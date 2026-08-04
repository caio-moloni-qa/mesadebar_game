export type CharacterId = 'barbarian' | 'mage';
export type PreferredWeaponId = 'staff' | 'sword' | 'boomerang';

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
  lowHealthAttackSpeedBonus?: number;
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
      'Pouca vida: até +40% velocidade de ataque'
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
  }
};
