import Phaser from 'phaser';
import { TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH, WORLD_SIZE } from '../config/gameConfig';
import { Enemy, EnemyVariantConfig } from '../entities/Enemy';
import { Player } from '../entities/Player';

const FINAL_BOSS_MESSAGE_MS = 2600;
const FINAL_BOSS_SUMMON_INTERVAL_MS = 10000;
const FINAL_BOSS_MELEE_COOLDOWN_MS = 7000;
const FINAL_BOSS_CHANNEL_INTERVAL_MS = 40000;
const FINAL_BOSS_CHANNEL_DURATION_MS = 15000;
const FINAL_BOSS_SHIELD_DEADLINE_MS = 20000;
const FINAL_BOSS_SHIELD_HEALTH = 500;
const FINAL_BOSS_MELEE_TRIGGER_RADIUS = 250;
const FINAL_BOSS_MELEE_DAMAGE = 40;
const FINAL_BOSS_EXPLOSION_RADIUS = 700;
const EXTRA_BOSS_SPAWN_DISTANCE = 520;
/** Telegraph before the melee sweep resolves — gives the player a window to back off after the sword appears. */
const MELEE_TELEGRAPH_MS = 1500;
/** Reach of the 360° sweep itself, distinct from the (larger) trigger radius above. */
const MELEE_SWING_RADIUS = 170;
/** How close the player must be to the blade's current (moving) position for the swing to actually connect — sized to roughly match the sword sprite's own footprint (140px display size). */
const MELEE_SWORD_HIT_RADIUS = 70;
/** The sword icon art is drawn on a diagonal (hilt bottom-left, tip top-right); this nudges it left so it reads as upright. Eyeballed — tune if it still looks off. */
const MELEE_SWORD_ART_TILT = -Math.PI / 8;
const MELEE_SWORD_BASE_TINT = 0x2fe86a;
const MELEE_SWORD_BLINK_TINT = 0xd6ffd0;
const MELEE_SWORD_BLINK_COUNT = 3;
/** Damage already resolves the instant the telegraph ends — this only paces the follow-through visual (sword + glowing arc)
 *  slowly enough to actually see the swing's path, since a sprite alone moving at "instant" speed was invisible between frames. */
const MELEE_SWEEP_VISUAL_MS = 320;
const MELEE_SWEEP_RING_COLOR = 0x8cff8c;
/** Cooldown between Necro-Beam casts. Never fires during a shield channel (mutually exclusive — see updateBoss). */
const NECRO_BEAM_INTERVAL_MS = 20000;
const NECRO_BEAM_LOCKON_MS = 3000;
const NECRO_BEAM_DURATION_MS = 6000;
const NECRO_BEAM_WIDTH = 46;
const NECRO_BEAM_LENGTH = WORLD_SIZE * 1.5;
/** The beam's leading edge travels outward from the boss at this speed instead of drawing full-length instantly —
 *  gives the player a visible window to step out of its path before it reaches them. ~1.6s to reach full length. */
const NECRO_BEAM_TRAVEL_SPEED = 2600;
/** Per-tick damage, gated by the player's own invulnerability window (~750ms) — standing fully in the beam for its whole duration is heavily punished but not an instant kill. */
const NECRO_BEAM_DAMAGE = 20;
// At range D, the beam needs an angular speed of (player_speed / D) rad/s just to keep pointing exactly at a player
// moving perpendicular to it. At the base player speed (180px/s), 60°/s could out-turn that requirement at
// anything closer than ~170px, which is why it always caught up once it landed a hit. 15°/s only "wins" the
// chase below ~690px, so moving perpendicular to the beam gains real separation at any normal fighting distance.
const NECRO_BEAM_FOLLOW_TURN_RATE = Phaser.Math.DegToRad(15);
const NECRO_BEAM_CORE_COLOR = 0xd6ffd0;
const NECRO_BEAM_GLOW_COLOR = 0x35c96b;

