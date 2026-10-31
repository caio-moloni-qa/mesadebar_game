import { describe, expect, it } from 'vitest';
import { AttackPattern, DUELS, DUEL_HERO, DuelId, DuelSpec, REACTION_WINDOWS } from '../../config/tavernBattle';
import { SKILL_TREES } from '../../config/tavernSkills';
import { activeKit, freshRegular, learn } from './SkillTree';
import { TurnBattle } from './TurnBattle';

// Taverna em Turnos, phase 3: the other four duels (each one rule) and the numbers of their trees.

/** One regular with a single pattern, played straight: exact timing tests. */
function onePattern(duel: DuelId, pattern: Partial<AttackPattern>): DuelSpec {
  return {
    ...DUELS[duel],
    patterns: [{ id: 'test', name: 'Teste', intent: 'golpe', leadMs: 1000, hits: [{ offsetMs: 0, damage: 10 }], weight: 1, ...pattern }]
  };
}

/** Runs the clock until `phase`; the hero just firms on any turn met on the way. */
function untilPhase(battle: TurnBattle, phase: TurnBattle['phase']): void {
  for (let i = 0; i < 20000 && battle.phase !== phase; i += 1) {
    if (battle.phase === 'player-turn') battle.firm();
    else battle.advance(1);
  }
  expect(battle.phase).toBe(phase);
}

/** Advances to `offset` ms around the next unresolved hit. */
function toHit(battle: TurnBattle, offset = 0): void {
  const hit = battle.attack!.hits.find((candidate) => candidate.result === null)!;
  battle.advance(Math.max(0, hit.at + offset - battle.clock.now));
}

function kitOf(regular: string, ids: string[]) {
  const tree = SKILL_TREES[regular];
  return activeKit(tree, ids.reduce((state, id) => learn(tree, state, id)!, { ...freshRegular(), level: 12 }));
}

describe('Lyra: arrows from range can only be dodged', () => {
  const arrow = onePattern('lyra', { intent: 'flecha', projectile: 'arrow', dodgeOnly: true });

  it('a perfect parry on an arrow is taken; a dodge saves you', () => {
    const parried = new TurnBattle({ duel: arrow, hero: DUEL_HERO, seed: 1 });
    untilPhase(parried, 'enemy-attack');
    toHit(parried);
    expect(parried.react('parry')).toBe('taken');
    expect(parried.party[0].hp).toBe(90);

    const dodged = new TurnBattle({ duel: arrow, hero: DUEL_HERO, seed: 1 });
    untilPhase(dodged, 'enemy-attack');
    toHit(dodged, REACTION_WINDOWS.dodgeMs - 10);
    expect(dodged.react('dodge')).toBe('dodge');
    expect(dodged.party[0].hp).toBe(100);
  });

  it('up close the dagger parries like any hit', () => {
    const battle = new TurnBattle({ duel: onePattern('lyra', { intent: 'combo' }), hero: DUEL_HERO, seed: 1 });
    untilPhase(battle, 'enemy-attack');
    toHit(battle);
    expect(battle.react('parry')).toBe('parry');
  });
});

