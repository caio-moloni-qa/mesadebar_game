export const PLAYER_CONFIG = { maxHealth: 100, movementSpeed: 180, pickupRange: 100, invulnerabilityMs: 750 };
export const ENEMY_CONFIG = { maxHealth: 40, movementSpeed: 75, contactDamage: 10, reward: 3, maxActive: 240 };
/** Sandbox "Limite spawn" choices (F9 panel). The last is the ceiling the 3D horde renderer is sized for. */
export const SANDBOX_SPAWN_CAPS = [ENEMY_CONFIG.maxActive, 500, 1000, 2000] as const;
export const ENEMY_VARIANTS = {
  skeleton: { maxHealth: ENEMY_CONFIG.maxHealth, movementSpeed: ENEMY_CONFIG.movementSpeed, contactDamage: ENEMY_CONFIG.contactDamage, reward: ENEMY_CONFIG.reward },
  necromancerWraith: { maxHealth: 150, movementSpeed: 0, contactDamage: 0, reward: 8, currencyDrops: 3, soulCooldownMs: 2200 },
  apparitionWraith: { maxHealth: 35, movementSpeed: 150, contactDamage: 10, reward: 4 },
  superSkeleton: { maxHealth: 500, movementSpeed: 35, contactDamage: 50, reward: 25 },
  finalBoss: { maxHealth: 10000, movementSpeed: 35, contactDamage: 0, reward: 0 },
  // Campo Nevado's horde (HORDE_BY_ARENA): same numbers as the Greenfield role they fill.
  frostSkeleton: { maxHealth: ENEMY_CONFIG.maxHealth, movementSpeed: ENEMY_CONFIG.movementSpeed, contactDamage: ENEMY_CONFIG.contactDamage, reward: ENEMY_CONFIG.reward },
  /** Espírito da Geada: an Aparição that leaves a slowing frost trail behind it (FROST_TRAIL). */
  frostSpirit: { maxHealth: 35, movementSpeed: 150, contactDamage: 10, reward: 4 },
  /** Xamã da Nevasca: the Necromante's numbers; instead of souls it raises a Boneco de Neve every castCooldownMs. */
  snowShaman: { maxHealth: 150, movementSpeed: 0, contactDamage: 0, reward: 8, currencyDrops: 3, castCooldownMs: 3200 },
  /** Boneco de Neve: 3 HP, waddles at the hero and bursts on reaching it (SNOWMAN). Worth nothing - it's a nuisance. */
  snowman: { maxHealth: 3, movementSpeed: 95, contactDamage: 0, reward: 0, currencyDrops: 0 },
  /** Troll de Gelo: the Super Esqueleto's numbers, a frost aura instead of the rot and a telegraphed icicle slam. */
  iceTroll: { maxHealth: 500, movementSpeed: 35, contactDamage: 50, reward: 25, castCooldownMs: 7000 },
  /** Lobo do Gelo: mixed into the Nevado's base drip in packs (WOLF_PACK) - quicker than the skeleton, frailer. */
  iceWolf: { maxHealth: 26, movementSpeed: 110, contactDamage: 8, reward: 3 }
};
export type HordeVariantId = keyof typeof ENEMY_VARIANTS;
/** The horde's four roles: the base drip, the standing summoner, the fast swarm from the borders, the elite wave. */
export type HordeRole = 'base' | 'summoner' | 'fast' | 'elite';
/** `pack`: an extra base creature that arrives in packs (WOLF_PACK) alongside the base drip. */
export type HordeRoster = Record<HordeRole, HordeVariantId> & { pack?: HordeVariantId };
/** Who fills each role, per arena (ArenaLayout.id). */
export const HORDE_BY_ARENA: Record<string, HordeRoster> = {
  greenfield: { base: 'skeleton', summoner: 'necromancerWraith', fast: 'apparitionWraith', elite: 'superSkeleton' },
  snowfield: { base: 'frostSkeleton', summoner: 'snowShaman', fast: 'frostSpirit', elite: 'iceTroll', pack: 'iceWolf' }
};
/** A pack of `min..max` wolves every `intervalMs`, bunched within `spread` of one spot at the base drip's distance.
 *  Each wolf takes a side of the hero (spread over `flankArc` radians either way of the pack's approach) and circles
 *  out to it, `flankRadius` off the hero, before biting - so the pack closes in from several sides at once. It goes
 *  straight for the hero once on its side, within `closeIn`, or `flankMs` after spawning. */
