// Taverna em Turnos balance bots (venivium-balance §5B): a seeded reaction bot and an action policy that play a
// TurnBattle to the end on its own SimClock, no DOM. Used by tavern.sim.test.ts.

import { TAVERN_BATTLE } from '../../src/config/tavernBattle';
import { SkillNode } from '../../src/config/tavernSkills';
import { createRng, Rng } from '../../src/core/math';
import { BattleHit, Fighter, TurnBattle } from '../../src/core/tavern/TurnBattle';

/** How a bot answers a hit: a press at `hitAt + N(bias, sigma)`; parry with `parryRate`, else dodge. */
export interface ReactionProfile {
  id: string;
  sigma: number;
  bias: number;
  parryRate: number;
  /** Chance of pressing parry on a feint (biting). */
  bite: number;
  /** Knows arrows from range can only be dodged (always dodges a dodge-only hit). */
  readsArrows: boolean;
  /** Never presses. */
  idle?: boolean;
  assisted?: boolean;
}

export const PROFILES: Record<string, ReactionProfile> = {
  none: { id: 'none', sigma: 0, bias: 0, parryRate: 0, bite: 0, readsArrows: false, idle: true },
  dodgeOnly: { id: 'dodgeOnly', sigma: 60, bias: 0, parryRate: 0, bite: 0, readsArrows: true },
  newcomer: { id: 'newcomer', sigma: 110, bias: -30, parryRate: 0.3, bite: 0.7, readsArrows: false },
  newcomerAssisted: { id: 'newcomerAssisted', sigma: 110, bias: -30, parryRate: 0.3, bite: 0.7, readsArrows: false, assisted: true },
  average: { id: 'average', sigma: 70, bias: 0, parryRate: 0.6, bite: 0.4, readsArrows: true },
  skilled: { id: 'skilled', sigma: 40, bias: 0, parryRate: 0.9, bite: 0.1, readsArrows: true },
  perfect: { id: 'perfect', sigma: 0, bias: 0, parryRate: 1, bite: 0, readsArrows: true }
};

export type ActionPolicy = 'attackOnly' | 'skillGreedy' | 'sensible';

export interface BattleStats {
  won: boolean;
  /** Battle clock at the end, ms. */
  durationMs: number;
  rounds: number;
  partyTurns: number;
  hpLeft: number;
  hpLeftRatio: number;
  minHpRatio: number;
  /** Damage taken by the party, per enemy pattern id. */
  takenBy: Record<string, number>;
  /** The biggest single blow and the biggest whole attack the party took, as a share of the defender's max HP. */
  maxHitRatio: number;
  maxAttackRatio: number;
  /** A whole attack took the defender from above 50% to 0. */
  killedFromHalf: boolean;
  tally: Record<string, number>;
  counters: number;
  courageEarned: number;
  courageSpent: number;
  skillsUsed: Record<string, number>;
  loot: number;
}

