import { AttackPattern, DRINKING_RULE, DuelFighterSpec, DuelSpec, REACTION_WINDOWS, TAVERN_BATTLE } from '../../config/tavernBattle';
import { SkillNode } from '../../config/tavernSkills';
import { EventBus } from '../EventBus';
import { Rng, createRng } from '../math';
import { SimClock, TimerHandle } from '../SimClock';
import { ReactionKind, ReactionResult, ReactionWindows, judgeReaction, reactionWindows } from './Reaction';

export type BattleSide = 'party' | 'enemy';
export type BattlePhase = 'player-turn' | 'enemy-attack' | 'resolving' | 'won' | 'lost';

export interface Fighter {
  id: string;
  name: string;
  side: BattleSide;
  /** Position in its side's line (turn-order ties break by it). */
  slot: number;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  /** Coragem, 0..courageMax: +1 per parry and per hit landed. */
  courage: number;
  /** Firmar: a wider parry window until this fighter's next turn. */
  firm: boolean;
  statuses: string[];
  /** The duel's drinks so far (Brom's rhythm jitters by it; the player's only sways the screen). */
  tipsiness: number;
  patterns: AttackPattern[];
  /** Skills from a regular's tree (phase 2): the actives and the equipped finisher, used for Coragem. */
  skills: SkillNode[];
  /** Passives from the tree, folded into numbers. */
  passives: FighterPassives;
  /** Barril: damage soaked before HP. */
  shield: number;
  /** Provocar: this fighter's next attack hits for this share (1 = untouched). */
  weakened: number;
  /** Muralha Viva (and the other "wall" finishers): the next attack aimed at this fighter is answered on its own. */
  wall: boolean;
  /** How the wall answers: parried (ends in a counter) or dodged (Dança do Vento, Mesa Virada). */
  wallAs: 'parry' | 'dodge';
  /** Veneno / Praga: damage at the start of each of the next `rounds` rounds. */
  poison: { perRound: number; rounds: number } | null;
  /** Marca: the next `hits` party blows on this fighter hit for (1 + ratio) ×. */
  mark: { ratio: number; hits: number } | null;
}

export interface FighterPassives {
  /** Casca Grossa: damage off every hit taken. */
  armor: number;
  /** Rodada Dupla: healed by each round's drink. */
  roundHeal: number;
  /** Ritmo da Forja: a wider parry window. */
  parryBonusMs: number;
  /** Contragolpe, Flecha de Volta, Desvio, Devolução: strike back after a parry or a dodge. */
  ripostes: Array<{ ratio: number; on: 'parry' | 'dodge'; of: 'attack' | 'hit' }>;
  /** Mira, Dado Chumbado, Estoque Cheio: the chance a party blow crits for double. */
  critChance: number;
  /** Pés Ligeiros, Ginga: a wider dodge window. */
  dodgeBonusMs: number;
  /** Bolso Fundo: fichas pocketed per perfect parry. */
  parryLoot: number;
  /** Pressentimento: feints show on the track, the dice show before they're thrown. */
  foresight: boolean;
}

/** One scheduled hit of an enemy attack (`at` is a SimClock time); `result` stays null until it resolves. */
export interface BattleHit {
  index: number;
  at: number;
  damage: number;
  targetId: string;
  result: ReactionResult | null;
  /** Zora's feint: never lands; parrying it is punished with `damage`, letting it pass is 'held'. */
  feint: boolean;
  /** Lyra's arrows from range: a parry can't stop them. */
  dodgeOnly: boolean;
}

export interface EnemyAttack {
  attackerId: string;
  pattern: AttackPattern;
  announcedAt: number;
  hits: BattleHit[];
  /** Grimbo's dice: how many hits the roll gave, and whether the defender gets to see it (a bet, Pressentimento). */
  dice: { rolled: number; revealed: boolean } | null;
}