/** One boss encounter's full runtime state — channel/shield/melee/summon/arrow — generalized from the old single `finalBoss` scalar fields. */
interface ActiveBoss {
  enemy: Enemy;
  /** True only for the run's timer-triggered boss: it owns the arena-clear countdown and ends the run on defeat. Sandbox-spawned extras are plain fights. */
  isMain: boolean;
  cleanupAt: number;
  countdownText?: Phaser.GameObjects.Text;
  summonElapsed: number;
  channelElapsed: number;
  meleeLastAt: number;
  channelActive: boolean;
  shieldActive: boolean;
  channelStartedAt: number;
  shield: number;
  shieldAura?: Phaser.GameObjects.Arc;
  shieldBolts: Phaser.GameObjects.Sprite[];
  nextShieldBoltAt: number;
  shieldBack?: Phaser.GameObjects.Rectangle;
  shieldFill?: Phaser.GameObjects.Rectangle;
  arrow?: Phaser.GameObjects.Container;
  beamElapsed: number;
  beamState: 'idle' | 'lockon' | 'active';
  beamLockOnElapsed: number;
  beamActiveElapsed: number;
  /** Fixed once at activation — the beam doesn't re-aim while active. Its origin, unlike the angle, always tracks the boss sprite's current position (see drawBeam/distanceToBeam). */
  beamAngle: number;
  beamReticle?: Phaser.GameObjects.Image;
  beamVisual?: Phaser.GameObjects.Graphics;
}

/** Everything BossSystem needs from GameScene, exposed narrowly so the two stay decoupled. */
export interface BossHost {
  scene: Phaser.Scene;
  getPlayer(): Player;
  isEnded(): boolean;
  spawnEnemyVariant(x: number, y: number, config: EnemyVariantConfig): Enemy | null;
  enemyConfig(id: EnemyVariantConfig['id'], overrides?: Partial<Omit<EnemyVariantConfig, 'id'>>): EnemyVariantConfig;
  clearEnemyField(preserve?: Enemy): number;
  finish(victory: boolean): void;
  refreshHud(): void;
}

/** Boss encounters: the run-ending timer boss plus any sandbox-spawned extras fighting alongside it. Owns all boss-only state. */
export class BossSystem {
  private mainBossTriggered = false;
  private mainBossPending = false;
  private mainBossMessage?: Phaser.GameObjects.Text;
  private bosses: ActiveBoss[] = [];

  constructor(private readonly host: BossHost) {}

  reset(): void {
    this.mainBossTriggered = false;
    this.mainBossPending = false;
    this.mainBossMessage = undefined;
    this.bosses = [];
  }

  hasTriggeredMainBoss(): boolean {
    return this.mainBossTriggered;
  }
  /** Gates spawning/merchant: true while the timer boss's warning is pending, or any boss (main or extra) is alive. */
  hasActiveEncounter(): boolean {
    return this.mainBossPending || this.bosses.length > 0;
  }
  isChanneling(enemy: Enemy): boolean {
    return this.bosses.some((boss) => boss.enemy === enemy && boss.channelActive);
  }
  isBoss(enemy: Enemy): boolean {
    return this.bosses.some((boss) => boss.enemy === enemy);
  }

