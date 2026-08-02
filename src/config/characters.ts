export interface CharacterConfig { id: 'barbarian' | 'mage'; name: string; texture: string; description: string; maxHealth: number; movementSpeed: number; damageMultiplier: number; attackSpeedMultiplier: number; pickupRange: number; armor: number; }
export const CHARACTERS: Record<CharacterConfig['id'], CharacterConfig> = {
  barbarian: { id: 'barbarian', name: 'Barbarian', texture: 'barbarian', description: 'Resistant warrior with powerful physical attacks.', maxHealth: 140, movementSpeed: 165, damageMultiplier: 1.1, attackSpeedMultiplier: 0.9, pickupRange: 90, armor: 2 },
  mage: { id: 'mage', name: 'Mage', texture: 'mage', description: 'Fast spellcaster with frequent attacks.', maxHealth: 90, movementSpeed: 185, damageMultiplier: 1, attackSpeedMultiplier: 1.15, pickupRange: 110, armor: 0 }
};
