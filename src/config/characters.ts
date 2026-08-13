export type CharacterId = 'barbarian' | 'mage' | 'reliquia' | 'fabri';
export type PreferredWeaponId = 'staff' | 'sword' | 'boomerang' | 'amulet';

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
  boomerangBananaTransform?: { upgradeThreshold: number; slowPercentPerHit: number };
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
      '+30% de dano com armas',
      'Pouca vida: até +40% velocidade de ataque e movimento'
    ],
    preferredWeaponId: 'sword',
    startingWeaponUpgradeChoices: 3,
    lowHealthAttackSpeedBonus: 0.4
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
      'Cura 1 HP a cada 3s'
    ],
    preferredWeaponId: 'staff',
    startingWeaponUpgradeChoices: 3,
    passiveHealAmount: 1,
    passiveHealIntervalMs: 3000
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
      '+40 de alcance de coleta'
    ],
    preferredWeaponId: 'amulet',
    startingWeaponUpgradeChoices: 3,
    auraWeaponOverrides: { baseDamage: 6.75, cooldown: 1000, range: 80 }
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
      'Aos 10 upgrades, o bumerangue vira banana: lentidão acumulativa de 1% por acerto',
      '+20 de velocidade de movimento'
    ],
    preferredWeaponId: 'boomerang',
    startingWeaponUpgradeChoices: 3,
    boomerangBananaTransform: { upgradeThreshold: 10, slowPercentPerHit: 0.01 }
  }
};
