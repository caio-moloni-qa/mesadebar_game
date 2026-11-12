import { describe, expect, it } from 'vitest';
import { AttackPattern, DEFENSE_RULES, DUELS, DUEL_HERO, DuelSpec, REACTION_WINDOWS } from '../../config/tavernBattle';
import { SkillNode } from '../../config/tavernSkills';
import { createRng } from '../math';
import { isPerfectDodge, judgeReaction, reactionWindows } from './Reaction';
import { TurnBattle, tipsyOffsets } from './TurnBattle';

const WINDOWS = reactionWindows(REACTION_WINDOWS);

/** A one-pattern Brom that plays it straight (no drinking, no jitter) — for exact timing tests. */
function soberDuel(hits: Array<{ offsetMs: number; damage: number }>, overrides: Partial<DuelSpec['enemy']> = {}): DuelSpec {
  return {
    ...DUELS.brom,
    rule: 'none',
    enemy: { ...DUELS.brom.enemy, ...overrides },
    patterns: [{ id: 'test', name: 'Teste', intent: 'golpe', leadMs: 1000, hits, weight: 1 }]
  };
}

/** Runs the clock until the battle reaches `phase` (or gives up). */
function runUntil(battle: TurnBattle, phase: TurnBattle['phase'], limitMs = 20000): void {
  for (let elapsed = 0; elapsed < limitMs && battle.phase !== phase; elapsed += 1) battle.advance(1);
  expect(battle.phase).toBe(phase);
}

/** Advances exactly to `time` on the battle clock. */
function advanceTo(battle: TurnBattle, time: number): void {
  battle.advance(time - battle.clock.now);
}

describe('judgeReaction', () => {
  const { parryMs: P, dodgeMs: D } = WINDOWS;
  it.each([
    ['parry', P, 'parry'], ['parry', -P, 'parry'],
    ['parry', P + 1, 'taken'], ['parry', -P - 1, 'taken'],
    ['parry', D, 'taken'], ['parry', D + 1, 'early'],
    ['dodge', D, 'dodge'], ['dodge', -D, 'dodge'],
    ['dodge', D + 1, 'early'], ['dodge', -D - 1, 'early'],
    ['dodge', 0, 'dodge']
  ] as const)('%s at %i ms → %s', (kind, offset, expected) => {
    expect(judgeReaction(kind, 1000, 1000 + offset, WINDOWS)).toBe(expected);
  });

  it('the dodge is the easier answer, but the perfect dodge is the sharpest', () => {
    expect(WINDOWS.dodgeMs).toBeGreaterThan(WINDOWS.parryMs);
    expect(WINDOWS.perfectDodgeMs).toBeLessThan(WINDOWS.parryMs);
    expect(isPerfectDodge(1000, 1000 + WINDOWS.perfectDodgeMs, WINDOWS)).toBe(true);
    expect(isPerfectDodge(1000, 1000 - WINDOWS.perfectDodgeMs - 1, WINDOWS)).toBe(false);
  });

  it('assisted mode doubles every window', () => {
    const assisted = reactionWindows(REACTION_WINDOWS, { assisted: true });
    expect(assisted.parryMs).toBe(P * 2);
    expect(assisted.dodgeMs).toBe(D * 2);
    expect(assisted.perfectDodgeMs).toBe(WINDOWS.perfectDodgeMs * 2);
    expect(judgeReaction('parry', 0, P * 2 - 10, assisted)).toBe('parry');
    expect(judgeReaction('dodge', 0, -D * 2 + 10, assisted)).toBe('dodge');
    expect(judgeReaction('dodge', 0, D * 2 + 1, assisted)).toBe('early');
  });

  it('Firmar widens only the parry window', () => {
    const firm = reactionWindows(REACTION_WINDOWS, { firm: true });
    expect(firm.parryMs).toBe(P + REACTION_WINDOWS.firmBonusMs);
    expect(firm.dodgeMs).toBe(D);
  });
});

