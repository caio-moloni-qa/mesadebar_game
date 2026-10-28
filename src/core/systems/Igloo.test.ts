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
    // Only the regulars talk: the Esquimó's bar has nothing on sale.
    const bar = session.merchant.layout.sergioSpot;
    session.player.x = session.merchant.room.x + bar.x;
    session.player.y = session.merchant.room.y + bar.y;
    expect(session.merchant.roomSpot?.kind).toBe('sergio');
    expect(session.merchant.offers).toHaveLength(4);
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

  it('leaves when the front passes', () => {
    const session = snowSession();
    session.adjustElapsedMs(STORM);
    session.summonEskimo();
    expect(session.shelter.eskimo).not.toBeNull();
    advance(session, stormMs);
    expect(session.shelter.eskimo).toBeNull();
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
