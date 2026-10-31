import { describe, expect, it } from 'vitest';
import { SKILL_TREES } from '../../config/tavernSkills';
import { ROSTER } from '../../config/tavernRoster';
import { chargeMs, hasOwnFx, impacts, skillFx } from './SkillFx';
import { TAVERN_BATTLE } from '../../config/tavernBattle';

const usable = [
  ...Object.values(SKILL_TREES).flatMap((tree) => tree.branches.flatMap((branch) => branch.nodes)),
  ...Object.values(ROSTER).flatMap((fighter) => fighter.kit)
].filter((skill) => skill.kind !== 'passive');

describe('skill looks', () => {
  it('gives every usable skill its own look', () => {
    expect(usable.filter((skill) => !hasOwnFx(skill.id)).map((skill) => skill.id)).toEqual([]);
  });

  it('lands every hit before the next turn starts', () => {
    // Three foes spread across the enemy side, the farthest ~840 px from the back of the squad.
    const distances = [260, 550, 840];
    usable.forEach((skill) => {
      const fx = skillFx(skill);
      impacts(fx, distances).forEach((at) => {
        expect(at, skill.id).toBeGreaterThanOrEqual(chargeMs(fx));
        expect(at, skill.id).toBeLessThan(TAVERN_BATTLE.skillMs);
      });
    });
  });

  it('casts spells and looses arrows instead of swinging them', () => {
    expect(skillFx(usable.find((skill) => skill.id === 'raio-arcano')!).motion).toBe('cast');
    expect(skillFx(usable.find((skill) => skill.id === 'tiro-certeiro')!).motion).toBe('shot');
    expect(skillFx(usable.find((skill) => skill.id === 'chuva-de-meteoros')!).motion).toBe('rain');
    expect(skillFx(usable.find((skill) => skill.id === 'avalanche')!).motion).toBe('quake');
  });
});
