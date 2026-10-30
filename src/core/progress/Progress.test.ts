import { describe, expect, it } from 'vitest';
import { CURRENT_AREA } from '../../config/areas';
import {
  DIFFICULTY_TIERS, MASTERY_THRESHOLDS, MISSIONS_PER_REGULAR, REGULAR_UNLOCKS, RunSummary, SERGIO_TOTAL_MASTERY, applyRun, buyUpgrade, emptySave,
  areaCompletion, arenaProgress, heroesToWelcome, masteryLevel, metaBonuses, nextPrice, parseSave, rosterFor, runPayout, serializeSave, unlockSteps, unlockedSkins,
  SaveData, bankTowerClimb, bankTowerFloor, towerBest
} from './Progress';
import { TOWERS, TOWER_UNLOCKS } from '../../config/tavernTowers';

/** The Torre da Taverna climbed to `best` (heroes also need their tower floor beaten). */
function climbed(save: SaveData, best = TOWERS.taverna.floors.length): SaveData {
  return { ...save, tavern: { ...save.tavern, towers: { taverna: { best, climbs: 1, tops: 0 } } } };
}

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    heroId: 'barbarian', victory: false, elapsedMs: 8 * 60_000, kills: 600, guardians: 2, bosses: 1, missions: 1, coins: 500, cycle: 1,
    killsByVariant: { skeleton: 600 }, guardiansByKind: { gravedigger: 1, lakeSpirit: 1 }, questTiers: {}, endedAt: 0, tier: 1, ...overrides
  };
}

