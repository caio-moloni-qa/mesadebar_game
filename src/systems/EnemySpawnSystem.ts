import Phaser from 'phaser';
import { ENEMY_VARIANTS, ENEMY_VARIANT_SCHEDULE, EnemyVariantScheduleEntry } from '../config/balance';
import { WORLD_SIZE } from '../config/gameConfig';
import { Enemy, EnemyVariantConfig } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { DifficultyStage } from './DifficultySystem';

const ENEMY_TEXTURE_KEYS: Record<EnemyVariantConfig['id'], string> = {
  skeleton: 'skeleton-sword',
  necromancerWraith: 'necromancer-wraith',
  apparitionWraith: 'apparition-wraith',
  superSkeleton: 'super-skeleton',
  finalBoss: 'final-boss'
};

/** Display/behavior overrides layered onto each scheduled variant's base ENEMY_VARIANTS stats. Shared between the
 *  real scheduled spawns below and SandboxDebugPanel's manual "spawn near player" shortcut (spawnNearPlayer) so
 *  debug-spawned enemies always look and behave exactly like the real thing. */
const VARIANT_DISPLAY_OVERRIDES: Partial<Record<EnemyVariantConfig['id'], Partial<Omit<EnemyVariantConfig, 'id'>>>> = {
  necromancerWraith: { isStatic: true, displaySize: 68 },
  apparitionWraith: { displaySize: 68 },
  superSkeleton: { isMiniBoss: true, displaySize: 92 }
};

/** Everything EnemySpawnSystem needs from GameScene, exposed narrowly so the two stay decoupled. */
export interface EnemySpawnHost {
  scene: Phaser.Scene;
  getPlayer(): Player;
  getEnemies(): Phaser.Physics.Arcade.Group;
  isSkeletonSpawnEnabled(): boolean;
  isVariantSpawnEnabled(): boolean;
  hasActiveEncounter(): boolean;
  difficultyStageFor(elapsedMs: number): DifficultyStage;
}

/** Owns every "who/when/how many enemies spawn" decision: the regular skeleton drip and the three scheduled
 *  variants (Necromante every 15s, Aparição hordes every 30s, Super Esqueleto waves every 40s — see
 *  ENEMY_VARIANT_SCHEDULE). Also owns the shared enemy-pool + config-building primitives (spawnEnemyVariant,
 *  enemyConfig) that BossSystem (apparition summons mid-fight) and SandboxDebugPanel (manual F9 variant spawns)
 *  spawn through too, so there is exactly one place that knows how to pull an Enemy out of the pool.
 *  Kept decoupled from GameScene the same way MerchantSystem/BossSystem are — only talks to the scene through
 *  EnemySpawnHost. */
export class EnemySpawnSystem {
  private skeletonSpawnElapsed = 0;
  private readonly variantSpawnElapsed = new Map<string, number>(ENEMY_VARIANT_SCHEDULE.map((entry) => [entry.variantId, 0]));
  /** Aparição horde size/health both grow with this — see spawnApparitionHorde. */
  private apparitionHordeLevel = 0;
  /** How many Super Esqueletos spawn in the next wave — grows +2 every wave (see spawnSuperSkeletonWave), uncapped
   *  by design: count is this variant's only difficulty lever besides the healthMultiplier applied per spawn. */
  private superSkeletonSpawnCount = 1;

  constructor(private readonly host: EnemySpawnHost) {}

