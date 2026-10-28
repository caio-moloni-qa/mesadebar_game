import { describe, expect, it } from 'vitest';
import { DIFFICULTY_STAGES, ENEMY_VARIANTS, ENEMY_VARIANT_SCHEDULE, GUARDIAN_FIGHT_SPAWNS, HORDE_BY_ARENA, HordeRoster, WOLF_PACK, hordeFor } from '../../config/balance';
import { WORLD_SIZE } from '../../config/world';
import { createRng, distanceSq } from '../math';
import { DifficultySystem } from './DifficultySystem';
import { EnemySpawnScheduler, SpawnRequest } from './EnemySpawnScheduler';

const PLAYER = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };

function setup(options: { skeletons?: boolean; variants?: boolean; encounter?: boolean; guardian?: () => boolean; live?: () => number } = {}) {
  const requests: SpawnRequest[] = [];
  const difficulty = new DifficultySystem();
  const scheduler = new EnemySpawnScheduler({
    getPlayerPosition: () => PLAYER,
    isSkeletonSpawnEnabled: () => options.skeletons ?? true,
    isVariantSpawnEnabled: () => options.variants ?? true,
    hasActiveEncounter: () => options.encounter ?? false,
    guardianFight: options.guardian,
    liveEnemyCount: options.live,
    difficultyStageFor: (elapsedMs) => difficulty.stageFor(elapsedMs),
    spawn: (request) => requests.push(request)
  }, createRng(2024));
  const ofVariant = (id: SpawnRequest['variantId']) => requests.filter((request) => request.variantId === id);
  return { requests, scheduler, difficulty, ofVariant };
}

const onBorder = (request: SpawnRequest) => request.x === 40 || request.x === WORLD_SIZE - 40 || request.y === 40 || request.y === WORLD_SIZE - 40;

describe('EnemySpawnScheduler — skeleton drip', () => {
  it('spawns stage.count skeletons once per stage interval, 700–900 from the player', () => {
    const { requests, scheduler } = setup({ variants: false });
    scheduler.update(999, 999);
    expect(requests).toHaveLength(0);
    scheduler.update(1, 1000);
    expect(requests).toHaveLength(DIFFICULTY_STAGES[0].count);
    const distance = Math.sqrt(distanceSq(requests[0], PLAYER));
    expect(distance).toBeGreaterThanOrEqual(700 - 1e-9);
    expect(distance).toBeLessThanOrEqual(900 + 1e-9);
    expect(requests[0].maxHealth).toBe(ENEMY_VARIANTS.skeleton.maxHealth * DIFFICULTY_STAGES[0].healthMultiplier);
  });

  it('uses the later stage\'s interval, count and health', () => {
    const { requests, scheduler } = setup({ variants: false });
    scheduler.update(DIFFICULTY_STAGES[2].spawnInterval, DIFFICULTY_STAGES[2].startMs);
    expect(requests).toHaveLength(DIFFICULTY_STAGES[2].count);
    requests.forEach((request) => expect(request.maxHealth).toBe(ENEMY_VARIANTS.skeleton.maxHealth * DIFFICULTY_STAGES[2].healthMultiplier));
  });

  it('pauses during a boss encounter and when toggled off', () => {
    expect(((): number => { const s = setup({ encounter: true }); s.scheduler.update(60_000, 60_000); return s.requests.length; })()).toBe(0);
    expect(((): number => { const s = setup({ skeletons: false, variants: false }); s.scheduler.update(60_000, 60_000); return s.requests.length; })()).toBe(0);
  });
});

describe('EnemySpawnScheduler — scheduled variants', () => {
  it('spawns a Necromante every 15s inside the map margin', () => {
    const { scheduler, ofVariant } = setup({ skeletons: false });
    scheduler.update(14_999, 14_999);
    expect(ofVariant('necromancerWraith')).toHaveLength(0);
    scheduler.update(1, 15_000);
    const [necromancer] = ofVariant('necromancerWraith');
    expect(necromancer.x).toBeGreaterThanOrEqual(120);
    expect(necromancer.x).toBeLessThanOrEqual(WORLD_SIZE - 120);
    expect(necromancer.maxHealth).toBe(ENEMY_VARIANTS.necromancerWraith.maxHealth * DIFFICULTY_STAGES[0].healthMultiplier);
  });

  it('grows Aparição hordes by 2 and +12 HP every 30s, always on the border', () => {
    const { scheduler, ofVariant } = setup({ skeletons: false });
    scheduler.update(30_000, 30_000);
    expect(ofVariant('apparitionWraith')).toHaveLength(10);
    scheduler.update(30_000, 60_000);
    const hordes = ofVariant('apparitionWraith');
    expect(hordes).toHaveLength(10 + 12);
    expect(hordes[10].maxHealth).toBe(ENEMY_VARIANTS.apparitionWraith.maxHealth + 12);
    hordes.forEach((request) => expect(onBorder(request)).toBe(true));
  });

  it('grows Super Esqueleto waves 1 → 3 → 5', () => {
    const { scheduler, ofVariant } = setup({ skeletons: false });
    scheduler.update(40_000, 40_000);
    expect(ofVariant('superSkeleton')).toHaveLength(1);
    scheduler.update(40_000, 80_000);
    expect(ofVariant('superSkeleton')).toHaveLength(4);
    scheduler.update(40_000, 120_000);
    expect(ofVariant('superSkeleton')).toHaveLength(9);
  });

  it('reset() restarts timers and horde growth', () => {
    const { scheduler, ofVariant, requests } = setup({ skeletons: false });
    scheduler.update(40_000, 40_000);
    scheduler.reset();
    requests.length = 0;
    scheduler.update(39_999, 39_999);
    expect(ofVariant('superSkeleton')).toHaveLength(0);
    scheduler.update(1, 40_000);
    expect(ofVariant('superSkeleton')).toHaveLength(1);
    expect(ofVariant('apparitionWraith')).toHaveLength(10);
  });
});

