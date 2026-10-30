import { describe, expect, it } from 'vitest';
import { DUELS, DUEL_HERO, DuelSpec } from '../../config/tavernBattle';
import { SKILL_PROGRESSION, SKILL_TREES } from '../../config/tavernSkills';
import { emptySave, parseSave } from '../progress/Progress';
import { activeKit, duelXp, equipFinisher, freshRegular, grantXp, learn, levelForXp, nodeStatus, pointsLeft, regularState, resetTree, withRegular } from './SkillTree';
import { TurnBattle } from './TurnBattle';

const TREE = SKILL_TREES.brom!;

/** A regular with enough levels to learn `ids` in order. */
function learned(ids: string[], level = 12) {
  return ids.reduce((state, id) => learn(TREE, state, id)!, { ...freshRegular(), level });
}

describe('SkillTree', () => {
  it('every regular tree has 3 branches of 4 nodes ending in a finisher, with unique ids', () => {
    Object.values(SKILL_TREES).forEach((tree) => {
      expect(tree.branches).toHaveLength(3);
      const ids = tree.branches.flatMap((branch) => branch.nodes.map((node) => node.id));
      expect(new Set(ids).size).toBe(12);
      tree.branches.forEach((branch) => {
        expect(branch.nodes.map((node) => node.kind === 'finisher')).toEqual([false, false, false, true]);
      });
    });
  });

  it('node N needs node N−1 of its branch', () => {
    const start = { ...freshRegular(), level: 3 };
    expect(nodeStatus(TREE, start, 'barril')).toBe('available');
    expect(nodeStatus(TREE, start, 'casca-grossa')).toBe('locked');
    expect(learn(TREE, start, 'casca-grossa')).toBeNull();
    const one = learn(TREE, start, 'barril')!;
    expect(nodeStatus(TREE, one, 'barril')).toBe('learned');
    expect(nodeStatus(TREE, one, 'casca-grossa')).toBe('available');
    expect(nodeStatus(TREE, one, 'martelada')).toBe('locked');
  });

  it('one point per level', () => {
    const state = freshRegular();
    expect(pointsLeft(state)).toBe(1);
    const spent = learn(TREE, state, 'gole-rapido')!;
    expect(pointsLeft(spent)).toBe(0);
    expect(nodeStatus(TREE, spent, 'barril')).toBe('locked');
    expect(learn(TREE, spent, 'barril')).toBeNull();
  });

  it('only one finisher is equipped at a time', () => {
    const first = learned(['barril', 'casca-grossa', 'provocar', 'muralha-viva', 'contragolpe', 'martelada', 'ritmo-da-forja', 'golpe-da-forja']);
    // The first finisher learned equips itself; the second waits.
    expect(first.finisher).toBe('muralha-viva');
    expect(activeKit(TREE, first).filter((node) => node.kind === 'finisher').map((node) => node.id)).toEqual(['muralha-viva']);
    const swapped = equipFinisher(TREE, first, 'golpe-da-forja')!;
    expect(activeKit(TREE, swapped).filter((node) => node.kind === 'finisher').map((node) => node.id)).toEqual(['golpe-da-forja']);
    expect(equipFinisher(TREE, swapped, 'martelada')).toBeNull();
    expect(equipFinisher(TREE, swapped, 'barril-sem-fundo')).toBeNull();
  });

  it('XP raises levels along the table', () => {
    const { levelXp } = SKILL_PROGRESSION;
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(levelXp[2] - 1)).toBe(1);
    expect(levelForXp(levelXp[2])).toBe(2);
    expect(levelForXp(1e9)).toBe(levelXp.length - 1);
    const { state, levelsGained } = grantXp(freshRegular(), levelXp[3]);
    expect(state.level).toBe(3);
    expect(levelsGained).toBe(2);
    expect(duelXp(true, 4)).toBe(SKILL_PROGRESSION.duelWinXp + 4 * SKILL_PROGRESSION.xpPerParry);
    expect(duelXp(false, 0)).toBe(SKILL_PROGRESSION.duelLossXp);
  });

  it('reset refunds the points and charges the Fichas', () => {
    const state = learned(['barril', 'casca-grossa'], 4);
    const save = { ...withRegular(emptySave(), 'brom', state), fichas: 100 };
    const reset = resetTree(save, 'brom')!;
    expect(reset.fichas).toBe(100 - SKILL_PROGRESSION.resetFichas);
    expect(regularState(reset, 'brom')).toEqual({ xp: 0, level: 4, learned: [] });
    expect(pointsLeft(regularState(reset, 'brom'))).toBe(4);
    expect(resetTree({ ...save, fichas: SKILL_PROGRESSION.resetFichas - 1 }, 'brom')).toBeNull();
    expect(resetTree(reset, 'brom')).toBeNull();
  });

  it('a regular state survives a save round-trip; old saves start fresh', () => {
    const state = learned(['contragolpe', 'martelada', 'ritmo-da-forja', 'golpe-da-forja'], 5);
    const save = withRegular(emptySave(), 'brom', { ...state, xp: 380 });
    expect(regularState(parseSave(JSON.stringify(save)), 'brom')).toEqual({ ...state, xp: 380 });
    expect(regularState(parseSave(JSON.stringify({ fichas: 3 })), 'brom')).toEqual(freshRegular());
  });
});

