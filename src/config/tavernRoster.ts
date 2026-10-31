// Taverna em Turnos: everyone who can fight on the player's side (the squad) and the region foes the towers add.
// Every fighter has a signature kit of four skills (two actives, a passive and a finisher) that's always theirs, on
// top of what a regular's tree teaches the leader. The regulars' kits are picked from their own trees.

import { AttackPattern, DUELS, DuelFighterSpec, DuelId, DuelSpec } from './tavernBattle';
import { SKILL_TREES, SkillNode } from './tavernSkills';

/** The region fighters who join the squad in the igloo (they're also the Nevado tower's foes). */
export type SnowFighterId = 'eskimo' | 'frostKnight' | 'iceSerpent' | 'bellringer' | 'ancientYeti';
/** Foes only: the Nevado's champion and its horde. */
export type SnowFoeOnlyId = 'winterKing' | 'frostSkeleton' | 'frostSpirit';
export type SnowFoeId = SnowFighterId | SnowFoeOnlyId;
/** Anyone a tower floor can put in front of the player. */
export type FoeId = DuelId | SnowFoeId;
/** Anyone who can stand on the player's side: the 3D game's heroes plus the igloo's people. */
export type RosterId = 'barbarian' | 'mage' | 'reliquia' | 'fabri' | DuelId | SnowFighterId;

/** A fight's rule and lines, for any foe (the regulars' duels are the tavern's; the region foes have their own). */
export interface FoeSpec extends Omit<DuelSpec, 'id'> { id: string }

export interface RosterFighter {
  id: RosterId;
  name: string;
  /** Where they belong: the tower whose squad picker lists them first. */
  region: 'taverna' | 'snowfield';
  /** Their duel stats on the player's side. */
  stats: DuelFighterSpec;
  /** Always theirs: two actives, a passive and a finisher. */
  kit: SkillNode[];
  /** The HUD chip and the placeholder blocks. */
  color: number;
}

const node = (id: string, name: string, description: string, kind: SkillNode['kind'], cost: number, effect: SkillNode['effect']): SkillNode =>
  ({ id, name, description, kind, cost, effect });

/** A regular's signature kit: these nodes of their own tree. */
function fromTree(regular: DuelId, ids: string[]): SkillNode[] {
  const nodes = SKILL_TREES[regular].branches.flatMap((branch) => branch.nodes);
  return ids.map((id) => nodes.find((candidate) => candidate.id === id)!);
}

