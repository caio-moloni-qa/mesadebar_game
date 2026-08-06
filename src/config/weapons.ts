export interface WeaponConfig {
  id: 'staff' | 'sword' | 'boomerang';
  name: string;
  type: 'projectile' | 'cone' | 'boomerang';
  description: string;
  baseDamage: number;
  cooldown: number;
  range: number;
  projectileSpeed?: number;
  projectileLifetime?: number;
  coneAngle?: number;
}

export type WeaponFamily = 'melee' | 'ranged';

export function weaponFamily(weapon: WeaponConfig): WeaponFamily {
  switch (weapon.type) {
    case 'cone':
      return 'melee';
    case 'projectile':
    case 'boomerang':
      return 'ranged';
    default: {
      const exhaustiveCheck: never = weapon.type;
      throw new Error(`weaponFamily: unhandled weapon type "${exhaustiveCheck}"`);
    }
  }
}

export const FAMILY_LABELS: Record<WeaponFamily, string> = { melee: 'CORPO A CORPO', ranged: 'À DISTÂNCIA' };

/** Maximum number of weapons a run can have active at once (see GameScene.rollExtraWeaponOffer). */
export const MAX_ACTIVE_WEAPONS = 2;

export const WEAPONS: Record<WeaponConfig['id'], WeaponConfig> = {
  staff: {
    id: 'staff',
    name: 'Cajado',
    type: 'projectile',
    description: 'Dispara projéteis mágicos automaticamente contra o inimigo mais próximo.',
    baseDamage: 15,
    cooldown: 700,
    range: 800,
    projectileSpeed: 500,
    projectileLifetime: 2000
  },
  sword: {
    id: 'sword',
    name: 'Espada',
    type: 'cone',
    description: 'Executa um ataque corpo a corpo poderoso em cone.',
    baseDamage: 18,
    cooldown: 1100,
    range: 120,
    coneAngle: 90
  },
  boomerang: {
    id: 'boomerang',
    name: 'Bumerangue Rúnico',
    type: 'boomerang',
    description: 'Voa e retorna ao herói, ferindo inimigos nos dois trajetos.',
    baseDamage: 10,
    cooldown: 1300,
    range: 300,
    projectileSpeed: 390,
    projectileLifetime: 2000
  }
};

export const WEAPON_FAMILIES: WeaponFamily[] = Array.from(new Set(Object.values(WEAPONS).map(weaponFamily)));
