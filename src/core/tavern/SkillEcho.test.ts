import { describe, expect, it } from 'vitest';
import { DUELS, DUEL_HERO, TAVERN_BATTLE } from '../../config/tavernBattle';
import { SkillNode } from '../../config/tavernSkills';
import { TurnBattle } from './TurnBattle';

const skill: SkillNode = { id: 'echo-test', name: 'Teste', description: '', kind: 'active', cost: 1, effect: { type: 'shield', amount: 1 } } as SkillNode;

function setup() {
  const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, seed: 1, kit: [skill, { ...skill, id: 'other' }] });
  const turn = () => {
    for (let i = 0; i < 30000 && battle.phase !== 'player-turn'; i++) {
      if (battle.phase === 'enemy-attack') {
        const hit = battle.attack!.hits.find(h => h.result === null);
        if (hit) { battle.advance(Math.max(0, hit.at - battle.clock.now)); battle.react('parry'); }
      }
      battle.advance(1);
    }
    expect(battle.phase).toBe('player-turn');
    battle.party[0].courage = TAVERN_BATTLE.courageMax;
  };
  turn();
  return { battle, hero: battle.party[0], turn };
}

describe('skill repetition cost', () => {
  it('charges the displayed cost, rejects an unaffordable repeat and caps at a full bar', () => {
    const { battle, hero, turn } = setup();
    const paid: number[] = [];
    battle.events.on('skillUsed', e => paid.push(e.cost));
    expect(battle.skillCost(hero, skill)).toBe(skill.cost);
    for (let i = 0; i < 7; i++) {
      const cost = battle.skillCost(hero, skill);
      hero.courage = cost - 1;
      expect(battle.useSkill(skill.id)).toBe(false);
      expect(battle.skillCost(hero, skill)).toBe(cost);
      hero.courage = cost;
      expect(battle.useSkill(skill.id)).toBe(true);
      expect(hero.courage).toBe(0);
      expect(paid.at(-1)).toBe(cost);
      turn();
    }
    expect(battle.skillCost(hero, skill)).toBe(TAVERN_BATTLE.courageMax);
  });

  it.each(['attack', 'firm', 'other'] as const)('clears repetition after %s, but not after rejected input', action => {
    const { battle, hero, turn } = setup();
    battle.useSkill(skill.id);
    turn();
    expect(battle.skillCost(hero, skill)).toBeGreaterThan(skill.cost);
    expect(battle.useSkill('missing')).toBe(false);
    expect(battle.skillCost(hero, skill)).toBeGreaterThan(skill.cost);
    if (action === 'attack') battle.attackTarget();
    else if (action === 'firm') battle.firm();
    else battle.useSkill('other');
    expect(battle.skillCost(hero, skill)).toBe(skill.cost);
  });
});