export type TurnBattleEvents = {
  /** Every round starts with a drink (the duel rule). */
  roundStarted: { round: number };
  turnStarted: { fighterId: string; round: number };
  attackAnnounced: { attackerId: string; pattern: AttackPattern; hits: readonly BattleHit[] };
  strike: { attackerId: string; targetId: string; damage: number; crit: boolean };
  firmed: { fighterId: string };
  /** A press outside every window: input locks for a moment. */
  early: { fighterId: string };
  hitResolved: { attackerId: string; targetId: string; index: number; result: ReactionResult; damage: number };
  /** Every hit of an attack parried: the defender's free swing. */
  counter: { defenderId: string; attackerId: string; damage: number };
  fighterDown: { fighterId: string };
  battleEnded: { winner: BattleSide };
  /** A skill from the tree: what it did (damage dealt, HP healed). */
  skillUsed: { fighterId: string; skill: SkillNode; targetId: string; damage: number; heal: number; crit: boolean };
  /** Contragolpe and friends: a parry or a dodge struck straight back. */
  riposte: { defenderId: string; attackerId: string; damage: number; on: 'parry' | 'dodge' };
  /** Veneno / Praga ticking at the start of a round. */
  poisoned: { fighterId: string; damage: number };
  /** Fichas pocketed (Mão Leve): paid out after the duel. */
  looted: { fighterId: string; fichas: number };
  /** Rodada Dupla: the round's drink healed. */
  healed: { fighterId: string; amount: number };
};

export interface TurnBattleOptions {
  duel: DuelSpec;
  hero: DuelFighterSpec;
  seed: number;
  /** Assisted mode: both reaction windows × assistedScale. */
  assisted?: boolean;
  /** The hero's skills from the dueled regular's tree (activeKit): passives apply, actives fill the Habilidade menu. */
  kit?: SkillNode[];
  /** Grimbo's duel: the player bet fichas, so every dice roll shows before it's thrown. */
  diceRevealed?: boolean;
}

/** Each hit offset jittered by up to ± tipsiness × jitterMs (seeded), so a tipsy fighter's rhythm grows irregular. */
export function tipsyOffsets(offsets: readonly number[], tipsiness: number, rng: Rng, jitterMs: number = DRINKING_RULE.jitterPerTipsinessMs): number[] {
  const spread = tipsiness * jitterMs;
  return offsets.map((offset) => offset + (rng() * 2 - 1) * spread);
}

function makeFighter(id: string, spec: DuelFighterSpec, side: BattleSide, slot: number, patterns: AttackPattern[], kit: SkillNode[] = []): Fighter {
  const passives: FighterPassives = { armor: 0, roundHeal: 0, parryBonusMs: 0, ripostes: [], critChance: 0, dodgeBonusMs: 0, parryLoot: 0, foresight: false };
  kit.filter((node) => node.kind === 'passive').forEach(({ effect }) => {
    if (effect.type === 'armor') passives.armor += effect.amount;
    else if (effect.type === 'roundHeal') passives.roundHeal += effect.amount;
    else if (effect.type === 'parryBonus') passives.parryBonusMs += effect.ms;
    else if (effect.type === 'riposte') passives.ripostes.push({ ratio: effect.ratio, on: effect.on ?? 'parry', of: effect.of ?? 'attack' });
    else if (effect.type === 'crit') passives.critChance += effect.chance;
    else if (effect.type === 'dodgeBonus') passives.dodgeBonusMs += effect.ms;
    else if (effect.type === 'parryLoot') passives.parryLoot += effect.fichas;
    else if (effect.type === 'foresight') passives.foresight = true;
  });
  return {
    id, name: spec.name, side, slot, hp: spec.maxHp, maxHp: spec.maxHp, attack: spec.attack, speed: spec.speed, courage: 0,
    firm: false, statuses: [], tipsiness: 0, patterns, skills: kit.filter((node) => node.kind !== 'passive'), passives,
    shield: 0, weakened: 1, wall: false, wallAs: 'parry', poison: null, mark: null
  };
}

/** A turn-based tavern battle:initiative turns, party commands, and enemy attacks the defender answers in real time
 *  (aparar / esquivar). Driven by commands and `advance(dt)` on its own SimClock; the 2D stage only reads it and
 *  listens to `events`. */
export class TurnBattle {
  readonly clock = new SimClock();
  readonly events = new EventBus<TurnBattleEvents>();
  readonly fighters: Fighter[];
  /** Assisted mode (a setting the pause menu can flip mid-duel). */
  assisted: boolean;
  phase: BattlePhase = 'resolving';
  round = 0;
  /** Whose turn it is (null during the opening drink). */
  active: Fighter | null = null;
  /** The enemy attack in the air, while phase is 'enemy-attack' (kept after it ends for the stage to finish drawing). */
  attack: EnemyAttack | null = null;
  /** The last reaction judged (results screen, probe). */
  lastReaction: { result: ReactionResult; at: number } | null = null;
  /** Reactions per result over the battle. */
  readonly tally: Record<ReactionResult, number> = { parry: 0, dodge: 0, taken: 0, early: 0, held: 0 };
  /** Input is locked until this time after an early press. */
  lockedUntil = 0;
  /** Fichas the party pocketed this duel (Mão Leve), paid out at the end. */
  loot = 0;
  private readonly rng: Rng;
  private readonly meters = new Map<string, number>();
  private readonly actedThisRound = new Set<string>();
  private pending: TimerHandle | null = null;

