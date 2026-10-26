import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { MERCHANT_ROOM, MERCHANT_TUNING } from './MerchantSystem';

const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

function hub(): GameSession {
  return new GameSession({ characterId: 'mage', seed: 3, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE), hub: true, questTiers: { brom: 1 } });
}
function standAt(run: GameSession, offset: { x: number; y: number }): void {
  run.player.x = run.player.prevX = run.merchant.room.x + offset.x;
  run.player.y = run.player.prevY = run.merchant.room.y + offset.y;
}

describe('the tavern between runs', () => {
  it('starts in the room with nothing on the counter, no portal and no run clock', () => {
    const run = hub();
    expect(run.merchant.inside).toBe(true);
    expect(run.merchant.offers).toEqual([]);
    advance(run, MERCHANT_TUNING.intervalMs + 1000);
    expect(run.merchant.portal).toBeNull();
    expect(run.elapsedMs).toBe(0);
    expect(run.enemies.activeCount).toBe(0);
  });

  it('its stations answer E with events: the exit, Sergio', () => {
    const run = hub();
    const heard: string[] = [];
    run.events.on('hub-exit', () => heard.push('exit'));
    run.events.on('hub-sergio', () => heard.push('sergio'));
    standAt(run, MERCHANT_ROOM.exit);
    run.interact();
    standAt(run, MERCHANT_ROOM.sergioSpot);
    run.interact();
    expect(heard).toEqual(['exit', 'sergio']);
    expect(run.merchant.inside).toBe(true);
  });

  it('the regulars talk but hand out no missions here', () => {
    const run = hub();
    const npc = MERCHANT_ROOM.npcs[0];
    standAt(run, { x: npc.x + 40, y: npc.y });
    run.interact();
    expect(run.dialogue).toBe(0);
    run.interact();
    expect(run.dialogue).toBeNull();
    expect(run.quests.quests[0].status).toBe('offer');
    expect(run.quests.quests[0].tier).toBe(1);
  });
});