describe('progress', () => {
  it('pays the plan’s example run 267 Fichas, half again on a win', () => {
    expect(runPayout(run()).fichasTotal).toBe(267);
    expect(runPayout(run({ victory: true })).fichasTotal).toBe(267 + Math.round(267 * 0.5));
    const xp = runPayout(run({ victory: true })).xpTotal;
    expect(xp).toBe(480 + 60 + 100 + 150 + 200);
  });

  it('banks a run: Fichas, mastery XP, records, history and the regulars’ missions', () => {
    const outcome = applyRun(emptySave(), run({ questTiers: { brom: 2 } }));
    expect(outcome.save.fichas).toBe(267);
    expect(outcome.save.mastery.barbarian).toBe(outcome.payout.xpTotal);
    expect(outcome.save.records.runs).toBe(1);
    expect(outcome.save.records.kills.skeleton).toBe(600);
    expect(outcome.save.history).toHaveLength(1);
    expect(outcome.save.regularMissions.brom).toBe(2);
    // A later run that got less far with Brom never lowers what was done.
    expect(applyRun(outcome.save, run({ questTiers: { brom: 1 } })).save.regularMissions.brom).toBe(2);
  });

  it('reports the mastery rewards a run reaches', () => {
    const save = { ...emptySave(), mastery: { barbarian: MASTERY_THRESHOLDS[1] - 10 } };
    const outcome = applyRun(save, run());
    expect(masteryLevel(outcome.xpAfter)).toBeGreaterThanOrEqual(2);
    expect(outcome.rewards.map((reward) => reward.id)).toContain('sombra');
    expect(unlockedSkins(outcome.xpAfter)).toContain('sombra');
  });

  it('buys Sergio’s upgrades at rising prices and applies them', () => {
    let save = { ...emptySave(), fichas: 1000 };
    expect(nextPrice(save, 'vitalidade')).toBe(100);
    save = buyUpgrade(save, 'vitalidade')!;
    expect(nextPrice(save, 'vitalidade')).toBe(200);
    save = buyUpgrade(save, 'vitalidade')!;
    expect(save.fichas).toBe(700);
    expect(metaBonuses(save).maxHealth).toBe(20);
    expect(buyUpgrade({ ...save, fichas: 10 }, 'forca')).toBeNull();
  });

  it('a regular joins after all their missions and the paired mastery level; Sergio after all four', () => {
    const level5 = MASTERY_THRESHOLDS[4];
    let save = climbed({ ...emptySave(), regularMissions: { brom: MISSIONS_PER_REGULAR }, mastery: { barbarian: level5 - 1 } });
    expect(rosterFor(save)).not.toContain('brom');
    save = { ...save, mastery: { barbarian: level5 } };
    expect(rosterFor(save)).toContain('brom');
    const everyone = {
      ...climbed(emptySave()),
      regularMissions: { brom: 3, lyra: 3, grimbo: 3, zora: 3 },
      mastery: Object.fromEntries(Object.values(REGULAR_UNLOCKS).map((rule) => [rule.hero, level5]))
    };
    // Four heroes at level 5 is 20 levels: not yet Sergio.
    expect(rosterFor(everyone)).not.toContain('sergio');
    const top = MASTERY_THRESHOLDS[MASTERY_THRESHOLDS.length - 1];
    const maxed = { ...everyone, mastery: { barbarian: top, mage: top, reliquia: top, fabri: top } };
    expect(SERGIO_TOTAL_MASTERY).toBeLessThanOrEqual(40);
    expect(rosterFor(maxed)).toContain('sergio');
  });

  it('announces a newly joined hero once', () => {
    const level5 = MASTERY_THRESHOLDS[4];
    const save = climbed({ ...emptySave(), regularMissions: { brom: 2 }, mastery: { barbarian: level5 } });
    const outcome = applyRun(save, run({ questTiers: { brom: 3 } }));
    expect(outcome.joined).toEqual(['brom']);
    expect(applyRun(outcome.save, run()).joined).toEqual([]);
  });

  it('a win on the top open tier opens the next; tiers pay more and are capped', () => {
    const first = applyRun(emptySave(), run({ victory: true }));
    expect(first.newTier?.tier).toBe(2);
    expect(first.save.tierUnlocked).toBe(2);
    // A win on an easier tier than the top open one opens nothing.
    expect(applyRun(first.save, run({ victory: true, tier: 1 })).newTier).toBeNull();
    // Harder tiers pay more of both.
    const normal = runPayout(run());
    const cruel = runPayout(run({ tier: 3 }));
    expect(cruel.fichasTotal).toBe(normal.fichasTotal + Math.round(normal.fichasTotal * (DIFFICULTY_TIERS[2].reward - 1)));
    expect(cruel.xpTotal).toBeGreaterThan(normal.xpTotal);
    const top = { ...emptySave(), tierUnlocked: DIFFICULTY_TIERS.length };
    expect(applyRun(top, run({ victory: true, tier: DIFFICULTY_TIERS.length })).newTier).toBeNull();
  });

  it('round-trips the save, and survives garbage', () => {
    const outcome = applyRun(emptySave(), run());
    expect(parseSave(serializeSave(outcome.save))).toEqual(outcome.save);
    expect(parseSave('not json')).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ fichas: -5, mastery: { mage: 'lots' } })).fichas).toBe(0);
    expect(parseSave(JSON.stringify({ fichas: -5, mastery: { mage: 'lots' } })).mastery).toEqual({});
  });

  it('loads saves from before the Taverna em Turnos with empty duel defaults, and round-trips its settings', () => {
    const old = parseSave(JSON.stringify({ fichas: 40, mastery: { mage: 600 } }));
    expect(old.fichas).toBe(40);
    expect(old.tavern).toEqual({ regulars: {}, assisted: false, timingTrack: true, boons: [], towers: {} });
    const tavern = { regulars: { brom: { xp: 30, level: 2, learned: ['contragolpe'], finisher: 'golpe-da-forja' } }, assisted: true, timingTrack: false, boons: ['flecha-marcada' as const], towers: { taverna: { best: 4, climbs: 2, tops: 0 } } };
    expect(parseSave(serializeSave({ ...emptySave(), tavern })).tavern).toEqual(tavern);
    expect(parseSave(JSON.stringify({ tavern: { regulars: { brom: 'x', lyra: { xp: -3, learned: [1, 'a'] } }, assisted: 'yes', boons: ['uma-visao', 'nope', 'uma-visao'], towers: { taverna: { best: -1, climbs: 'x' }, atlantis: { best: 3 } } } })).tavern)
      .toEqual({ regulars: { lyra: { xp: 0, level: 1, learned: ['a'] } }, assisted: false, timingTrack: true, boons: ['uma-visao'], towers: { taverna: { best: 0, climbs: 0, tops: 0 } } });
  });
});

describe('signature skins', () => {
  it('stays locked at max mastery while it is coming soon', () => {
    expect(unlockedSkins(MASTERY_THRESHOLDS[MASTERY_THRESHOLDS.length - 1])).not.toContain('lenda');
    expect(unlockedSkins(MASTERY_THRESHOLDS[MASTERY_THRESHOLDS.length - 1])).toContain('ouro');
  });
});

describe('unlocking the tavern heroes', () => {
  it('lists what a regular still needs, then welcomes them once in the tavern', () => {
    const save = emptySave();
    expect(unlockSteps(save, 'barbarian')).toEqual([]);
    const steps = unlockSteps(save, 'brom');
    expect(steps.map((step) => [step.current, step.needed])).toEqual([[0, MISSIONS_PER_REGULAR], [1, REGULAR_UNLOCKS.brom.level], [0, TOWER_UNLOCKS.brom!.floor]]);
    const unlocked = climbed({ ...save, regularMissions: { brom: MISSIONS_PER_REGULAR }, mastery: { barbarian: MASTERY_THRESHOLDS[REGULAR_UNLOCKS.brom.level - 1] } }, TOWER_UNLOCKS.brom!.floor);
    expect(unlockSteps(unlocked, 'brom').every((step) => step.current >= step.needed)).toBe(true);
    expect(heroesToWelcome(unlocked)).toEqual(['brom']);
    expect(heroesToWelcome({ ...unlocked, welcomed: [...unlocked.welcomed, 'brom'] })).toEqual([]);
  });

  it('keeps Sergio for last: every regular and a mastery total', () => {
    const steps = unlockSteps(emptySave(), 'sergio');
    expect(steps.map((step) => step.needed)).toEqual([4, SERGIO_TOTAL_MASTERY, TOWERS.taverna.floors.length]);
    expect(steps[1].current).toBe(0);
  });
});

