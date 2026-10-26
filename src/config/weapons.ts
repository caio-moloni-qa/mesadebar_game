export interface WeaponConfig {
  id: 'staff' | 'sword' | 'boomerang' | 'amulet' | 'whip' | 'hammer' | 'bow' | 'coins' | 'crystal' | 'pack';
  name: string;
  type: 'projectile' | 'cone' | 'boomerang' | 'aura';
  description: string;
  baseDamage: number;
  cooldown: number;
  range: number;
  projectileSpeed?: number;
  projectileLifetime?: number;
  coneAngle?: number;
  /** Projectiles: enemies each shot passes through before it's spent (default WEAPON_CONFIG.pierces). */
  pierces?: number;
  /** Projectiles: guaranteed ricochets to the next enemy, on top of the Rebote Arcano upgrade's. */
  ricochets?: number;
}

export type WeaponFamily = 'melee' | 'ranged' | 'aura';

export function weaponFamily(weapon: WeaponConfig): WeaponFamily {
  switch (weapon.type) {
    case 'cone':
      return 'melee';
    case 'projectile':
    case 'boomerang':
      return 'ranged';
    case 'aura':
      return 'aura';
    default: {
      const exhaustiveCheck: never = weapon.type;
      throw new Error(`weaponFamily: unhandled weapon type "${exhaustiveCheck}"`);
    }
  }
}

export const FAMILY_LABELS: Record<WeaponFamily, string> = { melee: 'CORPO A CORPO', ranged: 'À DISTÂNCIA', aura: 'AURA' };

/** Maximum number of weapons a run can have active at once (see GameScene.rollExtraWeaponOffer). */
export const MAX_ACTIVE_WEAPONS = 2;

export const WEAPONS: Record<WeaponConfig['id'], WeaponConfig> = {
  staff: {
    id: 'staff',
    name: 'Cajado',
    type: 'projectile',
    description: 'Dispara projéteis mágicos automaticamente contra o inimigo mais próximo.',
    baseDamage: 21,
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
    baseDamage: 25.2,
    cooldown: 1100,
    range: 120,
    coneAngle: 90
  },
  boomerang: {
    id: 'boomerang',
    name: 'Bumerangue Rúnico',
    type: 'boomerang',
    description: 'Voa e retorna ao herói, ferindo inimigos nos dois trajetos.',
    baseDamage: 14,
    cooldown: 1300,
    range: 300,
    projectileSpeed: 390,
    projectileLifetime: 2000
  },
  amulet: {
    id: 'amulet',
    name: 'Relíquia Divina',
    type: 'aura',
    description: 'Emite uma área circular de dano contínuo ao redor do herói.',
    baseDamage: 7.875,
    cooldown: 1250,
    range: 64
  },
  hammer: {
    id: 'hammer',
    name: 'Martelo de Forja',
    type: 'cone',
    description: 'Golpe pesado em cone curto que solta uma onda de choque no chão.',
    baseDamage: 30,
    cooldown: 1400,
    range: 115,
    coneAngle: 80
  },
  bow: {
    id: 'bow',
    name: 'Arco Élfico',
    type: 'projectile',
    description: 'Flechas de longo alcance que atravessam dois inimigos.',
    baseDamage: 19,
    cooldown: 950,
    range: 950,
    projectileSpeed: 780,
    projectileLifetime: 1400,
    pierces: 2
  },
  coins: {
    id: 'coins',
    name: 'Moedas Viciadas',
    type: 'projectile',
    description: 'Moedas arremessadas que ricocheteiam entre os inimigos.',
    baseDamage: 13,
    cooldown: 700,
    range: 600,
    projectileSpeed: 560,
    projectileLifetime: 1500,
    ricochets: 2
  },
  crystal: {
    id: 'crystal',
    name: 'Bola de Cristal',
    type: 'aura',
    description: 'Esferas de cristal orbitam o herói e atingem quem tocam.',
    baseDamage: 12,
    cooldown: 600,
    range: 95
  },
  pack: {
    id: 'pack',
    name: 'Mochila de Tralhas',
    type: 'projectile',
    description: 'Arremessa um item aleatório: frigideira atordoa, garrafa explode, poção cura quem arremessou.',
    baseDamage: 17,
    cooldown: 900,
    range: 550,
    projectileSpeed: 480,
    projectileLifetime: 1500
  },
  whip: {
    id: 'whip',
    name: 'Chicote',
    type: 'cone',
    description: 'Golpeia em um arco amplo à frente do herói, atingindo vários inimigos de uma vez.',
    baseDamage: 14,
    cooldown: 700,
    range: 180,
    coneAngle: 140
  }
};

export const WEAPON_FAMILIES: WeaponFamily[] = Array.from(new Set(Object.values(WEAPONS).map(weaponFamily)));
