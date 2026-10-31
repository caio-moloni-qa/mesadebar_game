// O Coliseu do Sergio: the towers of Venivium (Pirate Yakuza's Madlantis coliseum, the owner's reference). One tower
// per region: you climb floor by floor in the tavern's turn-based fights, HP carries over, the pot grows, and you can
// walk away with it before every floor. Sergio is the secretary: the towers open from his counter.
// Every number the core's TowerRun reads lives here.

import { DuelId } from './tavernBattle';
import { FoeId, RosterId } from './tavernRoster';

export type TowerId = 'taverna' | 'greenfield' | 'snowfield';

/** One enemy on a floor: a regular (by duel id) or a region foe, scaled for the floor. */
export interface TowerFoeSpec {
  duel: FoeId;
  /** Multiplies the regular's duel health (groups are lighter, champions heavier). */
  hpScale?: number;
  /** Multiplies the damage of every hit. */
  damageScale?: number;
}

export type TowerFloorSpec =
  | {
    kind: 'fight';
    /** Shown on the ladder and the floor's intro (pt-BR). */
    name: string;
    foes: TowerFoeSpec[];
    /** Fichas added to the pot when it's won (lost if the climb ends in a defeat, see TOWER_TUNING.keepOnLoss). */
    fichas: number;
    /** Mastery XP for the hero climbing, paid at once (never at risk). */
    masteryXp: number;
    /** The tower's top floor. */
    champion?: boolean;
  }
  | {
    kind: 'rest';
    name: string;
  };

export interface TowerSpec {
  id: TowerId;
  name: string;
  /** The region it belongs to (pt-BR, the picker). */
  region: string;
  blurb: string;
  floors: TowerFloorSpec[];
  /** Announced but not climbable yet. */
  comingSoon?: boolean;
  /** The region's room painted behind the fight (BattleStage2D's backdrops). */
  stage: 'tavern' | 'igloo';
  /** The region's people, first in the squad picker (anyone in the player's roster can still join). */
  roster: RosterId[];
}

export const TOWER_TUNING = {
  /** Share of the pot kept when the climb ends in a defeat (rounded down). */
  keepOnLoss: 0.35,
  /** Rest floor, "Comer algo": heals this share of max HP. */
  restHeal: 0.5,
  /** Rest floor, "Respirar fundo": the next floor starts with this much Coragem. */
  restCourage: 3,
  /** Every floor up makes its foes this much tougher (× (1 + n·share) on HP and on hit damage, n = floor index), so
   *  the climb keeps getting harder even past the hand-made numbers. */
  hpPerFloor: 0.06,
  damagePerFloor: 0.04,
  /** Each ally in the squad adds this share of HP to every foe (three fighters must not trivialise a floor). */
  hpPerAlly: 0.55,
  /** ...and this share to every hit (more targets spread the damage thinner). */
  damagePerAlly: 0.18
} as const;

