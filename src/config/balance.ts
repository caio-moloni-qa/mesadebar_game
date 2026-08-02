export const PLAYER_CONFIG = { maxHealth: 100, movementSpeed: 180, pickupRange: 100, invulnerabilityMs: 750 };
export const ENEMY_CONFIG = { maxHealth: 30, movementSpeed: 75, contactDamage: 10, experience: 3, maxActive: 240 };
export const ENEMY_VARIANTS = {
  skeleton: { maxHealth: ENEMY_CONFIG.maxHealth, movementSpeed: ENEMY_CONFIG.movementSpeed, contactDamage: ENEMY_CONFIG.contactDamage, experience: ENEMY_CONFIG.experience },
  necromancerWraith: { maxHealth: 45, movementSpeed: 0, contactDamage: 0, experience: 8, soulCooldownMs: 2200 },
  apparitionWraith: { maxHealth: ENEMY_CONFIG.maxHealth / 2, movementSpeed: ENEMY_CONFIG.movementSpeed * 2, contactDamage: ENEMY_CONFIG.contactDamage, experience: 4 },
  superSkeleton: { maxHealth: ENEMY_CONFIG.maxHealth * 20, movementSpeed: ENEMY_CONFIG.movementSpeed / 3, contactDamage: ENEMY_CONFIG.contactDamage * 5, experience: 25 },
  finalBoss: { maxHealth: 3000, movementSpeed: ENEMY_CONFIG.movementSpeed / 3, contactDamage: 0, experience: 0 }
};
export const WEAPON_CONFIG = { damage: 10, cooldownMs: 700, projectileSpeed: 450, range: 600, lifetimeMs: 1500, pierces: 0 };
export const DIFFICULTY_STAGES = [
  { startMs: 0, spawnInterval: 1000, count: 1, healthMultiplier: 1 },
  { startMs: 60_000, spawnInterval: 750, count: 2, healthMultiplier: 1.25 },
  { startMs: 120_000, spawnInterval: 500, count: 3, healthMultiplier: 1.5 }
];
export const requiredExperience = (level: number): number => Math.floor(10 + level * level * 2.5);
