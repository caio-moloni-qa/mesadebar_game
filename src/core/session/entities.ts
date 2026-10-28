import { ALL_ENEMY_VARIANTS, BLIZZARD_TUNING, FROST_STACKS, ICE_TROLL, MINI_BOSS_VARIANTS, NEUTRAL_VARIANTS, PLAYER_CONFIG, ROTTEN_AURA_CONFIG } from '../../config/balance';
import { CharacterConfig } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { EnemyVariantId } from '../systems/EnemySpawnScheduler';
import { UpgradeTarget } from '../systems/UpgradeSystem';

/** Every simulated body keeps last step's position too, so the renderer can interpolate between fixed steps.
 *  Call `snapPrevious()` whenever a body appears or teleports, or it visibly slides in from its old spot. */
export interface Body {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  radius: number;
}

export function snapPrevious(body: Body): void {
  body.prevX = body.x;
  body.prevY = body.y;
}

/** Collision radii in game units, matching the Arcade bodies they replace (display-space radii). */
export const BODY_RADIUS = { player: 18, enemy: 18, honey: 14, bolt: 7, boomerang: 17, thrownSword: 20, soul: 13, gem: 8, peel: 19, chest: 21, potion: 14, arrow: 9, coin: 10, pan: 14, bottle: 12, flask: 12 } as const;

/** Relíquia Divina's banked "risk/reward" bonus on the next hit taken is capped (GameScene AURA_DAMAGE_TAKEN_BONUS_CAP). */
export const AURA_DAMAGE_TAKEN_BONUS_CAP = 15;

/** Player stats + status effects — the engine-agnostic twin of entities/Player (same formulas). */
export class PlayerState implements Body, UpgradeTarget {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  readonly radius = BODY_RADIUS.player;
  facingX = 1;
  facingY = 0;
  health: number;
  maxHealth: number;
  movementSpeed: number;
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  pickupRange: number;
  armor: number;
  invulnerableUntil = 0;
  lastDamagedAt = -Infinity;
  invincible = false;
  /** Sandbox "+500 Buffer de Dano": absorbs incoming damage before health does. */
  damageBuffer = 0;
  // Upgrade-driven stats (see core/systems/UpgradeSystem).
  lifeStealPercent = 0;
  meleeRangeBonus = 0;
  meleeExtraAttackChance = 0;
  meleeExtraAttackMax = 0;
  whirlwindUnlocked = false;
  projectileExtraCount = 0;
  projectileRicochetChance = 0;
  projectileRicochetMax = 0;
  projectileSizeBonus = 0;
  auraRadiusBonusPercent = 0;
  auraDamageBonus = 0;
  auraTickSpeedBonusMs = 0;
  /** 1.5% of the Relíquia Divina's banked streak damage — added to the next incoming hit, then consumed. */
  auraDamageTakenBonus = 0;
  // Character passives.
  passiveHealAmount: number;
  passiveHealIntervalMs: number;
  lowHealthAttackSpeedBonus: number;
  /** Bênção Divina (merchant): flat HP/s, ticking independently of the character's own passive heal. */
  bonusPassiveHealPerSecond = 0;
  /** Colmeia's honey: this much faster until then. */
  hasteUntil = 0;
  hastePercent = 0;
  /** Congelamento (Campo Nevado): stacks building towards a freeze, and the frozen-solid moment itself. */
  frozenUntil = -Infinity;
  private thawStartsAt = -Infinity;
  private frostStacks = 0;
  private frostStacksMeltAt = -Infinity;
  private frostImmuneUntil = -Infinity;
  private slows: Array<{ expiresAt: number; percent: number }> = [];
  private passiveHealElapsed = 0;
  private bonusPassiveHealElapsed = 0;
  private rottenExpiresAt = -Infinity;
  private rottenTickElapsed = 0;

