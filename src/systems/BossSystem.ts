import Phaser from 'phaser';
import { TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH, WORLD_SIZE } from '../config/gameConfig';
import { Enemy, EnemyVariantConfig } from '../entities/Enemy';
import { Player } from '../entities/Player';

const FINAL_BOSS_MESSAGE_MS = 2600;
const FINAL_BOSS_SUMMON_INTERVAL_MS = 5000;
const FINAL_BOSS_MELEE_COOLDOWN_MS = 7000;
const FINAL_BOSS_CHANNEL_INTERVAL_MS = 15000;
const FINAL_BOSS_CHANNEL_DURATION_MS = 15000;
const FINAL_BOSS_SHIELD_DEADLINE_MS = 20000;
/** Shield capacity is a straight cut of the boss's own max health, so it stays a meaningful check regardless of how strong a build the player has by the time they reach it. */
const SHIELD_MAX_HEALTH_SCALING = 0.15;
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
/** The lock-on reticle (and its paired line to the player) blink faster as the lock-on nears completion — this is
 *  the toggle interval at the very start (slow) vs. the very end (fast), linearly interpolated by progress. */
const NECRO_BEAM_LOCKON_BLINK_START_MS = 320;
const NECRO_BEAM_LOCKON_BLINK_END_MS = 45;
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
/** "Solo dos Mortos Vivos": always fires alongside the Necro-Beam, and can also fire sporadically off the apparition-summon
 *  tick in Phase 1 (guaranteed on that same tick in Phase 2 — see Etapa 5). Never damages the boss's own summons. */
const UNDEAD_SQUAD_SIZE = 15;
const UNDEAD_SQUAD_SPORADIC_CHANCE = 0.25;
/** Meteoros Infernais: only while actively channeling the shield (~15s window). Stops the instant the shield breaks early. */
const METEOR_INTERVAL_MS = 500;
const METEOR_TELEGRAPH_MS = 1500;
const METEOR_RADIUS = 90;
const METEOR_DAMAGE = 25;
const METEOR_COLOR = 0x35c96b;
/** Fase 2: kicks in once the boss drops to (or below) this fraction of its max health. Checked live, per-ability. */
const PHASE_TWO_HEALTH_RATIO = 0.5;
const NECRO_BEAM_DURATION_PHASE2_MS = 10000;
/** Fase 2 beam count (capped below the 20-beam theoretical max for NECRO_BEAM_DURATION_PHASE2_MS at this stagger — tuned down for pacing).
 *  Each beam despawns NECRO_BEAM_LIFETIME_MS after ITS OWN launch (see updateBeam) — first-launched, first-removed
 *  in practice, but driven independently per beam rather than a shared removal timer. This replaces the shared
 *  end-together deadline; Fase 1 uses the same launch+lifetime cycle at half the beam count. */
const NECRO_BEAM_COUNT_PHASE2 = 10;
/** Fase 1 fires half of Fase 2's beam count, through the same launch+lifetime cycle. */
const NECRO_BEAM_COUNT_PHASE1 = NECRO_BEAM_COUNT_PHASE2 / 2;
const NECRO_BEAM_LAUNCH_STAGGER_MS = 500;
/** How long each beam stays up after its own launch. A per-beam lifetime (instead of a shared removal-queue timer)
 *  guarantees a steady ~NECRO_BEAM_LIFETIME_MS / NECRO_BEAM_LAUNCH_STAGGER_MS beams on screen at once and can never
 *  coincide with a launch tick — a shared timer occasionally lined up a removal on the same frame as the next
 *  launch, reading as the new beam instantly erasing the old one instead of both briefly overlapping. */