export const ROSTER: Record<RosterId, RosterFighter> = {
  barbarian: {
    id: 'barbarian', name: 'Bárbaro', region: 'taverna', color: 0x8a3324,
    stats: { name: 'Bárbaro', maxHp: 115, attack: 13, speed: 9 },
    kit: [
      node('investida', 'Investida', 'Corre com o espadão: 1,7× o ataque.', 'active', 2, { type: 'damage', ratio: 1.7 }),
      node('grito-de-guerra', 'Grito de Guerra', 'Chama a briga pra si: os inimigos atacam só ele até a próxima vez dele, e o próximo golpe bate pela metade.', 'active', 1, { type: 'taunt', weaken: 0.5 }),
      node('pele-de-urso', 'Pele de Urso', 'Todo golpe levado tira 2 a menos (nunca menos que 1).', 'passive', 0, { type: 'armor', amount: 2 }),
      node('furia', 'Fúria', 'Finalizador. Gira o espadão em todo mundo: 2× o ataque em cada inimigo.', 'finisher', 5, { type: 'damageAll', ratio: 2 })
    ]
  },
  mage: {
    id: 'mage', name: 'Mago', region: 'taverna', color: 0x2c4f8c,
    stats: { name: 'Mago', maxHp: 105, attack: 13, speed: 11 },
    kit: [
      node('raio-arcano', 'Raio Arcano', 'Um raio do cajado: 1,5× o ataque.', 'active', 1, { type: 'damage', ratio: 1.5 }),
      node('barreira-arcana', 'Barreira Arcana', 'Um escudo de 12 em todo o grupo.', 'active', 2, { type: 'shieldAll', amount: 12 }),
      node('concentracao', 'Concentração', 'Golpes e habilidades de dano têm 15% de chance de crítico.', 'passive', 0, { type: 'crit', chance: 0.15 }),
      node('chuva-de-meteoros', 'Chuva de Meteoros', 'Finalizador. 2,2× o ataque em cada inimigo.', 'finisher', 5, { type: 'damageAll', ratio: 2.2 })
    ]
  },
  reliquia: {
    id: 'reliquia', name: 'Relíquia', region: 'taverna', color: 0xa8541a,
    stats: { name: 'Relíquia', maxHp: 115, attack: 11, speed: 10 },
    kit: [
      node('brilho-da-reliquia', 'Brilho da Relíquia', 'A aura dourada cura 10 de vida em todo o grupo.', 'active', 2, { type: 'healAll', amount: 10 }),
      node('olho-do-cacador', 'Olho do Caçador', 'Marca o alvo: os próximos 3 golpes do grupo nele batem 50% mais forte.', 'active', 1, { type: 'mark', ratio: 0.5, hits: 3 }),
      node('faro-de-tesouro', 'Faro de Tesouro', 'Todo aparo perfeito afana 1 ficha.', 'passive', 0, { type: 'parryLoot', fichas: 1 }),
      node('tesouro-antigo', 'Tesouro Antigo', 'Finalizador. 2,5× o ataque e acha 10 fichas.', 'finisher', 5, { type: 'steal', ratio: 2.5, fichas: 10 })
    ]
  },
  fabri: {
    id: 'fabri', name: 'Fabri', region: 'taverna', color: 0x9c7a1e,
    stats: { name: 'Fabri', maxHp: 95, attack: 12, speed: 12 },
    kit: [
      node('bumerangue-runico', 'Bumerangue Rúnico', 'Vai e volta por todo mundo: 0,8× o ataque em cada inimigo.', 'active', 2, { type: 'damageAll', ratio: 0.8 }),
      node('banana', 'Banana!', 'Uma banana do cinto: cura 15 de vida.', 'active', 1, { type: 'heal', amount: 15 }),
      node('ginga-simia', 'Ginga Símia', 'A janela de esquiva cresce 30 ms.', 'passive', 0, { type: 'dodgeBonus', ms: 30 }),
      node('furia-simia', 'Fúria Símia', 'Finalizador. Bate no peito e desce tudo: 4× o ataque.', 'finisher', 5, { type: 'damage', ratio: 4 })
    ]
  },
  brom: {
    id: 'brom', name: 'Brom', region: 'taverna', color: 0xc0502a, stats: { ...DUELS.brom.enemy },
    kit: fromTree('brom', ['barril', 'gole-rapido', 'contragolpe', 'golpe-da-forja'])
  },
  lyra: {
    id: 'lyra', name: 'Lyra', region: 'taverna', color: 0x3f7a4a, stats: { ...DUELS.lyra.enemy, maxHp: 115, attack: 11 },
    kit: fromTree('lyra', ['tiro-certeiro', 'flecha-envenenada', 'mira', 'flecha-fantasma'])
  },
  grimbo: {
    id: 'grimbo', name: 'Grimbo', region: 'taverna', color: 0x7fb04a, stats: { ...DUELS.grimbo.enemy, maxHp: 125, attack: 12 },
    kit: fromTree('grimbo', ['rolar-os-dados', 'batedor-de-carteira', 'dado-chumbado', 'seis-duplo'])
  },
  zora: {
    id: 'zora', name: 'Zora', region: 'taverna', color: 0x7a3a9a, stats: { ...DUELS.zora.enemy, maxHp: 135, attack: 14 },
    kit: fromTree('zora', ['escudo-de-cristal', 'mau-olhado', 'pressentimento', 'eclipse'])
  },
  sergio: {
    id: 'sergio', name: 'Sergio', region: 'taverna', color: 0x5a3a6b, stats: { ...DUELS.sergio.enemy },
    kit: [
      ...fromTree('sergio', ['garrafada']),
      node('rodada-da-casa', 'Rodada da Casa', 'Por conta da casa: cura 10 de vida em todo o grupo.', 'active', 2, { type: 'healAll', amount: 10 }),
      ...fromTree('sergio', ['devolucao', 'barril-rolante'])
    ]
  },
  eskimo: {
    id: 'eskimo', name: 'Esquimó', region: 'snowfield', color: 0xb8632e,
    stats: { name: 'Esquimó', maxHp: 100, attack: 10, speed: 10 },
    kit: [
      node('peixe-congelado', 'Peixe Congelado', 'Um peixe duro de gelo: 0,8× o ataque e o alvo demora mais pra agir.', 'active', 1, { type: 'stun', ratio: 0.8, delay: 50 }),
      node('sopa-quentinha', 'Sopa Quentinha', 'Uma concha pra cada um: cura 12 de vida em todo o grupo.', 'active', 2, { type: 'healAll', amount: 12 }),
      node('agasalho', 'Agasalho', 'Todo golpe levado tira 2 a menos (nunca menos que 1).', 'passive', 0, { type: 'armor', amount: 2 }),
      node('banquete-da-tundra', 'Banquete da Tundra', 'Finalizador. O panelão inteiro: cura 30 de vida em todo o grupo.', 'finisher', 5, { type: 'healAll', amount: 30 })
    ]
  },
  frostKnight: {
    id: 'frostKnight', name: 'Cavaleiro Congelado', region: 'snowfield', color: 0x6fa8d8,
    stats: { name: 'Cavaleiro Congelado', maxHp: 120, attack: 12, speed: 8 },
    kit: [
      node('corte-gelido', 'Corte Gélido', 'A espada de gelo: 1,7× o ataque.', 'active', 2, { type: 'damage', ratio: 1.7 }),
      node('guarda-de-gelo', 'Guarda de Gelo', 'Ergue a guarda: os inimigos atacam só ele até a próxima vez dele, com um escudo de 10.', 'active', 1, { type: 'taunt', shield: 10 }),
      node('postura-firme', 'Postura Firme', 'A janela de aparo cresce 20 ms.', 'passive', 0, { type: 'parryBonus', ms: 20 }),
      node('muralha-congelada', 'Muralha Congelada', 'Finalizador. O próximo ataque nele é aparado sozinho, e ele contra-ataca.', 'finisher', 5, { type: 'wall' })
    ]
  },
  iceSerpent: {
    id: 'iceSerpent', name: 'Serpente do Gelo', region: 'snowfield', color: 0x5fc8d8,
    stats: { name: 'Serpente do Gelo', maxHp: 95, attack: 12, speed: 12 },
    kit: [
      node('cuspe-gelido', 'Cuspe Gélido', 'Metade do ataque e queimadura de frio: 4 de dano no começo das próximas 3 rodadas.', 'active', 1, { type: 'poison', ratio: 0.5, perRound: 4, rounds: 3 }),
      node('bote', 'Bote', 'O ataque inteiro e o alvo demora mais pra agir.', 'active', 2, { type: 'stun', ratio: 1, delay: 60 }),
      node('escamas-lisas', 'Escamas Lisas', 'A janela de esquiva cresce 40 ms.', 'passive', 0, { type: 'dodgeBonus', ms: 40 }),
      node('nevasca', 'Nevasca', 'Finalizador. Cospe uma nevasca: 2× o ataque em cada inimigo.', 'finisher', 5, { type: 'damageAll', ratio: 2 })
    ]
  },
  bellringer: {
    id: 'bellringer', name: 'Sineiro', region: 'snowfield', color: 0x9a8a5a,
    stats: { name: 'Sineiro', maxHp: 105, attack: 10, speed: 10 },
    kit: [
      node('badalada', 'Badalada', 'O som pega todo mundo: 0,7× o ataque em cada inimigo.', 'active', 2, { type: 'damageAll', ratio: 0.7 }),
      node('toque-sereno', 'Toque Sereno', 'Um toque baixinho: o próximo ataque do alvo bate pela metade.', 'active', 1, { type: 'weaken', ratio: 0.5 }),
      node('ouvido-de-sino', 'Ouvido de Sino', 'As fintas aparecem roxas na trilha de tempo, e os dados mostram o número antes.', 'passive', 0, { type: 'foresight' }),
      node('dobre-final', 'Dobre Final', 'Finalizador. 2× o ataque e o alvo perde a vez por um bom tempo.', 'finisher', 5, { type: 'stun', ratio: 2, delay: 110 })
    ]
  },
  ancientYeti: {
    id: 'ancientYeti', name: 'Yeti Ancião', region: 'snowfield', color: 0xd8dde6,
    stats: { name: 'Yeti Ancião', maxHp: 135, attack: 14, speed: 7 },
    kit: [
      node('pancada', 'Pancada', 'Os dois punhos: 1,8× o ataque.', 'active', 2, { type: 'damage', ratio: 1.8 }),
      node('rugido', 'Rugido', 'Um rugido que chama a briga: os inimigos atacam só ele até a próxima vez dele.', 'active', 1, { type: 'taunt' }),
      node('pelagem-grossa', 'Pelagem Grossa', 'Todo golpe levado tira 3 a menos (nunca menos que 1).', 'passive', 0, { type: 'armor', amount: 3 }),
      node('avalanche', 'Avalanche', 'Finalizador. Soca o chão e a neve desce: 2,5× o ataque em cada inimigo.', 'finisher', 5, { type: 'damageAll', ratio: 2.5 })
    ]
  }
};