export const WOLF_PACK = { intervalMs: 9000, min: 3, max: 5, spread: 45, flankArc: 2.4, flankRadius: 130, closeIn: 80, flankMs: 7000 };
export const hordeFor = (arenaId: string): HordeRoster => HORDE_BY_ARENA[arenaId] ?? HORDE_BY_ARENA.greenfield;
/** The Espírito da Geada drops a frost patch every `dropEveryMs`; each lasts `lifetimeMs`. Standing on one slows the
 *  hero by `slowPercent` (refreshed while on it, never stacking with itself). */
export const FROST_TRAIL = { dropEveryMs: 220, lifetimeMs: 3000, radius: 26, slowPercent: 0.3, slowMs: 400, maxPatches: 400 };
/** Congelamento: Campo Nevado's own threat. Each stack slows the hero `slowPerStack`; they all melt `decayMs` after the
 *  last one landed. Reaching `max` freezes the hero solid for `freezeMs` (no moving, no attacking), clears the stacks
 *  and leaves `immuneMs` of grace before frost can build again. */
export const FROST_STACKS = { max: 5, slowPerStack: 0.06, decayMs: 4000, freezeMs: 1000, immuneMs: 1500 };
/** Nevasca (Campo Nevado): a cold meter (0..100) the HUD shows as a thermometer. The storm comes in fronts on the run
 *  clock: `firstFrontMs` of calm, then `stormMs` of blizzard and `calmMs` of lull, again and again (`rampMs` to blow
 *  in/out). In the storm the cold rises `risePerSec`; within a lit torch's reach it falls `warmPerSec` and that torch
 *  burns its fuel (`torchFuelMs` of use; its reach shrinks to `torchMinRadius` of `torchRadius` as it burns down). In
 *  the lull the cold eases `calmDecayPerSec` and burnt-out torches relight with `relightFuel` of a full load. Each
 *  stack of Congelamento adds `coldPerFrostStack`. Full cold freezes the hero `freezeMs` (`freezeDamage`), then the
 *  meter drops to `afterFreeze`. */
export const BLIZZARD_TUNING = {
  firstFrontMs: 40_000, stormMs: 90_000, calmMs: 30_000, rampMs: 4000,
  risePerSec: 2.2, warmPerSec: 9, calmDecayPerSec: 3, coldPerFrostStack: 6,
  torchRadius: 140, torchMinRadius: 0.55, torchFuelMs: 45_000, relightFuel: 0.5,
  freezeMs: 2000, freezeDamage: 8, afterFreeze: 60
};
/** Every hit from these lands one stack of Congelamento (the Nevado horde's touch). */
export const FROST_TOUCH_VARIANTS: ReadonlySet<string> = new Set(['frostSkeleton', 'frostSpirit', 'iceTroll']);
/** The Xamã keeps at most `perShaman` snowmen alive each, raised `minRadius..maxRadius` from it. A snowman bursts once
 *  within `burstReach` of the hero's body: `damage` plus `frostStacks`. */
export const SNOWMAN = { perShaman: 4, minRadius: 30, maxRadius: 60, burstReach: 10, damage: 6, frostStacks: 1 };
/** Troll de Gelo: standing in its aura (`auraRadius`) adds a stack every `auraTickMs`. Within `slamRange` of the hero
 *  (and off cooldown) it stops, pounds the ground and marks `icicles` spots - one on the hero, the rest up to
 *  `icicleSpread` around - that icicles hit `warnMs` later: `icicleDamage` and `icicleFrost` stacks each. */
export const ICE_TROLL = { auraRadius: 60, auraTickMs: 1000, slamRange: 300, icicles: 3, icicleSpread: 90, icicleRadius: 38, warnMs: 1000, icicleDamage: 20, icicleFrost: 2 };
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
export interface EnemyVariantScheduleEntry { role: Exclude<HordeRole, 'base'>; intervalMs: number; }
/** Every arena keeps Greenfield's timing for now (Caio's call: tune it after playing). */
export const ENEMY_VARIANT_SCHEDULE: EnemyVariantScheduleEntry[] = [
  { role: 'summoner', intervalMs: 15000 },
  { role: 'fast', intervalMs: 30000 },
  { role: 'elite', intervalMs: 40000 }
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
