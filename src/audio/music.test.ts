import { describe, expect, it } from 'vitest';
import { DIFFICULTY_STAGES } from '../config/balance';
import { MusicSituation, musicFor } from './GameAudio';

function situation(overrides: Partial<MusicSituation> = {}): MusicSituation {
  return {
    arena: { layout: { id: 'greenfield' } },
    merchant: { hub: false, inside: false },
    bosses: { bosses: [] },
    miniBosses: { bosses: [] },
    difficulty: { stageFor: (elapsedMs) => [...DIFFICULTY_STAGES].reverse().find((stage) => elapsedMs >= stage.startMs)! },
    elapsedMs: 0,
    over: false,
    ...overrides
  };
}

describe('musicFor', () => {
  const snow = { arena: { layout: { id: 'snowfield' } } };
  it('plays the igloo at the snowy base, inside the shelter and after death, ahead of combat', () => {
    const fighting = { bosses: { bosses: [{ phaseTwo: false, enraged: false }] } };
    expect(musicFor(situation({ ...snow, ...fighting, merchant: { hub: true, inside: true } }), false)).toBe('igloo');
    expect(musicFor(situation({ ...snow, ...fighting, merchant: { hub: false, inside: true } }), false)).toBe('igloo');
    expect(musicFor(situation({ ...snow, over: true }), false)).toBe('igloo');
    expect(musicFor(situation(snow), true)).toBe('tavern');
    expect(musicFor(situation(snow), false)).toBe('arena');
  });

  it.each([
    ['frostKnight', 'guardian-frost-knight'], ['iceSerpent', 'guardian-ice-serpent'],
    ['bellringer', 'guardian-bellringer'], ['ancientYeti', 'guardian-ancient-yeti']
  ] as const)('gives %s its own snowy theme and restores the arena after the fight', (kind, track) => {
    expect(musicFor(situation({ ...snow, miniBosses: { bosses: [{ kind }] } }), false)).toBe(track);
    expect(musicFor(situation(snow), false)).toBe('arena');
  });

  it('gives the Winter King both phases and priority over guardians', () => {
    const guardian = { bosses: [{ kind: 'frostKnight' as const }] };
    for (const [phaseTwo, enraged, track] of [[false, false, 'boss-winter-king'], [true, false, 'boss-winter-king-enraged'], [false, true, 'boss-winter-king-enraged']] as const) {
      expect(musicFor(situation({ ...snow, miniBosses: guardian, bosses: { bosses: [{ phaseTwo, enraged }] } }), false)).toBe(track);
    }
  });
  it('plays the tavern in the menu, between runs, inside the portal and after a run', () => {
    expect(musicFor(situation(), true)).toBe('tavern');
    expect(musicFor(situation({ merchant: { hub: true, inside: false } }), false)).toBe('tavern');
    expect(musicFor(situation({ merchant: { hub: false, inside: true } }), false)).toBe('tavern');
    expect(musicFor(situation({ over: true }), false)).toBe('tavern');
  });

  it('heats the arena up from the third difficulty stage', () => {
    expect(musicFor(situation({ elapsedMs: DIFFICULTY_STAGES[1].startMs }), false)).toBe('arena');
    expect(musicFor(situation({ elapsedMs: DIFFICULTY_STAGES[2].startMs }), false)).toBe('arena-intense');
  });

  it('gives each guardian its theme', () => {
    expect(musicFor(situation({ miniBosses: { bosses: [{ kind: 'gravedigger' }] } }), false)).toBe('guardian-gravedigger');
    expect(musicFor(situation({ miniBosses: { bosses: [{ kind: 'templeGuardian' }] } }), false)).toBe('guardian-temple');
    expect(musicFor(situation({ miniBosses: { bosses: [{ kind: 'lakeSpirit' }] } }), false)).toBe('guardian-lake');
  });

  it('puts the Necromancer over everything, enraged in his second phase', () => {
    const guardian = { bosses: [{ kind: 'lakeSpirit' as const }] };
    expect(musicFor(situation({ miniBosses: guardian, bosses: { bosses: [{ phaseTwo: false, enraged: false }] } }), false)).toBe('boss-necromancer');
    expect(musicFor(situation({ bosses: { bosses: [{ phaseTwo: true, enraged: false }] } }), false)).toBe('boss-necromancer-enraged');
  });
});