  constructor(private readonly options: TurnBattleOptions) {
    this.rng = createRng(options.seed);
    this.assisted = Boolean(options.assisted);
    const { hero, duel } = options;
    this.fighters = [
      makeFighter('hero', hero, 'party', 0, [], options.kit),
      makeFighter(duel.id, duel.enemy, 'enemy', 0, duel.patterns)
    ];
    this.fighters.forEach((fighter) => this.meters.set(fighter.id, this.rng() * TAVERN_BATTLE.initiativeJitter));
    this.startRound();
    this.wait(TAVERN_BATTLE.introMs);
  }

  /** The duel being fought (its rule, for the stage and the HUD). */
  get duel(): DuelSpec { return this.options.duel; }
  get party(): Fighter[] { return this.fighters.filter((fighter) => fighter.side === 'party'); }
  get enemies(): Fighter[] { return this.fighters.filter((fighter) => fighter.side === 'enemy'); }
  get over(): boolean { return this.phase === 'won' || this.phase === 'lost'; }

  fighter(id: string): Fighter | undefined {
    return this.fighters.find((fighter) => fighter.id === id);
  }

  /** The reaction windows a fighter defends with right now (Firmar, assisted mode). */
  windowsFor(fighter: Fighter): ReactionWindows {
    return reactionWindows(REACTION_WINDOWS, { firm: fighter.firm, assisted: this.assisted, parryBonusMs: fighter.passives.parryBonusMs, dodgeBonusMs: fighter.passives.dodgeBonusMs });
  }

  /** The next `count` turns (fighter ids), for the queue at the top of the screen. */
  upcoming(count: number = TAVERN_BATTLE.queueLength): string[] {
    const meters = new Map(this.meters);
    return Array.from({ length: count }, () => this.nextActor(meters).id);
  }

  /** Keeps ticking after the end (the stage plays the knockout out on this clock); nothing is decided then. */
  advance(deltaMs: number): void {
    this.clock.advance(deltaMs);
    if (!this.over) this.expireHits();
  }

  // ── Party commands (only on a party fighter's turn) ──

  attackTarget(targetId?: string): boolean {
    const actor = this.partyActor();
    const target = targetId ? this.fighter(targetId) : this.enemies.find((enemy) => enemy.hp > 0);
    if (!actor || !target || target.hp <= 0 || target.side === actor.side) return false;
    const { damage, crit } = this.blow(actor, target, actor.attack, true);
    this.gainCourage(actor);
    this.events.emit('strike', { attackerId: actor.id, targetId: target.id, damage, crit });
    if (!this.checkEnd()) this.wait(TAVERN_BATTLE.strikeMs);
    return true;
  }

  firm(): boolean {
    const actor = this.partyActor();
    if (!actor) return false;
    actor.firm = true;
    this.events.emit('firmed', { fighterId: actor.id });
    this.wait(TAVERN_BATTLE.firmMs);
    return true;
  }

  /** A skill from the active fighter's tree, for its Coragem. Damage skills hit `targetId` (or the first enemy
   *  standing). */
  useSkill(skillId: string, targetId?: string): boolean {
    const actor = this.partyActor();
    const skill = actor?.skills.find((node) => node.id === skillId);
    const target = targetId ? this.fighter(targetId) : this.enemies.find((enemy) => enemy.hp > 0);
    if (!actor || !skill || !target || target.hp <= 0 || actor.courage < skill.cost) return false;
    actor.courage -= skill.cost;
    const { effect } = skill;
    let damage = 0;
    let heal = 0;
    let crit = false;
    const strike = (ratio: number) => ({ damage, crit } = this.blow(actor, target, actor.attack * ratio, true));
    if (effect.type === 'damage' || effect.type === 'stun') {
      strike(effect.ratio);
      // Pushed back on the initiative meter: the target acts later.
      if (effect.type === 'stun') this.meters.set(target.id, this.meters.get(target.id)! - effect.delay);
    } else if (effect.type === 'gamble') {
      strike(effect.min + this.rng() * (effect.max - effect.min));
    } else if (effect.type === 'poison') {
      strike(effect.ratio);
      target.poison = { perRound: effect.perRound, rounds: effect.rounds };
    } else if (effect.type === 'steal') {
      strike(effect.ratio);
      this.pocket(actor, effect.fichas);
    } else if (effect.type === 'mark') {
      target.mark = { ratio: effect.ratio, hits: effect.hits };
    } else if (effect.type === 'heal') {
      heal = this.heal(actor, effect.amount);
    } else if (effect.type === 'sober') {
      heal = this.heal(actor, Math.round(actor.maxHp * effect.ratio));
      actor.tipsiness = 0;
    } else if (effect.type === 'shield') {
      actor.shield += effect.amount;
    } else if (effect.type === 'weaken') {
      target.weakened = Math.min(target.weakened, effect.ratio);
    } else if (effect.type === 'wall') {
      actor.wall = true;
      actor.wallAs = effect.as ?? 'parry';
    }
    this.events.emit('skillUsed', { fighterId: actor.id, skill, targetId: target.id, damage, heal, crit });
    if (!this.checkEnd()) this.wait(TAVERN_BATTLE.strikeMs);
    return true;
  }

