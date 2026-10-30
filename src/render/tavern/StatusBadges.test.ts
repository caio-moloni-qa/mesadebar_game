import { describe, expect, it } from 'vitest';
import { Fighter } from '../../core/tavern/TurnBattle';
import { fighterStatuses, statusInfo } from './StatusBadges';

const calm = { shield: 0, firm: false, wall: false, taunting: false, poison: null, mark: null, weakened: 1, stunned: false };

describe('status badges', () => {
  it('shows nothing on a fighter with no buffs or debuffs', () => {
    expect(fighterStatuses(calm as unknown as Fighter)).toEqual([]);
  });

  it('lists buffs first, then debuffs, with their counters', () => {
    const fighter = { ...calm, shield: 12, taunting: true, poison: { perRound: 3, rounds: 2 }, mark: { ratio: 0.5, hits: 1 }, weakened: 0.5, stunned: true };
    expect(fighterStatuses(fighter as unknown as Fighter)).toEqual([
      { id: 'shield', good: true, count: 12 },
      { id: 'taunt', good: true },
      { id: 'poison', good: false, count: 2 },
      { id: 'mark', good: false, count: 1 },
      { id: 'weak', good: false },
      { id: 'stun', good: false }
    ]);
  });

  it('explains every badge on hover, with the bearer\'s numbers', () => {
    const fighter = { ...calm, shield: 12, firm: true, wall: true, wallAs: 'dodge', taunting: true, poison: { perRound: 3, rounds: 2 }, mark: { ratio: 0.5, hits: 1 }, weakened: 0.5, stunned: true } as unknown as Fighter;
    const tips = fighterStatuses(fighter).map((badge) => statusInfo(fighter, badge));
    expect(tips).toHaveLength(8);
    tips.forEach((tip) => { expect(tip.title).not.toBe(''); expect(tip.text).not.toBe(''); });
    expect(tips[0]).toMatchObject({ title: 'Escudo 12', good: true });
    expect(tips.find((tip) => tip.title === 'Muralha')!.text).toContain('esquivado');
    expect(tips.find((tip) => tip.title === 'Veneno')).toMatchObject({ text: 'Perde 3 de vida a cada rodada, por mais 2 rodadas.', good: false });
    expect(tips.find((tip) => tip.title === 'Marcado')!.text).toBe('O próximo golpe nele causa +50% de dano.');
    expect(tips.find((tip) => tip.title === 'Enfraquecido')!.text).toContain('50%');
  });
});
