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
const FINAL_BOSS_MELEE_RADIUS = 250;
const FINAL_BOSS_EXPLOSION_RADIUS = 700;
const EXTRA_BOSS_SPAWN_DISTANCE = 520;

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
      nextShieldBoltAt: 0
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
    boss.summonElapsed += delta;
    boss.channelElapsed += delta;
    if (boss.summonElapsed >= FINAL_BOSS_SUMMON_INTERVAL_MS) {
      boss.summonElapsed = 0;
      this.summonApparitions(boss);
    }
    if (boss.channelElapsed >= FINAL_BOSS_CHANNEL_INTERVAL_MS) { this.startChannel(boss); return; }
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
    if (Phaser.Math.Distance.Between(boss.enemy.x, boss.enemy.y, player.x, player.y) > FINAL_BOSS_MELEE_RADIUS) return;
    boss.meleeLastAt = scene.time.now;
    const direction = new Phaser.Math.Vector2(player.x - boss.enemy.x, player.y - boss.enemy.y).normalize();
    this.playMeleeSlash(boss, direction);
    scene.time.delayedCall(220, () => {
      if (this.host.isEnded() || !boss.enemy.active) return;
      if (Phaser.Math.Distance.Between(boss.enemy.x, boss.enemy.y, player.x, player.y) <= FINAL_BOSS_MELEE_RADIUS && player.damage(40, scene.time.now) && player.health <= 0) this.host.finish(false);
    });
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
  private playMeleeSlash(boss: ActiveBoss, direction: Phaser.Math.Vector2): void {
    const scene = this.host.scene;
    const slash = scene.add.sprite(boss.enemy.x + direction.x * 118, boss.enemy.y + direction.y * 118, 'sword-air-slash')
      .setDisplaySize(300, 300)
      .setTint(0x52ff45)
      .setAlpha(0.88)
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD);
    slash.rotation = Phaser.Math.Angle.Between(0, 0, direction.x, direction.y) + Math.PI;
    slash.play('sword-air-slash-swing');
    scene.tweens.add({
      targets: slash,
      x: boss.enemy.x + direction.x * 168,
      y: boss.enemy.y + direction.y * 168,
      alpha: 0.12,
      duration: 320,
      ease: 'Quad.Out'
    });
    slash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => slash.destroy());
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
    boss.arrow?.destroy();
    boss.countdownText?.destroy();
    return boss.isMain;
  }
}