describe('O Coliseu do Sergio (the towers)', () => {
  const level5 = MASTERY_THRESHOLDS[4];
  const ready = { ...emptySave(), regularMissions: { brom: MISSIONS_PER_REGULAR, lyra: MISSIONS_PER_REGULAR }, mastery: { barbarian: level5, fabri: level5 } };

  it('a regular also needs their tower floor beaten; the floor banks mastery at once and announces who joined', () => {
    expect(rosterFor(ready)).not.toContain('brom');
    const first = bankTowerFloor(ready, 'mage', 'taverna', 1, 60);
    expect(first.save.mastery.mage).toBe(60);
    expect(towerBest(first.save, 'taverna')).toBe(1);
    expect(first.joined).toEqual(['brom']);
    // Lyra's floor is the second.
    expect(rosterFor(first.save)).not.toContain('lyra');
    const second = bankTowerFloor(first.save, 'mage', 'taverna', 2, 70);
    expect(second.joined).toEqual(['lyra']);
    // A worse climb never lowers the best floor.
    expect(towerBest(bankTowerFloor(second.save, 'mage', 'taverna', 1, 60).save, 'taverna')).toBe(2);
  });

  it('never takes a hero away from a save that had them before the towers', () => {
    const old = { ...ready, announced: [...ready.announced, 'brom' as const] };
    expect(rosterFor(old)).toContain('brom');
    expect(unlockSteps(old, 'brom')).toHaveLength(2);
  });

  it('banks a climb: the fichas and the counters', () => {
    const save = bankTowerClimb({ ...emptySave(), fichas: 5 }, 'taverna', 30, true);
    expect(save.fichas).toBe(35);
    expect(save.fichasEarned).toBe(30);
    expect(save.tavern.towers.taverna).toEqual({ best: 0, climbs: 1, tops: 1 });
  });
});

describe('Greenfield', () => {
  it('ends with Sergio: its four regulars, then him', () => {
    const save = emptySave();
    expect(areaCompletion(save, CURRENT_AREA)).toEqual({ joined: 0, total: 5 });
    expect(unlockSteps(save, CURRENT_AREA.finale!)[0].label).toContain('Greenfield');
  });
});

describe('the area picker', () => {
  it('counts an arena\'s missions, heroes and guardians beaten', () => {
    const save = { ...emptySave(), regularMissions: { brom: MISSIONS_PER_REGULAR, lyra: 1 } };
    save.records = { ...save.records, guardians: { gravedigger: 2 }, arenaGuardians: { greenfield: { gravedigger: 2 } } };
    const greenfield = arenaProgress(save, 'greenfield', ['gravedigger', 'lakeSpirit']);
    expect(greenfield.missions).toEqual({ done: MISSIONS_PER_REGULAR + 1, total: 4 * MISSIONS_PER_REGULAR });
    expect(greenfield.heroes).toEqual({ joined: 0, total: 5 });
    expect(greenfield.guardians).toEqual([{ kind: 'gravedigger', defeated: true }, { kind: 'lakeSpirit', defeated: false }]);
    // The Campo Nevado: the igloo's three regulars, no finale yet.
    const snowfield = arenaProgress(save, 'snowfield', ['frostKnight']);
    expect(snowfield.missions).toEqual({ done: 0, total: 3 * MISSIONS_PER_REGULAR });
    expect(snowfield.heroes).toEqual({ joined: 0, total: 3 });
  });

  it('counts a guardian only in the arena it was beaten in', () => {
    const { save } = applyRun(emptySave(), run({ arena: 'snowfield', guardiansByKind: { lakeSpirit: 1 } }));
    expect(arenaProgress(save, 'snowfield', ['lakeSpirit'])).toMatchObject({ guardians: [{ kind: 'lakeSpirit', defeated: true }] });
    expect(arenaProgress(save, 'greenfield', ['lakeSpirit'])).toMatchObject({ guardians: [{ kind: 'lakeSpirit', defeated: false }] });
    // A save from before the split: its guardians were all beaten in Greenfield.
    const old = parseSave(JSON.stringify({ records: { guardians: { gravedigger: 1 } } }));
    expect(old.records.arenaGuardians).toEqual({ greenfield: { gravedigger: 1 } });
  });
});
