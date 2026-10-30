// Taverna em Turnos: the turn-based duels in the tavern (TAVERNA_EM_TURNOS plan: Brom in phase 1, the other four
// regulars in phase 3, each duel teaching one part of the reaction).
// Every number the core's TurnBattle and judgeReaction read lives here.

/** Timing windows of a reaction, in ms either side of the moment a hit lands. */
export interface ReactionWindowsConfig {
  /** |offset| inside this with "aparar" is a parry (no damage, +Coragem, a full parried combo counters). */
  parryMs: number;
  /** |offset| inside this with "esquivar" is a dodge; a parry outside parryMs but inside this is taken. */
  dodgeMs: number;
  /** A dodge inside this is perfect: +1 Coragem (the easy answer only pays when it's sharp; a parry always pays). */
  perfectDodgeMs: number;
  /** A press outside the dodge window locks input this long (the punishment for mashing early). */
  earlyLockMs: number;
  /** "Firmar" widens the parry window by this until the fighter's next turn. */
  firmBonusMs: number;
  /** Assisted mode multiplies every window by this. */
  assistedScale: number;
}

export const REACTION_WINDOWS: ReactionWindowsConfig = {
  parryMs: 90,
  dodgeMs: 130,
  perfectDodgeMs: 60,
  earlyLockMs: 250,
  firmBonusMs: 40,
  assistedScale: 2
};

/** One hit of an enemy attack: when it lands after the attack's lead, and how hard. */
export interface AttackHit {
  offsetMs: number;
  damage: number;
  /** Zora's feint: the arm goes up and never comes down. Parrying it is punished (this damage); holding still pays. */
  feint?: boolean;
}

/** What a ranged attack throws: drawn flying from the attacker, who stays home. */
export type Projectile = 'arrow' | 'mug' | 'plate' | 'bottle' | 'barrel' | 'fish' | 'ice' | 'snowball';

export interface AttackPattern {
  id: string;
  /** Shown in the intent badge and the announcement. */
  name: string;
  /** The intent badge's kind (icon and colour). */
  intent: 'golpe' | 'combo' | 'pesado' | 'flecha' | 'dados' | 'arremesso';
  /** Time from the announcement to the first hit (the wind-up the player reads). */
  leadMs: number;
  hits: AttackHit[];
  /** Thrown or shot from home. */
  projectile?: Projectile;
  /** Lyra's arrows from range: they can only be dodged (a parry inside the dodge window is taken). */
  dodgeOnly?: boolean;
  /** How long a projectile flies before its hit lands. */
  flightMs?: number;
  /** Grimbo's dice: the combo has min..max copies of hits[0], intervalMs apart, rolled when announced. */
  dice?: { min: number; max: number; intervalMs: number };
  /** How often the seeded rng picks it, relative to the fighter's other patterns. */
  weight: number;
}

export interface DuelFighterSpec {
  name: string;
  maxHp: number;
  attack: number;
  /** Fills the initiative meter; the faster fighter acts more often. */
  speed: number;
}

export const TAVERN_BATTLE = {
  /** Coragem: +1 per parry, perfect dodge and hit landed, capped (skills spend it from phase 2). */
  courageMax: 5,
  /** The initiative meter a fighter must fill to act. */
  initiativeThreshold: 100,
  /** A seeded head start on the meter at the start, up to this. */
  initiativeJitter: 20,
  /** Turns the UI queue shows ahead. */
  queueLength: 6,
  /** The pause after the opening drink before the first turn. */
  introMs: 1400,
  /** How long a party strike plays out before the next turn. */
  strikeMs: 700,
  /** How long a skill plays out: a cast charges, then its bolt (or arrow, meteor, avalanche) still has to land. */
  skillMs: 1050,
  /** "Firmar" plays out this long. */
  firmMs: 450,
  /** After the last hit of an enemy attack resolves (and the counter, if any). */
  afterAttackMs: 650,
  /** Extra time when the attack ends in a counter (the defender's free swing). */
  counterMs: 550,
  /** A counter hits for this share of the defender's attack. */
  counterRatio: 1
} as const;

/** The duel hero: every hero is scaled to the same duel stats in phase 1 (tune after the owner plays it). */
export const DUEL_HERO: DuelFighterSpec = { name: 'Você', maxHp: 100, attack: 12, speed: 10 };

/** The drinking duel: both drink at the start of every round; Brom's rhythm grows irregular as he gets tipsy. */
export const DRINKING_RULE = {
  /** Tipsiness gained per round's drink. */
  perDrink: 1,
  tipsinessCap: 4,
  /** Each hit offset jitters by up to ± tipsiness × this (seeded). */
  jitterPerTipsinessMs: 40
} as const;

