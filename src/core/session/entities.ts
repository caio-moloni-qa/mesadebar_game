import { ENEMY_VARIANTS, PLAYER_CONFIG } from '../../config/balance';
import { CharacterConfig } from '../../config/characters';
import { EnemyVariantId } from '../systems/EnemySpawnScheduler';

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

/** Collision radii in game units, matching the Arcade setCircle bodies they replace (Player/Enemy 18, bolt 6, gem 8). */
export const BODY_RADIUS = { player: 18, enemy: 18, projectile: 6, gem: 8 } as const;

export class PlayerState implements Body {
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

  constructor(character: CharacterConfig) {
    this.health = this.maxHealth = character.maxHealth;
    this.movementSpeed = character.movementSpeed;
    this.damageMultiplier = character.damageMultiplier;
    this.attackSpeedMultiplier = character.attackSpeedMultiplier;
    this.pickupRange = character.pickupRange;
    this.armor = character.armor;
  }

  /** Same rules as entities/Player.damage: blocked during i-frames, armor reduces each hit but never below 1. */
  damage(amount: number, now: number): number {
    if (this.invincible || now < this.invulnerableUntil) return 0;
    const dealt = Math.max(1, amount - this.armor);
    this.health = Math.max(0, this.health - dealt);
    this.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
    this.lastDamagedAt = now;
    return dealt;
  }

  get alive(): boolean {
    return this.health > 0;
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
  /** Display size in game units (the old sprite displaySize) — the renderer scales the model from this. */
  displaySize = 62;
  hitStunUntil = 0;
  lastHitAt = -Infinity;
  phaseEndsAt = 0;
  facingX = 0;
  facingY = 1;

  activate(variantId: EnemyVariantId, x: number, y: number, maxHealth: number): void {
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
    this.displaySize = ENEMY_DISPLAY_SIZES[variantId];
    this.radius = BODY_RADIUS.enemy;
    this.hitStunUntil = 0;
    this.lastHitAt = -Infinity;
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

export class ProjectileState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  readonly radius = BODY_RADIUS.projectile;
  velocityX = 0;
  velocityY = 0;
  damage = 0;
  expiresAt = 0;
}

export class GemState implements Body {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  readonly radius = BODY_RADIUS.gem;
  value = 0;
}
