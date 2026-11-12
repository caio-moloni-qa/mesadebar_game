import { describe, expect, it, vi } from 'vitest';
import { DUELS, DUEL_HERO } from '../config/tavernBattle';
import { TurnBattle } from '../core/tavern/TurnBattle';
import { bindBattleAudio, DuelAudioState, duelMusicFor } from './TavernAudio';
import { musicFor } from './GameAudio';

const state: DuelAudioState = { duel: 'brom', tower: null, floor: 0, ladder: false, paused: false, ended: null };
const battle = () => new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, heroLook: 'mage', seed: 7 });

describe('tavern audio routing', () => {
  it('keeps the duel separate from tower battle, rest and squad selection', () => {
    const fight = battle();
    expect(duelMusicFor(fight, state)).toBe('duel-brom');
    expect(duelMusicFor(null, state)).toBe('tower-select');
    expect(duelMusicFor(fight, { ...state, tower: 'snowfield' })).toBe('tower-igloo-battle');
    expect(duelMusicFor(null, { ...state, tower: 'taverna', floor: 3, ladder: true })).toBe('tower-taverna-rest');
    fight.enemies[0].look = 'winterKing';
    expect(duelMusicFor(fight, { ...state, tower: 'snowfield' })).toBe('tower-igloo-champion');
    fight.phase = 'won';
    expect(duelMusicFor(fight, { ...state, tower: 'snowfield', ended: 'top' })).toBe('tower-igloo-rest');
  });

  it('distinguishes impact, perfect dodge, feint and result, then detaches all event listeners', () => {
    const fight = battle(), sound = vi.fn(), ended = vi.fn();
    const detach = bindBattleAudio(fight, sound, ended);
    const hit = { attackerId: 'brom', targetId: 'hero', index: 0, damage: 0, perfect: false };
    fight.events.emit('hitResolved', { ...hit, result: 'taken', damage: 10 });
    expect(sound).toHaveBeenLastCalledWith('common/hit-taken', .65);
    fight.events.emit('hitResolved', { ...hit, result: 'dodge', perfect: true });
    expect(sound).toHaveBeenLastCalledWith('common/dodge-perfect', .65);
    fight.events.emit('hitResolved', { ...hit, result: 'held' });
    expect(sound).toHaveBeenLastCalledWith('common/feint-held', .3);
    fight.events.emit('charging', { fighterId: 'brom', targetId: 'hero', pattern: DUELS.brom.patterns[0], turnsLeft: 1, started: false });
    expect(sound).toHaveBeenCalledTimes(3);
    fight.events.emit('battleEnded', { winner: 'party' });
    expect(ended).toHaveBeenCalledExactlyOnceWith(true);
    detach();
    fight.events.emit('battleEnded', { winner: 'enemy' });
    fight.events.emit('firmed', { fighterId: 'hero' });
    expect(sound).toHaveBeenCalledTimes(3);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('restores snowy exploration and intensity after guardians instead of using the greenfield score', () => {
    const session = { arena: { layout: { id: 'snowfield' } }, merchant: { inside: false, hub: false },
      bosses: { bosses: [] }, miniBosses: { bosses: [] }, difficulty: { stageFor: () => ({ startMs: Infinity }) }, elapsedMs: 0, over: false };
    expect(musicFor(session, false)).toBe('arena-snowfield-intense');
    expect(musicFor(session, true)).toBe('menu');
  });

  it('plays the learned skill even when its caster is a different hero', () => {
    const fight = battle(), sound = vi.fn();
    const detach = bindBattleAudio(fight, sound, vi.fn());
    fight.events.emit('skillUsed', { fighterId: fight.party[0].id, targetId: fight.party[0].id,
      skill: { id: 'barril', name: 'Barril', description: '', kind: 'active', cost: 2, effect: { type: 'shield', amount: 15 } }, damage: 0, heal: 0, crit: false, splash: [], cost: 2 });
    expect(sound).toHaveBeenCalledWith('brom/skill-barril', .65);
    detach();
  });
});