export const ROSTER_ORDER: RosterId[] = ['barbarian', 'mage', 'reliquia', 'fabri', 'brom', 'lyra', 'grimbo', 'zora', 'sergio', 'eskimo', 'frostKnight', 'iceSerpent', 'bellringer', 'ancientYeti'];

export const SQUAD_TUNING = {
  /** The leader plus up to this many allies. */
  maxAllies: 2
} as const;

const snow = (id: SnowFoeId, enemy: DuelFighterSpec, rule: FoeSpec['rule'], legend: string, patterns: AttackPattern[]): FoeSpec => ({
  id, enemy, rule, legend, patterns,
  lines: { won: 'O gelo racha, mas aguenta... por hoje.', lost: 'A tundra não perdoa quem treme.' }
});

/** The Nevado's foes: its four guardians, the Esquimó (sparring, he's a cook), the Rei do Inverno at the top and the
 *  horde that fills the floors. Each teaches one part of the reaction, like the regulars. */
export const SNOW_FOES: Record<SnowFoeId, FoeSpec> = {
  eskimo: snow('eskimo', { name: 'Esquimó', maxHp: 100, attack: 10, speed: 10 }, 'items', 'O Esquimó arremessa a cozinha: peixe, concha e a panela.', [
    { id: 'peixe', name: 'Peixe Congelado', intent: 'arremesso', leadMs: 1000, projectile: 'fish', flightMs: 450, hits: [{ offsetMs: 0, damage: 9 }], weight: 3 },
    { id: 'concha', name: 'Conchada', intent: 'combo', leadMs: 1100, hits: [{ offsetMs: 0, damage: 6 }, { offsetMs: 340, damage: 6 }], weight: 3 },
    { id: 'panela', name: 'Panelada', intent: 'pesado', leadMs: 1800, hits: [{ offsetMs: 0, damage: 16 }], weight: 2 }
  ]),
  frostKnight: snow('frostKnight', { name: 'Cavaleiro Congelado', maxHp: 125, attack: 12, speed: 8 }, 'none', 'O Cavaleiro bate pesado e devagar: espere o golpe e apare.', [
    { id: 'corte', name: 'Corte Gélido', intent: 'golpe', leadMs: 1200, hits: [{ offsetMs: 0, damage: 12 }], weight: 3 },
    { id: 'estocadas', name: 'Estocadas', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 7 }, { offsetMs: 420, damage: 7 }, { offsetMs: 840, damage: 7 }], weight: 3 },
    { id: 'lamina', name: 'Lâmina do Inverno', intent: 'pesado', leadMs: 2100, hits: [{ offsetMs: 0, damage: 20 }], weight: 2 }
  ]),
  iceSerpent: snow('iceSerpent', { name: 'Serpente do Gelo', maxHp: 100, attack: 11, speed: 12 }, 'range', 'O cuspe de gelo vem de longe: só dá pra esquivar. O bote dá pra aparar.', [
    { id: 'cuspe', name: 'Cuspe de Gelo', intent: 'flecha', leadMs: 1000, projectile: 'ice', dodgeOnly: true, flightMs: 420, hits: [{ offsetMs: 0, damage: 9 }], weight: 3 },
    { id: 'rajada', name: 'Rajada Gélida', intent: 'flecha', leadMs: 1100, projectile: 'ice', dodgeOnly: true, flightMs: 420, hits: [{ offsetMs: 0, damage: 4 }, { offsetMs: 260, damage: 4 }, { offsetMs: 520, damage: 4 }], weight: 2 },
    { id: 'bote', name: 'Bote', intent: 'combo', leadMs: 1000, hits: [{ offsetMs: 0, damage: 8 }, { offsetMs: 280, damage: 8 }], weight: 3 }
  ]),
  bellringer: snow('bellringer', { name: 'Sineiro', maxHp: 110, attack: 10, speed: 9 }, 'feints', 'O Sineiro finge a badalada: às vezes o sino sobe e não desce. Segure firme.', [
    { id: 'badalada', name: 'Badalada', intent: 'golpe', leadMs: 1200, hits: [{ offsetMs: 0, damage: 11 }], weight: 2 },
    { id: 'dobre', name: 'Dobre Falso', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 8, feint: true }, { offsetMs: 500, damage: 8 }, { offsetMs: 900, damage: 8 }], weight: 3 },
    { id: 'sino-grande', name: 'Sino Grande', intent: 'pesado', leadMs: 1700, hits: [{ offsetMs: 0, damage: 10, feint: true }, { offsetMs: 800, damage: 18 }], weight: 2 }
  ]),
  ancientYeti: snow('ancientYeti', { name: 'Yeti Ancião', maxHp: 150, attack: 14, speed: 7 }, 'none', 'O Yeti é lento e esmaga: o pesado vem demorado, não aperte cedo.', [
    { id: 'tapa', name: 'Tapão', intent: 'golpe', leadMs: 1100, hits: [{ offsetMs: 0, damage: 13 }], weight: 3 },
    { id: 'socos', name: 'Socos de Avalanche', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 8 }, { offsetMs: 450, damage: 8 }, { offsetMs: 700, damage: 8 }, { offsetMs: 1150, damage: 8 }], weight: 3 },
    { id: 'terremoto', name: 'Pancada no Chão', intent: 'pesado', leadMs: 2300, hits: [{ offsetMs: 0, damage: 24 }], weight: 2 }
  ]),
  winterKing: snow('winterKing', { name: 'Rei do Inverno', maxHp: 170, attack: 14, speed: 9 }, 'feints', 'O Rei mistura tudo: gelo de longe, fintas e o cetro pesado.', [
    { id: 'raio', name: 'Raio do Cetro', intent: 'flecha', leadMs: 1000, projectile: 'ice', dodgeOnly: true, flightMs: 380, hits: [{ offsetMs: 0, damage: 11 }], weight: 2 },
    { id: 'coroa', name: 'Dança da Coroa', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 8 }, { offsetMs: 420, damage: 9, feint: true }, { offsetMs: 800, damage: 8 }, { offsetMs: 1100, damage: 8 }], weight: 3 },
    { id: 'nevasca', name: 'Nevasca Real', intent: 'pesado', leadMs: 2000, hits: [{ offsetMs: 0, damage: 12, feint: true }, { offsetMs: 900, damage: 22 }], weight: 2 },
    { id: 'granizo', name: 'Granizo', intent: 'arremesso', leadMs: 1000, projectile: 'snowball', flightMs: 400, hits: [{ offsetMs: 0, damage: 5 }, { offsetMs: 220, damage: 5 }, { offsetMs: 440, damage: 5 }, { offsetMs: 800, damage: 5 }], weight: 2 }
  ]),
  frostSkeleton: snow('frostSkeleton', { name: 'Esqueleto Gélido', maxHp: 60, attack: 8, speed: 10 }, 'none', 'Esqueletos de gelo: fracos, mas vêm em bando.', [
    { id: 'osso', name: 'Ossada', intent: 'golpe', leadMs: 1000, hits: [{ offsetMs: 0, damage: 8 }], weight: 3 },
    { id: 'chacoalhar', name: 'Chacoalhada', intent: 'combo', leadMs: 1000, hits: [{ offsetMs: 0, damage: 5 }, { offsetMs: 320, damage: 5 }], weight: 2 }
  ]),
  frostSpirit: snow('frostSpirit', { name: 'Espírito Gélido', maxHp: 55, attack: 8, speed: 12 }, 'range', 'Espíritos atiram gelo de longe: só esquivando.', [
    { id: 'sopro', name: 'Sopro Gelado', intent: 'flecha', leadMs: 950, projectile: 'ice', dodgeOnly: true, flightMs: 400, hits: [{ offsetMs: 0, damage: 7 }], weight: 3 },
    { id: 'toque', name: 'Toque Frio', intent: 'golpe', leadMs: 1000, hits: [{ offsetMs: 0, damage: 7 }], weight: 2 }
  ])
};

/** Any foe's fight spec: a regular's duel or a region foe. */
export function foeSpec(id: FoeId): FoeSpec {
  return (DUELS as Record<string, DuelSpec>)[id] ?? SNOW_FOES[id as SnowFoeId];
}

export function isRosterId(id: string): id is RosterId {
  return id in ROSTER;
}