/** Grimbo's bet: fichas staked before the duel let you see every dice roll; a win pays double, a loss keeps it. */
export const DICE_RULE = {
  bets: [10, 25],
  payout: 2
} as const;

export type DuelId = 'brom' | 'lyra' | 'grimbo' | 'zora' | 'sergio';

/** A small gift for the next run, won in a duel (spent by that run, like Sergio's pack). Grimbo pays in fichas instead
 *  (the bet). */
export type TavernBoonId = 'caneca-de-ferro' | 'flecha-marcada' | 'uma-visao' | 'garrafa-da-casa';

export interface TavernBoonSpec { id: TavernBoonId; name: string; description: string }

export const DUEL_REWARDS: Partial<Record<DuelId, TavernBoonSpec>> = {
  brom: { id: 'caneca-de-ferro', name: 'Caneca de ferro', description: '+20 de vida máxima na próxima partida' },
  lyra: { id: 'flecha-marcada', name: 'Flecha marcada', description: 'O primeiro acerto da próxima partida é crítico garantido' },
  zora: { id: 'uma-visao', name: 'Uma visão', description: 'O primeiro guardião da próxima partida surge com 25% menos vida' },
  sergio: { id: 'garrafa-da-casa', name: 'Garrafa da casa', description: '+10% de dano na próxima partida (só o Sergio tem)' }
};

/** What each boon adds to the run it's spent on. Small on purpose: the tavern must never feel like a chore. */
export const BOON_TUNING = {
  canecaMaxHealth: 20,
  flechaMarcadaCrits: 1,
  /** The first guardian's health is cut by this share. */
  visionHealthCut: 0.25,
  garrafaDamage: 0.1
} as const;

export interface DuelSpec {
  id: DuelId;
  enemy: DuelFighterSpec;
  patterns: AttackPattern[];
  /** The duel's house rule ('none' plays it straight). The others live in the patterns' data: Lyra's dodge-only
   *  arrows, Grimbo's dice, Zora's feints, Sergio's thrown items. */
  rule: 'drinking' | 'range' | 'dice' | 'feints' | 'items' | 'none';
  /** The one-line rule under the stage (pt-BR). */
  legend: string;
  /** What they say at the end (pt-BR). */
  lines: { won: string; lost: string };
}

