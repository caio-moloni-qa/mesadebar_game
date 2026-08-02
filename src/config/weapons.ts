export interface WeaponConfig { id: 'staff' | 'sword'; name: string; type: 'projectile' | 'cone'; description: string; baseDamage: number; cooldown: number; range: number; projectileSpeed?: number; projectileLifetime?: number; coneAngle?: number; }
export const WEAPONS: Record<WeaponConfig['id'], WeaponConfig> = {
  staff: { id: 'staff', name: 'Cajado', type: 'projectile', description: 'Dispara projéteis mágicos automaticamente contra o inimigo mais próximo.', baseDamage: 12, cooldown: 700, range: 600, projectileSpeed: 450, projectileLifetime: 1500 },
  sword: { id: 'sword', name: 'Espada', type: 'cone', description: 'Executa um ataque corpo a corpo poderoso em cone.', baseDamage: 20, cooldown: 900, range: 120, coneAngle: 90 }
};