export const TOWERS: Record<TowerId, TowerSpec> = {
  taverna: {
    id: 'taverna',
    name: 'Torre da Taverna',
    region: 'Taverna',
    blurb: 'Os frequentadores, um por um, depois em turma. No topo, o dono da casa.',
    stage: 'tavern',
    roster: ['barbarian', 'mage', 'reliquia', 'fabri', 'brom', 'lyra', 'grimbo', 'zora', 'sergio'],
    floors: [
      { kind: 'fight', name: 'Brom, o aquecimento', foes: [{ duel: 'brom' }], fichas: 6, masteryXp: 60 },
      { kind: 'fight', name: 'Lyra de longe', foes: [{ duel: 'lyra' }], fichas: 8, masteryXp: 70 },
      { kind: 'fight', name: 'A mesa do Grimbo', foes: [{ duel: 'grimbo' }], fichas: 10, masteryXp: 80 },
      { kind: 'rest', name: 'Balcão' },
      { kind: 'fight', name: 'As fintas da Zora', foes: [{ duel: 'zora' }], fichas: 12, masteryXp: 90 },
      { kind: 'fight', name: 'Mesa dos fundos', foes: [{ duel: 'brom', hpScale: 0.7 }, { duel: 'grimbo', hpScale: 0.7 }], fichas: 15, masteryXp: 110 },
      { kind: 'fight', name: 'Flecha e feitiço', foes: [{ duel: 'lyra', hpScale: 0.5 }, { duel: 'zora', hpScale: 0.5 }], fichas: 18, masteryXp: 120 },
      { kind: 'rest', name: 'Balcão' },
      { kind: 'fight', name: 'A turma toda', foes: [{ duel: 'brom', hpScale: 0.55 }, { duel: 'lyra', hpScale: 0.55 }, { duel: 'grimbo', hpScale: 0.55 }], fichas: 22, masteryXp: 140 },
      { kind: 'fight', name: 'O dono da casa', foes: [{ duel: 'sergio', hpScale: 1.3, damageScale: 1.15 }], fichas: 40, masteryXp: 200, champion: true }
    ]
  },
  greenfield: {
    id: 'greenfield',
    name: 'Torre do Campo Verde',
    region: 'Campo Verde',
    blurb: 'Os bichos e os guardiões do Campo Verde, sozinhos ou com os frequentadores.',
    stage: 'tavern',
    roster: [],
    floors: [],
    comingSoon: true
  },
  snowfield: {
    id: 'snowfield',
    name: 'Torre do Iglu',
    region: 'Campo Nevado',
    blurb: 'Os guardiões do Nevado e a horda do gelo. No topo, o Rei do Inverno. O pessoal do iglu luta com você.',
    stage: 'igloo',
    roster: ['eskimo', 'frostKnight', 'iceSerpent', 'bellringer', 'ancientYeti'],
    floors: [
      { kind: 'fight', name: 'Ossos na neve', foes: [{ duel: 'frostSkeleton' }, { duel: 'frostSkeleton' }], fichas: 8, masteryXp: 70 },
      { kind: 'fight', name: 'O Cavaleiro Congelado', foes: [{ duel: 'frostKnight' }], fichas: 10, masteryXp: 80 },
      { kind: 'fight', name: 'Sopro da nevasca', foes: [{ duel: 'frostSpirit' }, { duel: 'frostSkeleton' }, { duel: 'frostSpirit' }], fichas: 12, masteryXp: 90 },
      { kind: 'rest', name: 'Fogueira' },
      { kind: 'fight', name: 'A Serpente do Gelo', foes: [{ duel: 'iceSerpent' }, { duel: 'frostSpirit', hpScale: 0.8 }], fichas: 14, masteryXp: 100 },
      { kind: 'fight', name: 'O Sineiro', foes: [{ duel: 'bellringer' }, { duel: 'frostSkeleton', hpScale: 0.8 }], fichas: 16, masteryXp: 110 },
      { kind: 'fight', name: 'O Yeti Ancião', foes: [{ duel: 'ancientYeti', hpScale: 1.15 }], fichas: 20, masteryXp: 130 },
      { kind: 'rest', name: 'Fogueira' },
      { kind: 'fight', name: 'Guardiões juntos', foes: [{ duel: 'frostKnight', hpScale: 0.7 }, { duel: 'iceSerpent', hpScale: 0.7 }, { duel: 'bellringer', hpScale: 0.7 }], fichas: 26, masteryXp: 150 },
      { kind: 'fight', name: 'O Rei do Inverno', foes: [{ duel: 'winterKing', hpScale: 1.2, damageScale: 1.1 }, { duel: 'frostSkeleton', hpScale: 0.6 }], fichas: 45, masteryXp: 220, champion: true }
    ]
  }
};

export const TOWER_ORDER: TowerId[] = ['taverna', 'greenfield', 'snowfield'];

/** Heroes that also need a tower floor beaten to join (on top of their missions and mastery): beating the regular in
 *  their own floor of the tower; Sergio, the whole tower. Floors are 1-based. */
export const TOWER_UNLOCKS: Partial<Record<DuelId, { tower: TowerId; floor: number }>> = {
  brom: { tower: 'taverna', floor: 1 },
  lyra: { tower: 'taverna', floor: 2 },
  grimbo: { tower: 'taverna', floor: 3 },
  zora: { tower: 'taverna', floor: 5 },
  sergio: { tower: 'taverna', floor: 10 }
};