describe('TurnBattle', () => {
  it('opens with a drink, then the faster hero acts first', () => {
    const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, seed: 1 });
    expect(battle.round).toBe(1);
    expect(battle.fighters.every((fighter) => fighter.tipsiness === 1)).toBe(true);
    runUntil(battle, 'player-turn');
    expect(battle.active?.id).toBe('hero');
  });

  it('turn order is deterministic for a seed', () => {
    const queue = () => new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, seed: 42 }).upcoming(6);
    expect(queue()).toHaveLength(6);
    expect(queue()).toEqual(queue());
  });

  it('an unanswered hit is taken once its dodge window passes', () => {
    const battle = new TurnBattle({ duel: soberDuel([{ offsetMs: 0, damage: 10 }], { speed: 50 }), hero: DUEL_HERO, seed: 3 });
    runUntil(battle, 'enemy-attack');
    const hit = battle.attack!.hits[0];
    advanceTo(battle, hit.at + WINDOWS.dodgeMs);
    expect(hit.result).toBeNull();
    battle.advance(1);
    expect(hit.result).toBe('taken');
    expect(battle.party[0].hp).toBe(DUEL_HERO.maxHp - 10);
  });

  it('only a perfect dodge earns Coragem; a plain dodge just saves the hit', () => {
    const play = (offset: number) => {
      const battle = new TurnBattle({ duel: soberDuel([{ offsetMs: 0, damage: 10 }], { speed: 50 }), hero: DUEL_HERO, seed: 3 });
      runUntil(battle, 'enemy-attack');
      const hero = battle.party[0];
      const before = hero.courage;
      const hit = battle.attack!.hits[0];
      advanceTo(battle, hit.at + offset);
      expect(battle.react('dodge')).toBe('dodge');
      return { gained: hero.courage - before, perfect: battle.tally.perfectDodge, hp: hero.hp };
    };
    expect(play(WINDOWS.perfectDodgeMs)).toEqual({ gained: 1, perfect: 1, hp: DUEL_HERO.maxHp });
    expect(play(WINDOWS.dodgeMs)).toEqual({ gained: 0, perfect: 0, hp: DUEL_HERO.maxHp });
  });

  it('an early press locks input, and the hit still comes', () => {
    const battle = new TurnBattle({ duel: soberDuel([{ offsetMs: 0, damage: 10 }], { speed: 50 }), hero: DUEL_HERO, seed: 3 });
    runUntil(battle, 'enemy-attack');
    const hit = battle.attack!.hits[0];
    advanceTo(battle, hit.at - 300);
    expect(battle.react('parry')).toBe('early');
    advanceTo(battle, hit.at - 100);
    expect(battle.react('dodge')).toBeNull();
    expect(hit.result).toBeNull();
    advanceTo(battle, hit.at);
    expect(battle.react('parry')).toBe('parry');
  });

  it('Firmar widens the parry window only until the fighter\'s next turn', () => {
    const battle = new TurnBattle({ duel: soberDuel([{ offsetMs: 0, damage: 10 }], { speed: 10, maxHp: 999 }), hero: { ...DUEL_HERO, speed: 10 }, seed: 5 });
    // Hero first (ties go to the party): firm, then answer Brom 110 ms late — inside the widened window.
    runUntil(battle, 'player-turn');
    expect(battle.firm()).toBe(true);
    runUntil(battle, 'enemy-attack');
    advanceTo(battle, battle.attack!.hits[0].at + 110);
    expect(battle.react('parry')).toBe('parry');
    // The hero's next turn clears it: attack instead, and the same timing is taken now.
    runUntil(battle, 'player-turn');
    expect(battle.active!.firm).toBe(false);
    battle.attackTarget();
    runUntil(battle, 'enemy-attack');
    advanceTo(battle, battle.attack!.hits[0].at + 110);
    expect(battle.react('parry')).toBe('taken');
  });

  it('a fully parried combo counters; a partly parried one does not', () => {
    const combo = [{ offsetMs: 0, damage: 6 }, { offsetMs: 380, damage: 6 }, { offsetMs: 760, damage: 6 }];
    const play = (answers: Array<'parry' | 'dodge'>) => {
      const battle = new TurnBattle({ duel: soberDuel(combo, { speed: 50 }), hero: DUEL_HERO, seed: 9 });
      const counters: number[] = [];
      battle.events.on('counter', ({ damage }) => counters.push(damage));
      runUntil(battle, 'enemy-attack');
      battle.attack!.hits.forEach((hit, i) => {
        advanceTo(battle, hit.at);
        battle.react(answers[i]);
      });
      return { battle, counters };
    };
    const full = play(['parry', 'parry', 'parry']);
    expect(full.counters).toEqual([DUEL_HERO.attack]);
    expect(full.battle.enemies[0].hp).toBe(DUELS.brom.enemy.maxHp - DUEL_HERO.attack);
    expect(full.battle.party[0].courage).toBe(4);
    const partial = play(['parry', 'dodge', 'parry']);
    expect(partial.counters).toEqual([]);
    expect(partial.battle.party[0].hp).toBe(DUEL_HERO.maxHp);
  });

  it('Brom\'s tipsy jitter stays in bounds and is deterministic for a seed', () => {
    const offsets = [0, 380, 760];
    for (let tipsiness = 0; tipsiness <= 4; tipsiness += 1) {
      const rng = createRng(77);
      for (let i = 0; i < 200; i += 1) {
        tipsyOffsets(offsets, tipsiness, rng).forEach((value, index) => {
          expect(Math.abs(value - offsets[index])).toBeLessThanOrEqual(tipsiness * 40);
        });
      }
    }
    expect(tipsyOffsets(offsets, 3, createRng(5))).toEqual(tipsyOffsets(offsets, 3, createRng(5)));
    expect(tipsyOffsets(offsets, 0, createRng(5))).toEqual(offsets);
  });

  it('tipsiness grows one drink per round up to the cap', () => {
    const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, seed: 11 });
    const brom = battle.enemies[0];
    let rounds = 0;
    battle.events.on('roundStarted', () => { rounds += 1; });
    for (let guard = 0; guard < 400000 && rounds < 6 && !battle.over; guard += 1) {
      if (battle.phase === 'player-turn') battle.firm();
      else if (battle.phase === 'enemy-attack') {
        const hit = battle.attack!.hits.find((candidate) => candidate.result === null)!;
        advanceTo(battle, Math.max(battle.clock.now, hit.at));
        battle.react('dodge');
      } else battle.advance(5);
    }
    expect(rounds).toBe(6);
    expect(brom.tipsiness).toBe(4);
  });

  /** Scripted duel: the hero attacks every turn and answers each hit exactly on time with `answer` (or never). */
  function scriptedDuel(answer: 'parry' | null, partyMove: 'attack' | 'firm'): TurnBattle {
    const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, seed: 1 });
    for (let guard = 0; guard < 200000 && !battle.over; guard += 1) {
      if (battle.phase === 'player-turn') {
        if (partyMove === 'attack') battle.attackTarget();
        else battle.firm();
      } else if (battle.phase === 'enemy-attack' && answer) {
        const hit = battle.attack!.hits.find((candidate) => candidate.result === null)!;
        advanceTo(battle, Math.max(battle.clock.now, Math.round(hit.at)));
        battle.react(answer);
      } else battle.advance(16);
    }
    return battle;
  }

  it('a scripted duel with perfect parries is won', () => {
    const battle = scriptedDuel('parry', 'attack');
    expect(battle.phase).toBe('won');
    expect(battle.party[0].hp).toBe(DUEL_HERO.maxHp);
    expect(battle.tally.taken).toBe(0);
  });

  it('a scripted duel that never reacts is lost', () => {
    const battle = scriptedDuel(null, 'firm');
    expect(battle.phase).toBe('lost');
    expect(battle.enemies[0].hp).toBe(DUELS.brom.enemy.maxHp);
  });

  it('is deterministic: the same seed and presses give the same battle', () => {
    const summary = (battle: TurnBattle) => ({ phase: battle.phase, now: battle.clock.now, hp: battle.fighters.map((f) => f.hp), tally: { ...battle.tally } });
    expect(summary(scriptedDuel('parry', 'attack'))).toEqual(summary(scriptedDuel('parry', 'attack')));
  });
});

