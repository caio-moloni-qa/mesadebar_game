export interface WeaponConfig { id: 'staff' | 'sword'; name: string; type: 'projectile' | 'cone'; description: string; baseDamage: number; cooldown: number; range: number; projectileSpeed?: number; projectileLifetime?: number; coneAngle?: number; }
export const WEAPONS: Record<WeaponConfig['id'], WeaponConfig> = {
  staff: { id: 'staff', name: 'Staff', type: 'projectile', description: 'Automatically fires magical projectiles at the nearest enemy.', baseDamage: 12, cooldown: 700, range: 600, projectileSpeed: 450, projectileLifetime: 1500 },
  sword: { id: 'sword', name: 'Sword', type: 'cone', description: 'Performs a powerful melee attack in a cone.', baseDamage: 20, cooldown: 900, range: 120, coneAngle: 90 }
};
