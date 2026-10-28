export const PLAYER_CONFIG = { maxHealth: 100, movementSpeed: 180, pickupRange: 100, invulnerabilityMs: 750 };
export const ENEMY_CONFIG = { maxHealth: 40, movementSpeed: 75, contactDamage: 10, reward: 3, maxActive: 240 };
/** Sandbox "Limite spawn" choices (F9 panel). The last is the ceiling the 3D horde renderer is sized for. */
export const SANDBOX_SPAWN_CAPS = [ENEMY_CONFIG.maxActive, 500, 1000, 2000] as const;
export const ENEMY_VARIANTS = {
  skeleton: { maxHealth: ENEMY_CONFIG.maxHealth, movementSpeed: ENEMY_CONFIG.movementSpeed, contactDamage: ENEMY_CONFIG.contactDamage, reward: ENEMY_CONFIG.reward },
  necromancerWraith: { maxHealth: 150, movementSpeed: 0, contactDamage: 0, reward: 8, currencyDrops: 3, soulCooldownMs: 2200 },
  apparitionWraith: { maxHealth: 35, movementSpeed: 150, contactDamage: 10, reward: 4 },
  superSkeleton: { maxHealth: 500, movementSpeed: 35, contactDamage: 50, reward: 25 },
  finalBoss: { maxHealth: 10000, movementSpeed: 35, contactDamage: 0, reward: 0 }
};
/** 3D-only zone mini-bosses (kept out of ENEMY_VARIANTS).
 *  Health is multiplied by the difficulty stage when they spawn. */
export const MINI_BOSS_VARIANTS = {
  gravedigger: { maxHealth: 1200, movementSpeed: 70, contactDamage: 10, reward: 0 },
  templeGuardian: { maxHealth: 1700, movementSpeed: 55, contactDamage: 15, reward: 0 },
  lakeSpirit: { maxHealth: 2000, movementSpeed: 60, contactDamage: 12, reward: 0 },
  // Campo Nevado
  frostKnight: { maxHealth: 1600, movementSpeed: 70, contactDamage: 14, reward: 0 }
};
/** Neutral creatures: they live at fixed spots of the map (ArenaLayout.neutrals), leave the hero alone until hurt,
 *  and don't count toward the horde's cap. `contactDamage` only bites while angry (NeutralSystem). */
export const NEUTRAL_VARIANTS = {
  boar: { maxHealth: 180, movementSpeed: 85, contactDamage: 12, reward: 12, currencyDrops: 3, loot: null },
  /** Cervo: the stag leads the herd and charges; the does only ever run. Each drops a small potion. */
  stag: { maxHealth: 220, movementSpeed: 110, contactDamage: 10, reward: 14, currencyDrops: 3, loot: 'potion' },
  doe: { maxHealth: 90, movementSpeed: 125, contactDamage: 0, reward: 8, currencyDrops: 2, loot: 'potion' },
  /** Colmeia: never moves; hurt, it sends out a swarm. Drops honey (a potion that also quickens the hero). */
  hive: { maxHealth: 70, movementSpeed: 0, contactDamage: 0, reward: 10, currencyDrops: 2, loot: 'honey' },
  /** Mímico: a chest that bites. Beaten, it leaves a real chest. */
  mimic: { maxHealth: 320, movementSpeed: 120, contactDamage: 0, reward: 20, currencyDrops: 4, loot: 'chest' }
} satisfies Record<string, { maxHealth: number; movementSpeed: number; contactDamage: number; reward: number; currencyDrops: number; loot: NeutralLoot }>;
/** What a neutral leaves besides its crystals. */
export type NeutralLoot = 'potion' | 'honey' | 'chest' | null;
/** Every variant the 3D core can spawn. */
export const ALL_ENEMY_VARIANTS = { ...ENEMY_VARIANTS, ...MINI_BOSS_VARIANTS, ...NEUTRAL_VARIANTS };
export const WEAPON_CONFIG = { damage: 10, cooldownMs: 700, projectileSpeed: 450, range: 600, lifetimeMs: 1500, pierces: 0 };
/** Level-up rewards: the larger selection and the guaranteed extra-weapon card occur every fifth level. */
export const LEVEL_UPGRADE_CONFIG = { bonusChoiceInterval: 5, defaultChoiceAmount: 3, bonusChoiceAmount: 5 };
/** Rotten Aura: constant proximity debuff around Super Esqueleto and the final boss. While inside, healing is cut
 * and the player takes damage-over-time; the status (and the heal cut) persists durationMs after last being inside. */
export const ROTTEN_AURA_CONFIG = { healReduction: 0.7, dps: 3, tickMs: 1000, durationMs: 5000 };
/** Super Esqueleto and Necromante têm essa chance de soltar um baú ao morrer; ao ser coletado, aplica automaticamente
 * uma melhoria aleatória sorteada do mesmo pool que a tela de nível ≥5 oferece (5 opções). */
export const LOOT_CHEST_DROP_CHANCE = 0.15;
/** Every enemy (any variant, not just superSkeleton/necromancerWraith like the loot chest) has this chance to drop
 * a Poção de Vida on death — a flat, instant HEALTH_POTION_HEAL_AMOUNT heal on pickup, no upgrade roll involved. */
export const HEALTH_POTION_DROP_CHANCE = 0.01;
export const HEALTH_POTION_HEAL_AMOUNT = 40;
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
/** While a zone guardian is announced or up the fight is about it: the skeleton drip slows right down (one at a time,
 *  this many times further apart, none while the field already holds `enemyCap` enemies) and the timed hordes
 *  (Necromantes, Aparições, Super Esqueletos) hold their timers until it's over. */
export const GUARDIAN_FIGHT_SPAWNS = { intervalMultiplier: 4, maxPerTick: 1, enemyCap: 25 };
export const requiredExperience = (level: number): number => Math.floor(10 + level * level * 2.5);