describe('Zora: feints', () => {
  const feinted = onePattern('zora', { intent: 'combo', hits: [{ offsetMs: 0, damage: 8, feint: true }, { offsetMs: 600, damage: 7 }] });

  it('parrying a feint is punished', () => {
    const battle = new TurnBattle({ duel: feinted, hero: DUEL_HERO, seed: 2 });
    untilPhase(battle, 'enemy-attack');
    toHit(battle);
    expect(battle.react('parry')).toBe('taken');
    expect(battle.party[0].hp).toBe(92);
  });

  it('holding still through a feint pays Coragem, and parrying the real hits counters', () => {
    const battle = new TurnBattle({ duel: feinted, hero: DUEL_HERO, seed: 2 });
    let countered = false;
    battle.events.on('counter', () => { countered = true; });
    untilPhase(battle, 'enemy-attack');
    const [feint, real] = battle.attack!.hits;
    battle.advance(real.at - battle.clock.now);
    expect(battle.react('parry')).toBe('parry');
    expect(feint.result).toBe('held');
    expect(battle.tally.held).toBe(1);
    expect(countered).toBe(true);
    // +1 held, +1 parry, +1 counter.
    expect(battle.party[0].courage).toBe(3);
  });

  it('a wall finisher holds the feints and parries the rest', () => {
    const battle = new TurnBattle({ duel: feinted, hero: DUEL_HERO, seed: 2, kit: kitOf('zora', ['escudo-de-cristal', 'cura-cristalina', 'pele-de-quartzo', 'prisao-de-cristal']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 5;
    expect(battle.useSkill('prisao-de-cristal')).toBe(true);
    untilPhase(battle, 'enemy-attack');
    untilPhase(battle, 'resolving');
    expect(battle.attack!.hits.map((hit) => hit.result)).toEqual(['held', 'parry']);
  });
});

describe('Grimbo: the dice', () => {
  const dice = onePattern('grimbo', { intent: 'dados', hits: [{ offsetMs: 0, damage: 5 }], dice: { min: 1, max: 6, intervalMs: 330 } });

  it('rolls 1–6 hits, deterministic for a seed, and only a bet reveals the roll', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const battle = new TurnBattle({ duel: dice, hero: DUEL_HERO, seed });
      untilPhase(battle, 'enemy-attack');
      const { hits, dice: roll } = battle.attack!;
      expect(hits.length).toBe(roll!.rolled);
      expect(roll!.revealed).toBe(false);
      expect(hits[1] ? hits[1].at - hits[0].at : 330).toBe(330);
      counts.add(hits.length);
      const again = new TurnBattle({ duel: dice, hero: DUEL_HERO, seed });
      untilPhase(again, 'enemy-attack');
      expect(again.attack!.hits.length).toBe(hits.length);
    }
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts)).toBeLessThanOrEqual(6);
    expect(counts.size).toBeGreaterThan(3);
    const bet = new TurnBattle({ duel: dice, hero: DUEL_HERO, seed: 1, diceRevealed: true });
    untilPhase(bet, 'enemy-attack');
    expect(bet.attack!.dice!.revealed).toBe(true);
  });

  it('Pressentimento (Zora) also shows the roll', () => {
    const battle = new TurnBattle({ duel: dice, hero: DUEL_HERO, seed: 1, kit: kitOf('zora', ['pressentimento']) });
    untilPhase(battle, 'enemy-attack');
    expect(battle.attack!.dice!.revealed).toBe(true);
  });
});