export const DUELS: Record<DuelId, DuelSpec> = {
  brom: {
    id: 'brom',
    enemy: { name: 'Brom', maxHp: 120, attack: 10, speed: 9 },
    rule: 'drinking',
    legend: 'A cada rodada os dois bebem: quanto mais o Brom bebe, mais torto fica o ritmo dele.',
    lines: { won: 'Hah! Bebe bem e apara melhor ainda. Mais uma rodada outro dia!', lost: 'Não se preocupe, ninguém aguenta o Brom na terceira caneca. Volte quando quiser.' },
    patterns: [
      // The tutorial hit.
      { id: 'caneca', name: 'Golpe de Caneca', intent: 'golpe', leadMs: 1200, hits: [{ offsetMs: 0, damage: 10 }], weight: 3 },
      // Parry all three → counter.
      { id: 'socos', name: 'Rodada de Socos', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 6 }, { offsetMs: 380, damage: 6 }, { offsetMs: 760, damage: 6 }], weight: 3 },
      // Slow wind-up that punishes early presses.
      { id: 'martelada', name: 'Martelada Pesada', intent: 'pesado', leadMs: 2000, hits: [{ offsetMs: 0, damage: 18 }], weight: 2 }
    ]
  },
  // When to dodge vs parry: from range only a dodge saves you; up close the dagger can be parried.
  lyra: {
    id: 'lyra',
    enemy: { name: 'Lyra', maxHp: 100, attack: 9, speed: 11 },
    rule: 'range',
    legend: 'Flecha de longe só dá pra esquivar. De perto, a adaga dá pra aparar.',
    lines: { won: 'Leu minhas flechas no ar... Tá bom, essa foi sua. Leva uma das marcadas.', lost: 'Aparar flecha? Corajoso. Errado, mas corajoso.' },
    patterns: [
      { id: 'flecha', name: 'Flecha Rápida', intent: 'flecha', leadMs: 1000, projectile: 'arrow', dodgeOnly: true, flightMs: 380, hits: [{ offsetMs: 0, damage: 9 }], weight: 3 },
      { id: 'saraivada', name: 'Saraivada', intent: 'flecha', leadMs: 1100, projectile: 'arrow', dodgeOnly: true, flightMs: 380, hits: [{ offsetMs: 0, damage: 4 }, { offsetMs: 240, damage: 4 }, { offsetMs: 480, damage: 4 }, { offsetMs: 720, damage: 4 }], weight: 2 },
      { id: 'adaga', name: 'Dança da Adaga', intent: 'combo', leadMs: 1100, hits: [{ offsetMs: 0, damage: 7 }, { offsetMs: 300, damage: 7 }], weight: 3 },
      { id: 'queima-roupa', name: 'Tiro à Queima-Roupa', intent: 'pesado', leadMs: 1700, hits: [{ offsetMs: 0, damage: 16 }], weight: 2 }
    ]
  },
  // Reading the intent: the dice decide how many hits a combo has; a bet shows the roll before it comes.
  grimbo: {
    id: 'grimbo',
    enemy: { name: 'Grimbo', maxHp: 110, attack: 10, speed: 10 },
    rule: 'dice',
    legend: 'Os dados decidem quantos golpes vêm no combo. Quem apostou fichas vê o dado antes.',
    lines: { won: 'Ganhou de mim no meu próprio jogo? Toma, toma suas fichas, trapaceiro.', lost: 'A casa sempre ganha, amigo. E hoje a casa sou eu.' },
    patterns: [
      { id: 'moeda', name: 'Moeda na Testa', intent: 'golpe', leadMs: 1100, hits: [{ offsetMs: 0, damage: 10 }], weight: 2 },
      { id: 'dados', name: 'Dados Rolando', intent: 'dados', leadMs: 1300, hits: [{ offsetMs: 0, damage: 5 }], dice: { min: 1, max: 6, intervalMs: 330 }, weight: 4 },
      { id: 'mesa', name: 'Mesa Virada', intent: 'pesado', leadMs: 1900, hits: [{ offsetMs: 0, damage: 17 }], weight: 2 }
    ]
  },
  // Patience: the arm goes up and doesn't come down. Parry a feint and she gets you; hold still and it pays.
  zora: {
    id: 'zora',
    enemy: { name: 'Zora', maxHp: 105, attack: 10, speed: 9 },
    rule: 'feints',
    legend: 'Zora finge: às vezes o braço sobe e não desce. Aparar uma finta dói; segurar firme dá Coragem.',
    lines: { won: 'As cartas não mentiram: paciência de pedra. Vou te mostrar uma visão.', lost: 'Você viu o golpe que não veio. Os espíritos riram.' },
    patterns: [
      { id: 'cristal', name: 'Raio de Cristal', intent: 'golpe', leadMs: 1200, hits: [{ offsetMs: 0, damage: 10 }], weight: 2 },
      { id: 'sombras', name: 'Dança das Sombras', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 8, feint: true }, { offsetMs: 520, damage: 7 }, { offsetMs: 880, damage: 7 }], weight: 3 },
      { id: 'olhar', name: 'Olhar Maldito', intent: 'combo', leadMs: 1200, hits: [{ offsetMs: 0, damage: 7 }, { offsetMs: 450, damage: 8, feint: true }, { offsetMs: 900, damage: 7 }], weight: 2 },
      { id: 'corvo', name: 'Finta do Corvo', intent: 'pesado', leadMs: 1600, hits: [{ offsetMs: 0, damage: 10, feint: true }, { offsetMs: 750, damage: 16 }], weight: 2 }
    ]
  },
  // Mixed rhythms: everything in his shop flies, each on its own beat.
  sergio: {
    id: 'sergio',
    enemy: { name: 'Sergio', maxHp: 130, attack: 11, speed: 8 },
    rule: 'items',
    legend: 'Sergio arremessa o estoque: cada coisa voa num ritmo diferente.',
    lines: { won: 'Quebrou metade da minha loja e ainda ganhou. Leva uma da casa, vai.', lost: 'Volta quando tiver fichas pra pagar os pratos, freguês.' },
    patterns: [
      { id: 'caneca', name: 'Caneca Arremessada', intent: 'arremesso', leadMs: 1000, projectile: 'mug', flightMs: 500, hits: [{ offsetMs: 0, damage: 10 }], weight: 3 },
      { id: 'pratos', name: 'Chuva de Pratos', intent: 'arremesso', leadMs: 1100, projectile: 'plate', flightMs: 450, hits: [{ offsetMs: 0, damage: 5 }, { offsetMs: 300, damage: 5 }, { offsetMs: 500, damage: 5 }, { offsetMs: 900, damage: 5 }], weight: 3 },
      { id: 'garrafas', name: 'Garrafas de Rolha', intent: 'arremesso', leadMs: 1000, projectile: 'bottle', flightMs: 350, hits: [{ offsetMs: 0, damage: 4 }, { offsetMs: 190, damage: 4 }, { offsetMs: 380, damage: 4 }], weight: 2 },
      { id: 'barril', name: 'Barril Rolando', intent: 'pesado', leadMs: 1200, projectile: 'barrel', flightMs: 1400, hits: [{ offsetMs: 0, damage: 18 }], weight: 2 }
    ]
  }
};