  /** A reaction press, stamped with `clock.now`; it always answers the earliest unresolved hit. Returns how it was
   *  judged, or null when there was nothing to answer (or input is locked after an early press). */
  react(kind: ReactionKind): ReactionResult | null {
    if (this.phase !== 'enemy-attack') return null;
    this.expireHits();
    const now = this.clock.now;
    if (this.phase !== 'enemy-attack' || now < this.lockedUntil) return null;
    const hit = this.attack!.hits.find((candidate) => candidate.result === null);
    if (!hit) return null;
    const target = this.fighter(hit.targetId)!;
    // Muralha Viva answers this attack on its own.
    if (target.wall) return null;
    const windows = this.windowsFor(target);
    // An arrow from range can't be parried: a parry inside the dodge window is just taken.
    let result = judgeReaction(kind, hit.at, now, hit.dodgeOnly ? { ...windows, parryMs: -1 } : windows);
    // Biting on a feint: she was waiting for it.
    if (hit.feint && result === 'parry') result = 'taken';
    if (result === 'early') {
      this.lockedUntil = now + windows.earlyLockMs;
      this.tally.early += 1;
      this.lastReaction = { result, at: now };
      this.events.emit('early', { fighterId: target.id });
      return result;
    }
    this.resolveHit(hit, result);
    return result;
  }

  // ── Turn flow ──

  private partyActor(): Fighter | null {
    return this.phase === 'player-turn' && this.active?.side === 'party' ? this.active : null;
  }

  /** Phase 'resolving' for `ms`, then the next turn. */
  private wait(ms: number): void {
    this.phase = 'resolving';
    this.pending?.cancel();
    this.pending = this.clock.delayedCall(ms, () => this.nextTurn());
  }

  private nextTurn(): void {
    if (this.over) return;
    let actor = this.nextActor(this.meters);
    if (this.actedThisRound.has(actor.id)) {
      this.startRound();
      if (this.checkEnd()) return;
      // The poison may have dropped who was next.
      if (actor.hp <= 0) actor = this.nextActor(this.meters);
    }
    this.actedThisRound.add(actor.id);
    this.active = actor;
    // Firmar lasts until the fighter's own next turn.
    actor.firm = false;
    this.events.emit('turnStarted', { fighterId: actor.id, round: this.round });
    if (actor.side === 'party') {
      this.phase = 'player-turn';
      return;
    }
    this.announceAttack(actor);
  }

  /** Who fills their meter first; every meter advances by that much. Ties: the party first, then the lower slot. */
  private nextActor(meters: Map<string, number>): Fighter {
    const living = this.fighters.filter((fighter) => fighter.hp > 0)
      .sort((a, b) => (a.side === b.side ? a.slot - b.slot : a.side === 'party' ? -1 : 1));
    let next = living[0];
    let soonest = Infinity;
    living.forEach((fighter) => {
      const time = (TAVERN_BATTLE.initiativeThreshold - meters.get(fighter.id)!) / fighter.speed;
      if (time < soonest - 1e-9) {
        soonest = time;
        next = fighter;
      }
    });
    const elapsed = Math.max(0, soonest);
    living.forEach((fighter) => meters.set(fighter.id, meters.get(fighter.id)! + elapsed * fighter.speed));
    meters.set(next.id, Math.max(0, meters.get(next.id)! - TAVERN_BATTLE.initiativeThreshold));
    return next;
  }

