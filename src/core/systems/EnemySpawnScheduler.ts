import { ENEMY_VARIANTS, ENEMY_VARIANT_SCHEDULE, EnemyVariantScheduleEntry, GUARDIAN_FIGHT_SPAWNS, HORDE_BY_ARENA, WOLF_PACK, HordeRoster, HordeVariantId, MINI_BOSS_VARIANTS, NEUTRAL_VARIANTS } from '../../config/balance';
import { WORLD_SIZE } from '../../config/world';
import { Rng, Vec2, floatBetween, intBetween, randomPointAround } from '../math';
import { DifficultyStage } from './DifficultySystem';

/** The variants the timed schedule spawns (every arena's horde roster). */
export type ScheduledVariantId = HordeVariantId;
export type MiniBossVariantId = keyof typeof MINI_BOSS_VARIANTS;
export type NeutralVariantId = keyof typeof NEUTRAL_VARIANTS;
/** Everything the 3D core can spawn: the schedule's variants, the zone mini-bosses and the neutral creatures. */
export type EnemyVariantId = ScheduledVariantId | MiniBossVariantId | NeutralVariantId;

/** One enemy the scheduler wants on the field. How it looks and which pooled object carries it is the caller's job. */
export interface SpawnRequest {
  variantId: ScheduledVariantId;
  x: number;
  y: number;
  maxHealth: number;
  /** A pack member's side of the hero (radians, world x/y): it circles out there before biting (WOLF_PACK). */
  flankAngle?: number;
  /** Which pack it runs with (1, 2, ...): the session counts a pack wiped out when its last member falls. */
  pack?: number;
}

/** Everything the scheduler reads from the running game, exposed narrowly (same Host pattern as the other systems). */
export interface EnemySpawnSchedulerHost {
  getPlayerPosition(): Vec2;
  isSkeletonSpawnEnabled(): boolean;
  isVariantSpawnEnabled(): boolean;
  hasActiveEncounter(): boolean;
  /** A zone guardian is announced or up: spawns thin out (GUARDIAN_FIGHT_SPAWNS). */
  guardianFight?(): boolean;
  /** Enemies on the field now (the guardian fight's cap). */
  liveEnemyCount?(): number;
  difficultyStageFor(elapsedMs: number): DifficultyStage;
  spawn(request: SpawnRequest): void;
}

const SKELETON_SPAWN_DISTANCE = { min: 700, max: 900 };
const MAP_SPAWN_MARGIN = 120;
const BORDER_SPAWN_EDGE = 40;

/** Engine-agnostic "who/when/where/how strong" spawn decisions: the base drip and the three scheduled roles
 *  (summoner every 15s, fast hordes every 30s, elite waves every 40s — see ENEMY_VARIANT_SCHEDULE). Which variant
 *  plays each role comes from the arena's roster (HORDE_BY_ARENA). Emits SpawnRequests through the host, which the
 *  session turns into enemies. */
export class EnemySpawnScheduler {
  private skeletonSpawnElapsed = 0;
  private packSpawnElapsed = 0;
  private packsSpawned = 0;
  private readonly variantSpawnElapsed = new Map<string, number>(ENEMY_VARIANT_SCHEDULE.map((entry) => [entry.role, 0]));
  /** Fast horde size/health both grow with this — see spawnFastHorde. */
  private apparitionHordeLevel = 0;
  /** How many elites spawn in the next wave — grows +2 every wave (see spawnEliteWave), uncapped by design: count
   *  is this role's only difficulty lever besides the healthMultiplier applied per spawn. */
  private superSkeletonSpawnCount = 1;

  /** `worldSize`: side of the square play area. `horde`: who plays each role (Greenfield's unless told otherwise). */
  constructor(private readonly host: EnemySpawnSchedulerHost, private readonly rng: Rng, private readonly worldSize: number = WORLD_SIZE, private readonly horde: HordeRoster = HORDE_BY_ARENA.greenfield) {}

