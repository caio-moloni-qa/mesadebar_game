export type CharacterId = 'barbarian' | 'mage' | 'reliquia' | 'fabri' | 'brom' | 'lyra' | 'grimbo' | 'zora' | 'sergio';
export type PreferredWeaponId = 'staff' | 'sword' | 'boomerang' | 'amulet' | 'hammer' | 'bow' | 'coins' | 'crystal' | 'pack';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  texture: string;
  description: string;
  maxHealth: number;
  movementSpeed: number;
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  pickupRange: number;
  armor: number;
  advantages: string[];
  preferredWeaponId?: PreferredWeaponId;
  startingWeaponUpgradeChoices?: number;
  passiveHealAmount?: number;
  passiveHealIntervalMs?: number;
  /** Scales with missing HP (0 at full, this value at 0 HP) — applied to both attack speed and movement speed, see Player.effectiveAttackSpeedMultiplier/effectiveMovementSpeed. */
  lowHealthAttackSpeedBonus?: number;
  /** "Transforma quaisquer amuletos em relíquias": replaces the Relíquia Divina's own base stats for this character, regardless of when the amulet was acquired (starting weapon or a mid-run extra-weapon offer). */
  auraWeaponOverrides?: { baseDamage: number; cooldown: number; range: number };
  /** Fabri's exclusive: once the Bumerangue Rúnico reaches `upgradeThreshold` upgrades (+ ranged affinity, same
   *  guardrail every other weapon exclusive uses), it permanently transforms into bananas — same projectile family,
   *  new visuals, and every hit stacks `slowPercentPerHit` of cumulative slow onto the enemy struck (see
   *  GameScene.applyBananaSlow / Enemy.addSlowStack). */
  boomerangBananaTransform?: { upgradeThreshold: number; slowPercentPerHit: number; slipChancePerHit: number };
  /** Relíquia's exclusive: every hit that lands (any weapon) adds `perHit` points of shield, which soaks damage
   *  before health, up to `maxHealthFraction` of max health on top of it. */
  hitShield?: { perHit: number; maxHealthFraction: number };
  /** The tavern regulars (and Sergio): their always-on passive and the exclusive that switches on at
   *  `exclusiveThreshold` upgrades with affinity (see HeroAbilitySystem). */
  kit?: { exclusiveThreshold: number };
  /** Model scale in the 3D views (the dwarf and the goblin stand shorter). */
  modelScale?: number;
  /** This character's signature color — drives the detail panel's background gradient (see
   *  MenuScene.renderCharacterCard) so each character's info column reads as "theirs" at a glance. */
  accentColor: number;
}

