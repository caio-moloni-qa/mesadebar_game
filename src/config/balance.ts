export const PLAYER_CONFIG = { maxHealth: 100, movementSpeed: 180, pickupRange: 100, invulnerabilityMs: 750 };
export const ENEMY_CONFIG = { maxHealth: 40, movementSpeed: 75, contactDamage: 10, reward: 3, maxActive: 240 };
export const ENEMY_VARIANTS = {
  skeleton: { maxHealth: ENEMY_CONFIG.maxHealth, movementSpeed: ENEMY_CONFIG.movementSpeed, contactDamage: ENEMY_CONFIG.contactDamage, reward: ENEMY_CONFIG.reward },
  necromancerWraith: { maxHealth: 150, movementSpeed: 0, contactDamage: 0, reward: 8, currencyDrops: 3, soulCooldownMs: 2200 },
  apparitionWraith: { maxHealth: 35, movementSpeed: 150, contactDamage: 10, reward: 4 },
  superSkeleton: { maxHealth: 500, movementSpeed: 35, contactDamage: 50, reward: 25 },
  finalBoss: { maxHealth: 10000, movementSpeed: 35, contactDamage: 0, reward: 0 }
};
export const WEAPON_CONFIG = { damage: 10, cooldownMs: 700, projectileSpeed: 450, range: 600, lifetimeMs: 1500, pierces: 0 };
/** Rotten Aura: constant proximity debuff around Super Esqueleto and the final boss. While inside, healing is cut
 * and the player takes damage-over-time; the status (and the heal cut) persists durationMs after last being inside. */
export const ROTTEN_AURA_CONFIG = { healReduction: 0.7, dps: 3, tickMs: 1000, durationMs: 5000 };
/** Super Esqueleto and Necromante têm essa chance de soltar um baú ao morrer; ao ser coletado, aplica automaticamente
 * uma melhoria aleatória sorteada do mesmo pool que a tela de nível ≥5 oferece (5 opções). */
export const LOOT_CHEST_DROP_CHANCE = 0.4;
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
