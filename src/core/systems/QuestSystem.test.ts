import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { MERCHANT_ROOM } from './MerchantSystem';
import { MINI_BOSS_TUNING } from './MiniBossSystem';
import { QUEST_NPCS } from './QuestSystem';

function session(): GameSession {
  const run = new GameSession({ characterId: 'mage', seed: 11, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.invincible = true;
  return run;
}
const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

/** Takes whatever choice kills left open (level-ups, a guardian's companion), so the run isn't paused. */
function settle(run: GameSession): void {
  for (let guard = 0; guard < 20 && run.pendingChoice; guard += 1) {
    const choice = run.pendingChoice;
    if (choice.kind === 'companion') run.chooseCompanion(0);
    else if (choice.kind === 'affinity') run.chooseAffinity(choice.families[0]);
    else run.chooseUpgrade(choice.upgrades[0].id);
  }
}

function enter(run: GameSession): void {
  settle(run);
  run.openMerchantPortal();
  run.player.x = run.merchant.portal!.x;
  run.player.y = run.merchant.portal!.y;
  run.interact();
}
function standAt(run: GameSession, offset: { x: number; y: number }): void {
  run.player.x = run.player.prevX = run.merchant.room.x + offset.x;
  run.player.y = run.player.prevY = run.merchant.room.y + offset.y;
}
/** Walks up to regular `index` (beside their table) and presses E twice: talk, then answer. */
function talkTo(run: GameSession, index: number): void {
  const npc = MERCHANT_ROOM.npcs[index];
  standAt(run, { x: npc.x + 40, y: npc.y });
  run.interact();
  expect(run.dialogue).toBe(index);
  run.interact();
  expect(run.dialogue).toBeNull();
}
function leave(run: GameSession): void {
  standAt(run, MERCHANT_ROOM.exit);
  run.interact();
  expect(run.merchant.inside).toBe(false);
}
const npcIndex = (id: string) => QUEST_NPCS.findIndex((npc) => npc.id === id);

describe('tavern missions', () => {
  it('Brom: accept, pick up the barrels on the arena, come back and claim more max health', () => {
    const run = session();
    const brom = npcIndex('brom');
    enter(run);
    talkTo(run, brom);
    expect(run.quests.quests[brom].status).toBe('active');
    expect(run.quests.barrels).toHaveLength(3);
    leave(run);
    [...run.quests.barrels].forEach((barrel) => {
      run.player.x = run.player.prevX = barrel.x;
      run.player.y = run.player.prevY = barrel.y;
      advance(run, STEP_MS * 2);
    });
    expect(run.quests.quests[brom].status).toBe('ready');
    const before = run.player.maxHealth;
    enter(run);
    talkTo(run, brom);
    expect(run.player.maxHealth).toBe(before + 30);
    expect(run.quests.quests[brom]).toMatchObject({ tier: 1, status: 'offer' });
  });

  it('Lyra counts kills only once the hunt is accepted', () => {
    const run = session();
    const lyra = npcIndex('lyra');
    const kill = () => {
      const enemy = run.spawnEnemy('skeleton', run.player.x + 300, run.player.y, 1)!;
      run.damageEnemy(enemy, 10, 'staff');
    };
    kill();
    enter(run);
    talkTo(run, lyra);
    leave(run);
    for (let index = 0; index < 99; index += 1) kill();
    expect(run.quests.quests[lyra]).toMatchObject({ status: 'active', progress: 99 });
    kill();
    expect(run.quests.quests[lyra].status).toBe('ready');
    settle(run);
    const before = run.player.damageMultiplier;
    enter(run);
    talkTo(run, lyra);
    expect(run.player.damageMultiplier).toBeCloseTo(before + 0.1);
  });

  it('Grimbo’s bet: a hit resets the clock, and only the arena counts', () => {
    const run = session();
    const grimbo = npcIndex('grimbo');
    enter(run);
    talkTo(run, grimbo);
    advance(run, 10_000);
    expect(run.quests.quests[grimbo].progress).toBe(0);
    leave(run);
    advance(run, 20_000);
    run.events.emit('player-damaged', { amount: 5 });
    expect(run.quests.quests[grimbo].progress).toBe(0);
    advance(run, 30_100);
    expect(run.quests.quests[grimbo].status).toBe('ready');
    const coins = run.currency;
    enter(run);
    talkTo(run, grimbo);
    expect(run.currency).toBe(coins + 200);
  });

  it('Madame Zora: a fallen guardian is paid in random upgrades', () => {
    const run = session();
    const zora = npcIndex('zora');
    enter(run);
    talkTo(run, zora);
    leave(run);
    run.spawnMiniBoss('gravedigger');
    advance(run, MINI_BOSS_TUNING.warningMs + 50);
    const boss = run.miniBosses.bosses[0];
    run.damageEnemy(boss.enemy, boss.enemy.health + 1, 'staff');
    expect(run.quests.quests[zora].status).toBe('ready');
    const gifts: string[] = [];
    run.events.on('quest-gifts', ({ names }) => gifts.push(...names));
    enter(run);
    talkTo(run, zora);
    expect(gifts).toHaveLength(1);
  });

  it('after three missions a regular has nothing more to give', () => {
    const run = session();
    const grimbo = npcIndex('grimbo');
    for (let tier = 0; tier < 3; tier += 1) {
      enter(run);
      talkTo(run, grimbo);
      leave(run);
      advance(run, 61_000);
      enter(run);
      talkTo(run, grimbo);
      leave(run);
    }
    expect(run.quests.quests[grimbo].status).toBe('done');
    expect(run.currency).toBe(200 + 400 + 800);
  });

  it('you can’t walk off mid-conversation or through the tables', () => {
    const run = session();
    enter(run);
    const npc = MERCHANT_ROOM.npcs[0];
    standAt(run, { x: npc.x + 40, y: npc.y });
    run.interact();
    const { x } = run.player;
    run.setMoveInput(1, 0);
    advance(run, 500);
    expect(run.player.x).toBe(x);
    run.closeDialogue();
    const table = MERCHANT_ROOM.tables[0];
    standAt(run, { x: table.x, y: table.y + 120 });
    run.setMoveInput(0, -1);
    advance(run, 2000);
    expect(Math.hypot(run.player.x - (run.merchant.room.x + table.x), run.player.y - (run.merchant.room.y + table.y))).toBeGreaterThanOrEqual(MERCHANT_ROOM.tableRadius + run.player.radius - 0.5);
  });
});
