import { describe, expect, it } from 'vitest';
import { BLIZZARD_TUNING } from '../../config/balance';
import { SNOWFIELD } from '../../config/arenaLayout';
import { ArenaMap } from '../world/ArenaMap';
import { GameSession, STEP_MS } from '../session/GameSession';
import { MERCHANT_ROOM } from './MerchantSystem';
import { NEUTRAL_TUNING } from './NeutralSystem';
import { SHELTER_TUNING } from './ShelterSystem';

const { firstFrontMs, stormMs, rampMs } = BLIZZARD_TUNING;
const STORM = firstFrontMs + rampMs * 2;

function snowSession(): GameSession {
  const session = new GameSession({ characterId: 'barbarian', seed: 7, skipStartingUpgrades: true, arena: ArenaMap.generate(7, SNOWFIELD) });
  session.skeletonSpawnEnabled = false;
  session.variantSpawnEnabled = false;
  session.player.invincible = true;
  return session;
}
const advance = (session: GameSession, ms: number) => { for (let t = 0; t < ms; t += STEP_MS) session.step(STEP_MS); };
const questIndex = (session: GameSession, id: string) => session.quests.quests.findIndex((quest) => quest.npc.id === id);
/** Steps until `done` holds (or `ms` runs out). */
function until(session: GameSession, done: () => boolean, ms: number): boolean {
  for (let t = 0; t < ms && !done(); t += STEP_MS) session.step(STEP_MS);
  return done();
}

describe('O Esquimó e o Iglu', () => {
  it('seats the Campo Nevado regulars at the igloo, with no portal of its own and the fourth table empty', () => {
    const session = snowSession();
    expect(session.quests.quests.map((quest) => quest.npc.id)).toEqual(['joe', 'beast', 'voly']);
    expect(session.merchant.away.has(3)).toBe(true);
    advance(session, 60_000);
    expect(session.merchant.portal).toBeNull();
  });

  it('walks up during a front and offers shelter; E takes the hero in warm, and out again by a full torch', () => {
    const session = snowSession();
    session.adjustElapsedMs(STORM);
    expect(until(session, () => session.shelter.eskimo !== null, SHELTER_TUNING.arriveAfterMs + 1000)).toBe(true);
    expect(until(session, () => session.shelterInReach, stormMs - 10_000)).toBe(true);
    session.blizzard.cold = 70;
    session.interact();
    const clock = session.clock.now, elapsed = session.elapsedMs;
    expect(session.journey?.kind).toBe('igloo');
    advance(session, 3200);
    expect(session.journeyOpacity).toBe(1);
    expect(session.merchant.inside).toBe(false);
    advance(session, 1900);
    expect(session.merchant.inside).toBe(false);
    while (session.journey) session.step();
    expect(session.clock.now).toBe(clock);
    expect(session.elapsedMs).toBe(elapsed);
    expect(session.merchant.inside).toBe(true);
    expect(session.blizzard.cold).toBe(0);
    // The Esquimó's menu, at his bar.
    const bar = session.merchant.layout.sergioSpot;
    session.player.x = session.merchant.room.x + bar.x;
    session.player.y = session.merchant.room.y + bar.y;
    expect(session.merchant.roomSpot?.kind).toBe('sergio');
    expect(session.merchant.offers).toHaveLength(4);
    // Sergio, eating at the fourth table, has his own items; buying from him re-prices the menu too.
    const guest = session.merchant.layout.guest!;
    session.player.x = session.merchant.room.x + guest.x - 40;
    session.player.y = session.merchant.room.y + guest.y;
    const shops: boolean[] = [];
    session.events.on('merchant-shop', ({ guest: atTable }) => shops.push(atTable));
    session.interact();
    expect(shops).toEqual([true]);
    expect(session.merchant.guestOffers.map((offer) => offer.id).slice(0, 2)).toEqual(['divine-blessing', 'arcane-curse']);
    session.currency = 10_000;
    const stew = session.merchant.offers[0].cost;
    expect(session.buyMerchantItem(0, true)).toBe(true);
    expect(session.merchant.guestOffers[0].purchased).toBe(true);
    expect(session.merchant.offers[0].cost).toBe(stew * 3);
    session.player.x = session.merchant.room.x + MERCHANT_ROOM.exit.x;
    session.player.y = session.merchant.room.y + MERCHANT_ROOM.exit.y;
    session.interact();
    while (session.journey) session.step();
    expect(session.merchant.inside).toBe(false);
    const torch = session.blizzard.warmingTorch(session.player);
    expect(torch?.fuelMs).toBe(BLIZZARD_TUNING.torchFuelMs);
    // Once a front: he doesn't come back before the next one.
    advance(session, 20_000);
    expect(session.shelter.eskimo).toBeNull();
  });

  it('leaves by sled when the front passes: off the nearest map edge, offering nothing on the way', () => {
    const session = snowSession();
    session.adjustElapsedMs(STORM);
    session.summonEskimo();
    expect(session.shelter.eskimo).not.toBeNull();
    expect(until(session, () => session.shelter.leaving, stormMs)).toBe(true);
    const eskimo = session.shelter.eskimo!;
    const start = { x: eskimo.x, y: eskimo.y };
    const { size } = session.arena;
    const edge = Math.min(start.x, start.y, size - start.x, size - start.y);
    expect(session.shelter.offering).toBe(false);
    advance(session, 1000);
    expect(session.shelter.offering).toBe(false);
    const moved = { x: eskimo.x, y: eskimo.y };
    expect(Math.hypot(moved.x - start.x, moved.y - start.y)).toBeGreaterThan(SHELTER_TUNING.leaveSpeed * 0.9);
    expect(Math.min(moved.x, moved.y, size - moved.x, size - moved.y)).toBeLessThan(edge);
    expect(until(session, () => session.shelter.eskimo === null, SHELTER_TUNING.leaveMaxMs)).toBe(true);
  });
});

