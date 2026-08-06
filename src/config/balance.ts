export const PLAYER_CONFIG = { maxHealth: 100, movementSpeed: 180, pickupRange: 100, invulnerabilityMs: 750 };
export const ENEMY_CONFIG = { maxHealth: 40, movementSpeed: 75, contactDamage: 10, reward: 3, maxActive: 240 };
export const ENEMY_VARIANTS = {
  skeleton: { maxHealth: ENEMY_CONFIG.maxHealth, movementSpeed: ENEMY_CONFIG.movementSpeed, contactDamage: ENEMY_CONFIG.contactDamage, reward: ENEMY_CONFIG.reward },
  necromancerWraith: { maxHealth: 150, movementSpeed: 0, contactDamage: 0, reward: 8, currencyDrops: 3, soulCooldownMs: 2200 },
  apparitionWraith: { maxHealth: 35, movementSpeed: 150, contactDamage: 10, reward: 4 },
  superSkeleton: { maxHealth: 800, movementSpeed: 35, contactDamage: 50, reward: 25 },
  finalBoss: { maxHealth: 5000, movementSpeed: 35, contactDamage: 0, reward: 0 }
};
export const WEAPON_CONFIG = { damage: 10, cooldownMs: 700, projectileSpeed: 450, range: 600, lifetimeMs: 1500, pierces: 0 };
export interface EnemyVariantScheduleEntry { variantId: 'necromancerWraith' | 'apparitionWraith' | 'superSkeleton'; intervalMs: number; }
export const ENEMY_VARIANT_SCHEDULE: EnemyVariantScheduleEntry[] = [
  { variantId: 'necromancerWraith', intervalMs: 15000 },
  { variantId: 'apparitionWraith', intervalMs: 30000 },
  { variantId: 'superSkeleton', intervalMs: 40000 }
];
export const DIFFICULTY_STAGES = [
  { startMs: 0, spawnInterval: 1000, count: 1, healthMultiplier: 1 },
  { startMs: 60_000, spawnInterval: 750, count: 2, healthMultiplier: 1.75 },
  { startMs: 120_000, spawnInterval: 500, count: 3, healthMultiplier: 2.25 }
];
export const requiredExperience = (level: number): number => Math.floor(10 + level * level * 2.5);