  /** Shows the warning message and spawns the run-ending boss after a delay. No-op if already triggered this run. */
  warn(): void {
    if (this.mainBossTriggered) return;
    this.mainBossTriggered = true;
    this.mainBossPending = true;
    const scene = this.host.scene;
    this.mainBossMessage = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'O sobrevivente sente uma presença maligna no ar!', {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '34px',
      color: '#d8ffd0',
      align: 'center',
      stroke: '#101510',
      strokeThickness: 5,
      wordWrap: { width: 900 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(45);
    scene.tweens.add({ targets: this.mainBossMessage, alpha: 0.45, yoyo: true, repeat: 2, duration: 420 });
    scene.time.delayedCall(FINAL_BOSS_MESSAGE_MS, () => this.spawnMainBoss());
  }
  private spawnMainBoss(): void {
    this.mainBossMessage?.destroy();
    this.mainBossMessage = undefined;
    this.mainBossPending = false;
    const player = this.host.getPlayer();
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = 980;
    const x = Phaser.Math.Clamp(player.x + Math.cos(angle) * distance, 260, WORLD_SIZE - 260);
    const y = Phaser.Math.Clamp(player.y + Math.sin(angle) * distance, 260, WORLD_SIZE - 260);
    this.spawnBossAt(x, y, true);
  }
  /** Sandbox-only: spawns an extra boss instantly (no warning), fighting alongside whatever else is active. Does not end the run on defeat. */
  spawnExtraBoss(): void {
    const player = this.host.getPlayer();
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const x = Phaser.Math.Clamp(player.x + Math.cos(angle) * EXTRA_BOSS_SPAWN_DISTANCE, 260, WORLD_SIZE - 260);
    const y = Phaser.Math.Clamp(player.y + Math.sin(angle) * EXTRA_BOSS_SPAWN_DISTANCE, 260, WORLD_SIZE - 260);
    this.spawnBossAt(x, y, false);
  }
  private spawnBossAt(x: number, y: number, isMain: boolean): void {
    const scene = this.host.scene;
    const enemy = this.host.spawnEnemyVariant(x, y, this.host.enemyConfig('finalBoss', { isMiniBoss: true, displaySize: 390, collisionRadius: 58, healthBarWidth: 220 }));
    if (!enemy) return;
    const boss: ActiveBoss = {
      enemy,
      isMain,
      cleanupAt: isMain ? scene.time.now + 30000 : 0,
      countdownText: isMain ? scene.add.text(GAME_WIDTH / 2, 84, '', { fontFamily: TITLE_FONT_FAMILY, fontSize: '24px', color: '#ffffff', stroke: '#101510', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(44) : undefined,
      summonElapsed: 0,
      channelElapsed: 0,
      meleeLastAt: scene.time.now - FINAL_BOSS_MELEE_COOLDOWN_MS + 1600,
      channelActive: false,
      shieldActive: false,
      channelStartedAt: 0,
      shield: 0,
      shieldBolts: [],
      nextShieldBoltAt: 0,
      beamElapsed: 0,
      beamState: 'idle',
      beamLockOnElapsed: 0,
      beamActiveElapsed: 0,
      beamAngle: 0
    };
    this.bosses.push(boss);
    this.ensureArrow(boss);
  }

  update(delta: number): void {
    [...this.bosses].forEach((boss) => this.updateBoss(boss, delta));
  }
  private updateBoss(boss: ActiveBoss, delta: number): void {
    if (!boss.enemy.active) return;
    if (boss.isMain && boss.cleanupAt > 0) {
      const remainingMs = Math.max(0, boss.cleanupAt - this.host.scene.time.now);
      boss.countdownText?.setText(`A escuridão consome a arena em ${Math.ceil(remainingMs / 1000)}s`);
      if (remainingMs <= 0) {
        const clearedEnemies = this.host.clearEnemyField(boss.enemy);
        boss.enemy.maxHealth += clearedEnemies * 20;
        boss.enemy.health += clearedEnemies * 20;
        boss.cleanupAt = 0;
        boss.countdownText?.destroy();
        boss.countdownText = undefined;
      }
    }
    if (boss.channelActive) {
      boss.enemy.pauseMovement();
      this.updateShieldVisual(boss);
      if (this.host.scene.time.now >= boss.channelStartedAt + FINAL_BOSS_CHANNEL_DURATION_MS) boss.channelActive = false;
      return;
    }
    if (boss.shieldActive) {
      if (this.host.scene.time.now >= boss.channelStartedAt + FINAL_BOSS_SHIELD_DEADLINE_MS) this.completeChannel(boss);
      return;
    }
    // Mutually exclusive with shield-channel/melee/summon-trigger checks below: while beaming, the boss stands
    // still tracking the player and nothing else can start until the beam ends.
    if (boss.beamState !== 'idle') {
      this.updateBeam(boss, delta);
      return;
    }
    boss.summonElapsed += delta;
    boss.channelElapsed += delta;
    boss.beamElapsed += delta;
    if (boss.summonElapsed >= FINAL_BOSS_SUMMON_INTERVAL_MS) {
      boss.summonElapsed = 0;
      this.summonApparitions(boss);
    }
    if (boss.channelElapsed >= FINAL_BOSS_CHANNEL_INTERVAL_MS) { this.startChannel(boss); return; }
    if (boss.beamElapsed >= NECRO_BEAM_INTERVAL_MS) { this.startBeamLockOn(boss); return; }
    this.tryMeleeAttack(boss);
  }
  private summonApparitions(boss: ActiveBoss): void {
    for (let index = 0; index < 30; index += 1) {
      const angle = (Math.PI * 2 * index) / 30 + Phaser.Math.FloatBetween(-0.12, 0.12);
      const radius = Phaser.Math.Between(175, 255);
      this.host.spawnEnemyVariant(boss.enemy.x + Math.cos(angle) * radius, boss.enemy.y + Math.sin(angle) * radius, this.host.enemyConfig('apparitionWraith', { displaySize: 72 }));
    }
  }
  private tryMeleeAttack(boss: ActiveBoss): void {
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    if (scene.time.now < boss.meleeLastAt + FINAL_BOSS_MELEE_COOLDOWN_MS) return;
    if (Phaser.Math.Distance.Between(boss.enemy.x, boss.enemy.y, player.x, player.y) > FINAL_BOSS_MELEE_TRIGGER_RADIUS) return;
    boss.meleeLastAt = scene.time.now;
    this.telegraphMeleeAttack(boss);
  }
  /** Spawns the telegraph sword beside the boss, then resolves the 360° sweep after `MELEE_TELEGRAPH_MS`. */
  private telegraphMeleeAttack(boss: ActiveBoss): void {
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    const direction = new Phaser.Math.Vector2(player.x - boss.enemy.x, player.y - boss.enemy.y).normalize();
    const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x);
    const spawnAngle = Phaser.Math.Angle.Between(0, 0, perpendicular.x, perpendicular.y);
    // Placeholder art: reuses the sword weapon icon (same sprite as the player's thrown-sword buff), tinted green.
    // Swap for a dedicated "necromantic sword" sprite once one exists.
    const sword = scene.add.sprite(
      boss.enemy.x + perpendicular.x * MELEE_SWING_RADIUS,
      boss.enemy.y + perpendicular.y * MELEE_SWING_RADIUS,
      'weapon-sword-icon'
    )
      .setDisplaySize(140, 140)
      .setTint(MELEE_SWORD_BASE_TINT)
      .setDepth(12)
      .setRotation(spawnAngle + Math.PI / 2 + MELEE_SWORD_ART_TILT);
    this.blinkTelegraphSword(sword);
    scene.time.delayedCall(MELEE_TELEGRAPH_MS, () => this.resolveMeleeSweep(boss, sword, spawnAngle));
  }
  /** Flashes the telegraph sword to a light green tint `MELEE_SWORD_BLINK_COUNT` times, spread evenly across the telegraph window. */
  private blinkTelegraphSword(sword: Phaser.GameObjects.Sprite): void {
    const scene = this.host.scene;
    const halfCycles = MELEE_SWORD_BLINK_COUNT * 2;
    const stepMs = MELEE_TELEGRAPH_MS / halfCycles;
    for (let step = 1; step <= halfCycles; step += 1) {
      scene.time.delayedCall(stepMs * step, () => {
        if (!sword.active) return;
        sword.setTint(step % 2 === 1 ? MELEE_SWORD_BLINK_TINT : MELEE_SWORD_BASE_TINT);
      });
    }
  }
  /** Plays the 360° sweep once the telegraph ends; damage only lands when the moving blade actually reaches the player. */
  private resolveMeleeSweep(boss: ActiveBoss, sword: Phaser.GameObjects.Sprite, startAngle: number): void {
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    if (this.host.isEnded() || !boss.enemy.active) { sword.destroy(); return; }
    const orbit = { angle: startAngle };
    const wind = this.createWindTrail(sword);
    const ring = scene.add.graphics().setDepth(11);
    scene.tweens.add({
      targets: orbit,
      angle: startAngle + Math.PI * 2,
      duration: MELEE_SWEEP_VISUAL_MS,
      ease: 'Linear',
      onUpdate: () => {
        if (!boss.enemy.active) return;
        const swordX = boss.enemy.x + Math.cos(orbit.angle) * MELEE_SWING_RADIUS;
        const swordY = boss.enemy.y + Math.sin(orbit.angle) * MELEE_SWING_RADIUS;
        sword.setPosition(swordX, swordY);
        sword.setRotation(orbit.angle + Math.PI / 2 + MELEE_SWORD_ART_TILT);
        // Redraws the traced arc every frame so the swing's full path stays visible, unlike the fast-moving
        // sword sprite alone (which was skipping too many pixels between frames to read at a glance).
        ring.clear();
        ring.lineStyle(22, MELEE_SWEEP_RING_COLOR, 0.18);
        ring.beginPath().arc(boss.enemy.x, boss.enemy.y, MELEE_SWING_RADIUS, startAngle, orbit.angle, false).strokePath();
        ring.lineStyle(9, MELEE_SWEEP_RING_COLOR, 0.9);
        ring.beginPath().arc(boss.enemy.x, boss.enemy.y, MELEE_SWING_RADIUS, startAngle, orbit.angle, false).strokePath();
        // Contact-based: only damages once the blade's current position actually reaches the player
        // (player.damage()'s own invulnerability window keeps this from re-triggering every frame of contact).
        if (!this.host.isEnded() && Phaser.Math.Distance.Between(swordX, swordY, player.x, player.y) <= MELEE_SWORD_HIT_RADIUS) {
          if (player.damage(FINAL_BOSS_MELEE_DAMAGE, scene.time.now) && player.health <= 0) this.host.finish(false);
        }
      },
      onComplete: () => {
        sword.destroy();
        wind.stop();
        scene.time.delayedCall(250, () => wind.destroy());
        scene.tweens.add({ targets: ring, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => ring.destroy() });
      }
    });
  }
  /** Generates a tiny soft-dot texture once (no dedicated wind asset exists yet) and returns a light-green particle
   *  emitter following `sword`, giving the swing a streaking wind trail. Caller stops/destroys it when the swing ends. */
  private createWindTrail(sword: Phaser.GameObjects.Sprite): Phaser.GameObjects.Particles.ParticleEmitter {
    const scene = this.host.scene;
    if (!scene.textures.exists('melee-wind-particle')) {
      const graphics = scene.add.graphics();
      graphics.fillStyle(0xffffff, 1);
      graphics.fillCircle(4, 4, 4);
      graphics.generateTexture('melee-wind-particle', 8, 8);
      graphics.destroy();
    }
    const emitter = scene.add.particles(sword.x, sword.y, 'melee-wind-particle', {
      tint: 0xb6ffb0,
      alpha: { start: 0.75, end: 0 },
      scale: { start: 1.4, end: 0.2 },
      speed: 30,
      lifespan: 220,
      frequency: 12,
      blendMode: Phaser.BlendModes.ADD
    }).setDepth(11);
    emitter.startFollow(sword);
    return emitter;
  }
  /** Begins the 3s lock-on: a reticle tracks the player's live position above their head while the boss stands still. */
  private startBeamLockOn(boss: ActiveBoss): void {
    boss.beamElapsed = 0;
    boss.beamState = 'lockon';
    boss.beamLockOnElapsed = 0;
    boss.enemy.pauseMovement();
    this.ensureBeamReticleTexture();
    const player = this.host.getPlayer();
    boss.beamReticle = this.host.scene.add.image(player.x, player.y - 60, 'necro-beam-reticle').setDepth(46).setScale(0);
    this.host.scene.tweens.add({ targets: boss.beamReticle, scale: 1, duration: 260, ease: 'Back.Out' });
  }
  /** Lock-on ends: points the beam at the player's position right now. The origin itself always tracks the boss's live sprite position (see drawBeam), it's only the angle that locks here. */
  private activateBeam(boss: ActiveBoss): void {
    boss.beamReticle?.destroy();
    boss.beamReticle = undefined;
    const player = this.host.getPlayer();
    boss.beamState = 'active';
    boss.beamActiveElapsed = 0;
    boss.beamAngle = Phaser.Math.Angle.Between(boss.enemy.x, boss.enemy.y, player.x, player.y);
    boss.beamVisual = this.host.scene.add.graphics().setDepth(10);
  }
  private updateBeam(boss: ActiveBoss, delta: number): void {
    boss.enemy.pauseMovement();
    const player = this.host.getPlayer();
    if (boss.beamState === 'lockon') {
      boss.beamLockOnElapsed += delta;
      boss.beamReticle?.setPosition(player.x, player.y - 60);
      if (boss.beamLockOnElapsed >= NECRO_BEAM_LOCKON_MS) this.activateBeam(boss);
      return;
    }
    boss.beamActiveElapsed += delta;
    this.steerBeamTowardPlayer(boss, delta);
    this.drawBeam(boss);
    this.applyBeamDamage(boss);
    if (boss.beamActiveElapsed >= NECRO_BEAM_DURATION_MS) this.endBeam(boss);
  }
  /** Slowly rotates the beam toward wherever the player currently is — e.g. if they walk down after it's emitted
   *  pointing at their old spot, the beam gradually swings down to reacquire them, at a capped turn rate rather
   *  than snapping instantly. */
  private steerBeamTowardPlayer(boss: ActiveBoss, delta: number): void {
    const player = this.host.getPlayer();
    const targetAngle = Phaser.Math.Angle.Between(boss.enemy.x, boss.enemy.y, player.x, player.y);
    boss.beamAngle = Phaser.Math.Angle.RotateTo(boss.beamAngle, targetAngle, NECRO_BEAM_FOLLOW_TURN_RATE * (delta / 1000));
  }
  /** How far the beam's leading edge has traveled from the boss so far — grows at `NECRO_BEAM_TRAVEL_SPEED`, capped at full length. */
  private beamGrownLength(boss: ActiveBoss): number {
    return Math.min(NECRO_BEAM_LENGTH, (boss.beamActiveElapsed / 1000) * NECRO_BEAM_TRAVEL_SPEED);
  }
  private drawBeam(boss: ActiveBoss): void {
    if (!boss.beamVisual) return;
    const originX = boss.enemy.x;
    const originY = boss.enemy.y;
    const length = this.beamGrownLength(boss);
    const endX = originX + Math.cos(boss.beamAngle) * length;
    const endY = originY + Math.sin(boss.beamAngle) * length;
    boss.beamVisual.clear();
    boss.beamVisual.lineStyle(NECRO_BEAM_WIDTH, NECRO_BEAM_GLOW_COLOR, 0.28);
    boss.beamVisual.lineBetween(originX, originY, endX, endY);
    boss.beamVisual.lineStyle(NECRO_BEAM_WIDTH * 0.4, NECRO_BEAM_CORE_COLOR, 0.9);
    boss.beamVisual.lineBetween(originX, originY, endX, endY);
  }
  /** Perpendicular distance from the player to the beam's already-drawn portion — clamped to how far the leading
   *  edge has actually traveled, so standing beyond the tip (or behind the boss) is always safe. Origin tracks
   *  the boss's live sprite position (e.g. its hit-reaction shake), only the angle is locked at activation. */
  private distanceToBeam(boss: ActiveBoss): number {
    const player = this.host.getPlayer();
    const originX = boss.enemy.x;
    const originY = boss.enemy.y;
    const dirX = Math.cos(boss.beamAngle);
    const dirY = Math.sin(boss.beamAngle);
    const toPlayerX = player.x - originX;
    const toPlayerY = player.y - originY;
    const projection = Phaser.Math.Clamp(toPlayerX * dirX + toPlayerY * dirY, 0, this.beamGrownLength(boss));
    const closestX = originX + dirX * projection;
    const closestY = originY + dirY * projection;
    return Phaser.Math.Distance.Between(player.x, player.y, closestX, closestY);
  }
  private applyBeamDamage(boss: ActiveBoss): void {
    if (this.host.isEnded() || this.distanceToBeam(boss) > NECRO_BEAM_WIDTH / 2) return;
    const player = this.host.getPlayer();
    if (player.damage(NECRO_BEAM_DAMAGE, this.host.scene.time.now) && player.health <= 0) this.host.finish(false);
  }
  private endBeam(boss: ActiveBoss): void {
    boss.beamState = 'idle';
    boss.beamVisual?.destroy();
    boss.beamVisual = undefined;
  }
  /** Generates a tiny crosshair-in-a-ring texture once (no dedicated reticle asset exists yet) for the beam's lock-on warning. */
  private ensureBeamReticleTexture(): void {
    const scene = this.host.scene;
    if (scene.textures.exists('necro-beam-reticle')) return;
    const graphics = scene.add.graphics();
    graphics.lineStyle(3, 0x8cffb0, 1);
    graphics.strokeCircle(14, 14, 11);
    graphics.lineBetween(14, 0, 14, 6);
    graphics.lineBetween(14, 22, 14, 28);
    graphics.lineBetween(0, 14, 6, 14);
    graphics.lineBetween(22, 14, 28, 14);
    graphics.fillStyle(0x8cffb0, 1);
    graphics.fillCircle(14, 14, 2.5);
    graphics.generateTexture('necro-beam-reticle', 28, 28);
    graphics.destroy();
  }
  private startChannel(boss: ActiveBoss): void {
    if (boss.channelActive) return;
    boss.channelActive = true;
    boss.shieldActive = true;
    boss.channelStartedAt = this.host.scene.time.now;
    boss.shield = FINAL_BOSS_SHIELD_HEALTH;
    boss.channelElapsed = 0;
    boss.nextShieldBoltAt = 0;
    boss.enemy.pauseMovement();
    this.updateShieldVisual(boss);
  }
  private completeChannel(boss: ActiveBoss): void {
    if (boss.shield <= 0) { this.endChannel(boss); return; }
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    const explosion = scene.add.circle(boss.enemy.x, boss.enemy.y, FINAL_BOSS_EXPLOSION_RADIUS, 0x52ff45, 0.24).setStrokeStyle(7, 0xd8ffd0, 0.9).setDepth(12);
    scene.tweens.add({ targets: explosion, alpha: 0, scale: 1.18, duration: 520, onComplete: () => explosion.destroy() });
    const playerCaught = Phaser.Math.Distance.Between(boss.enemy.x, boss.enemy.y, player.x, player.y) <= FINAL_BOSS_EXPLOSION_RADIUS;
    this.endChannel(boss);
    if (playerCaught) {
      player.health = 0;
      this.host.refreshHud();
      scene.time.delayedCall(260, () => this.host.finish(false));
    }
  }
  private endChannel(boss: ActiveBoss): void {
    boss.channelActive = false;
    boss.shieldActive = false;
    boss.shield = 0;
    boss.shieldAura?.destroy();
    boss.shieldBolts.forEach((bolt) => bolt.destroy());
    boss.shieldBack?.destroy();
    boss.shieldFill?.destroy();
    boss.shieldAura = undefined;
    boss.shieldBolts = [];
    boss.shieldBack = undefined;
    boss.shieldFill = undefined;
  }
  private updateShieldVisual(boss: ActiveBoss): void {
    if (!boss.enemy.active || !boss.shieldActive) return;
    const scene = this.host.scene;
    if (!boss.shieldAura) {
      boss.shieldAura = scene.add.circle(boss.enemy.x, boss.enemy.y, 230, 0x48ff52, 0.16).setStrokeStyle(5, 0xb4ff9e, 0.88).setDepth(8);
      boss.shieldBack = scene.add.rectangle(boss.enemy.x, boss.enemy.y - boss.enemy.displayHeight / 2 - 34, 188, 10, 0x061009).setDepth(12);
      boss.shieldFill = scene.add.rectangle(boss.enemy.x, boss.enemy.y - boss.enemy.displayHeight / 2 - 34, 184, 5, 0x65ff5a).setDepth(13);
    }
    const width = Phaser.Math.Clamp(boss.shield / FINAL_BOSS_SHIELD_HEALTH, 0, 1) * 184;
    const y = boss.enemy.y - boss.enemy.displayHeight / 2 - 34;
    boss.shieldAura.setPosition(boss.enemy.x, boss.enemy.y);
    this.spawnShieldBolts(boss);
    boss.shieldBack?.setPosition(boss.enemy.x, y);
    boss.shieldFill?.setPosition(boss.enemy.x - 92 + width / 2, y).setSize(width, 5);
  }
  private spawnShieldBolts(boss: ActiveBoss): void {
    const scene = this.host.scene;
    if (scene.time.now < boss.nextShieldBoltAt) return;
    boss.nextShieldBoltAt = scene.time.now + Phaser.Math.Between(90, 180);
    const count = Phaser.Math.Between(1, 3);
    for (let index = 0; index < count; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * 205;
      const bolt = scene.add.sprite(
        boss.enemy.x + Math.cos(angle) * radius,
        boss.enemy.y + Math.sin(angle) * radius,
        'boss-shield-bolt'
      )
        .setDisplaySize(Phaser.Math.Between(42, 84), Phaser.Math.Between(42, 84))
        .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
        .setAlpha(Phaser.Math.FloatBetween(0.72, 1))
        .setDepth(11)
        .setBlendMode(Phaser.BlendModes.ADD)
        .play('boss-shield-bolt-flicker');
      boss.shieldBolts.push(bolt);
      scene.tweens.add({ targets: bolt, alpha: 0, duration: Phaser.Math.Between(180, 320), onComplete: () => { Phaser.Utils.Array.Remove(boss.shieldBolts, bolt); bolt.destroy(); } });
    }
  }
  private ensureArrow(boss: ActiveBoss): void {
    if (boss.arrow) return;
    const scene = this.host.scene;
    const arrow = scene.add.graphics();
    arrow.fillStyle(0x111111, 0.9);
    arrow.fillTriangle(25, 0, -15, -22, -9, 0);
    arrow.fillTriangle(25, 0, -15, 22, -9, 0);
    arrow.fillRect(-30, -7, 22, 14);
    arrow.fillStyle(0xffffff, 1);
    arrow.fillTriangle(18, 0, -11, -15, -7, 0);
    arrow.fillTriangle(18, 0, -11, 15, -7, 0);
    arrow.fillRect(-25, -4, 19, 8);
    boss.arrow = scene.add.container(0, 0, [arrow]).setScrollFactor(0).setDepth(44).setVisible(false);
  }
  updateArrows(): void {
    this.bosses.forEach((boss) => this.updateArrow(boss));
  }
  private updateArrow(boss: ActiveBoss): void {
    if (!boss.arrow || !boss.enemy.active) { boss.arrow?.setVisible(false); return; }
    const scene = this.host.scene;
    const view = scene.cameras.main.worldView;
    const screenX = boss.enemy.x - view.x;
    const screenY = boss.enemy.y - view.y;
    const visible = screenX >= 0 && screenX <= GAME_WIDTH && screenY >= 0 && screenY <= GAME_HEIGHT;
    if (visible) { boss.arrow.setVisible(false); return; }
    const x = Phaser.Math.Clamp(screenX, 48, GAME_WIDTH - 48);
    const y = Phaser.Math.Clamp(screenY, 48, GAME_HEIGHT - 48);
    boss.arrow.setVisible(true).setPosition(x, y).setRotation(Phaser.Math.Angle.Between(GAME_WIDTH / 2, GAME_HEIGHT / 2, screenX, screenY));
  }

  /** Absorbs damage into a boss's active shield. Returns null if `enemy` isn't a shielded boss (caller should apply `amount` normally); otherwise returns the overflow damage (0+) to apply as real damage. */
  tryAbsorbShieldDamage(enemy: Enemy, amount: number): number | null {
    const boss = this.bosses.find((candidate) => candidate.enemy === enemy);
    if (!boss || !boss.shieldActive || boss.shield <= 0) return null;
    const overflow = Math.max(0, amount - boss.shield);
    boss.shield = Math.max(0, boss.shield - amount);
    enemy.takeDamage(0);
    this.updateShieldVisual(boss);
    if (boss.shield <= 0) this.endChannel(boss);
    return overflow;
  }
  /** Removes a defeated boss from tracking and cleans up its visuals. Returns whether it was the run-ending main boss. */
  defeatBoss(enemy: Enemy): boolean {
    const index = this.bosses.findIndex((boss) => boss.enemy === enemy);
    if (index === -1) return false;
    const [boss] = this.bosses.splice(index, 1);
    this.endChannel(boss);
    this.endBeam(boss);
    boss.beamReticle?.destroy();
    boss.arrow?.destroy();
    boss.countdownText?.destroy();
    return boss.isMain;
  }
}
