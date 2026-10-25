import { ENEMY_VARIANTS, ENEMY_VARIANT_SCHEDULE, EnemyVariantScheduleEntry } from '../../config/balance';
import { WORLD_SIZE } from '../../config/world';
import { Rng, Vec2, intBetween, randomPointAround } from '../math';
import { DifficultyStage } from './DifficultySystem';

export type EnemyVariantId = keyof typeof ENEMY_VARIANTS;

/** One enemy the scheduler wants on the field. How it looks and which pooled object carries it is the caller's job. */
export interface SpawnRequest {
  variantId: EnemyVariantId;
  x: number;
  y: number;
  maxHealth: number;
}

/** Everything the scheduler reads from the running game, exposed narrowly (same Host pattern as the other systems). */
export interface EnemySpawnSchedulerHost {
  getPlayerPosition(): Vec2;
  isSkeletonSpawnEnabled(): boolean;
  isVariantSpawnEnabled(): boolean;
  hasActiveEncounter(): boolean;
  difficultyStageFor(elapsedMs: number): DifficultyStage;
  spawn(request: SpawnRequest): void;
}

const SKELETON_SPAWN_DISTANCE = { min: 700, max: 900 };
const MAP_SPAWN_MARGIN = 120;
const BORDER_SPAWN_EDGE = 40;

/** Engine-agnostic "who/when/where/how strong" spawn decisions: the regular skeleton drip and the three scheduled
 *  variants (Necromante every 15s, Aparição hordes every 30s, Super Esqueleto waves every 40s — see
 *  ENEMY_VARIANT_SCHEDULE). Emits SpawnRequests through the host; systems/EnemySpawnSystem turns them into pooled
 *  Phaser enemies today, and the Three.js session will consume the same requests later. */
export class EnemySpawnScheduler {
  private skeletonSpawnElapsed = 0;
  private readonly variantSpawnElapsed = new Map<string, number>(ENEMY_VARIANT_SCHEDULE.map((entry) => [entry.variantId, 0]));
  /** Aparição horde size/health both grow with this — see spawnApparitionHorde. */
  private apparitionHordeLevel = 0;
  /** How many Super Esqueletos spawn in the next wave — grows +2 every wave (see spawnSuperSkeletonWave), uncapped
   *  by design: count is this variant's only difficulty lever besides the healthMultiplier applied per spawn. */
  private superSkeletonSpawnCount = 1;

  constructor(private readonly host: EnemySpawnSchedulerHost, private readonly rng: Rng) {}

  reset(): void {
    this.skeletonSpawnElapsed = 0;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.variantId, 0));
    this.apparitionHordeLevel = 0;
    this.superSkeletonSpawnCount = 1;
  }

  /** Advances every spawn timer by `delta` and fires whichever spawns are due. Call once per simulation step with the
   *  session's current elapsedMs (used to look up the active difficulty stage). */
  update(delta: number, elapsedMs: number): void {
    this.skeletonSpawnElapsed += delta;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.variantId, (this.variantSpawnElapsed.get(entry.variantId) ?? 0) + delta));
    this.spawnDueSkeletons(elapsedMs);
    this.spawnDueVariants(elapsedMs);
  }

  /** Random point in the 160–260 ring around the player — the sandbox's manual "spawn near player" placement. */
  pointNearPlayer(): Vec2 {
    return randomPointAround(this.rng, this.host.getPlayerPosition(), 160, 260);
  }

  private spawnDueSkeletons(elapsedMs: number): void {
    if (!this.host.isSkeletonSpawnEnabled() || this.host.hasActiveEncounter()) return;
    const stage = this.host.difficultyStageFor(elapsedMs);
    if (this.skeletonSpawnElapsed < stage.spawnInterval) return;
    this.skeletonSpawnElapsed = 0;
    for (let i = 0; i < stage.count; i += 1) {
      const position = randomPointAround(this.rng, this.host.getPlayerPosition(), SKELETON_SPAWN_DISTANCE.min, SKELETON_SPAWN_DISTANCE.max);
      this.host.spawn({ variantId: 'skeleton', ...position, maxHealth: ENEMY_VARIANTS.skeleton.maxHealth * stage.healthMultiplier });
    }
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

  /** Necromante and Super Esqueleto scale through the same DifficultySystem.healthMultiplier (time stage x boss-cycle)
   *  as the skeleton, so nothing in the roster is exempt from difficulty scaling. */
  private spawnScheduledVariant(variantId: EnemyVariantScheduleEntry['variantId'], elapsedMs: number): void {
    const healthMultiplier = this.host.difficultyStageFor(elapsedMs).healthMultiplier;
    if (variantId === 'necromancerWraith') { this.spawnNecromancer(healthMultiplier); return; }
    if (variantId === 'apparitionWraith') { this.spawnApparitionHorde(); return; }
    this.spawnSuperSkeletonWave(healthMultiplier);
  }

  private spawnNecromancer(healthMultiplier: number): void {
    this.host.spawn({ variantId: 'necromancerWraith', ...this.randomMapPosition(), maxHealth: ENEMY_VARIANTS.necromancerWraith.maxHealth * healthMultiplier });
  }

  private spawnApparitionHorde(): void {
    const count = 10 + this.apparitionHordeLevel * 2;
    const health = ENEMY_VARIANTS.apparitionWraith.maxHealth + this.apparitionHordeLevel * 12;
    for (let index = 0; index < count; index += 1) {
      this.host.spawn({ variantId: 'apparitionWraith', ...this.randomBorderPosition(), maxHealth: health });
    }
    this.apparitionHordeLevel += 1;
  }

  private spawnSuperSkeletonWave(healthMultiplier: number): void {
    for (let index = 0; index < this.superSkeletonSpawnCount; index += 1) {
      this.host.spawn({ variantId: 'superSkeleton', ...this.randomBorderPosition(), maxHealth: ENEMY_VARIANTS.superSkeleton.maxHealth * healthMultiplier });
    }
    this.superSkeletonSpawnCount += 2;
  }

  private randomMapPosition(): Vec2 {
    return { x: intBetween(this.rng, MAP_SPAWN_MARGIN, WORLD_SIZE - MAP_SPAWN_MARGIN), y: intBetween(this.rng, MAP_SPAWN_MARGIN, WORLD_SIZE - MAP_SPAWN_MARGIN) };
  }

  private randomBorderPosition(): Vec2 {
    const side = intBetween(this.rng, 0, 3);
    if (side === 0) return { x: intBetween(this.rng, 0, WORLD_SIZE), y: BORDER_SPAWN_EDGE };
    if (side === 1) return { x: intBetween(this.rng, 0, WORLD_SIZE), y: WORLD_SIZE - BORDER_SPAWN_EDGE };
    if (side === 2) return { x: BORDER_SPAWN_EDGE, y: intBetween(this.rng, 0, WORLD_SIZE) };
    return { x: WORLD_SIZE - BORDER_SPAWN_EDGE, y: intBetween(this.rng, 0, WORLD_SIZE) };
  }
}