describe('the phase-3 skills', () => {
  const straight = (duel: DuelId, damage = 10) => onePattern(duel, { hits: [{ offsetMs: 0, damage }] });
  /** The skill math below is written for a 12-attack hero, whatever the duel hero is tuned to. */
  const HERO = { ...DUEL_HERO, attack: 12 };

  it('poison ticks at the start of the next rounds, then wears off', () => {
    const battle = new TurnBattle({ duel: straight('lyra'), hero: HERO, seed: 1, kit: kitOf('lyra', ['flecha-envenenada']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 1;
    expect(battle.useSkill('flecha-envenenada')).toBe(true);
    const lyra = battle.enemies[0];
    // Half of 12 → 6.
    expect(lyra.hp).toBe(94);
    const ticks: number[] = [];
    battle.events.on('poisoned', ({ damage }) => ticks.push(damage));
    for (let guard = 0; guard < 200000 && ticks.length < 3 && !battle.over; guard += 1) {
      if (battle.phase === 'player-turn') battle.firm();
      else battle.advance(5);
    }
    expect(ticks).toEqual([4, 4, 4]);
    expect(lyra.poison).toBeNull();
  });

  it('a mark makes the next blows hit harder, then fades', () => {
    const battle = new TurnBattle({ duel: straight('zora'), hero: HERO, seed: 1, kit: kitOf('zora', ['mau-olhado', 'marca']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 2;
    battle.useSkill('marca');
    expect(battle.enemies[0].mark).toEqual({ ratio: 0.5, hits: 3 });
    untilPhase(battle, 'player-turn');
    const before = battle.enemies[0].hp;
    battle.attackTarget();
    expect(before - battle.enemies[0].hp).toBe(18);
    expect(battle.enemies[0].mark!.hits).toBe(2);
  });

  it('stealing pockets fichas, and Bolso Fundo pockets one per parry', () => {
    const battle = new TurnBattle({ duel: straight('grimbo'), hero: DUEL_HERO, seed: 1, kit: kitOf('grimbo', ['batedor-de-carteira', 'bolso-fundo']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 1;
    battle.useSkill('batedor-de-carteira');
    expect(battle.loot).toBe(3);
    untilPhase(battle, 'enemy-attack');
    toHit(battle);
    battle.react('parry');
    expect(battle.loot).toBe(4);
  });

  it('Desvio throws half the dodged hit back; Pés Ligeiros widens the dodge', () => {
    const battle = new TurnBattle({ duel: straight('grimbo', 16), hero: DUEL_HERO, seed: 1, kit: kitOf('grimbo', ['desvio']) });
    untilPhase(battle, 'enemy-attack');
    const before = battle.enemies[0].hp;
    toHit(battle, 100);
    expect(battle.react('dodge')).toBe('dodge');
    expect(before - battle.enemies[0].hp).toBe(8);
    const lyra = new TurnBattle({ duel: straight('lyra'), hero: DUEL_HERO, seed: 1, kit: kitOf('lyra', ['pes-ligeiros']) });
    expect(lyra.windowsFor(lyra.party[0]).dodgeMs).toBe(REACTION_WINDOWS.dodgeMs + 40);
  });

  it('Dança do Vento dodges the whole next attack on its own (no counter)', () => {
    const battle = new TurnBattle({ duel: straight('lyra'), hero: DUEL_HERO, seed: 1, kit: kitOf('lyra', ['pes-ligeiros', 'flecha-de-volta', 'distancia', 'danca-do-vento']) });
    untilPhase(battle, 'player-turn');
    battle.party[0].courage = 5;
    battle.useSkill('danca-do-vento');
    let countered = false;
    battle.events.on('counter', () => { countered = true; });
    untilPhase(battle, 'enemy-attack');
    untilPhase(battle, 'resolving');
    expect(battle.attack!.hits[0].result).toBe('dodge');
    expect(countered).toBe(false);
    expect(battle.party[0].hp).toBe(100);
  });

  it('crits are seeded: the same seed crits the same blows', () => {
    const crits = (seed: number) => {
      const battle = new TurnBattle({ duel: straight('grimbo', 1), hero: HERO, seed, kit: kitOf('grimbo', ['rolar-os-dados', 'dado-chumbado']) });
      const seen: boolean[] = [];
      battle.events.on('strike', ({ crit, damage }) => { seen.push(crit); expect(damage).toBe(crit ? 24 : 12); });
      for (let guard = 0; guard < 200000 && seen.length < 8 && !battle.over; guard += 1) {
        if (battle.phase === 'player-turn') battle.attackTarget();
        else battle.advance(5);
      }
      return seen;
    };
    expect(crits(4)).toEqual(crits(4));
    expect(crits(4)).toContain(true);
  });
});

describe('every duel', () => {
  /** The hero attacks every turn and answers each real hit on time: parry up close, dodge arrows, let feints pass. */
  function perfectDuel(duel: DuelId, seed = 1): TurnBattle {
    const battle = new TurnBattle({ duel: DUELS[duel], hero: DUEL_HERO, seed });
    for (let guard = 0; guard < 400000 && !battle.over; guard += 1) {
      if (battle.phase === 'player-turn') battle.attackTarget();
      else if (battle.phase === 'enemy-attack') {
        const hit = battle.attack!.hits.find((candidate) => candidate.result === null && !candidate.feint);
        if (!hit) { battle.advance(16); continue; }
        battle.advance(Math.max(0, Math.round(hit.at) - battle.clock.now));
        battle.react(hit.dodgeOnly ? 'dodge' : 'parry');
      } else battle.advance(16);
    }
    return battle;
  }

  it.each(['brom', 'lyra', 'grimbo', 'zora', 'sergio'] as const)('%s: a perfect duel is won without a scratch', (duel) => {
    const battle = perfectDuel(duel);
    expect(battle.phase).toBe('won');
    expect(battle.tally.taken).toBe(0);
    expect(battle.party[0].hp).toBe(DUEL_HERO.maxHp);
  });

  it.each(['lyra', 'grimbo', 'zora', 'sergio'] as const)('%s: never reacting loses', (duel) => {
    const battle = new TurnBattle({ duel: DUELS[duel], hero: DUEL_HERO, seed: 3 });
    for (let guard = 0; guard < 400000 && !battle.over; guard += 1) {
      if (battle.phase === 'player-turn') battle.firm();
      else battle.advance(16);
    }
    expect(battle.phase).toBe('lost');
  });

  it('every regular with a duel has a tree', () => {
    Object.keys(DUELS).forEach((id) => expect(SKILL_TREES[id]).toBeDefined());
  });
});