  /** The drinking rule: everyone drinks at the start of a round, up to the cap. */
  private startRound(): void {
    this.round += 1;
    this.actedThisRound.clear();
    if (this.options.duel.rule === 'drinking') {
      this.fighters.forEach((fighter) => { fighter.tipsiness = Math.min(DRINKING_RULE.tipsinessCap, fighter.tipsiness + DRINKING_RULE.perDrink); });
    }
    this.fighters.forEach((fighter) => {
      const amount = fighter.hp > 0 && fighter.passives.roundHeal > 0 ? this.heal(fighter, fighter.passives.roundHeal) : 0;
      if (amount > 0) this.events.emit('healed', { fighterId: fighter.id, amount });
    });
    this.events.emit('roundStarted', { round: this.round });
    this.fighters.forEach((fighter) => {
      if (!fighter.poison || fighter.hp <= 0) return;
      const damage = fighter.poison.perRound;
      fighter.poison = fighter.poison.rounds > 1 ? { ...fighter.poison, rounds: fighter.poison.rounds - 1 } : null;
      this.damage(fighter, damage);
      this.events.emit('poisoned', { fighterId: fighter.id, damage });
    });
  }

  private announceAttack(attacker: Fighter): void {
    const pattern = this.pickPattern(attacker.patterns);
    const targets = this.party.filter((fighter) => fighter.hp > 0);
    const target = targets[Math.floor(this.rng() * targets.length)];
    const now = this.clock.now;
    // Grimbo's dice: the roll decides how many copies of the first hit come.
    const { dice } = pattern;
    const rolled = dice ? dice.min + Math.floor(this.rng() * (dice.max - dice.min + 1)) : 0;
    const template = dice
      ? Array.from({ length: rolled }, (_, i) => ({ ...pattern.hits[0], offsetMs: i * dice.intervalMs }))
      : pattern.hits;
    const offsets = tipsyOffsets(template.map((hit) => hit.offsetMs), this.options.duel.rule === 'drinking' ? attacker.tipsiness : 0, this.rng);
    const hits = template
      .map((hit, i) => ({ at: now + pattern.leadMs + offsets[i], damage: Math.max(1, Math.round(hit.damage * attacker.weakened)), feint: Boolean(hit.feint) }))
      .sort((a, b) => a.at - b.at)
      .map((hit, index): BattleHit => ({ index, at: hit.at, damage: hit.damage, targetId: target.id, result: null, feint: hit.feint, dodgeOnly: Boolean(pattern.dodgeOnly) }));
    // Provocar spends itself on this attack.
    attacker.weakened = 1;
    this.attack = {
      attackerId: attacker.id, pattern, announcedAt: now, hits,
      dice: dice ? { rolled, revealed: Boolean(this.options.diceRevealed) || target.passives.foresight } : null
    };
    this.lockedUntil = 0;
    this.phase = 'enemy-attack';
    this.events.emit('attackAnnounced', { attackerId: attacker.id, pattern, hits });
  }

  private pickPattern(patterns: AttackPattern[]): AttackPattern {
    const total = patterns.reduce((sum, pattern) => sum + pattern.weight, 0);
    let roll = this.rng() * total;
    for (const pattern of patterns) {
      roll -= pattern.weight;
      if (roll < 0) return pattern;
    }
    return patterns[patterns.length - 1];
  }

  /** A hit nobody answered is taken once its dodge window has passed. */
  private expireHits(): void {
    if (this.phase !== 'enemy-attack' || !this.attack) return;
    for (const hit of this.attack.hits) {
      if (this.phase !== 'enemy-attack') return;
      if (hit.result !== null) continue;
      const target = this.fighter(hit.targetId)!;
      if (target.wall && this.clock.now >= hit.at) this.resolveHit(hit, hit.feint ? 'held' : target.wallAs);
      // Nobody bit on the feint: patience pays.
      else if (this.clock.now > hit.at + this.windowsFor(target).dodgeMs) this.resolveHit(hit, hit.feint ? 'held' : 'taken');
    }
  }