  constructor(character: CharacterConfig) {
    this.health = this.maxHealth = character.maxHealth;
    this.movementSpeed = character.movementSpeed;
    this.damageMultiplier = character.damageMultiplier;
    this.attackSpeedMultiplier = character.attackSpeedMultiplier;
    this.pickupRange = character.pickupRange;
    this.armor = character.armor;
    this.passiveHealAmount = character.passiveHealAmount ?? 0;
    this.passiveHealIntervalMs = character.passiveHealIntervalMs ?? 0;
    this.lowHealthAttackSpeedBonus = character.lowHealthAttackSpeedBonus ?? 0;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Blocked during i-frames; the banked aura bonus is added then consumed; armor reduces each hit but never below 1. */
  /** `unavoidable` hits (the boss's shield explosion) ignore the i-frames — only `invincible` stops them. */
  damage(amount: number, now: number, unavoidable = false): number {
    if (this.invincible || (!unavoidable && now < this.invulnerableUntil)) return 0;
    const incoming = amount + this.auraDamageTakenBonus;
    this.auraDamageTakenBonus = 0;
    const dealt = Math.max(1, incoming - this.armor);
    const absorbed = Math.min(this.damageBuffer, dealt);
    this.damageBuffer -= absorbed;
    this.health = Math.max(0, this.health - (dealt - absorbed));
    this.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
    this.lastDamagedAt = now;
    return dealt;
  }

  /** Heals (cut by the Aura Podre while rotten). Returns how much the rot prevented, for the "CURA -N" callout. */
  heal(amount: number, now: number): number {
    const effective = this.isRotten(now) ? amount * (1 - ROTTEN_AURA_CONFIG.healReduction) : amount;
    this.health = Math.min(this.maxHealth, this.health + effective);
    return amount - effective;
  }

  /** The water fairy's cleanse (Congelamento's stacks melt too). */
  clearSlows(): void {
    this.slows.length = 0;
    this.thawStartsAt = -Infinity;
    this.frostStacks = 0;
  }

  /** Safe rooms remove temporary harmful statuses without changing equipment or buffs. */
  clearNegativeEffects(): void {
    this.clearSlows();
    this.frozenUntil = -Infinity;
    this.frostStacksMeltAt = -Infinity;
    this.frostImmuneUntil = -Infinity;
    this.rottenExpiresAt = -Infinity;
    this.rottenTickElapsed = 0;
  }

  /** Congelamento stacks still standing at `now`. */
  frostStacksAt(now: number): number {
    return now < this.frostStacksMeltAt ? this.frostStacks : 0;
  }

  isFrozen(now: number): boolean {
    return now < this.frozenUntil;
  }

  /** Adds `count` stacks of Congelamento (none while frozen or in the grace after). Returns true when they froze the
   *  hero solid. */
  addFrost(count: number, now: number): boolean {
    if (count <= 0 || now < this.frostImmuneUntil) return false;
    this.frostStacks = this.frostStacksAt(now) + count;
    this.frostStacksMeltAt = now + FROST_STACKS.decayMs;
    if (this.frostStacks < FROST_STACKS.max) return false;
    this.freezeSolid(FROST_STACKS.freezeMs, now);
    return true;
  }

  /** Frozen solid for `durationMs` (Congelamento's last stack, the blizzard's full cold): stacks cleared, then the
   *  usual grace. */
  freezeSolid(durationMs: number, now: number): void {
    this.frostStacks = 0;
    this.frozenUntil = now + durationMs;
    this.thawStartsAt = this.frozenUntil;
    this.frostImmuneUntil = this.frozenUntil + FROST_STACKS.immuneMs;
  }

  applySlow(percent: number, durationMs: number, now: number): void {
    this.slows.push({ expiresAt: now + durationMs, percent });
  }

  /** Missing-health ratio (0 at full HP, 1 at 0 HP) — scales the Bárbaro's "pouca vida" bonus. */
  private lowHealthBonusRatio(): number {
    return Math.min(1, Math.max(0, 1 - this.health / this.maxHealth));
  }

  effectiveAttackSpeedMultiplier(): number {
    if (this.lowHealthAttackSpeedBonus <= 0) return this.attackSpeedMultiplier;
    return this.attackSpeedMultiplier + this.lowHealthAttackSpeedBonus * this.lowHealthBonusRatio();
  }

  /** Stacked slows (floored at 25% speed) and the low-health bonus, same as entities/Player.effectiveMovementSpeed.
   *  Congelamento's stacks count as slows; frozen solid, the hero doesn't move at all. */
  effectiveMovementSpeed(now: number): number {
    if (this.isFrozen(now)) return 0;
    this.slows = this.slows.filter((slow) => slow.expiresAt > now);
    const slowAmount = this.slows.reduce((total, slow) => total + slow.percent, 0) + this.frostStacksAt(now) * FROST_STACKS.slowPerStack;
    const thawSlow = BLIZZARD_TUNING.thawSlow * Math.max(0, 1 - (now - this.thawStartsAt) / BLIZZARD_TUNING.thawMs);
    const slowMultiplier = Math.min(Math.max(0.25, 1 - slowAmount), 1 - thawSlow);
    const lowHealthBonus = this.lowHealthAttackSpeedBonus > 0 ? this.lowHealthAttackSpeedBonus * this.lowHealthBonusRatio() : 0;
    const haste = now < this.hasteUntil ? this.hastePercent : 0;
    return this.movementSpeed * slowMultiplier * (1 + lowHealthBonus) * (1 + haste);
  }

  isSlowed(now: number): boolean {
    return (now >= this.thawStartsAt && now < this.thawStartsAt + BLIZZARD_TUNING.thawMs) || this.slows.some((slow) => slow.expiresAt > now);
  }

  /** Character passive heal + Bênção Divina. Returns the total the Aura Podre prevented this step. */
  updatePassiveHealing(deltaMs: number, now: number): number {
    if (!this.alive) return 0;
    let prevented = 0;
    if (this.passiveHealAmount > 0 && this.passiveHealIntervalMs > 0) {
      this.passiveHealElapsed += deltaMs;
      while (this.passiveHealElapsed >= this.passiveHealIntervalMs) {
        this.passiveHealElapsed -= this.passiveHealIntervalMs;
        prevented += this.heal(this.passiveHealAmount, now);
      }
    }
    if (this.bonusPassiveHealPerSecond > 0) {
      this.bonusPassiveHealElapsed += deltaMs;
      while (this.bonusPassiveHealElapsed >= 1000) {
        this.bonusPassiveHealElapsed -= 1000;
        prevented += this.heal(this.bonusPassiveHealPerSecond, now);
      }
    }
    return prevented;
  }

  refreshRottenAura(now: number): void {
    this.rottenExpiresAt = now + ROTTEN_AURA_CONFIG.durationMs;
  }

  isRotten(now: number): boolean {
    return now < this.rottenExpiresAt;
  }

  /** Aura Podre damage-over-time: ignores i-frames and armor (only `invincible` stops it). Returns damage dealt. */
  updateRotten(deltaMs: number, now: number): number {
    if (!this.isRotten(now) || !this.alive) {
      this.rottenTickElapsed = 0;
      return 0;
    }
    this.rottenTickElapsed += deltaMs;
    let dealt = 0;
    while (this.rottenTickElapsed >= ROTTEN_AURA_CONFIG.tickMs) {
      this.rottenTickElapsed -= ROTTEN_AURA_CONFIG.tickMs;
      if (this.invincible) continue;
      this.health = Math.max(0, this.health - ROTTEN_AURA_CONFIG.dps);
      this.lastDamagedAt = now;
      dealt += ROTTEN_AURA_CONFIG.dps;
    }
    return dealt;
  }

  addLifeSteal(): void { this.lifeStealPercent += this.lifeStealPercent === 0 ? 0.005 : 0.0025; }
  addMeleeRangeBonus(amount: number): void { this.meleeRangeBonus += amount; }
  addMeleeExtraAttack(): void { this.meleeExtraAttackChance += 0.1; this.meleeExtraAttackMax += 1; }
  unlockWhirlwind(): void { this.whirlwindUnlocked = true; }
  addProjectileExtraCount(): void { this.projectileExtraCount += 1; }
  addProjectileRicochet(): void { this.projectileRicochetChance += 0.1; this.projectileRicochetMax += 1; }
  addProjectileSizeBonus(): void { this.projectileSizeBonus += this.projectileSizeBonus === 0 ? 0.21 : 0.09; }
  addAuraRadiusPercent(): void { this.auraRadiusBonusPercent += 0.06; }
  addAuraDamageBonus(): void { this.auraDamageBonus += 2.38; }
  addAuraTickSpeedBonus(): void { this.auraTickSpeedBonusMs += 100; }
  addMealRegeneration(): void { this.bonusPassiveHealPerSecond += 2; }
  addDivineBlessing(): void { this.bonusPassiveHealPerSecond += 5; }
  addArcaneCurse(): void {
    this.maxHealth = Math.max(1, this.maxHealth - 50);
    this.health = Math.min(this.health, this.maxHealth);
    this.damageMultiplier += 1.5;
  }
}

/** Dead enemies don't vanish instantly in 3D: they spend DYING_MS in 'dying' (no collision, already counted as a
 *  kill) so the renderer can play a death animation, then return to the pool. */
export const ENEMY_DYING_MS = 350;
/** entities/Enemy: every hit freezes the enemy's movement for 200ms. */
export const ENEMY_HIT_STUN_MS = 200;
/** A slipped enemy (banana hit or peel) lies on the ground this long. */
export const ENEMY_SLIP_MS = 1000;

export type EnemyPhase = 'active' | 'dying';
/** calm: grazing at home · startled/fleeing: noticed the hero and runs · angry: hurt, fights · returning: lost
 *  interest, walks home and heals. */
export type NeutralMood = 'calm' | 'startled' | 'fleeing' | 'angry' | 'returning';

export class EnemyState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  radius: number = BODY_RADIUS.enemy;
  phase: EnemyPhase = 'active';
  variantId: EnemyVariantId = 'skeleton';
  health = 0;
  maxHealth = 0;
  movementSpeed = 0;
  contactDamage = 0;
  reward = 0;
  currencyDrops = 1;
  isStatic = false;
  /** Super Esqueleto (and the boss later): shows a health bar, isn't a "common" enemy for the staff execute. */
  isMiniBoss = false;
  hasRottenAura = false;
  /** Troll de Gelo: standing near it builds Congelamento (ICE_TROLL.auraRadius). */
  hasFrostAura = false;
  /** The boss's aura goes quiet while it channels its shield. */
  rottenAuraSuppressed = false;
  /** Display size in game units (the old sprite displaySize) — the renderer scales the model from this. */
  displaySize = 62;
  hitStunUntil = 0;
  lastHitAt = -Infinity;
  phaseEndsAt = 0;
  facingX = 0;
  facingY = 1;
  /** Fabri's banana boomerang: cumulative slow (0..cap), cleared only when the enemy leaves the pool. */
  slowStackPercent = 0;
  /** Fabri's banana peel: no movement until this time. */
  slipUntil = 0;
  /** Zora's Destino Selado: double damage taken, and a burst on death, until this sim time. */
  markedUntil = 0;
  // The heroes' power tiers (core/systems/PowerTierSystem): a bleed, a timed slow, held in place (roots), lifted
  // into the air (no moving, no hitting), fleeing the hero, pulled toward a point, turned to gold on death.
  bleedUntil = 0;
  bleedPerSecond = 0;
  slowUntil = 0;
  slowPercent = 0;
  heldUntil = 0;
  liftedUntil = 0;
  fleeUntil = 0;
  pullUntil = 0;
  pullX = 0;
  pullY = 0;
  gilded = false;
  nextSoulAt = 0;
  /** The Xamã's next snowman, the Troll's next icicle slam. */
  nextCastAt = 0;
  /** A pack wolf's side of the hero (radians; NaN = none, or already there) and when it gives up circling. */
  flankAngle = Number.NaN;
  flankUntil = 0;
  /** Sim time it appeared (the renderer plays a rise-from-the-ground). */
  spawnedAt = -Infinity;
  // Neutral creatures (core/systems/NeutralSystem): their mood, the spot they live around, the group they wake with.
  neutral = false;
  mood: NeutralMood = 'calm';
  homeX = 0;
  homeY = 0;
  /** Neutrals living together (a pack, a herd): hurting one angers them all. -1 = alone. */
  packId = -1;
  /** The horde wolf pack it came in with (0: none). */
  wolfPack = 0;
  /** The "!" jump when a calm neutral notices the hero; it bolts after this. */
  startledUntil = 0;
  /** A neutral digging in before its attack (the renderer shakes and reddens it), and the lane it will charge down
   *  (`windupReach` game units along `windupDirX/Y`; 0 = no lane, it attacks where it stands). */
  windupUntil = 0;
  windupDirX = 0;
  windupDirY = 0;
  windupReach = 0;
  /** A mimic shivering as the hero walks up to it (the renderer shakes it in place). */
  trembleUntil = 0;