const NECRO_BEAM_LIFETIME_MS = 2100;
const METEOR_TELEGRAPH_PHASE2_MS = 1000;
/** Avanço com Escudo: two different triggers share this same dash/telegraph machinery.
 *  Fase 1 — fires as a 2-hit punish combo the instant the shield is broken by the player (not gated by cooldown).
 *  Fase 2 — fires guaranteed every SHIELD_DASH_COOLDOWN_MS while channeling, up to SHIELD_DASH_MAX_PER_CHANNEL times, with a smaller "mini" explosion. */
const SHIELD_DASH_BLINK_COUNT = 3;
const SHIELD_DASH_TELEGRAPH_MS = 600;
const SHIELD_DASH_TRAVEL_MS = 400;
const SHIELD_DASH_EXPLOSION_RADIUS = 220;
const SHIELD_DASH_EXPLOSION_DAMAGE = 35;
const SHIELD_BREAK_DASH_COUNT = 2;
const SHIELD_BREAK_DASH_GAP_MS = 3000;
const SHIELD_DASH_COOLDOWN_MS = 4000;
const SHIELD_DASH_MAX_PER_CHANNEL = 4;
const SHIELD_DASH_MINI_RADIUS = 130;
const SHIELD_DASH_MINI_DAMAGE = 18;