  private resolveHit(hit: BattleHit, result: ReactionResult): void {
    const attack = this.attack!;
    const target = this.fighter(hit.targetId)!;
    hit.result = result;
    const damage = result === 'taken' ? this.soak(target, hit.damage) : 0;
    this.damage(target, damage);
    if (result === 'parry' || result === 'held') this.gainCourage(target);
    if (result === 'parry' && target.passives.parryLoot > 0) this.pocket(target, target.passives.parryLoot);
    this.tally[result] += 1;
    this.lastReaction = { result, at: this.clock.now };
    this.events.emit('hitResolved', { attackerId: attack.attackerId, targetId: target.id, index: hit.index, result, damage });
    if (this.checkEnd()) return;
    const attacker = this.fighter(attack.attackerId)!;
    for (const riposte of target.passives.ripostes) {
      if (riposte.on !== result || hit.feint || attacker.hp <= 0) continue;
      const base = riposte.of === 'hit' ? hit.damage : target.attack;
      const { damage: back } = this.blow(target, attacker, Math.max(1, base * riposte.ratio), false);
      this.events.emit('riposte', { defenderId: target.id, attackerId: attacker.id, damage: back, on: riposte.on });
      if (this.checkEnd()) return;
    }
    // Hits still aimed at a fallen fighter go nowhere.
    attack.hits.forEach((other) => { if (other.result === null && this.fighter(other.targetId)!.hp <= 0) other.result = 'taken'; });
    if (attack.hits.some((other) => other.result === null)) return;
    this.finishAttack(attack);
  }

  private finishAttack(attack: EnemyAttack): void {
    const attacker = this.fighter(attack.attackerId)!;
    const defender = this.fighter(attack.hits[0].targetId)!;
    defender.wall = false;
    // Every real hit parried, and no feint bitten.
    const countered = defender.hp > 0 && attacker.hp > 0 && attack.hits.some((hit) => !hit.feint)
      && attack.hits.every((hit) => (hit.feint ? hit.result === 'held' : hit.result === 'parry'));
    if (countered) {
      const { damage } = this.blow(defender, attacker, defender.attack * TAVERN_BATTLE.counterRatio, false);
      this.gainCourage(defender);
      this.events.emit('counter', { defenderId: defender.id, attackerId: attacker.id, damage });
      if (this.checkEnd()) return;
    }
    this.wait(TAVERN_BATTLE.afterAttackMs + (countered ? TAVERN_BATTLE.counterMs : 0));
  }

  /** A party blow on an enemy: a crit (if `canCrit` and the dice say so) doubles it, a mark adds its share. */
  private blow(actor: Fighter, target: Fighter, base: number, canCrit: boolean): { damage: number; crit: boolean } {
    const crit = canCrit && actor.passives.critChance > 0 && this.rng() < actor.passives.critChance;
    let amount = base * (crit ? 2 : 1);
    if (target.mark) {
      amount *= 1 + target.mark.ratio;
      target.mark = target.mark.hits > 1 ? { ...target.mark, hits: target.mark.hits - 1 } : null;
    }
    const damage = Math.max(1, Math.round(amount));
    this.damage(target, damage);
    return { damage, crit };
  }

  private pocket(fighter: Fighter, fichas: number): void {
    this.loot += fichas;
    this.events.emit('looted', { fighterId: fighter.id, fichas });
  }

  private damage(fighter: Fighter, amount: number): void {
    if (amount <= 0 || fighter.hp <= 0) return;
    fighter.hp = Math.max(0, fighter.hp - amount);
    if (fighter.hp === 0) this.events.emit('fighterDown', { fighterId: fighter.id });
  }

  /** Armor (never below 1), then the shield, take their share of a hit; returns what reaches HP. */
  private soak(fighter: Fighter, amount: number): number {
    let left = fighter.passives.armor > 0 ? Math.max(1, amount - fighter.passives.armor) : amount;
    const absorbed = Math.min(fighter.shield, left);
    fighter.shield -= absorbed;
    left -= absorbed;
    return left;
  }

  /** Heals up to max HP; returns how much it healed. */
  private heal(fighter: Fighter, amount: number): number {
    const healed = Math.max(0, Math.min(amount, fighter.maxHp - fighter.hp));
    fighter.hp += healed;
    return healed;
  }

  private gainCourage(fighter: Fighter): void {
    fighter.courage = Math.min(TAVERN_BATTLE.courageMax, fighter.courage + 1);
  }

  /** Ends the battle when a side has nobody standing; true if it ended. */
  private checkEnd(): boolean {
    const partyUp = this.party.some((fighter) => fighter.hp > 0);
    const enemiesUp = this.enemies.some((fighter) => fighter.hp > 0);
    if (partyUp && enemiesUp) return false;
    this.phase = partyUp ? 'won' : 'lost';
    this.pending?.cancel();
    this.events.emit('battleEnded', { winner: partyUp ? 'party' : 'enemy' });
    return true;
  }
}