  activate(variantId: EnemyVariantId, x: number, y: number, maxHealth: number, now: number): void {
    const base = ALL_ENEMY_VARIANTS[variantId];
    this.variantId = variantId;
    this.phase = 'active';
    this.x = x;
    this.y = y;
    snapPrevious(this);
    this.health = this.maxHealth = maxHealth;
    this.movementSpeed = base.movementSpeed;
    this.contactDamage = base.contactDamage;
    this.reward = base.reward;
    this.currencyDrops = 'currencyDrops' in base ? base.currencyDrops : 1;
    this.isStatic = variantId === 'necromancerWraith' || variantId === 'snowShaman' || variantId === 'hive' || variantId === 'iceBlock';
    this.isMiniBoss = variantId === 'superSkeleton' || variantId === 'iceTroll' || variantId === 'finalBoss' || variantId in MINI_BOSS_VARIANTS;
    this.hasRottenAura = variantId === 'superSkeleton' || variantId === 'finalBoss';
    this.rottenAuraSuppressed = false;
    this.hasFrostAura = variantId === 'iceTroll';
    this.displaySize = ENEMY_DISPLAY_SIZES[variantId];
    this.radius = variantId === 'ancientYeti' ? 48 : variantId === 'iceSerpent' ? 44 : variantId === 'bellringer' ? 32 : variantId === 'finalBoss' ? 58 : variantId === 'templeGuardian' ? 28 : variantId === 'frostKnight' ? 32 : variantId === 'gravedigger' ? 30 : variantId === 'boar' ? 22 : variantId === 'stag' ? 24 : variantId === 'hive' ? 20 : variantId === 'mimic' ? 22 : variantId === 'iceTroll' ? 26 : variantId === 'snowman' ? 14 : variantId === 'iceWolf' ? 16 : variantId === 'iceBlock' ? 24 : BODY_RADIUS.enemy;
    this.hitStunUntil = 0;
    this.lastHitAt = -Infinity;
    this.slowStackPercent = 0;
    this.slipUntil = 0;
    this.markedUntil = 0;
    this.bleedUntil = this.bleedPerSecond = this.slowUntil = this.slowPercent = 0;
    this.heldUntil = this.liftedUntil = this.fleeUntil = this.pullUntil = 0;
    this.gilded = false;
    this.nextSoulAt = now + ('soulCooldownMs' in base ? base.soulCooldownMs : 0);
    this.nextCastAt = now + ('castCooldownMs' in base ? base.castCooldownMs : 0);
    this.spawnedAt = now;
    this.flankAngle = Number.NaN;
    this.flankUntil = 0;
    this.neutral = variantId in NEUTRAL_VARIANTS;
    this.mood = 'calm';
    this.homeX = x;
    this.homeY = y;
    this.packId = -1;
    this.wolfPack = 0;
    this.startledUntil = this.windupUntil = this.windupDirX = this.windupDirY = this.windupReach = this.trembleUntil = 0;
  }

