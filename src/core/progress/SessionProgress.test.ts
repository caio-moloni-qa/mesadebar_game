import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../config/characters';
import { WORLD_SIZE } from '../../config/world';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { NO_META_BONUSES } from './Progress';

const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

function session(options: Partial<ConstructorParameters<typeof GameSession>[0]> = {}): GameSession {
  const run = new GameSession({ characterId: 'barbarian', seed: 5, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE), ...options });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  return run;
}

describe('a run with progress', () => {
  it('starts with Sergio’s permanent upgrades applied', () => {
    const base = CHARACTERS.barbarian;
    const run = session({ meta: { ...NO_META_BONUSES, maxHealth: 30, damage: 0.1, speed: 0.08, pickupRange: 0.2, startingCoins: 100, revives: 1 } });
    expect(run.player.maxHealth).toBe(base.maxHealth + 30);
    expect(run.player.health).toBe(run.player.maxHealth);
    expect(run.player.damageMultiplier).toBeCloseTo(base.damageMultiplier + 0.1);
    expect(run.player.movementSpeed).toBeCloseTo(base.movementSpeed * 1.08);
    expect(run.currency).toBe(100);
    expect(run.revivesLeft).toBe(1);
  });

  it('Segunda chance revives once at half health; the next death ends the run', () => {
    const run = session({ meta: { ...NO_META_BONUSES, revives: 1 } });
    const revived: unknown[] = [];
    run.events.on('player-revived', () => revived.push(1));
    run.player.health = 0;
    advance(run, STEP_MS * 2);
    expect(revived).toHaveLength(1);
    expect(run.over).toBe(false);
    expect(run.player.health).toBe(run.player.maxHealth * 0.5);
    run.player.health = 0;
    advance(run, STEP_MS * 2);
    expect(run.over).toBe(true);
  });

  it('an extra starting pick from Escolha extra', () => {
    const run = new GameSession({ characterId: 'barbarian', seed: 5, arena: ArenaMap.open(WORLD_SIZE), meta: { ...NO_META_BONUSES, extraStartingPicks: 1 } });
    const choice = run.pendingChoice as Extract<typeof run.pendingChoice, { kind: 'starting' }>;
    expect(choice.picksTotal).toBe((CHARACTERS.barbarian.startingWeaponUpgradeChoices ?? 0) + 1);
  });

  it('regulars pick up at the next mission from earlier runs', () => {
    const run = session({ questTiers: { brom: 1, zora: 3 } });
    const brom = run.quests.quests.find((quest) => quest.npc.id === 'brom')!;
    const zora = run.quests.quests.find((quest) => quest.npc.id === 'zora')!;
    expect(brom.tier).toBe(1);
    expect(run.quests.spec(brom).title).toBe(brom.npc.quests[1].title);
    expect(zora.status).toBe('done');
  });

  it('summarises the run: kills by enemy, guardians by kind, missions and the regulars’ tiers', () => {
    const run = session({ questTiers: { lyra: 1 } });
    const enemy = run.spawnEnemy('skeleton', run.player.x + 300, run.player.y, 1)!;
    run.damageEnemy(enemy, 10, 'sword');
    const summary = run.runSummary('barbarian', 123);
    expect(summary.kills).toBe(1);
    expect(summary.killsByVariant).toEqual({ skeleton: 1 });
    expect(summary.questTiers.lyra).toBe(1);
    expect(summary.endedAt).toBe(123);
  });
});
