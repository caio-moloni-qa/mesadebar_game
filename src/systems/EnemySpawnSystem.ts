import Phaser from 'phaser';
import { ENEMY_VARIANTS } from '../config/balance';
import { Rng } from '../core/math';
import { DifficultyStage } from '../core/systems/DifficultySystem';
import { EnemySpawnScheduler, SpawnRequest } from '../core/systems/EnemySpawnScheduler';
import { Enemy, EnemyVariantConfig } from '../entities/Enemy';
import { Player } from '../entities/Player';

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

/** Phaser adapter around core/systems/EnemySpawnScheduler: the scheduler decides who/when/where/how strong, this
 *  class turns each SpawnRequest into a pooled Arcade Enemy with the variant's texture and display overrides. Also
 *  owns the shared enemy-pool + config-building primitives (spawnEnemyVariant, enemyConfig) that BossSystem
 *  (apparition summons mid-fight) and SandboxDebugPanel (manual F9 variant spawns) spawn through too, so there is
 *  exactly one place that knows how to pull an Enemy out of the pool. */
export class EnemySpawnSystem {
  private readonly scheduler: EnemySpawnScheduler;

  constructor(private readonly host: EnemySpawnHost, rng: Rng) {
    this.scheduler = new EnemySpawnScheduler({
      getPlayerPosition: () => host.getPlayer(),
      isSkeletonSpawnEnabled: () => host.isSkeletonSpawnEnabled(),
      isVariantSpawnEnabled: () => host.isVariantSpawnEnabled(),
      hasActiveEncounter: () => host.hasActiveEncounter(),
      difficultyStageFor: (elapsedMs) => host.difficultyStageFor(elapsedMs),
      spawn: (request) => this.spawnRequested(request)
    }, rng);
  }

  reset(): void {
    this.scheduler.reset();
  }

  /** Advances every spawn timer by `delta` and fires whichever spawns are due. Call once per frame from
   *  GameScene.update() with the scene's current elapsedMs (used to look up the active difficulty stage). */
  update(delta: number, elapsedMs: number): void {
    this.scheduler.update(delta, elapsedMs);
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
    for (let index = 0; index < count; index += 1) {
      const position = this.scheduler.pointNearPlayer();
      this.spawnEnemyVariant(position.x, position.y, this.enemyConfig(id, VARIANT_DISPLAY_OVERRIDES[id]));
    }
  }

  private spawnRequested(request: SpawnRequest): void {
    this.spawnEnemyVariant(request.x, request.y, this.enemyConfig(request.variantId, { ...VARIANT_DISPLAY_OVERRIDES[request.variantId], maxHealth: request.maxHealth }));
  }
}