  /** A neutral that hasn't been provoked: no contact damage, and aimed weapons look past it. */
  get calmNeutral(): boolean {
    return this.neutral && this.mood !== 'angry';
  }

  get alive(): boolean {
    return this.phase === 'active';
  }

  /** GameScene.isCommonEnemy — what the staff's execute is allowed to one-shot. */
  get isCommon(): boolean {
    return this.variantId !== 'superSkeleton' && this.variantId !== 'iceTroll' && this.variantId !== 'finalBoss' && !(this.variantId in MINI_BOSS_VARIANTS);
  }

  /** GameScene.enemyRangePadding: the huge boss sprite is easier to reach than its center point suggests. */
  get rangePadding(): number {
    return this.variantId === 'finalBoss' ? this.displaySize * 0.35 : this.variantId in MINI_BOSS_VARIANTS ? this.displaySize * 0.2 : 0;
  }

  /** Rotten Aura reach: half the display size, so it scales with the model. */
  get rottenAuraRadius(): number {
    return this.displaySize / 2;
  }

  get frostAuraRadius(): number {
    return ICE_TROLL.auraRadius;
  }

  /** The banana stack, then any timed slow still running at `now`. */
  effectiveMovementSpeed(now = 0): number {
    const timed = now < this.slowUntil ? this.slowPercent : 0;
    return this.movementSpeed * (1 - this.slowStackPercent) * (1 - timed);
  }