function normal(rng: Rng): number {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const SKILL_RANK: Record<string, number> = { finisher: 3, active: 1, passive: 0 };

/** The skill a policy spends Coragem on, or null to just attack. */
function pickSkill(policy: ActionPolicy, actor: Fighter, battle: TurnBattle): SkillNode | null {
  if (policy === 'attackOnly') return null;
  const affordable = actor.skills.filter((skill) => skill.cost <= actor.courage);
  if (affordable.length === 0) return null;
  const useful = affordable.filter((skill) => {
    const e = skill.effect;
    if (e.type === 'heal' || e.type === 'healAll' || e.type === 'sober') return actor.hp < actor.maxHp * 0.6;
    if (e.type === 'shield' || e.type === 'shieldAll') return actor.shield === 0;
    if (e.type === 'wall') return !actor.wall;
    if (e.type === 'mark') return battle.enemies.every((enemy) => !enemy.mark);
    return true;
  });
  if (useful.length === 0) return null;
  const best = [...useful].sort((a, b) => SKILL_RANK[b.kind] - SKILL_RANK[a.kind] || b.cost - a.cost)[0];
  if (policy === 'skillGreedy') return best;
  // Sensible: the finisher when Coragem is full, a cheap active only to heal or save it.
  if (actor.courage >= TAVERN_BATTLE.courageMax) return best;
  const heal = useful.find((skill) => ['heal', 'sober', 'healAll'].includes(skill.effect.type));
  return actor.hp < actor.maxHp * 0.35 && heal ? heal : null;
}

/** Plays a battle to the end with one reaction profile and one action policy. */
export function playBattle(battle: TurnBattle, profile: ReactionProfile, policy: ActionPolicy, botSeed: number): BattleStats {
  const rng = createRng(botSeed * 7919 + 17);
  const plans = new Map<BattleHit, { at: number; kind: 'parry' | 'dodge' | null; done: boolean }>();
  const takenBy: Record<string, number> = {};
  const skillsUsed: Record<string, number> = {};
  let maxHitRatio = 0, maxAttackRatio = 0, killedFromHalf = false, counters = 0, courageEarned = 0, courageSpent = 0, partyTurns = 0;
  let minHpRatio = 1;
  let attackTaken = new Map<string, number>();
  let attackStartHp = new Map<string, number>();
  battle.events.on('attackAnnounced', () => {
    attackTaken = new Map();
    attackStartHp = new Map(battle.party.map((f) => [f.id, f.hp]));
  });
  battle.events.on('hitResolved', ({ targetId, damage }) => {
    if (damage <= 0) return;
    const target = battle.fighter(targetId)!;
    const id = battle.attack?.pattern.id ?? '?';
    takenBy[id] = (takenBy[id] ?? 0) + damage;
    maxHitRatio = Math.max(maxHitRatio, damage / target.maxHp);
    attackTaken.set(targetId, (attackTaken.get(targetId) ?? 0) + damage);
    maxAttackRatio = Math.max(maxAttackRatio, attackTaken.get(targetId)! / target.maxHp);
    if (target.hp <= 0 && (attackStartHp.get(targetId) ?? 0) > target.maxHp * 0.5) killedFromHalf = true;
  });
  battle.events.on('counter', () => { counters += 1; });
  battle.events.on('turnStarted', ({ fighterId }) => { if (battle.fighter(fighterId)?.side === 'party') partyTurns += 1; });
  battle.events.on('skillUsed', ({ skill }) => { skillsUsed[skill.id] = (skillsUsed[skill.id] ?? 0) + 1; courageSpent += skill.cost; });
  const courageBefore = () => battle.party.reduce((sum, f) => sum + f.courage, 0);
  battle.assisted = Boolean(profile.assisted);
  let guard = 0;
  while (!battle.over && guard < 200000) {
    guard += 1;
    battle.party.forEach((f) => { minHpRatio = Math.min(minHpRatio, f.hp / f.maxHp); });
    if (battle.phase === 'player-turn') {
      const actor = battle.active!;
      const skill = pickSkill(policy, actor, battle);
      const target = [...battle.enemies].filter((e) => e.hp > 0).sort((a, b) => a.hp - b.hp)[0];
      const before = courageBefore();
      const used = Boolean(skill && battle.useSkill(skill.id, target?.id));
      if (!used) battle.attackTarget(target?.id);
      courageEarned += Math.max(0, courageBefore() - before + (used ? skill!.cost : 0));
      continue;
    }
    if (battle.phase === 'enemy-attack') {
      const hit = battle.attack!.hits.find((h) => h.result === null);
      if (!hit) { battle.advance(5); continue; }
      const defender = battle.fighter(hit.targetId)!;
      let plan = plans.get(hit);
      if (!plan) {
        let kind: 'parry' | 'dodge' | null = null;
        if (!profile.idle && !defender.wall) {
          if (hit.feint) kind = rng() < profile.bite ? 'parry' : null;
          else if (hit.dodgeOnly && profile.readsArrows) kind = 'dodge';
          else kind = rng() < profile.parryRate ? 'parry' : 'dodge';
        }
        plan = { at: hit.at + profile.bias + normal(rng) * profile.sigma, kind, done: false };
        plans.set(hit, plan);
      }
      const windows = battle.windowsFor(defender);
      const late = hit.at + windows.dodgeMs;
      if (!plan.kind || plan.done || plan.at > late) {
        battle.advance(Math.max(1, late + 1 - battle.clock.now));
        continue;
      }
      if (battle.clock.now < plan.at) battle.advance(plan.at - battle.clock.now);
      if (hit.result === null && battle.phase === 'enemy-attack') {
        const before = courageBefore();
        battle.react(plan.kind);
        courageEarned += Math.max(0, courageBefore() - before);
      }
      plan.done = true;
      continue;
    }
    const before = courageBefore();
    battle.advance(25);
    courageEarned += Math.max(0, courageBefore() - before);
  }
  const hpLeft = battle.party.reduce((sum, f) => sum + f.hp, 0);
  const maxHp = battle.party.reduce((sum, f) => sum + f.maxHp, 0);
  return {
    won: battle.phase === 'won', durationMs: battle.clock.now, rounds: battle.round, partyTurns,
    hpLeft, hpLeftRatio: hpLeft / maxHp, minHpRatio, takenBy, maxHitRatio, maxAttackRatio, killedFromHalf,
    tally: { ...battle.tally }, counters, courageEarned, courageSpent, skillsUsed, loot: battle.loot
  };
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