describe('Missões do Nevado', () => {
  it('Joe: storm fragments only shine while a front blows; Mente Clara scatters them again on a freeze', () => {
    const session = snowSession();
    const joe = questIndex(session, 'joe');
    session.quests.quests[joe].tier = 1;
    session.quests.accept(joe);
    expect(session.quests.fragments).toHaveLength(5);
    expect(session.quests.fragmentsShowing).toBe(false);
    const [fragment] = session.quests.fragments;
    Object.assign(session.player, fragment);
    session.step();
    expect(session.quests.quests[joe].progress).toBe(0);
    session.adjustElapsedMs(STORM);
    session.step();
    session.step();
    expect(session.quests.quests[joe].progress).toBe(1);

    const other = snowSession();
    const quest = other.quests.quests[joe];
    quest.tier = 2;
    other.quests.accept(joe);
    Object.assign(other.player, other.quests.fragments[0]);
    other.step();
    expect(quest.progress).toBe(1);
    other.events.emit('player-frozen', {});
    expect(quest.progress).toBe(0);
    expect(other.quests.fragments).toHaveLength(7);
  });

  it('Beast: on the mission the wildlife lets the hero walk up, and stays tamed', () => {
    const session = snowSession();
    const beast = questIndex(session, 'beast');
    session.quests.accept(beast);
    const home = { x: session.player.x + 60, y: session.player.y };
    session.neutrals.addGroup({ variant: 'boar', home, count: 1 });
    advance(session, NEUTRAL_TUNING.tameMs + 200);
    const creature = session.neutrals.creatures[session.neutrals.creatures.length - 1];
    expect(creature.tamed).toBe(true);
    expect(creature.enemy!.mood).toBe('calm');
    expect(session.quests.quests[beast].status).toBe('ready');
  });

  it('Beast: a wolf pack counts once its last wolf is down', () => {
    const session = snowSession();
    const beast = questIndex(session, 'beast');
    session.quests.quests[beast].tier = 1;
    session.quests.accept(beast);
    session.spawnWolfPack(3);
    session.killAllEnemies();
    expect(session.quests.quests[beast].status).toBe('ready');
  });

  it('Voly: ice blocks rise when accepted and breaking them counts (not as kills)', () => {
    const session = snowSession();
    const voly = questIndex(session, 'voly');
    session.quests.accept(voly);
    let blocks = 0;
    session.enemies.forEachActive((enemy) => { if (enemy.variantId === 'iceBlock') blocks += 1; });
    expect(blocks).toBe(10);
    session.killAllEnemies();
    expect(session.kills).toBe(0);
    expect(session.quests.quests[voly].status).toBe('ready');
  });

  it('Voly: A Revanche counts the storm away from the torches, and a torch starts it over', () => {
    const session = snowSession();
    const voly = questIndex(session, 'voly');
    const quest = session.quests.quests[voly];
    quest.tier = 2;
    session.quests.accept(voly);
    advance(session, 2000);
    expect(quest.progress).toBe(0);
    session.adjustElapsedMs(STORM);
    advance(session, 3000);
    expect(quest.progress).toBeGreaterThanOrEqual(2900);
    Object.assign(session.player, session.blizzard.torches[0]);
    session.step();
    expect(quest.progress).toBe(0);
  });
});
