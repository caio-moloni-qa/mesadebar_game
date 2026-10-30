import { DUEL_HERO, DuelFighterSpec } from '../../config/tavernBattle';
import { FoeSpec, foeSpec } from '../../config/tavernRoster';
import { TOWER_TUNING, TowerFloorSpec, TowerFoeSpec, TowerSpec } from '../../config/tavernTowers';
import { BattleAlly, BattleFoe, TurnBattleOptions } from './TurnBattle';

export type ClimbEnd = 'top' | 'lost' | 'left';

/** What one floor won paid. */
export interface FloorPrize { fichas: number; masteryXp: number }

/** How much tougher a floor's foes are than their base numbers: the climb (`floor`, 0-based) and the squad's size
 *  (`allies` beside the leader) both push them up. */
export function floorScale(floor: number, allies: number): { hp: number; damage: number } {
  const T = TOWER_TUNING;
  return {
    hp: (1 + T.hpPerFloor * floor) * (1 + T.hpPerAlly * allies),
    damage: (1 + T.damagePerFloor * floor) * (1 + T.damagePerAlly * allies)
  };
}

/** The foes of a floor, scaled, with unique ids (the same regular twice gets "-2"). */
export function floorFoes(foes: TowerFoeSpec[], floor = 0, allies = 0): BattleFoe[] {
  const seen = new Map<string, number>();
  const scale = floorScale(floor, allies);
  return foes.map((foe) => {
    const duel = foeSpec(foe.duel);
    const count = (seen.get(foe.duel) ?? 0) + 1;
    seen.set(foe.duel, count);
    const damageScale = (foe.damageScale ?? 1) * scale.damage;
    return {
      id: count > 1 ? `${foe.duel}-${count}` : foe.duel,
      look: foe.duel,
      enemy: { ...duel.enemy, maxHp: Math.round(duel.enemy.maxHp * (foe.hpScale ?? 1) * scale.hp) },
      patterns: damageScale === 1 ? duel.patterns : duel.patterns.map((pattern) => ({
        ...pattern,
        hits: pattern.hits.map((hit) => ({ ...hit, damage: Math.max(1, Math.round(hit.damage * damageScale)) }))
      }))
    };
  });
}

/** The fight's rule: a lone regular keeps their duel's (Brom still drinks); a group plays straight, each with their
 *  own patterns (arrows, dice and feints live in them). */
export function floorDuel(foes: TowerFoeSpec[]): FoeSpec {
  const first = foeSpec(foes[0].duel);
  if (foes.length === 1) return first;
  return {
    ...first,
    rule: 'none',
    legend: `Em turma: cada um ataca no seu ritmo. Escolha o alvo com <kbd>Tab</kbd>.`,
    lines: { won: 'Tá bom, tá bom... vocês venceram a mesa toda.', lost: 'Contra a turma toda não dá, né?' }
  };
}

/** A climb up one tower (O Coliseu do Sergio): the floor reached, the hero's HP carried over, the pot of fichas at
 *  risk and the mastery XP already banked. Pure state; the overlay runs each floor's TurnBattle with `battleOptions`
 *  and reports back with `won` / `lost`. */
export class TowerRun {
  /** Index of the floor to play next (0-based); equals the floors cleared. */
  floor = 0;
  heroHp: number;
  readonly heroMaxHp: number;
  /** Coragem the next floor starts with (a rest's "Respirar fundo"). */
  courage = 0;
  /** Fichas won so far: paid in full when you walk away or reach the top, partly on a defeat. */
  pot = 0;
  /** Mastery XP banked for the climbing hero over this climb. */
  masteryXp = 0;
  ended: ClimbEnd | null = null;
  /** The squad beside the leader, with the HP each carries from floor to floor. */
  readonly allies: Array<{ ally: BattleAlly; hp: number }>;

  constructor(readonly tower: TowerSpec, hero: DuelFighterSpec = DUEL_HERO, allies: BattleAlly[] = []) {
    this.heroMaxHp = hero.maxHp;
    this.heroHp = hero.maxHp;
    this.allies = allies.map((ally) => ({ ally, hp: ally.spec.maxHp }));
  }

  get current(): TowerFloorSpec | null {
    return this.ended ? null : this.tower.floors[this.floor] ?? null;
  }

  /** Floors beaten (rests count once you pass them). */
  get cleared(): number { return this.floor; }

  /** The TurnBattle for the current fight floor (null on a rest or after the end). */
  battleOptions(base: Omit<TurnBattleOptions, 'duel' | 'foes' | 'heroStart' | 'allies'>): TurnBattleOptions | null {
    const floor = this.current;
    if (!floor || floor.kind !== 'fight') return null;
    return {
      ...base, duel: floorDuel(floor.foes), foes: floorFoes(floor.foes, this.floor, this.allies.length),
      heroStart: { hp: this.heroHp, courage: this.courage },
      allies: this.allies.map(({ ally, hp }) => ({ ...ally, start: { hp, courage: this.courage } }))
    };
  }

  /** The fight was won with `heroHp` left (and `allyHp` by id): the prize goes in, the climb moves up (and ends at the
   *  top). Whoever fell gets back up with 1 HP for the next floor. */
  won(heroHp: number, allyHp: Record<string, number> = {}): FloorPrize {
    const floor = this.current;
    if (!floor || floor.kind !== 'fight') return { fichas: 0, masteryXp: 0 };
    this.heroHp = Math.max(1, Math.min(this.heroMaxHp, heroHp));
    this.allies.forEach((member) => {
      const hp = allyHp[member.ally.id];
      if (hp !== undefined) member.hp = Math.max(1, Math.min(member.ally.spec.maxHp, hp));
    });
    this.courage = 0;
    this.pot += floor.fichas;
    this.masteryXp += floor.masteryXp;
    this.floor += 1;
    if (this.floor >= this.tower.floors.length) this.ended = 'top';
    return { fichas: floor.fichas, masteryXp: floor.masteryXp };
  }

  /** A defeat ends the climb; returns the fichas kept. */
  lost(): number {
    this.ended = 'lost';
    return this.payout;
  }

  /** "Sair com o prêmio": ends the climb with the whole pot. */
  leave(): number {
    if (!this.ended) this.ended = 'left';
    return this.payout;
  }

  /** At a rest floor: eat (heal) or breathe (Coragem for the next fight), then go on up. */
  rest(choice: 'heal' | 'courage'): void {
    const floor = this.current;
    if (!floor || floor.kind !== 'rest') return;
    if (choice === 'heal') {
      this.heroHp = Math.min(this.heroMaxHp, this.heroHp + Math.round(this.heroMaxHp * TOWER_TUNING.restHeal));
      this.allies.forEach((member) => { member.hp = Math.min(member.ally.spec.maxHp, member.hp + Math.round(member.ally.spec.maxHp * TOWER_TUNING.restHeal)); });
    } else this.courage = TOWER_TUNING.restCourage;
    this.floor += 1;
    if (this.floor >= this.tower.floors.length) this.ended = 'top';
  }

  /** The fichas this climb pays as it stands (the whole pot, or the share kept after a defeat). */
  get payout(): number {
    return this.ended === 'lost' ? Math.floor(this.pot * TOWER_TUNING.keepOnLoss) : this.pot;
  }
}
