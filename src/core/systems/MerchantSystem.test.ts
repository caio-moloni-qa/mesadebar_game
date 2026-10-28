import { BODY_RADIUS } from '../session/entities';
import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { MERCHANT_ROOM, MERCHANT_TUNING, TAVERN_LAYOUT } from './MerchantSystem';

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
  while (run.journey) run.step(STEP_MS);
}
function standAt(run: GameSession, offset: { x: number; y: number }): void {
  run.player.x = run.player.prevX = run.merchant.room.x + offset.x;
  run.player.y = run.player.prevY = run.merchant.room.y + offset.y;
}

describe('merchant', () => {
  it('cleanses harmful statuses on arrival and keeps them gone after leaving', () => {
    const run = session();
    const { player } = run;
    const now = run.clock.now;
    player.applySlow(0.5, 60_000, now);
    player.refreshRottenAura(now);
    player.updateRotten(500, now);
    player.freezeSolid(60_000, now);
    player.hasteUntil = now + 60_000;
    player.hastePercent = 0.2;
    const health = player.health;
    enter(run);
    expect(player.isFrozen(run.clock.now)).toBe(false);
    expect(player.isSlowed(run.clock.now)).toBe(false);
    expect(player.frostStacksAt(run.clock.now)).toBe(0);
    expect(player.isRotten(run.clock.now)).toBe(false);
    expect(player.effectiveMovementSpeed(run.clock.now)).toBeCloseTo(player.movementSpeed * 1.2);
    expect(player.health).toBe(health);
    run.merchant.leave();
    expect(player.isRotten(run.clock.now)).toBe(false);
    expect(player.isFrozen(run.clock.now)).toBe(false);
    expect(player.updateRotten(2000, run.clock.now)).toBe(0);
  });

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

  it('Sergio sells this visit’s items, every purchase triples what is left, and the exit returns you where you entered', () => {
    const run = session();
    const entry = { x: 0, y: 0 };
    run.openMerchantPortal();
    entry.x = run.player.x = run.merchant.portal!.x;
    entry.y = run.player.y = run.merchant.portal!.y;
    run.interact();
    while (run.journey) run.step(STEP_MS);
    run.currency = 1000;
    const curse = run.merchant.offers[1];
    expect(curse.id).toBe('arcane-curse');
    const blessingCost = run.merchant.offers[0].cost;
    const damage = run.player.damageMultiplier;
    run.buyMerchantItem(1);
    expect(curse.purchased).toBe(true);
    expect(run.currency).toBe(1000 - curse.cost);
    expect(run.player.damageMultiplier).toBeCloseTo(damage + 1.5);
    expect(run.merchant.offers[0].cost).toBe(blessingCost * MERCHANT_TUNING.priceInflation);
    standAt(run, MERCHANT_ROOM.exit);
    run.interact();
    while (run.journey) run.step(STEP_MS);
    expect(run.merchant.inside).toBe(false);
    expect(run.merchant.portal).toBeNull();
    expect(run.player.x).toBeCloseTo(entry.x);
    expect(run.player.y).toBeCloseTo(entry.y);
  });

  it('talking to Sergio opens his store; the counter has nothing on it to walk up to', () => {
    const run = session();
    enter(run);
    const heard: string[] = [];
    run.events.on('merchant-shop', () => heard.push('shop'));
    standAt(run, run.merchant.layout.sergioSpot);
    expect(run.merchant.roomSpot).toEqual({ kind: 'sergio' });
    run.interact();
    while (run.journey) run.step(STEP_MS);
    expect(heard).toEqual(['shop']);
    expect(run.merchant.offers).toHaveLength(4);
  });

  it('can’t buy what you can’t afford', () => {
    const run = session();
    enter(run);
    run.currency = 10;
    run.buyMerchantItem(0);
    expect(run.merchant.offers[0].purchased).toBe(false);
    expect(run.currency).toBe(10);
  });

  it('the Tomo de Afinidade opens a family choice and stops appearing at two affinities', () => {
    const run = session();
    enter(run);
    run.currency = 1000;
    expect(run.merchant.offers[3].id).toBe('affinity-tome');
    run.buyMerchantItem(3);
    const choice = run.pendingChoice as Extract<typeof run.pendingChoice, { kind: 'affinity' }>;
    expect(choice.kind).toBe('affinity');
    expect(choice.families).not.toContain('ranged');
    run.chooseAffinity(choice.families[0]);
    expect(run.affinities.has(choice.families[0])).toBe(true);
    standAt(run, MERCHANT_ROOM.exit);
    run.interact();
    while (run.journey) run.step(STEP_MS);
    enter(run);
    expect(run.merchant.offers[3].id).toBe('max-health');
  });

  it('a second weapon doesn’t take the Tomo de Afinidade away; a second affinity does', () => {
    const run = session();
    run.addWeapon(run.weapons.weapons[0].config.id === 'whip' ? 'staff' : 'whip');
    expect(run.weapons.weapons).toHaveLength(2);
    expect(run.affinities.size).toBe(1);
    enter(run);
    expect(run.merchant.offers[3].id).toBe('affinity-tome');
    standAt(run, MERCHANT_ROOM.exit);
    run.interact();
    while (run.journey) run.step(STEP_MS);
    run.grantAffinity(run.merchant.availableFamilies()[0]);
    enter(run);
    expect(run.merchant.offers[3].id).toBe('max-health');
  });

  it('the room’s walls and the island hold the hero in', () => {
    const run = session();
    enter(run);
    run.setMoveInput(-1, 0);
    advance(run, 4000);
    const half = MERCHANT_ROOM.size / 2;
    expect(run.player.x).toBeGreaterThanOrEqual(run.merchant.room.x - half);
    const island = TAVERN_LAYOUT.island!;
    standAt(run, { x: island.x + 10, y: island.y });
    run.setMoveInput(0, 0);
    advance(run, 100);
    const fromCentre = Math.hypot(run.player.x - (run.merchant.room.x + island.x), run.player.y - (run.merchant.room.y + island.y));
    expect(fromCentre).toBeGreaterThanOrEqual(island.outer + run.player.radius - 0.5);
  });

  it('walking into the island stops at its rim, without clipping in or stopping short', () => {
    const run = session();
    enter(run);
    const island = TAVERN_LAYOUT.island!;
    // From the arrival point, straight south toward the island.
    run.setMoveInput(0, 1);
    advance(run, 4000);
    const fromCentre = Math.hypot(run.player.x - (run.merchant.room.x + island.x), run.player.y - (run.merchant.room.y + island.y));
    expect(fromCentre).toBeCloseTo(island.outer + run.player.radius, 0);
  });

  it('the tavern’s regulars stand behind their tables, facing the island across a clear walkway', () => {
    const island = TAVERN_LAYOUT.island!;
    const { npcs, tables, sergioSpot, merchant, bottleTower } = TAVERN_LAYOUT;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    tables.forEach((table, index) => {
      // About 2 m (64 units) of free floor between the island and every table.
      expect(distance(table, island) - island.outer - MERCHANT_ROOM.tableRadius).toBeGreaterThanOrEqual(60);
      // The regular is on the far side of the table from the island, clear of it.
      const npc = npcs[index];
      expect(distance(npc, island)).toBeGreaterThan(distance(table, island));
      expect(distance(npc, table)).toBeGreaterThanOrEqual(MERCHANT_ROOM.tableRadius + MERCHANT_ROOM.npcRadius);
      // And can be talked to from the island side of the table.
      expect(distance(npc, table) + MERCHANT_ROOM.tableRadius + BODY_RADIUS.player).toBeLessThanOrEqual(MERCHANT_ROOM.talkReach);
    });
    // Sergio and his bottles are inside the ring; you talk to him from outside it.
    expect(distance(merchant, island)).toBeLessThan(island.inner);
    expect(distance(bottleTower!, island)).toBeLessThan(island.inner);
    expect(distance(sergioSpot, island)).toBeGreaterThan(island.outer + BODY_RADIUS.player);
    expect(distance(sergioSpot, merchant)).toBeLessThanOrEqual(MERCHANT_ROOM.sergioReach);
  });

  it('the arrival point walks straight to Sergio’s spot', () => {
    const run = session();
    enter(run);
    standAt(run, MERCHANT_ROOM.arrival);
    run.setMoveInput(0, 1);
    advance(run, 1500);
    expect(run.merchant.roomSpot).toEqual({ kind: 'sergio' });
    expect(run.player.x).toBeCloseTo(run.merchant.room.x + TAVERN_LAYOUT.sergioSpot.x, 0);
  });

  it('talks to every regular from the island side of their table, without Sergio taking the interaction', () => {
    const run = session();
    enter(run);
    const { island, tables } = run.merchant.layout;
    tables.forEach((table, index) => {
      const dx = island!.x - table.x, dy = island!.y - table.y;
      const distance = Math.hypot(dx, dy);
      const radius = MERCHANT_ROOM.tableRadius + run.player.radius + 0.1;
      standAt(run, { x: table.x + dx / distance * radius, y: table.y + dy / distance * radius });
      run.merchant.confine(run.player);
      expect(run.merchant.roomSpot).toEqual({ kind: 'npc', index });
      run.interact();
      while (run.journey) run.step(STEP_MS);
      expect(run.dialogue).toBe(index);
      run.closeDialogue();
    });
  });
});
