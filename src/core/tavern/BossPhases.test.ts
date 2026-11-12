import { describe, expect, it } from 'vitest';
import { AttackPattern, BOSS_PHASE_RULES, BossPhase, DUELS, DUEL_HERO, DuelSpec } from '../../config/tavernBattle';
import { SNOW_FOES } from '../../config/tavernRoster';
import { floorFoes } from './TowerRun';
import { TurnBattle } from './TurnBattle';

const jab: AttackPattern = { id: 'jab', name: 'Jab', intent: 'golpe', leadMs: 1000, hits: [{ offsetMs: 0, damage: 10 }], weight: 1 };
const charge: AttackPattern = { id: 'carga', name: 'Carga', intent: 'carregado', leadMs: 1600, hits: [{ offsetMs: 0, damage: 0 }], charge: { turns: 1, hpShare: 0.5 }, weight: 0.0001 };
const lance: AttackPattern = { id: 'lanca', name: 'Lança', intent: 'pesado', leadMs: 1200, hits: [{ offsetMs: 0, damage: 7 }], weight: 1000 };

/** A sober boss with one jab and the given phases; the hero is fast and hits for 10, so each strike is 10 HP off. */
function boss(phases: BossPhase[], patterns: AttackPattern[] = [jab]): TurnBattle {
  const duel: DuelSpec = { ...DUELS.brom, rule: 'none', enemy: { ...DUELS.brom.enemy, maxHp: 40, speed: 5 }, patterns, phases };
  return new TurnBattle({ duel, hero: { ...DUEL_HERO, maxHp: 999, speed: 30 }, seed: 7 });
}

/** Lets the clock run to the hero's next turn and strikes. */
function strike(battle: TurnBattle): void {
  for (let i = 0; i < 30000 && battle.phase !== 'player-turn'; i += 1) battle.advance(1);
  expect(battle.attackTarget()).toBe(true);
}

/** Runs to the boss's next move; the hero just firms on its own turns (no damage). */
function untilBoss(battle: TurnBattle, done: () => boolean = () => battle.phase === 'enemy-attack'): void {
  for (let i = 0; i < 30000 && !done(); i += 1) {
    if (battle.phase === 'player-turn') battle.firm();
    battle.advance(1);
  }
}

describe('boss phases by HP', () => {
  const second: BossPhase = { atHpShare: 0.75, name: 'SEGUNDA', line: 'a', addPatterns: [lance], dropPatterns: ['jab'] };
  const fury: BossPhase = { atHpShare: 0.5, name: 'FÚRIA', line: 'b', fury: { speedMul: 2, attackMul: 1.5, leadMul: 0.5 } };

  it('enters each phase once, in order, when HP crosses its threshold', () => {
    const battle = boss([fury, second]);
    const seen: number[] = [];
    battle.events.on('phaseChanged', ({ index }) => seen.push(index));
    strike(battle);
    expect(battle.enemies[0].hp).toBe(30);
    expect(seen).toEqual([0]);
    expect(battle.enemies[0].patterns.map((p) => p.id)).toEqual(['lanca']);
    strike(battle);
    expect(seen).toEqual([0, 1]);
    expect(battle.enemies[0].fury).toBe(true);
    strike(battle);
    expect(seen).toEqual([0, 1]);
  });

  it('one big blow across two thresholds enters both', () => {
    const duel: DuelSpec = { ...DUELS.brom, rule: 'none', enemy: { ...DUELS.brom.enemy, maxHp: 40, speed: 5 }, patterns: [jab], phases: [second, fury] };
    const battle = new TurnBattle({ duel, hero: { ...DUEL_HERO, maxHp: 999, speed: 30, attack: 25 }, seed: 7 });
    const seen: string[] = [];
    battle.events.on('phaseChanged', ({ phase }) => seen.push(phase.name));
    strike(battle);
    expect(seen).toEqual(['SEGUNDA', 'FÚRIA']);
  });

  it('the fury speeds the boss up, hits harder and winds up faster, but never under the telegraph floor', () => {
    const battle = boss([{ ...fury, atHpShare: 0.8 }]);
    const speed = battle.enemies[0].speed;
    strike(battle);
    const foe = battle.enemies[0];
    expect(foe.speed).toBe(speed * 2);
    untilBoss(battle);
    const { hits, announcedAt } = battle.attack!;
    expect(hits[0].damage).toBe(15);
    expect(hits[0].at - announcedAt).toBe(Math.max(BOSS_PHASE_RULES.minLeadMs, jab.leadMs * 0.5));
  });

  it('a phase opens with its move, even a charge during the rest after another', () => {
    const battle = boss([{ ...second, dropPatterns: [], addPatterns: [], atHpShare: 0.8, openWith: 'carga' }], [jab, charge]);
    battle.enemies[0].chargeRest = 2;
    const started: string[] = [];
    battle.events.on('charging', ({ pattern, started: first }) => { if (first) started.push(pattern.id); });
    strike(battle);
    untilBoss(battle, () => started.length > 0 || battle.phase === 'enemy-attack');
    expect(started).toEqual(['carga']);
  });

  it('the champions have their phases, and every opener is a move they own by then', () => {
    const check = (patterns: AttackPattern[], phases: BossPhase[] | undefined) => {
      expect(phases?.length).toBeGreaterThan(0);
      let ids = patterns.map((p) => p.id);
      [...phases!].sort((a, b) => b.atHpShare - a.atHpShare).forEach((phase) => {
        ids = [...ids.filter((id) => !(phase.dropPatterns ?? []).includes(id)), ...(phase.addPatterns ?? []).map((p) => p.id)];
        if (phase.openWith) expect(ids).toContain(phase.openWith);
      });
    };
    check(DUELS.sergio.patterns, DUELS.sergio.phases);
    check(SNOW_FOES.winterKing.patterns, SNOW_FOES.winterKing.phases);
  });

  it('a tower floor scales the later moves with the floor too', () => {
    const base = SNOW_FOES.winterKing.phases![0].addPatterns![0].hits[0].damage;
    const [king] = floorFoes([{ duel: 'winterKing', damageScale: 2 }]);
    expect(king.phases![0].addPatterns![0].hits[0].damage).toBe(base * 2);
  });
});