describe('EnemySpawnScheduler — guardian fights', () => {
  const lateStage = DIFFICULTY_STAGES[2];

  it('drips one skeleton at a time, much further apart', () => {
    const { requests, scheduler } = setup({ variants: false, guardian: () => true, live: () => 0 });
    scheduler.update(lateStage.spawnInterval * GUARDIAN_FIGHT_SPAWNS.intervalMultiplier - 1, lateStage.startMs);
    expect(requests).toHaveLength(0);
    scheduler.update(1, lateStage.startMs);
    expect(requests).toHaveLength(GUARDIAN_FIGHT_SPAWNS.maxPerTick);
  });

  it('spawns nothing while the field is at the cap', () => {
    const { requests, scheduler } = setup({ variants: false, guardian: () => true, live: () => GUARDIAN_FIGHT_SPAWNS.enemyCap });
    scheduler.update(60_000, lateStage.startMs);
    expect(requests).toHaveLength(0);
  });

  it('holds the hordes until the fight is over, without bunching them up', () => {
    let fight = true;
    const { requests, scheduler } = setup({ skeletons: false, guardian: () => fight });
    const longest = Math.max(...ENEMY_VARIANT_SCHEDULE.map((entry) => entry.intervalMs));
    scheduler.update(longest * 3, 0);
    expect(requests).toHaveLength(0);
    fight = false;
    scheduler.update(1, 0);
    expect(requests).toHaveLength(0);
  });
});

describe('EnemySpawnScheduler — horde per arena', () => {
  const run = (horde: HordeRoster) => {
    const requests: SpawnRequest[] = [];
    const difficulty = new DifficultySystem();
    const scheduler = new EnemySpawnScheduler({
      getPlayerPosition: () => PLAYER,
      isSkeletonSpawnEnabled: () => true,
      isVariantSpawnEnabled: () => true,
      hasActiveEncounter: () => false,
      difficultyStageFor: (elapsedMs) => difficulty.stageFor(elapsedMs),
      spawn: (request) => requests.push(request)
    }, createRng(2024), WORLD_SIZE, horde);
    scheduler.update(40_000, 40_000);
    return requests;
  };

  it('keeps Greenfield exactly as it was without a roster', () => {
    const { requests, scheduler } = setup();
    scheduler.update(40_000, 40_000);
    expect(run(hordeFor('greenfield'))).toEqual(requests);
    expect(new Set(requests.map((request) => request.variantId))).toEqual(new Set(['skeleton', 'necromancerWraith', 'apparitionWraith', 'superSkeleton']));
  });

  it('fills every Campo Nevado role with its own creature', () => {
    const variants = new Set(run(hordeFor('snowfield')).map((request) => request.variantId));
    expect(variants).toEqual(new Set(['frostSkeleton', 'snowShaman', 'frostSpirit', 'iceTroll', 'iceWolf']));
  });

  it('mixes Lobos do Gelo into the Nevado base as one bunched pack, each wolf off to its own side', () => {
    const wolves = run(hordeFor('snowfield')).filter((request) => request.variantId === 'iceWolf');
    expect(wolves.length).toBeGreaterThanOrEqual(WOLF_PACK.min);
    expect(wolves.length).toBeLessThanOrEqual(WOLF_PACK.max);
    const xs = wolves.map((wolf) => wolf.x);
    const ys = wolves.map((wolf) => wolf.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(WOLF_PACK.spread * 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(WOLF_PACK.spread * 2);
    expect(new Set(wolves.map((wolf) => wolf.flankAngle)).size).toBe(wolves.length);
  });

  it('falls back to Greenfield\'s horde for an arena without one', () => {
    expect(hordeFor('nowhere')).toBe(HORDE_BY_ARENA.greenfield);
  });
});