export const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  barbarian: {
    id: 'barbarian',
    name: 'Bárbaro',
    texture: 'barbarian',
    description: 'Guerreiro resistente que transforma dor em ritmo de combate.',
    maxHealth: 300,
    movementSpeed: 165,
    damageMultiplier: 1.3,
    attackSpeedMultiplier: 0.9,
    pickupRange: 90,
    armor: 2,
    advantages: [
      'Espada: 3 melhorias iniciais',
      '+30% de dano com armas brancas',
      'Pouca vida: até +40% velocidade de ataque e movimento'
    ],
    preferredWeaponId: 'sword',
    startingWeaponUpgradeChoices: 3,
    lowHealthAttackSpeedBonus: 0.4,
    accentColor: 0x8a3324
  },
  mage: {
    id: 'mage',
    name: 'Mago',
    texture: 'mage',
    description: 'Conjurador veloz que sustenta a run com magia e recuperação.',
    maxHealth: 150,
    movementSpeed: 241,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1.15,
    pickupRange: 110,
    armor: 0,
    advantages: [
      'Cajado: 3 melhorias iniciais',
      '+30% de velocidade de movimento',
      'Cura 3 HP por segundo'
    ],
    preferredWeaponId: 'staff',
    startingWeaponUpgradeChoices: 3,
    passiveHealAmount: 3,
    passiveHealIntervalMs: 1000,
    accentColor: 0x2c4f8c
  },
  reliquia: {
    id: 'reliquia',
    name: 'Relíquia',
    texture: 'reliquia',
    description: 'Caçador de relíquias sempre sorridente, envolto por uma aura de poder ancestral.',
    maxHealth: 220,
    movementSpeed: 190,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1,
    pickupRange: 130,
    armor: 1,
    advantages: [
      'Relíquia Divina: 3 melhorias iniciais',
      'Transforma amuletos em relíquias: +dano, +raio, tick mais rápido',
      'Cada acerto gera 1 de escudo além da vida (até a vida máxima)',
      '+40 de alcance de coleta'
    ],
    preferredWeaponId: 'amulet',
    startingWeaponUpgradeChoices: 3,
    auraWeaponOverrides: { baseDamage: 9.45, cooldown: 1000, range: 80 },
    hitShield: { perHit: 1, maxHealthFraction: 1 },
    accentColor: 0xa8541a
  },
  fabri: {
    id: 'fabri',
    name: 'Fabri',
    texture: 'fabri',
    description: 'Macaco guerreiro blindado, cinto cheio de bananas e pontaria certeira com o bumerangue.',
    maxHealth: 210,
    movementSpeed: 200,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1.05,
    pickupRange: 100,
    armor: 1,
    advantages: [
      'Bumerangue Rúnico: 3 melhorias iniciais',
      'Aos 10 upgrades, o bumerangue vira banana: lentidão acumulativa de 1% por acerto e 10% de chance de escorregar',
      '+20 de velocidade de movimento'
    ],
    preferredWeaponId: 'boomerang',
    startingWeaponUpgradeChoices: 3,
    boomerangBananaTransform: { upgradeThreshold: 10, slowPercentPerHit: 0.01, slipChancePerHit: 0.1 },
    accentColor: 0x9c7a1e
  },
  brom: {
    id: 'brom',
    name: 'Brom Barbaferro',
    texture: 'brom',
    description: 'Anão cervejeiro, duro como a bigorna da forja do clã.',
    maxHealth: 320,
    movementSpeed: 150,
    damageMultiplier: 1.1,
    attackSpeedMultiplier: 1,
    pickupRange: 100,
    armor: 3,
    advantages: [
      'Martelo de Forja: 3 melhorias iniciais',
      'Hidromel: a cada 20s recupera 12% da vida',
      'Aos 10 melhorias: Barril Rolante, que explode em espuma e derruba a horda'
    ],
    preferredWeaponId: 'hammer',
    startingWeaponUpgradeChoices: 3,
    kit: { exclusiveThreshold: 10 },
    modelScale: 0.8,
    accentColor: 0xc0502a
  },
  lyra: {
    id: 'lyra',
    name: 'Lyra Folhaverde',
    texture: 'lyra',
    description: 'Elfa caçadora que nunca erra um alvo distante.',
    maxHealth: 170,
    movementSpeed: 235,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1.1,
    pickupRange: 110,
    armor: 0,
    advantages: [
      'Arco Élfico: 3 melhorias iniciais',
      'Olho de Falcão: +25% de crítico em alvos distantes',
      'Aos 10 melhorias: Chuva de Flechas sobre o maior grupo'
    ],
    preferredWeaponId: 'bow',
    startingWeaponUpgradeChoices: 3,
    kit: { exclusiveThreshold: 10 },
    accentColor: 0x3f7a4a
  },
  grimbo: {
    id: 'grimbo',
    name: 'Grimbo Dedoleve',
    texture: 'grimbo',
    description: 'Goblin apostador: a sorte é dele, e as suas moedas também.',
    maxHealth: 160,
    movementSpeed: 225,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1.05,
    pickupRange: 140,
    armor: 1,
    advantages: [
      'Moedas Viciadas: 3 melhorias iniciais',
      'Mão Leve: +50% de moedas e preços do Sergio 20% menores',
      'Aos 10 melhorias: Tudo ou Nada, um dado a cada nível'
    ],
    preferredWeaponId: 'coins',
    startingWeaponUpgradeChoices: 3,
    kit: { exclusiveThreshold: 10 },
    modelScale: 0.72,
    accentColor: 0x7fb04a
  },
  zora: {
    id: 'zora',
    name: 'Madame Zora',
    texture: 'zora',
    description: 'Vidente que já viu como esta noite termina.',
    maxHealth: 150,
    movementSpeed: 205,
    damageMultiplier: 1.15,
    attackSpeedMultiplier: 1,
    pickupRange: 110,
    armor: 0,
    advantages: [
      'Bola de Cristal: 3 melhorias iniciais',
      'Previsão: +1 opção em cada escolha e guardiões vistos antes',
      'Aos 10 melhorias: Destino Selado nos 3 inimigos mais fortes'
    ],
    preferredWeaponId: 'crystal',
    startingWeaponUpgradeChoices: 3,
    kit: { exclusiveThreshold: 10 },
    accentColor: 0x7a3a9a
  },
  sergio: {
    id: 'sergio',
    name: 'Sergio',
    texture: 'sergio',
    description: 'O taberneiro em pessoa, com a loja inteira nas costas.',
    maxHealth: 220,
    movementSpeed: 190,
    damageMultiplier: 1,
    attackSpeedMultiplier: 1,
    pickupRange: 130,
    armor: 2,
    advantages: [
      'Mochila de Tralhas: 3 melhorias iniciais',
      'Loja Portátil: Q abre a taverna onde você estiver (preços +50%)',
      'Aos 10 melhorias: Liquidação, um item grátis a cada 2 minutos'
    ],
    preferredWeaponId: 'pack',
    startingWeaponUpgradeChoices: 3,
    kit: { exclusiveThreshold: 10 },
    accentColor: 0x5a3a6b
  }
};
