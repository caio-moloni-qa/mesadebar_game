import type { TurnBattle } from '../core/tavern/TurnBattle';
import { TOWERS, TowerId } from '../config/tavernTowers';
import { TAVERN_SFX } from './tavernSoundUrls';

export interface DuelAudioState {
  duel: string;
  tower: TowerId | null;
  floor: number;
  ladder: boolean;
  paused: boolean;
  ended: string | null;
}

/** The climb's floor advances as soon as a result opens; inspect the battle's ruler for champion music. */
export function duelMusicFor(battle: TurnBattle | null, state: DuelAudioState): string {
  if (!state.tower) return battle ? `duel-${state.duel}` : 'tower-select';
  const region = state.tower === 'snowfield' ? 'igloo' : 'taverna';
  if (!battle || battle.phase === 'won' || battle.phase === 'lost') {
    const floor = TOWERS[state.tower].floors[state.floor];
    return floor?.kind === 'rest' || state.ended ? `tower-${region}-rest` : 'tower-select';
  }
  const champion = battle.enemies.some(enemy => enemy.look === 'sergio' || enemy.look === 'winterKing');
  return `tower-${region}-${champion ? 'champion' : 'battle'}`;
}

/** Listen to the real simulation events, keeping sound out of the deterministic battle. */
export function bindBattleAudio(battle: TurnBattle, sound: (key: string, volume?: number) => void,
  ended: (won: boolean) => void): () => void {
  const on = battle.events.on.bind(battle.events);
  const common = (event: string, volume = .65) => sound(`common/${event}`, volume);
  const fighter = (id: string, event: string, fallback: string, volume = .65) => {
    const look = battle.fighters.find(member => member.id === id)?.look;
    const key = `${look}/${event}`;
    sound(TAVERN_SFX[key] ? key : `common/${fallback}`, volume);
  };
  const off = [
    on('roundStarted', () => common('round-start', .25)),
    on('strike', e => fighter(e.attackerId, 'attack', e.crit ? 'crit' : 'hit-taken')),
    on('firmed', () => common('firm')),
    on('early', () => common('early-lock', .3)),
    on('attackAnnounced', e => fighter(e.attackerId, `foe-${e.pattern.id}`, `intent-${e.pattern.intent}`, .4)),
    on('hitResolved', e => {
      if (e.result === 'parry') common('parry-perfect');
      else if (e.result === 'dodge') common(e.perfect ? 'dodge-perfect' : 'dodge');
      else if (e.result === 'held') common('feint-held', .3);
      else common('hit-taken');
    }),
    on('counter', () => common('counter')),
    on('riposte', () => common('counter', .4)),
    on('fighterDown', e => fighter(e.fighterId, 'bark-ko', 'fighter-down', .45)),
    on('skillUsed', e => {
      const look = battle.fighters.find(member => member.id === e.fighterId)?.look;
      const own = `${look}/skill-${e.skill.id}`;
      // Heroes can equip another regular's lessons; the taught skill retains its sound.
      const key = TAVERN_SFX[own] ? own : Object.keys(TAVERN_SFX).find(key => key.endsWith(`/skill-${e.skill.id}`));
      if (key) sound(key, .65);
      else common(e.heal > 0 ? 'heal' : e.skill.effect.type === 'shield' || e.skill.effect.type === 'shieldAll' ? 'shield-up' : 'crit');
    }),
    on('poisoned', () => common('poison-tick', .3)),
    on('looted', () => common('fichas-coin', .35)),
    on('healed', () => common('heal', .3)),
    on('charging', e => { if (e.started) common('charge-start', .45); }),
    on('chargeBroken', () => common('charge-broken')),
    on('courageLost', () => common('courage-lost', .25)),
    on('offBalance', () => common('off-balance', .4)),
    on('phaseChanged', () => common('charge-release', .6)),
    on('battleEnded', e => ended(e.winner === 'party')),
  ];
  return () => off.forEach(unsubscribe => unsubscribe());
}