  /** A timed slow; a stronger or longer one replaces it. */
  applySlow(percent: number, ms: number, now: number): void {
    if (now >= this.slowUntil || percent >= this.slowPercent) this.slowPercent = percent;
    this.slowUntil = Math.max(this.slowUntil, now + ms);
  }
}

/** Enemy display sizes (sprite height in world units). */
export const ENEMY_DISPLAY_SIZES: Record<EnemyVariantId, number> = {
  skeleton: 62,
  necromancerWraith: 68,
  apparitionWraith: 68,
  frostSkeleton: 62,
  frostSpirit: 68,
  snowShaman: 70,
  snowman: 44,
  /** Low and long like the boar, a touch taller. */
  iceWolf: 56,
  iceTroll: 104,
  superSkeleton: 92,
  finalBoss: 390,
  gravedigger: 160,
  /** Sized (with its 28-unit body) to walk between the temple's colonnade pillars, 73 units apart. */
  templeGuardian: 150,
  frostKnight: 160,
  iceSerpent: 190,
  bellringer: 170,
  ancientYeti: 210,
  /** Grows to 230 as it drinks the lake (MiniBossSystem). */
  lakeSpirit: 80,
  /** Low and long: about knee-high next to the hero. */
  boar: 58,
  /** Tall on long legs; the stag's antlers add more. */
  stag: 82,
  doe: 70,
  hive: 46,
  /** The same size as the loot chest it imitates. */
  mimic: 52,
  iceBlock: 54
};