  reset(): void {
    this.skeletonSpawnElapsed = 0;
    this.packSpawnElapsed = 0;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.role, 0));
    this.apparitionHordeLevel = 0;
    this.superSkeletonSpawnCount = 1;
  }

  /** Advances every spawn timer by `delta` and fires whichever spawns are due. Call once per simulation step with the
   *  session's current elapsedMs (used to look up the active difficulty stage). */
  update(delta: number, elapsedMs: number): void {
    this.skeletonSpawnElapsed += delta;
    // The hordes wait out a guardian fight instead of arriving the moment it ends.
    if (!this.host.guardianFight?.()) ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.role, (this.variantSpawnElapsed.get(entry.role) ?? 0) + delta));
    this.spawnDueSkeletons(elapsedMs);
    if (this.horde.pack) this.spawnDuePack(delta, elapsedMs);
    this.spawnDueVariants(elapsedMs);
  }

  /** Random point in the 160–260 ring around the player — the sandbox's manual "spawn near player" placement. */
  pointNearPlayer(): Vec2 {
    return randomPointAround(this.rng, this.host.getPlayerPosition(), 160, 260);
  }

  private spawnDueSkeletons(elapsedMs: number): void {
    if (!this.host.isSkeletonSpawnEnabled() || this.host.hasActiveEncounter()) return;
    const stage = this.host.difficultyStageFor(elapsedMs);
    const fight = this.host.guardianFight?.() ?? false;
    if (this.skeletonSpawnElapsed < stage.spawnInterval * (fight ? GUARDIAN_FIGHT_SPAWNS.intervalMultiplier : 1)) return;
    this.skeletonSpawnElapsed = 0;
    if (fight && (this.host.liveEnemyCount?.() ?? 0) >= GUARDIAN_FIGHT_SPAWNS.enemyCap) return;
    const count = fight ? Math.min(stage.count, GUARDIAN_FIGHT_SPAWNS.maxPerTick) : stage.count;
    const variantId = this.horde.base;
    for (let i = 0; i < count; i += 1) {
      const position = randomPointAround(this.rng, this.host.getPlayerPosition(), SKELETON_SPAWN_DISTANCE.min, SKELETON_SPAWN_DISTANCE.max);
      this.host.spawn({ variantId, ...position, maxHealth: ENEMY_VARIANTS[variantId].maxHealth * stage.healthMultiplier });
    }
  }

  /** The roster's pack creature, a whole pack at a time; it sits out encounters and guardian fights. */
  private spawnDuePack(delta: number, elapsedMs: number): void {
    if (!this.host.isSkeletonSpawnEnabled() || this.host.hasActiveEncounter() || this.host.guardianFight?.()) return;
    this.packSpawnElapsed += delta;
    if (this.packSpawnElapsed < WOLF_PACK.intervalMs) return;
    this.packSpawnElapsed = 0;
    const center = randomPointAround(this.rng, this.host.getPlayerPosition(), SKELETON_SPAWN_DISTANCE.min, SKELETON_SPAWN_DISTANCE.max);
    this.spawnPack(center, intBetween(this.rng, WOLF_PACK.min, WOLF_PACK.max), this.host.difficultyStageFor(elapsedMs).healthMultiplier);
  }

  /** `count` of the roster's pack creature (wolves if it has none) bunched around `center`, each sent to its own side
   *  of the hero: evenly over WOLF_PACK.flankArc either way of the line the pack comes in on. */
  spawnPack(center: Vec2, count: number, healthMultiplier = 1): void {
    const variantId = this.horde.pack ?? 'iceWolf';
    this.packsSpawned += 1;
    const pack = this.packsSpawned;
    const player = this.host.getPlayerPosition();
    const approach = Math.atan2(center.y - player.y, center.x - player.x);
    for (let index = 0; index < count; index += 1) {
      const position = randomPointAround(this.rng, center, 0, WOLF_PACK.spread);
      const share = count === 1 ? 0 : index / (count - 1) * 2 - 1;
      const flankAngle = approach + share * WOLF_PACK.flankArc + floatBetween(this.rng, -0.15, 0.15);
      this.host.spawn({ variantId, ...position, maxHealth: ENEMY_VARIANTS[variantId].maxHealth * healthMultiplier, flankAngle, pack });
    }
  }

  private spawnDueVariants(elapsedMs: number): void {
    if (!this.host.isVariantSpawnEnabled() || this.host.hasActiveEncounter() || this.host.guardianFight?.()) return;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => {
      const elapsed = this.variantSpawnElapsed.get(entry.role) ?? 0;
      if (elapsed < entry.intervalMs) return;
      this.variantSpawnElapsed.set(entry.role, 0);
      this.spawnScheduledRole(entry.role, elapsedMs);
    });
  }

  /** The summoner and the elite scale through the same DifficultySystem.healthMultiplier (time stage x boss-cycle)
   *  as the base, so nothing in the roster is exempt from difficulty scaling. */
  private spawnScheduledRole(role: EnemyVariantScheduleEntry['role'], elapsedMs: number): void {
    const healthMultiplier = this.host.difficultyStageFor(elapsedMs).healthMultiplier;
    if (role === 'summoner') { this.spawnSummoner(healthMultiplier); return; }
    if (role === 'fast') { this.spawnFastHorde(); return; }
    this.spawnEliteWave(healthMultiplier);
  }

  private spawnSummoner(healthMultiplier: number): void {
    const variantId = this.horde.summoner;
    this.host.spawn({ variantId, ...this.randomMapPosition(), maxHealth: ENEMY_VARIANTS[variantId].maxHealth * healthMultiplier });
  }

  private spawnFastHorde(): void {
    const variantId = this.horde.fast;
    const count = 10 + this.apparitionHordeLevel * 2;
    const health = ENEMY_VARIANTS[variantId].maxHealth + this.apparitionHordeLevel * 12;
    for (let index = 0; index < count; index += 1) {
      this.host.spawn({ variantId, ...this.randomBorderPosition(), maxHealth: health });
    }
    this.apparitionHordeLevel += 1;
  }

  private spawnEliteWave(healthMultiplier: number): void {
    const variantId = this.horde.elite;
    for (let index = 0; index < this.superSkeletonSpawnCount; index += 1) {
      this.host.spawn({ variantId, ...this.randomBorderPosition(), maxHealth: ENEMY_VARIANTS[variantId].maxHealth * healthMultiplier });
    }
    this.superSkeletonSpawnCount += 2;
  }

  private randomMapPosition(): Vec2 {
    return { x: intBetween(this.rng, MAP_SPAWN_MARGIN, this.worldSize - MAP_SPAWN_MARGIN), y: intBetween(this.rng, MAP_SPAWN_MARGIN, this.worldSize - MAP_SPAWN_MARGIN) };
  }

  private randomBorderPosition(): Vec2 {
    const side = intBetween(this.rng, 0, 3);
    const size = this.worldSize;
    if (side === 0) return { x: intBetween(this.rng, 0, size), y: BORDER_SPAWN_EDGE };
    if (side === 1) return { x: intBetween(this.rng, 0, size), y: size - BORDER_SPAWN_EDGE };
    if (side === 2) return { x: BORDER_SPAWN_EDGE, y: intBetween(this.rng, 0, size) };
    return { x: size - BORDER_SPAWN_EDGE, y: intBetween(this.rng, 0, size) };
  }
}
