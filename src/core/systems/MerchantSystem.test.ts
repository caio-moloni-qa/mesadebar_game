import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { MERCHANT_ROOM, MERCHANT_TUNING } from './MerchantSystem';

function session(): GameSession {
  const run = new GameSession({ characterId: 'mage', seed: 9, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.invincible = true;
  return run;
}
const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

/** Opens the portal, walks the hero onto it and steps through. */
function enter(run: GameSession): void {
  run.openMerchantPortal();
  run.player.x = run.merchant.portal!.x;
  run.player.y = run.merchant.portal!.y;
  run.interact();
}
function standAt(run: GameSession, offset: { x: number; y: number }): void {
  run.player.x = run.player.prevX = run.merchant.room.x + offset.x;
  run.player.y = run.player.prevY = run.merchant.room.y + offset.y;
}

describe('merchant', () => {
  it('opens a portal on its interval, and it closes again if nobody steps in', () => {
    const run = session();
    advance(run, MERCHANT_TUNING.intervalMs + 100);
    expect(run.merchant.portal).not.toBeNull();
    advance(run, MERCHANT_TUNING.portalOpenMs + 100);
    expect(run.merchant.portal).toBeNull();
  });

  it('never opens while the Necromancer is coming or up', () => {
    const run = session();
    run.triggerBossWave();
    advance(run, MERCHANT_TUNING.intervalMs + 100);
    expect(run.merchant.portal).toBeNull();
  });

  it('stepping in freezes the arena: no clock, no enemies moving', () => {
    const run = session();
    const enemy = run.spawnEnemy('skeleton', run.player.x + 300, run.player.y)!;
    enter(run);
    expect(run.merchant.inside).toBe(true);
    const clock = run.clock.now;
    const elapsed = run.elapsedMs;
    const enemyX = enemy.x;
    advance(run, 2000);
    expect(run.clock.now).toBe(clock);
    expect(run.elapsedMs).toBe(elapsed);
    expect(enemy.x).toBe(enemyX);
  });

  it('pedestals sell their item, every purchase triples what is left, and the exit returns you where you entered', () => {
    const run = session();
    const entry = { x: 0, y: 0 };
    run.openMerchantPortal();
    entry.x = run.player.x = run.merchant.portal!.x;
    entry.y = run.player.y = run.merchant.portal!.y;
    run.interact();
    run.currency = 1000;
    const curse = run.merchant.offers[1];
    expect(curse.id).toBe('arcane-curse');
    const blessingCost = run.merchant.offers[0].cost;
    const damage = run.player.damageMultiplier;
    standAt(run, MERCHANT_ROOM.slots[1]);
    run.interact();
    expect(curse.purchased).toBe(true);
    expect(run.currency).toBe(1000 - curse.cost);
    expect(run.player.damageMultiplier).toBeCloseTo(damage + 1.5);
    expect(run.merchant.offers[0].cost).toBe(blessingCost * MERCHANT_TUNING.priceInflation);
    standAt(run, MERCHANT_ROOM.exit);
    run.interact();
    expect(run.merchant.inside).toBe(false);
    expect(run.merchant.portal).toBeNull();
    expect(run.player.x).toBeCloseTo(entry.x);
    expect(run.player.y).toBeCloseTo(entry.y);
  });

  it('can’t buy what you can’t afford', () => {
    const run = session();
    enter(run);
    run.currency = 10;
    standAt(run, MERCHANT_ROOM.slots[0]);
    run.interact();
    expect(run.merchant.offers[0].purchased).toBe(false);
    expect(run.currency).toBe(10);
  });

  it('the Tomo de Afinidade opens a family choice and is sold once per run', () => {
    const run = session();
    enter(run);
    run.currency = 1000;
    expect(run.merchant.offers[3].id).toBe('affinity-tome');
    standAt(run, MERCHANT_ROOM.slots[3]);
    run.interact();
    const choice = run.pendingChoice as Extract<typeof run.pendingChoice, { kind: 'affinity' }>;
    expect(choice.kind).toBe('affinity');
    expect(choice.families).not.toContain('ranged');
    run.chooseAffinity(choice.families[0]);
    expect(run.affinities.has(choice.families[0])).toBe(true);
    standAt(run, MERCHANT_ROOM.exit);
    run.interact();
    enter(run);
    expect(run.merchant.offers[3].id).toBe('max-health');
  });

  it('the room’s walls and counter hold the hero in', () => {
    const run = session();
    enter(run);
    run.setMoveInput(-1, 0);
    advance(run, 4000);
    const half = MERCHANT_ROOM.size / 2;
    expect(run.player.x).toBeGreaterThanOrEqual(run.merchant.room.x - half);
    standAt(run, { x: MERCHANT_ROOM.counter.x, y: MERCHANT_ROOM.counter.y });
    run.setMoveInput(0, 0);
    advance(run, 100);
    expect(Math.abs(run.player.x - (run.merchant.room.x + MERCHANT_ROOM.counter.x))).toBeGreaterThanOrEqual(MERCHANT_ROOM.counter.halfWidth);
  });
});
