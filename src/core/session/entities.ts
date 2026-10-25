import { ENEMY_VARIANTS, PLAYER_CONFIG, ROTTEN_AURA_CONFIG } from '../../config/balance';
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
export const BODY_RADIUS = { player: 18, enemy: 18, bolt: 7, boomerang: 17, thrownSword: 20, soul: 13, gem: 8, peel: 19, chest: 21, potion: 14 } as const;

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

  /** Stacked slows (floored at 25% speed) and the low-health bonus, same as entities/Player.effectiveMovementSpeed. */
  effectiveMovementSpeed(now: number): number {
    this.slows = this.slows.filter((slow) => slow.expiresAt > now);
    const slowAmount = this.slows.reduce((total, slow) => total + slow.percent, 0);
    const slowMultiplier = Math.max(0.25, 1 - slowAmount);
    const lowHealthBonus = this.lowHealthAttackSpeedBonus > 0 ? this.lowHealthAttackSpeedBonus * this.lowHealthBonusRatio() : 0;
    return this.movementSpeed * slowMultiplier * (1 + lowHealthBonus);
  }

  isSlowed(now: number): boolean {
    return this.slows.some((slow) => slow.expiresAt > now);
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
  addAuraDamageBonus(): void { this.auraDamageBonus += 1.7; }
  addAuraTickSpeedBonus(): void { this.auraTickSpeedBonusMs += 100; }
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

export type EnemyPhase = 'active' | 'dying';

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
  nextSoulAt = 0;

  activate(variantId: EnemyVariantId, x: number, y: number, maxHealth: number, now: number): void {
    const base = ENEMY_VARIANTS[variantId];
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
    this.isStatic = variantId === 'necromancerWraith';
    this.isMiniBoss = variantId === 'superSkeleton' || variantId === 'finalBoss';
    this.hasRottenAura = variantId === 'superSkeleton' || variantId === 'finalBoss';
    this.rottenAuraSuppressed = false;
    this.displaySize = ENEMY_DISPLAY_SIZES[variantId];
    this.radius = variantId === 'finalBoss' ? 58 : BODY_RADIUS.enemy;
    this.hitStunUntil = 0;
    this.lastHitAt = -Infinity;
    this.slowStackPercent = 0;
    this.slipUntil = 0;
    this.nextSoulAt = now + ('soulCooldownMs' in base ? base.soulCooldownMs : 0);
  }

  get alive(): boolean {
    return this.phase === 'active';
  }

  /** GameScene.isCommonEnemy — what the staff's execute is allowed to one-shot. */
  get isCommon(): boolean {
    return this.variantId !== 'superSkeleton' && this.variantId !== 'finalBoss';
  }

  /** GameScene.enemyRangePadding: the huge boss sprite is easier to reach than its center point suggests. */
  get rangePadding(): number {
    return this.variantId === 'finalBoss' ? this.displaySize * 0.35 : 0;
  }

  /** Rotten Aura reach: half the display size, so it scales with the model. */
  get rottenAuraRadius(): number {
    return this.displaySize / 2;
  }

  effectiveMovementSpeed(): number {
    return this.movementSpeed * (1 - this.slowStackPercent);
  }
}

/** Same display sizes the Phaser build uses (EnemySpawnSystem VARIANT_DISPLAY_OVERRIDES / BossSystem). */
export const ENEMY_DISPLAY_SIZES: Record<EnemyVariantId, number> = {
  skeleton: 62,
  necromancerWraith: 68,
  apparitionWraith: 68,
  superSkeleton: 92,
  finalBoss: 390
};

export type ProjectileKind = 'bolt' | 'boomerang' | 'banana' | 'thrownSword';

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
  executeToken = 0;
  criticalChance = 0;
  sizeMultiplier = 1;
  /** Thrown sword: out-and-back trips left (including the current one) and the heading to relaunch along. */
  cyclesRemaining = 0;
  launchAngle = 0;
  /** Visual spin, advanced by the sim so it stays deterministic and freezes with pause. */
  spin = 0;
  readonly outboundHits = new Set<EnemyState>();
  readonly returnHits = new Set<EnemyState>();

  get isReturning(): boolean {
    return this.kind !== 'bolt' && this.returning;
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

export type PickupKind = 'gem' | 'chest' | 'potion';

/** Gems (currency), loot chests and health potions all drift to the player inside pickupRange. */
export class PickupState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  radius: number = BODY_RADIUS.gem;
  kind: PickupKind = 'gem';
  value = 0;
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