/** One concurrently-active Necro-Beam. Fase 1 fires NECRO_BEAM_COUNT_PHASE1, Fase 2 fires NECRO_BEAM_COUNT_PHASE2 — both staggered a beat apart and retired through the same launch+removal cycle (see updateBeam). */
interface ActiveNecroBeam {
  angle: number;
  /** Time since THIS specific beam launched — its own growth clock, independent of the other concurrent beams. */
  elapsedMs: number;
  visual: Phaser.GameObjects.Graphics;
}

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
  /** Snapshotted at the start of each channel as SHIELD_MAX_HEALTH_SCALING * maxHealth. */
  maxShield: number;
  meteorElapsed: number;
  /** Last countdown integer (10..0) already shown for the shield-explosion warning — -1 means none shown yet this channel. */
  shieldCountdownLastShown: number;
  shieldAura?: Phaser.GameObjects.Arc;
  shieldBolts: Phaser.GameObjects.Sprite[];
  nextShieldBoltAt: number;
  shieldBack?: Phaser.GameObjects.Rectangle;
  shieldFill?: Phaser.GameObjects.Rectangle;
  arrow?: Phaser.GameObjects.Container;
  beamElapsed: number;
  beamState: 'idle' | 'lockon' | 'active';
  beamLockOnElapsed: number;
  /** Shared clock for the whole encounter (all concurrent beams end together when this hits beamDurationMs) — distinct from each beam's own elapsedMs, which governs its individual growth. */
  beamActiveElapsed: number;
  beamReticle?: Phaser.GameObjects.Image;
  /** White line traced between the boss and the player during lock-on, blinking in sync with beamReticle. */
  beamLockLine?: Phaser.GameObjects.Graphics;
  /** Next value of beamLockOnElapsed at which the reticle/line toggle visibility — recomputed on each toggle using an interval that shrinks as the lock-on nears completion. */
  beamLockOnBlinkAt: number;
  beamLockOnVisible: boolean;
  beams: ActiveNecroBeam[];
  /** How many of beamCount have launched so far this activation — drives the staggered launch in updateBeam. */
  beamsLaunched: number;
  /** Snapshotted at activation: NECRO_BEAM_COUNT_PHASE1 in Fase 1, NECRO_BEAM_COUNT_PHASE2 in Fase 2. */
  beamCount: number;
  /** Snapshotted at activation from the Phase 1/2 constants — so a mid-cast phase transition doesn't change an already-running beam's duration. Vestigial now that both phases end via the launch+lifetime cycle; kept for a future single-beam mode. */
  beamDurationMs: number;
  dashState: 'idle' | 'telegraph' | 'dashing';
  /** Only relevant to the Fase 2 periodic dash — resets each new channel, capped at SHIELD_DASH_MAX_PER_CHANNEL. */
  dashLastAt: number;
  dashCountThisChannel: number;
  dashTarget?: Phaser.Math.Vector2;
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
  /** True for the whole shield sequence (visible channeling AND the shieldActive-only tail waiting on the explosion
   *  deadline) — GameScene.updateEnemies() uses this to decide pauseMovement() vs pursue(). Checking only
   *  channelActive left the boss walking again during that tail window until the shield finally exploded. */
  isChanneling(enemy: Enemy): boolean {
    return this.bosses.some((boss) => boss.enemy === enemy && (boss.channelActive || boss.shieldActive));
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
      maxShield: 0,
      meteorElapsed: 0,
      shieldCountdownLastShown: -1,
      shieldBolts: [],
      nextShieldBoltAt: 0,
      beamElapsed: 0,
      beamState: 'idle',
      beamLockOnElapsed: 0,
      beamLockOnBlinkAt: 0,
      beamLockOnVisible: true,
      beamActiveElapsed: 0,
      beams: [],
      beamsLaunched: 0,
      beamCount: 1,
      beamDurationMs: NECRO_BEAM_DURATION_MS,
      dashState: 'idle',
      dashLastAt: scene.time.now,
      dashCountThisChannel: 0
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
      boss.meteorElapsed += delta;
      if (boss.meteorElapsed >= METEOR_INTERVAL_MS) {
        boss.meteorElapsed = 0;
        this.launchMeteor(boss);
      }
      if (this.isPhaseTwo(boss) && boss.dashState === 'idle' && boss.dashCountThisChannel < SHIELD_DASH_MAX_PER_CHANNEL
        && this.host.scene.time.now >= boss.dashLastAt + SHIELD_DASH_COOLDOWN_MS) {
        boss.dashLastAt = this.host.scene.time.now;
        boss.dashCountThisChannel += 1;
        this.startShieldDashTelegraph(boss, SHIELD_DASH_MINI_DAMAGE, SHIELD_DASH_MINI_RADIUS);
      }
      this.updateShieldExplosionCountdown(boss);
      if (this.host.scene.time.now >= boss.channelStartedAt + FINAL_BOSS_CHANNEL_DURATION_MS) {
        boss.channelActive = false;
        boss.enemy.rottenAuraSuppressed = false;
      }
      return;
    }
    if (boss.shieldActive) {
      // Visible channeling ended but the shield hasn't resolved yet — keep the boss still until the deadline,
      // otherwise it resumes pursue() and walks around while still "channeling" from the player's perspective.
      boss.enemy.pauseMovement();
      this.updateShieldExplosionCountdown(boss);
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
      if (this.isPhaseTwo(boss) || Math.random() < UNDEAD_SQUAD_SPORADIC_CHANCE) this.summonUndeadSquad();
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
  /** "Solo dos Mortos Vivos": spawns near the player (not the boss) — always alongside the Necro-Beam, sometimes sporadically otherwise. */
  private summonUndeadSquad(): void {
    const player = this.host.getPlayer();
    for (let index = 0; index < UNDEAD_SQUAD_SIZE; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(90, 180);
      this.host.spawnEnemyVariant(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance, this.host.enemyConfig('skeleton'));
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
  /** Begins the 3s lock-on: a reticle tracks the player's live position above their head while the boss stands still,
   *  connected to the boss by a white line — both blink in sync, accelerating as the lock-on nears completion. */
  private startBeamLockOn(boss: ActiveBoss): void {
    boss.beamElapsed = 0;
    boss.beamState = 'lockon';
    boss.beamLockOnElapsed = 0;
    boss.beamLockOnBlinkAt = 0;
    boss.beamLockOnVisible = true;
    boss.enemy.pauseMovement();
    this.ensureBeamReticleTexture();
    const player = this.host.getPlayer();
    boss.beamReticle = this.host.scene.add.image(player.x, player.y - 60, 'necro-beam-reticle').setDepth(46).setScale(0);
    this.host.scene.tweens.add({ targets: boss.beamReticle, scale: 1, duration: 260, ease: 'Back.Out' });
    boss.beamLockLine = this.host.scene.add.graphics().setDepth(9);
    this.drawBeamLockLine(boss, player);
  }
  /** Redraws the full-white lock-on line between the boss and the player's live position. */
  private drawBeamLockLine(boss: ActiveBoss, player: Player): void {
    if (!boss.beamLockLine) return;
    boss.beamLockLine.clear();
    boss.beamLockLine.lineStyle(3, 0xffffff, 1);
    boss.beamLockLine.beginPath();
    boss.beamLockLine.moveTo(boss.enemy.x, boss.enemy.y);
    boss.beamLockLine.lineTo(player.x, player.y);
    boss.beamLockLine.strokePath();
  }
  /** Toggles the reticle+line visibility together, at an interval that shrinks from NECRO_BEAM_LOCKON_BLINK_START_MS
   *  down to NECRO_BEAM_LOCKON_BLINK_END_MS as boss.beamLockOnElapsed approaches NECRO_BEAM_LOCKON_MS — the blink
   *  reads as speeding up right up until the beam fires. */
  private updateBeamLockOnBlink(boss: ActiveBoss): void {
    if (boss.beamLockOnElapsed < boss.beamLockOnBlinkAt) return;
    boss.beamLockOnVisible = !boss.beamLockOnVisible;
    const progress = Phaser.Math.Clamp(boss.beamLockOnElapsed / NECRO_BEAM_LOCKON_MS, 0, 1);
    const intervalMs = Phaser.Math.Linear(NECRO_BEAM_LOCKON_BLINK_START_MS, NECRO_BEAM_LOCKON_BLINK_END_MS, progress);
    boss.beamLockOnBlinkAt = boss.beamLockOnElapsed + intervalMs;
    boss.beamReticle?.setVisible(boss.beamLockOnVisible);
    boss.beamLockLine?.setVisible(boss.beamLockOnVisible);
  }
  /** Lock-on ends: launches the first beam immediately, pointed at the player's position right now. The rest
   *  launch later, staggered, from updateBeam — see NECRO_BEAM_LAUNCH_STAGGER_MS. */
  private activateBeam(boss: ActiveBoss): void {
    boss.beamReticle?.destroy();
    boss.beamReticle = undefined;
    boss.beamLockLine?.destroy();
    boss.beamLockLine = undefined;
    boss.beamState = 'active';
    boss.beamActiveElapsed = 0;
    boss.beamDurationMs = this.isPhaseTwo(boss) ? NECRO_BEAM_DURATION_PHASE2_MS : NECRO_BEAM_DURATION_MS;
    boss.beamCount = this.isPhaseTwo(boss) ? NECRO_BEAM_COUNT_PHASE2 : NECRO_BEAM_COUNT_PHASE1;
    boss.beams = [];
    boss.beamsLaunched = 0;
    this.launchNextBeam(boss);
    this.summonUndeadSquad();
  }
  /** Spawns one more concurrent beam, aimed at the player's position at this exact moment. Each beam then grows/steers independently. */
  private launchNextBeam(boss: ActiveBoss): void {
    const player = this.host.getPlayer();
    const angle = Phaser.Math.Angle.Between(boss.enemy.x, boss.enemy.y, player.x, player.y);
    const visual = this.host.scene.add.graphics().setDepth(10);
    boss.beams.push({ angle, elapsedMs: 0, visual });
    boss.beamsLaunched += 1;
  }
  private updateBeam(boss: ActiveBoss, delta: number): void {
    boss.enemy.pauseMovement();
    const player = this.host.getPlayer();
    if (boss.beamState === 'lockon') {
      boss.beamLockOnElapsed += delta;
      boss.beamReticle?.setPosition(player.x, player.y - 60);
      this.drawBeamLockLine(boss, player);
      this.updateBeamLockOnBlink(boss);
      if (boss.beamLockOnElapsed >= NECRO_BEAM_LOCKON_MS) this.activateBeam(boss);
      return;
    }
    boss.beamActiveElapsed += delta;
    if (boss.beamsLaunched < boss.beamCount && boss.beamActiveElapsed >= boss.beamsLaunched * NECRO_BEAM_LAUNCH_STAGGER_MS) {
      this.launchNextBeam(boss);
    }
    boss.beams.forEach((beam) => {
      beam.elapsedMs += delta;
      this.steerBeamTowardPlayer(boss, beam, delta);
      this.drawBeam(boss, beam);
      this.applyBeamDamage(boss, beam);
    });
    if (boss.beamCount > 1) {
      // No shared deadline. Each beam despawns on its own once NECRO_BEAM_LIFETIME_MS has passed since IT launched —
      // decoupled from the launch stagger, so a removal can never land on the exact same frame as the next launch.
      boss.beams = boss.beams.filter((beam) => {
        if (beam.elapsedMs < NECRO_BEAM_LIFETIME_MS) return true;
        beam.visual.destroy();
        return false;
      });
      if (boss.beamsLaunched >= boss.beamCount && boss.beams.length === 0) this.endBeam(boss);
    } else if (boss.beamActiveElapsed >= boss.beamDurationMs) {
      this.endBeam(boss);
    }
  }
  /** Slowly rotates a beam toward wherever the player currently is — e.g. if they walk down after it's emitted
   *  pointing at their old spot, the beam gradually swings down to reacquire them, at a capped turn rate rather
   *  than snapping instantly. */
  private steerBeamTowardPlayer(boss: ActiveBoss, beam: ActiveNecroBeam, delta: number): void {
    const player = this.host.getPlayer();
    const targetAngle = Phaser.Math.Angle.Between(boss.enemy.x, boss.enemy.y, player.x, player.y);
    beam.angle = Phaser.Math.Angle.RotateTo(beam.angle, targetAngle, NECRO_BEAM_FOLLOW_TURN_RATE * (delta / 1000));
  }
  /** How far this beam's leading edge has traveled since IT launched — grows at `NECRO_BEAM_TRAVEL_SPEED`, capped at full length.
   *  Deliberately per-beam (not shared with the boss's overall active timer), so a beam launched mid-encounter still grows from 0 instead of popping in already extended. */
  private beamGrownLength(beam: ActiveNecroBeam): number {
    return Math.min(NECRO_BEAM_LENGTH, (beam.elapsedMs / 1000) * NECRO_BEAM_TRAVEL_SPEED);
  }
  private drawBeam(boss: ActiveBoss, beam: ActiveNecroBeam): void {
    const originX = boss.enemy.x;
    const originY = boss.enemy.y;
    const length = this.beamGrownLength(beam);
    const endX = originX + Math.cos(beam.angle) * length;
    const endY = originY + Math.sin(beam.angle) * length;
    beam.visual.clear();
    beam.visual.lineStyle(NECRO_BEAM_WIDTH, NECRO_BEAM_GLOW_COLOR, 0.28);
    beam.visual.lineBetween(originX, originY, endX, endY);
    beam.visual.lineStyle(NECRO_BEAM_WIDTH * 0.4, NECRO_BEAM_CORE_COLOR, 0.9);
    beam.visual.lineBetween(originX, originY, endX, endY);
  }
  /** Perpendicular distance from the player to this beam's already-drawn portion — clamped to how far its leading
   *  edge has actually traveled, so standing beyond the tip (or behind the boss) is always safe. Origin tracks
   *  the boss's live sprite position (e.g. its hit-reaction shake), only the angle is locked per-beam at launch. */
  private distanceToBeam(boss: ActiveBoss, beam: ActiveNecroBeam): number {
    const player = this.host.getPlayer();
    const originX = boss.enemy.x;
    const originY = boss.enemy.y;
    const dirX = Math.cos(beam.angle);
    const dirY = Math.sin(beam.angle);
    const toPlayerX = player.x - originX;
    const toPlayerY = player.y - originY;
    const projection = Phaser.Math.Clamp(toPlayerX * dirX + toPlayerY * dirY, 0, this.beamGrownLength(beam));
    const closestX = originX + dirX * projection;
    const closestY = originY + dirY * projection;
    return Phaser.Math.Distance.Between(player.x, player.y, closestX, closestY);
  }
  private applyBeamDamage(boss: ActiveBoss, beam: ActiveNecroBeam): void {
    if (this.host.isEnded() || this.distanceToBeam(boss, beam) > NECRO_BEAM_WIDTH / 2) return;
    const player = this.host.getPlayer();
    if (player.damage(NECRO_BEAM_DAMAGE, this.host.scene.time.now) && player.health <= 0) this.host.finish(false);
  }
  private endBeam(boss: ActiveBoss): void {
    boss.beamState = 'idle';
    boss.beams.forEach((beam) => beam.visual.destroy());
    boss.beams = [];
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
    boss.maxShield = boss.enemy.maxHealth * SHIELD_MAX_HEALTH_SCALING;
    boss.shield = boss.maxShield;
    boss.channelElapsed = 0;
    boss.meteorElapsed = 0;
    boss.shieldCountdownLastShown = -1;
    boss.nextShieldBoltAt = 0;
    boss.dashLastAt = this.host.scene.time.now;
    boss.dashCountThisChannel = 0;
    boss.enemy.pauseMovement();
    boss.enemy.rottenAuraSuppressed = true;
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
    // This branch kills by directly zeroing health rather than going through player.damage(), so it needs its
    // own invincible check — the sandbox toggle wouldn't otherwise cover this one instant-kill bypass.
    if (playerCaught && !player.invincible) {
      player.health = 0;
      this.host.refreshHud();
      scene.time.delayedCall(260, () => this.host.finish(false));
    }
  }
  private endChannel(boss: ActiveBoss): void {
    boss.channelActive = false;
    boss.shieldActive = false;
    boss.shield = 0;
    boss.enemy.rottenAuraSuppressed = false;
    boss.shieldAura?.destroy();
    boss.shieldBolts.forEach((bolt) => bolt.destroy());
    boss.shieldBack?.destroy();
    boss.shieldFill?.destroy();
    boss.shieldAura = undefined;
    boss.shieldBolts = [];
    boss.shieldBack = undefined;
    boss.shieldFill = undefined;
    // Can't dash-with-shield without a shield — cancel a pending telegraph, but let an already-moving dash finish.
    if (boss.dashState === 'telegraph') {
      boss.dashState = 'idle';
      boss.dashTarget = undefined;
    }
  }
  /** Ticks the shield-explosion countdown warning during the last 10s before FINAL_BOSS_SHIELD_DEADLINE_MS — fires
   *  once per integer second (10..0). Called from both the channelActive and shieldActive-only branches of
   *  updateBoss, since that 10s window spans across the boundary between them. */
  private updateShieldExplosionCountdown(boss: ActiveBoss): void {
    const remainingMs = boss.channelStartedAt + FINAL_BOSS_SHIELD_DEADLINE_MS - this.host.scene.time.now;
    if (remainingMs > 10000 || remainingMs < 0) return;
    const remaining = Math.ceil(remainingMs / 1000);
    if (remaining === boss.shieldCountdownLastShown) return;
    boss.shieldCountdownLastShown = remaining;
    this.spawnShieldWarningText(boss, remaining > 0 ? `${remaining}...` : '');
  }
  /** Same rise/fade animation as GameScene's floating damage numbers, in warning yellow instead of red. */
  private spawnShieldWarningText(boss: ActiveBoss, message: string): void {
    const scene = this.host.scene;
    const text = scene.add.text(boss.enemy.x, boss.enemy.y - boss.enemy.displayHeight / 2 - 10, message, {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '22px',
      color: '#ffcc33',
      stroke: '#321b00',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(15);
    scene.tweens.add({ targets: text, y: text.y - 34, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => text.destroy() });
  }
  private isPhaseTwo(boss: ActiveBoss): boolean {
    return boss.enemy.health <= boss.enemy.maxHealth * PHASE_TWO_HEALTH_RATIO;
  }
  /** Fase 1 punish combo: fires as soon as the player breaks the shield (see tryAbsorbShieldDamage) — 2 dashes, 3s apart. */
  private startShieldBreakDashCombo(boss: ActiveBoss): void {
    for (let index = 0; index < SHIELD_BREAK_DASH_COUNT; index += 1) {
      this.host.scene.time.delayedCall(index * SHIELD_BREAK_DASH_GAP_MS, () => {
        if (!boss.enemy.active || boss.dashState !== 'idle') return;
        this.startShieldDashTelegraph(boss, SHIELD_DASH_EXPLOSION_DAMAGE, SHIELD_DASH_EXPLOSION_RADIUS);
      });
    }
  }
  /** Blinks a telegraph twice, then dashes the boss to where the player was standing and detonates on arrival.
   *  Blinks the shield aura if one is still up (Fase 2's version, shield stays active throughout); otherwise
   *  flashes the boss sprite itself, since Fase 1's version only fires after the shield has already broken. */
  private startShieldDashTelegraph(boss: ActiveBoss, damage: number, radius: number): void {
    boss.dashState = 'telegraph';
    const player = this.host.getPlayer();
    boss.dashTarget = new Phaser.Math.Vector2(player.x, player.y);
    const scene = this.host.scene;
    const halfCycles = SHIELD_DASH_BLINK_COUNT * 2;
    const stepMs = SHIELD_DASH_TELEGRAPH_MS / halfCycles;
    for (let step = 1; step <= halfCycles; step += 1) {
      scene.time.delayedCall(stepMs * step, () => {
        if (boss.dashState !== 'telegraph') return;
        const flashOn = step % 2 === 1;
        if (boss.shieldAura) boss.shieldAura.setFillStyle(flashOn ? 0xffffff : 0x48ff52, flashOn ? 0.4 : 0.16);
        else if (flashOn) boss.enemy.setTintFill(0xffffff); else boss.enemy.clearTint();
      });
    }
    scene.time.delayedCall(SHIELD_DASH_TELEGRAPH_MS, () => this.beginShieldDash(boss, damage, radius));
  }
  private beginShieldDash(boss: ActiveBoss, damage: number, radius: number): void {
    if (!boss.enemy.active || !boss.dashTarget || boss.dashState !== 'telegraph') return;
    boss.dashState = 'dashing';
    boss.enemy.clearTint();
    // Getting hit mid-dash triggers Enemy's own hit-reaction shake, which also tweens x — that fought this tween
    // over the same property and caused the little wobble on arrival. Suppress it for the duration of the dash.
    boss.enemy.stopHitShake();
    boss.enemy.suppressHitShake = true;
    const target = boss.dashTarget;
    this.host.scene.tweens.add({
      targets: boss.enemy,
      x: target.x,
      y: target.y,
      duration: SHIELD_DASH_TRAVEL_MS,
      ease: 'Cubic.In',
      onComplete: () => {
        boss.enemy.suppressHitShake = false;
        boss.dashState = 'idle';
        boss.dashTarget = undefined;
        this.impactShieldDash(target.x, target.y, damage, radius);
      }
    });
  }
  private impactShieldDash(x: number, y: number, damage: number, radius: number): void {
    const scene = this.host.scene;
    const explosion = scene.add.circle(x, y, radius, 0x52ff45, 0.3).setStrokeStyle(6, 0xd8ffd0, 0.9).setDepth(12);
    scene.tweens.add({ targets: explosion, alpha: 0, scale: 1.2, duration: 380, onComplete: () => explosion.destroy() });
    if (this.host.isEnded()) return;
    const player = this.host.getPlayer();
    if (Phaser.Math.Distance.Between(x, y, player.x, player.y) > radius) return;
    if (player.damage(damage, scene.time.now) && player.health <= 0) this.host.finish(false);
  }
  /** Telegraphs an impact circle at the player's *current* position (not tracked afterward — a fixed spot they can just walk off), then lands it after `METEOR_TELEGRAPH_MS`. */
  private launchMeteor(boss: ActiveBoss): void {
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    const targetX = player.x;
    const targetY = player.y;
    const telegraphMs = this.isPhaseTwo(boss) ? METEOR_TELEGRAPH_PHASE2_MS : METEOR_TELEGRAPH_MS;
    const telegraph = scene.add.circle(targetX, targetY, METEOR_RADIUS, METEOR_COLOR, 0.22).setStrokeStyle(3, 0x8cffb0, 0.85).setDepth(9);
    scene.tweens.add({ targets: telegraph, alpha: 0.8, yoyo: true, repeat: -1, duration: 260 });
    const meteor = scene.add.circle(targetX, targetY, 16, 0x2fe86a, 0.95).setStrokeStyle(3, 0xd6ffd0, 1).setDepth(13).setScale(0.2);
    scene.tweens.add({ targets: meteor, scale: 1, duration: telegraphMs, ease: 'Cubic.In' });
    scene.time.delayedCall(telegraphMs, () => {
      telegraph.destroy();
      meteor.destroy();
      this.impactMeteor(targetX, targetY);
    });
  }
  private impactMeteor(x: number, y: number): void {
    const scene = this.host.scene;
    const explosion = scene.add.circle(x, y, METEOR_RADIUS, 0x52ff45, 0.35).setStrokeStyle(5, 0xd8ffd0, 0.9).setDepth(12);
    scene.tweens.add({ targets: explosion, alpha: 0, scale: 1.25, duration: 320, onComplete: () => explosion.destroy() });
    if (this.host.isEnded()) return;
    const player = this.host.getPlayer();
    if (Phaser.Math.Distance.Between(x, y, player.x, player.y) > METEOR_RADIUS) return;
    if (player.damage(METEOR_DAMAGE, scene.time.now) && player.health <= 0) this.host.finish(false);
  }
  private updateShieldVisual(boss: ActiveBoss): void {
    if (!boss.enemy.active || !boss.shieldActive) return;
    const scene = this.host.scene;
    if (!boss.shieldAura) {
      boss.shieldAura = scene.add.circle(boss.enemy.x, boss.enemy.y, 230, 0x48ff52, 0.16).setStrokeStyle(5, 0xb4ff9e, 0.88).setDepth(8);
      boss.shieldBack = scene.add.rectangle(boss.enemy.x, boss.enemy.y - boss.enemy.displayHeight / 2 - 34, 188, 10, 0x061009).setDepth(12);
      boss.shieldFill = scene.add.rectangle(boss.enemy.x, boss.enemy.y - boss.enemy.displayHeight / 2 - 34, 184, 5, 0x65ff5a).setDepth(13);
    }
    const width = Phaser.Math.Clamp(boss.shield / boss.maxShield, 0, 1) * 184;
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
    if (boss.shield <= 0) {
      this.endChannel(boss);
      // Fase 2 has its own guaranteed periodic dash while channeling (see updateBoss) — this break-triggered
      // combo is a Fase 1-only punish for popping the shield early.
      if (!this.isPhaseTwo(boss)) this.startShieldBreakDashCombo(boss);
    }
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
    boss.beamLockLine?.destroy();
    boss.arrow?.destroy();
    boss.countdownText?.destroy();
    return boss.isMain;
  }
}