describe('TurnBattle with a skill kit', () => {
  const sober = (damage: number): DuelSpec => ({
    ...DUELS.brom,
    rule: 'none',
    enemy: { ...DUELS.brom.enemy, speed: 50 },
    patterns: [{ id: 'test', name: 'Teste', intent: 'golpe', leadMs: 1000, hits: [{ offsetMs: 0, damage }], weight: 1 }]
  });
  const kit = (ids: string[]) => activeKit(TREE, learned(ids));

  function untilPhase(battle: TurnBattle, phase: TurnBattle['phase']): void {
    for (let i = 0; i < 20000 && battle.phase !== phase; i += 1) battle.advance(1);
    expect(battle.phase).toBe(phase);
  }

  it('passives fold in: armor, parry bonus and riposte', () => {
    const battle = new TurnBattle({ duel: sober(10), hero: DUEL_HERO, seed: 3, kit: kit(['barril', 'casca-grossa', 'contragolpe', 'martelada', 'ritmo-da-forja']) });
    const hero = battle.party[0];
    expect(hero.passives).toMatchObject({ armor: 2, roundHeal: 0, parryBonusMs: 20, ripostes: [{ ratio: 0.4, on: 'parry', of: 'attack' }] });
    expect(hero.skills.map((node) => node.id)).toEqual(['barril', 'martelada']);
    expect(battle.windowsFor(hero).parryMs).toBe(110);
    untilPhase(battle, 'enemy-attack');
    const hit = battle.attack!.hits[0];
    battle.advance(hit.at - battle.clock.now + 100);
    expect(battle.react('parry')).toBe('parry');
    // Contragolpe: 40% of 12 → 5, straight back.
    expect(battle.enemies[0].hp).toBe(120 - 5 - 12);
  });

  it('armor takes its share off a hit, never below 1', () => {
    const battle = new TurnBattle({ duel: sober(10), hero: DUEL_HERO, seed: 3, kit: kit(['barril', 'casca-grossa']) });
    untilPhase(battle, 'enemy-attack');
    untilPhase(battle, 'resolving');
    expect(battle.party[0].hp).toBe(100 - 8);
  });

  it('skills spend Coragem and do what they say', () => {
    const battle = new TurnBattle({ duel: sober(10), hero: DUEL_HERO, seed: 1, kit: kit(['barril', 'contragolpe', 'martelada']) });
    untilPhase(battle, 'player-turn');
    const hero = battle.party[0];
    expect(battle.useSkill('martelada')).toBe(false);
    hero.courage = 2;
    expect(battle.useSkill('martelada')).toBe(true);
    expect(hero.courage).toBe(0);
    expect(battle.enemies[0].hp).toBe(120 - 24);
    expect(battle.useSkill('barril')).toBe(false);
  });

  it('Barril soaks damage before HP', () => {
    const battle = new TurnBattle({ duel: sober(18), hero: DUEL_HERO, seed: 1, kit: kit(['barril']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 2;
    battle.useSkill('barril');
    const before = battle.party[0].hp;
    untilPhase(battle, 'enemy-attack');
    untilPhase(battle, 'resolving');
    expect(battle.party[0].hp).toBe(before - 3);
    expect(battle.party[0].shield).toBe(0);
  });

  it('Muralha Viva parries the whole next attack on its own and counters', () => {
    const battle = new TurnBattle({ duel: sober(18), hero: DUEL_HERO, seed: 1, kit: kit(['barril', 'casca-grossa', 'provocar', 'muralha-viva']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 5;
    expect(battle.useSkill('muralha-viva')).toBe(true);
    const before = battle.party[0].hp;
    let countered = false;
    battle.events.on('counter', () => { countered = true; });
    untilPhase(battle, 'enemy-attack');
    expect(battle.react('parry')).toBeNull();
    untilPhase(battle, 'resolving');
    expect(battle.attack!.hits.every((hit) => hit.result === 'parry')).toBe(true);
    expect(countered).toBe(true);
    expect(battle.party[0].hp).toBe(before);
    expect(battle.party[0].wall).toBe(false);
  });

  it('Provocar halves the next attack only', () => {
    const battle = new TurnBattle({ duel: sober(18), hero: DUEL_HERO, seed: 1, kit: kit(['barril', 'casca-grossa', 'provocar']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 1;
    battle.useSkill('provocar');
    untilPhase(battle, 'enemy-attack');
    expect(battle.attack!.hits[0].damage).toBe(9);
    expect(battle.enemies[0].weakened).toBe(1);
  });
});