  reset(): void {
    this.skeletonSpawnElapsed = 0;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.variantId, 0));
    this.apparitionHordeLevel = 0;
    this.superSkeletonSpawnCount = 1;
  }

  /** Advances every spawn timer by `delta` and fires whichever spawns are due. Call once per frame from
   *  GameScene.update() with the scene's current elapsedMs (used to look up the active difficulty stage). */
  update(delta: number, elapsedMs: number): void {
    this.skeletonSpawnElapsed += delta;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.variantId, (this.variantSpawnElapsed.get(entry.variantId) ?? 0) + delta));
    this.spawnDueSkeletons(elapsedMs);
    this.spawnDueVariants(elapsedMs);
  }

  /** Shared enemy-pool primitive: reuses a dead enemy from the pool, or creates one if there's room left. The one
   *  place anything in the game (scheduled spawns, boss apparition summons, sandbox manual spawns) goes through
   *  to actually put an Enemy on screen. */
  spawnEnemyVariant(x: number, y: number, config: EnemyVariantConfig): Enemy | null {
    const enemies = this.host.getEnemies();
    let enemy = enemies.getFirstDead(false) as Enemy | null;
    // `Group.add` ignores additions after maxSize — check capacity before creating, or the sprite ends up on
    // screen with a physics body outside the group: never updated, never considered by overlaps.
    if (!enemy && enemies.isFull()) return null;
    if (!enemy) {
      enemy = new Enemy(this.host.scene);
      enemies.add(enemy);
    }
    enemy.activate(x, y, config);
    return enemy;
  }

  /** Builds a variant's full spawn config: base stats from ENEMY_VARIANTS + its texture key + whatever overrides
   *  the caller layers on top (health-scaled maxHealth, display overrides, etc). */
  enemyConfig(id: EnemyVariantConfig['id'], overrides: Partial<Omit<EnemyVariantConfig, 'id'>> = {}): EnemyVariantConfig {
    return { id, texture: ENEMY_TEXTURE_KEYS[id], ...ENEMY_VARIANTS[id], ...overrides };
  }

  /** SandboxDebugPanel's manual "spawn near player" shortcut (F9 panel). Reuses VARIANT_DISPLAY_OVERRIDES so
   *  debug-spawned variants match the real scheduled spawns exactly. */
  spawnNearPlayer(id: EnemyVariantConfig['id'], count: number): void {
    const player = this.host.getPlayer();
    for (let index = 0; index < count; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(160, 260);
      this.spawnEnemyVariant(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance, this.enemyConfig(id, VARIANT_DISPLAY_OVERRIDES[id]));
    }
  }

  private spawnDueSkeletons(elapsedMs: number): void {
    if (!this.host.isSkeletonSpawnEnabled() || this.host.hasActiveEncounter()) return;
    const stage = this.host.difficultyStageFor(elapsedMs);
    if (this.skeletonSpawnElapsed < stage.spawnInterval) return;
    this.skeletonSpawnElapsed = 0;
    for (let i = 0; i < stage.count; i += 1) this.spawnSkeleton(stage.healthMultiplier);
  }

  private spawnSkeleton(healthMultiplier: number): void {
    const player = this.host.getPlayer();
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(700, 900);
    this.spawnEnemyVariant(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance, this.enemyConfig('skeleton', { maxHealth: ENEMY_VARIANTS.skeleton.maxHealth * healthMultiplier }));
  }

  private spawnDueVariants(elapsedMs: number): void {
    if (!this.host.isVariantSpawnEnabled() || this.host.hasActiveEncounter()) return;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => {
      const elapsed = this.variantSpawnElapsed.get(entry.variantId) ?? 0;
      if (elapsed < entry.intervalMs) return;
      this.variantSpawnElapsed.set(entry.variantId, 0);
      this.spawnScheduledVariant(entry.variantId, elapsedMs);
    });
  }

  /** Necromante and Super Esqueleto used to spawn with flat maxHealth forever — only the plain skeleton (inline
   *  here) and the Aparição (its own horde-level formula) actually got tougher over time. Both now scale through
   *  the same DifficultySystem.healthMultiplier (time stage x boss-cycle) as the skeleton, so nothing in the
   *  roster is exempt from difficulty scaling anymore. */
  private spawnScheduledVariant(variantId: EnemyVariantScheduleEntry['variantId'], elapsedMs: number): void {
    const healthMultiplier = this.host.difficultyStageFor(elapsedMs).healthMultiplier;
    if (variantId === 'necromancerWraith') { this.spawnNecromancer(healthMultiplier); return; }
    if (variantId === 'apparitionWraith') { this.spawnApparitionHorde(); return; }
    this.spawnSuperSkeletonWave(healthMultiplier);
  }

  private spawnNecromancer(healthMultiplier: number): void {
    const position = this.randomMapPosition();
    this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('necromancerWraith', { ...VARIANT_DISPLAY_OVERRIDES.necromancerWraith, maxHealth: ENEMY_VARIANTS.necromancerWraith.maxHealth * healthMultiplier }));
  }

  private spawnApparitionHorde(): void {
    const count = 10 + this.apparitionHordeLevel * 2;
    const health = ENEMY_VARIANTS.apparitionWraith.maxHealth + this.apparitionHordeLevel * 12;
    for (let index = 0; index < count; index += 1) {
      const position = this.randomBorderPosition();
      this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('apparitionWraith', { ...VARIANT_DISPLAY_OVERRIDES.apparitionWraith, maxHealth: health }));
    }
    this.apparitionHordeLevel += 1;
  }

  private spawnSuperSkeletonWave(healthMultiplier: number): void {
    for (let index = 0; index < this.superSkeletonSpawnCount; index += 1) {
      const position = this.randomBorderPosition();
      this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('superSkeleton', { ...VARIANT_DISPLAY_OVERRIDES.superSkeleton, maxHealth: ENEMY_VARIANTS.superSkeleton.maxHealth * healthMultiplier }));
    }
    this.superSkeletonSpawnCount += 2;
  }

  private randomMapPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(Phaser.Math.Between(120, WORLD_SIZE - 120), Phaser.Math.Between(120, WORLD_SIZE - 120));
  }
  private randomBorderPosition(): Phaser.Math.Vector2 {
    const side = Phaser.Math.Between(0, 3);
    const edge = 40;
    if (side === 0) return new Phaser.Math.Vector2(Phaser.Math.Between(0, WORLD_SIZE), edge);
    if (side === 1) return new Phaser.Math.Vector2(Phaser.Math.Between(0, WORLD_SIZE), WORLD_SIZE - edge);
    if (side === 2) return new Phaser.Math.Vector2(edge, Phaser.Math.Between(0, WORLD_SIZE));
    return new Phaser.Math.Vector2(WORLD_SIZE - edge, Phaser.Math.Between(0, WORLD_SIZE));
  }
}