describe('defence rules: no single button answers everything', () => {
  /** A Brom with exactly one pattern (no drinking, no jitter). */
  const only = (pattern: AttackPattern, enemy: Partial<DuelSpec['enemy']> = {}): DuelSpec => ({ ...DUELS.brom, rule: 'none', enemy: { ...DUELS.brom.enemy, ...enemy }, patterns: [pattern] });
  const charge: AttackPattern = { id: 'carga', name: 'Carga', intent: 'carregado', leadMs: 1600, hits: [{ offsetMs: 0, damage: 0 }], charge: { turns: 1, hpShare: 0.6 }, weight: 1 };

  it('a dodge on a feint throws you off balance: the feint lands', () => {
    const battle = new TurnBattle({ duel: only({ id: 'f', name: 'F', intent: 'combo', leadMs: 1000, hits: [{ offsetMs: 0, damage: 8, feint: true }, { offsetMs: 600, damage: 5 }], weight: 1 }, { speed: 50 }), hero: DUEL_HERO, seed: 3 });
    const offBalance: string[] = [];
    battle.events.on('offBalance', ({ fighterId }) => offBalance.push(fighterId));
    runUntil(battle, 'enemy-attack');
    advanceTo(battle, battle.attack!.hits[0].at);
    expect(battle.react('dodge')).toBe('taken');
    expect(battle.party[0].hp).toBe(DUEL_HERO.maxHp - 8);
    expect(offBalance).toEqual(['hero']);
  });

  it('a Golpe Inquebrável can only be parried', () => {
    const play = (kind: 'parry' | 'dodge') => {
      const battle = new TurnBattle({ duel: only({ id: 'i', name: 'I', intent: 'pesado', leadMs: 1000, parryOnly: true, hits: [{ offsetMs: 0, damage: 12 }], weight: 1 }, { speed: 50 }), hero: DUEL_HERO, seed: 3 });
      runUntil(battle, 'enemy-attack');
      expect(battle.attack!.hits[0].parryOnly).toBe(true);
      advanceTo(battle, battle.attack!.hits[0].at);
      return { result: battle.react(kind), hp: battle.party[0].hp };
    };
    expect(play('dodge')).toEqual({ result: 'taken', hp: DUEL_HERO.maxHp - 12 });
    expect(play('parry')).toEqual({ result: 'parry', hp: DUEL_HERO.maxHp });
  });

  it('a Golpe Carregado winds up for a turn, then lands for its share of the target\'s HP; Firmar cuts it', () => {
    const play = (firm: boolean) => {
      const battle = new TurnBattle({ duel: only(charge, { speed: 10, maxHp: 999 }), hero: { ...DUEL_HERO, speed: 10 }, seed: 5 });
      const charging: number[] = [];
      battle.events.on('charging', ({ turnsLeft }) => charging.push(turnsLeft));
      // Brom acts first on this seed: he starts the charge (no hit comes), then it's the hero's turn.
      runUntil(battle, 'player-turn');
      expect(battle.enemies[0].charging).toMatchObject({ turnsLeft: 1, targetId: 'hero' });
      expect(battle.party[0].hp).toBe(DUEL_HERO.maxHp);
      if (firm) battle.firm(); else battle.attackTarget();
      runUntil(battle, 'enemy-attack');
      const hit = battle.attack!.hits[0];
      expect(hit).toMatchObject({ charged: true, parryOnly: true, damage: Math.round(DUEL_HERO.maxHp * 0.6) });
      advanceTo(battle, hit.at);
      expect(battle.react('dodge')).toBe('taken');
      return { charging, hp: battle.party[0].hp, after: battle.enemies[0].charging };
    };
    expect(play(false)).toEqual({ charging: [1], hp: DUEL_HERO.maxHp - 60, after: null });
    expect(play(true).hp).toBe(DUEL_HERO.maxHp - Math.round(60 * DEFENSE_RULES.firmChargeCut));
  });

  it('after a charge lands, the next turns can\'t start another', () => {
    const jab: AttackPattern = { id: 'jab', name: 'Jab', intent: 'golpe', leadMs: 800, hits: [{ offsetMs: 0, damage: 1 }], weight: 1 };
    const battle = new TurnBattle({ duel: { ...only(charge, { speed: 50, maxHp: 999 }), patterns: [{ ...charge, weight: 1000 }, jab] }, hero: { ...DUEL_HERO, maxHp: 999 }, seed: 5 });
    const picked: string[] = [];
    battle.events.on('charging', ({ started }) => { if (started) picked.push('charge'); });
    battle.events.on('attackAnnounced', ({ pattern }) => picked.push(pattern.id));
    for (let i = 0; i < 20000 && picked.length < 5; i += 1) battle.advance(1);
    // Start, release, then the rest turns only jab.
    expect(picked.slice(0, 2 + DEFENSE_RULES.chargeRestTurns)).toEqual(['charge', 'carga', ...Array(DEFENSE_RULES.chargeRestTurns).fill('jab')]);
  });

  it('a stun breaks the wind-up', () => {
    const stun = { id: 'tonto', name: 'Tonto', kind: 'active', cost: 0, description: '', effect: { type: 'stun', ratio: 1, delay: 0 } } as unknown as SkillNode;
    const battle = new TurnBattle({ duel: only(charge, { speed: 10, maxHp: 999 }), hero: { ...DUEL_HERO, speed: 10 }, kit: [stun], seed: 5 });
    const broken: string[] = [];
    battle.events.on('chargeBroken', ({ fighterId }) => broken.push(fighterId));
    runUntil(battle, 'player-turn');
    expect(battle.enemies[0].charging).not.toBeNull();
    expect(battle.useSkill('tonto')).toBe(true);
    expect(battle.enemies[0].charging).toBeNull();
    expect(broken).toHaveLength(1);
  });
});