export type ProjectileKind = 'bolt' | 'boomerang' | 'banana' | 'thrownSword' | 'arrow' | 'coin' | 'pan' | 'bottle' | 'potion';

/** Kinds that fly out and come back to the hero (the boomerang family and the Espada's thrown swords); every
 *  other kind flies straight and is spent on its last hit. */
export function isReturningKind(kind: ProjectileKind): boolean {
  return kind === 'boomerang' || kind === 'banana' || kind === 'thrownSword';
}

/** One pooled player projectile — covers the Cajado bolt, the (banana) boomerang and the Espada's thrown swords,
 *  with entities/Projectile's out-and-back, per-leg hit sets, ricochet and execute behaviour. */
export class ProjectileState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  radius: number = BODY_RADIUS.bolt;
  kind: ProjectileKind = 'bolt';
  weaponId: WeaponConfig['id'] = 'staff';
  velocityX = 0;
  velocityY = 0;
  speed = 0;
  /** Outbound distance before a boomerang/thrown sword turns back; also the ricochet search radius. */
  range = 0;
  originX = 0;
  originY = 0;
  returning = false;
  damage = 0;
  expiresAt = 0;
  remainingPierces = 0;
  remainingRicochets = 0;
  /** The weapon's own guaranteed ricochets (the Moedas'), spent before the upgrade's chance-based ones. */
  innateRicochets = 0;
  executeToken = 0;
  criticalChance = 0;
  sizeMultiplier = 1;
  /** Thrown sword: out-and-back trips left (including the current one) and the heading to relaunch along. */
  cyclesRemaining = 0;
  launchAngle = 0;
  /** Visual spin, advanced by the sim so it stays deterministic and freezes with pause. */
  spin = 0;
  /** Grimbo's Moeda de Ouro: this coin bursts on its first hit. */
  golden = false;
  /** Fabri's Macaco Furioso: circling the hero until this sim time (0 = flying normally). */
  orbitUntil = 0;
  orbitAngle = 0;
  orbitHitsResetAt = 0;
  readonly outboundHits = new Set<EnemyState>();
  readonly returnHits = new Set<EnemyState>();

  get isReturning(): boolean {
    return isReturningKind(this.kind) && this.returning;
  }

  /** Each enemy can be hit once per leg (outbound / return) — false if this leg already struck it. */
  claimHit(enemy: EnemyState): boolean {
    const hits = this.returning ? this.returnHits : this.outboundHits;
    if (hits.has(enemy)) return false;
    hits.add(enemy);
    return true;
  }

  hasHit(enemy: EnemyState): boolean {
    return this.outboundHits.has(enemy) || this.returnHits.has(enemy);
  }

  aimAt(angle: number): void {
    this.velocityX = Math.cos(angle) * this.speed;
    this.velocityY = Math.sin(angle) * this.speed;
  }
}

/** Necromante's slowing skull. */
export class SoulState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  readonly radius = BODY_RADIUS.soul;
  velocityX = 0;
  velocityY = 0;
  expiresAt = 0;
}

export const SOUL_CONFIG = { damage: 17, slowPercent: 0.2, slowDurationMs: 5000, speed: 260, lifetimeMs: 6500 } as const;

export type PickupKind = 'gem' | 'chest' | 'potion' | 'honey';

/** Gems (currency), loot chests and health potions all drift to the player inside pickupRange. */
export class PickupState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  radius: number = BODY_RADIUS.gem;
  kind: PickupKind = 'gem';
  value = 0;
  /** Flies to the hero from anywhere (Grimbo's Lucro Rápido). */
  magnet = false;
}

/** Fabri's banana peel hazard. */
export class PeelState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  readonly radius = BODY_RADIUS.peel;
  expiresAt = 0;
}
