import { describe, expect, it } from 'vitest';
import { BLIZZARD_TUNING } from '../../config/balance';
import { SNOWFIELD } from '../../config/arenaLayout';
import { WORLD_SIZE } from '../../config/world';
import { ArenaMap } from '../world/ArenaMap';
import { GameSession, STEP_MS } from '../session/GameSession';
import { BlizzardSystem, blizzardPhaseAt } from './BlizzardSystem';

const { firstFrontMs, stormMs, calmMs, rampMs } = BLIZZARD_TUNING;
const STORM = firstFrontMs + rampMs * 2;
const FAR = { x: 99_999, y: 99_999 };

/** Runs `system` for `ms` of sim time from `elapsedMs`, hero at `hero`; returns the elapsed time after. */
function run(system: BlizzardSystem, elapsedMs: number, ms: number, hero = FAR, frozen = false): number {
  for (let t = 0; t < ms; t += STEP_MS) system.update(STEP_MS, (elapsedMs += STEP_MS), hero, frozen);
  return elapsedMs;
}

describe('Nevasca', () => {
  it('comes in fronts: calm until firstFrontMs, then storm and lull in turn', () => {
    expect(blizzardPhaseAt(firstFrontMs - 1).phase).toBe('calm');
    expect(blizzardPhaseAt(firstFrontMs).phase).toBe('storm');
    expect(blizzardPhaseAt(firstFrontMs + stormMs).phase).toBe('calm');
    expect(blizzardPhaseAt(firstFrontMs + stormMs + calmMs).phase).toBe('storm');
  });

  it('does nothing in an arena without torches', () => {
    const system = new BlizzardSystem(undefined);
    run(system, STORM, 20_000);
    system.addFrost(5);
    expect(system.active).toBe(false);
    expect(system.cold).toBe(0);
  });

  it('chills the hero out in the storm and warms them by a torch, which burns its fuel and shrinks', () => {
    const torch = { x: 0, y: 0 };
    const system = new BlizzardSystem([torch]);
    run(system, STORM, 10_000);
    expect(system.cold).toBeCloseTo(BLIZZARD_TUNING.risePerSec * 10, 0);
    const radius = system.torchRadius(system.torches[0]);
    run(system, STORM + 10_000, 1000, torch);
    expect(system.cold).toBeLessThan(BLIZZARD_TUNING.risePerSec * 10);
    expect(system.torches[0].fuelMs).toBeCloseTo(BLIZZARD_TUNING.torchFuelMs - 1000, -2);
    expect(system.torchRadius(system.torches[0])).toBeLessThan(radius);
  });

  it('burns a torch out for good within the storm, and relights it partly in the lull', () => {
    const torch = { x: 0, y: 0 };
    const system = new BlizzardSystem([torch]);
    system.torches[0].fuelMs = 500;
    run(system, STORM, 1000, torch);
    expect(system.torchRadius(system.torches[0])).toBe(0);
    expect(system.warmingTorch(torch)).toBeNull();
    run(system, firstFrontMs + stormMs - 100, 200);
    expect(system.torches[0].fuelMs).toBe(BLIZZARD_TUNING.torchFuelMs * BLIZZARD_TUNING.relightFuel);
  });

  it('eases in the calm, and stands still while the hero is frozen', () => {
    const system = new BlizzardSystem([{ x: 0, y: 0 }]);
    system.cold = 50;
    run(system, 0, 2000);
    expect(system.cold).toBeCloseTo(50 - BLIZZARD_TUNING.calmDecayPerSec * 2, 0);
    run(system, STORM, 2000, FAR, true);
    expect(system.cold).toBe(100);
    system.update(STEP_MS, STORM, FAR, false);
    expect(system.cold).toBe(50);
  });

  it('holds full while frozen, then drops to afterFreeze; Congelamento stacks feed the same meter', () => {
    const system = new BlizzardSystem([{ x: 0, y: 0 }]);
    system.addFrost(2);
    expect(system.cold).toBe(BLIZZARD_TUNING.coldPerFrostStack * 2);
    system.cold = 99.99;
    expect(system.update(STEP_MS, STORM, FAR, false)).toBe(true);
    expect(system.cold).toBe(100);
    system.update(5000, STORM, FAR, true);
    expect(system.cold).toBe(100);
    system.update(STEP_MS, STORM, FAR, false);
    expect(system.cold).toBe(BLIZZARD_TUNING.afterFreeze);
    // Stacks filling it in the calm still freeze (the lull's thaw doesn't hide it).
    system.addFrost(100);
    expect(system.update(STEP_MS, 1000, FAR, false)).toBe(true);
  });
});

describe('Nevasca na sessão', () => {
  function snowSession(): GameSession {
    const session = new GameSession({ characterId: 'barbarian', seed: 7, skipStartingUpgrades: true, arena: ArenaMap.generate(7, SNOWFIELD) });
    session.skeletonSpawnEnabled = false;
    session.variantSpawnEnabled = false;
    return session;
  }

  it('freezes the hero solid for freezeMs when the cold fills, with a little damage that never kills', () => {
    const session = snowSession();
    session.adjustElapsedMs(STORM);
    session.blizzard.cold = 99.99;
    session.player.health = 3;
    session.step();
    expect(session.player.isFrozen(session.clock.now)).toBe(true);
    expect(session.player.frozenUntil - session.clock.now).toBeCloseTo(BLIZZARD_TUNING.freezeMs, -2);
    expect(session.player.health).toBe(3);
  });

  it('thaws after 5 seconds at half cold with 90% slow easing over 6 seconds', () => {
    const session = snowSession();
    session.player.health = session.player.maxHealth;
    session.player.lowHealthAttackSpeedBonus = 0;
    session.adjustElapsedMs(STORM);
    session.blizzard.cold = 100;
    session.step();
    const end = session.player.frozenUntil;
    expect(end - session.clock.now).toBe(5000);
    expect(session.player.effectiveMovementSpeed(end - 1)).toBe(0);
    expect(session.player.effectiveMovementSpeed(end)).toBeCloseTo(session.player.movementSpeed * 0.1);
    expect(session.player.effectiveMovementSpeed(end + 3000)).toBeCloseTo(session.player.movementSpeed * 0.55);
    expect(session.player.effectiveMovementSpeed(end + 6000)).toBe(session.player.movementSpeed);
    while (session.clock.now < end) session.step();
    expect(session.blizzard.cold).toBe(50);
  });

  it('is off in Greenfield', () => {
    const session = new GameSession({ characterId: 'barbarian', seed: 7, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
    expect(session.blizzard.active).toBe(false);
  });
});
