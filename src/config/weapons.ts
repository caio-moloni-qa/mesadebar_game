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
