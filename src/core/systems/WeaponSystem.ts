import { WEAPON_CONFIG } from '../../config/balance';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { WORLD_SIZE } from '../../config/world';
import { EventBus } from '../EventBus';
import { Pool } from '../Pool';
import { SimClock } from '../SimClock';
import { Rng, Vec2, degToRad, pickOne } from '../math';
import { BODY_RADIUS, EnemyState, PlayerState, ProjectileKind, ProjectileState, snapPrevious } from '../session/entities';

/** Same tuning as GameScene (see its constant block for the design notes behind each number). */
export const WEAPON_TUNING = {
  whipChainMaxTargets: 4,
  whipChainRadius: 140,
  whipBuffTriggerCount: 3,
  whipBuffAoeRadius: 80,
  auraDamageTakenBonusCap: 15,
  bananaSlowCap: 0.5,
  thrownSwordDirections: 12,
  thrownSwordCycles: 2,
  thrownSwordSpeed: 520,
  thrownSwordSpawnOffset: 42,
  staffExplosionRadius: 50,
  /** Exclusive buffs unlock at this many upgrades (+ affinity with the weapon's family). */
  exclusiveUpgradeThreshold: 5,
  meleeExtraAttackDelayMs: 110,
  whirlwindIntervalMs: 5000,
  whirlwindStaggerMs: 70,
  projectileSpreadDegrees: 30,
  boomerangCatchRadius: 26,
  thrownSwordCatchRadius: 30,
  ricochetMinLifetimeMs: 650
} as const;

/** One weapon in the loadout. `upgradeCount` is shared progress: every upgrade picked bumps every owned weapon. */
export interface ActiveWeapon {
  config: WeaponConfig;
  upgradeCount: number;
  lastAttackAt: number;
  lastWhirlwindAt: number;
  thrownSwordReadyAt: number;
  thrownSwordVolleyActive: boolean;
  staffAttacksSinceExecute: number;
  staffExecuteToken: number;
  /** Relíquia Divina streak: +0.25% per connecting tick, reset the moment the player takes damage. */
  auraRampPercent: number;
  auraTotalDamageDealt: number;
  auraRampSyncedAt: number;
}

export function createActiveWeapon(config: WeaponConfig): ActiveWeapon {
  // -Infinity: the first attack is available immediately (Phaser's scene clock is already far from 0 at run start).
  return { config, upgradeCount: 0, lastAttackAt: -Infinity, lastWhirlwindAt: -Infinity, thrownSwordReadyAt: -Infinity, thrownSwordVolleyActive: false, staffAttacksSinceExecute: 0, staffExecuteToken: 0, auraRampPercent: 0, auraTotalDamageDealt: 0, auraRampSyncedAt: -Infinity };
}

export interface WeaponEvents extends Record<string, unknown> {
  'melee-swing': { x: number; y: number; dirX: number; dirY: number; range: number; coneAngle: number; weaponId: WeaponConfig['id'] };
  'aura-pulse': { radius: number; multiStrike: boolean; buffUnlocked: boolean };
  'whip-burst': { radius: number };
  'staff-explosion': { x: number; y: number; radius: number; index: number };
  'projectile-fired': { x: number; y: number; kind: ProjectileKind };
}

/** What WeaponSystem needs from the session — kept narrow (same Host pattern as the other systems). */
export interface WeaponHost {
  readonly player: PlayerState;
  readonly clock: SimClock;
  readonly rng: Rng;
  readonly characterId: CharacterId;
  readonly projectiles: Pool<ProjectileState>;
  /** Only emits — any bus whose event map includes WeaponEvents (the session's) fits. */
  readonly events: Pick<EventBus<WeaponEvents>, 'emit'>;
  hasAffinity(weapon: WeaponConfig): boolean;
  isOver(): boolean;
  /** Nearest living enemy to `from` within `range` (+ each enemy's rangePadding), skipping `exclude`. */
  nearestEnemy(from: Vec2, range: number, exclude?: (enemy: EnemyState) => boolean): EnemyState | null;
  /** Living enemies whose center is within `radius` (+ rangePadding) of `from`. */
  enemiesWithin(from: Vec2, radius: number): EnemyState[];
  /** Living enemies overlapping a circle (broad phase + exact test) — projectile hits. */
  enemiesOverlapping(x: number, y: number, radius: number): EnemyState[];
  damageEnemy(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id'], critical?: boolean): void;
  /** Fabri's banana hit side effects (slow stack + chance to drop a peel). */
  onBananaHit(enemy: EnemyState): void;
}

/** All player weapons, ported from GameScene's attack code: Cajado (projectiles + execute/explosion exclusive),
 *  Espada/Chicote (cone, extra attacks, Redemoinho, thrown-sword volley, whip chain + burst), Bumerangue (out and
 *  back, crits, Fabri's banana transform) and Relíquia Divina (aura ticks, streak ramp, multi-strike). Weapon
 *  exclusives keep the repo's guardrail: upgradeCount >= 5 AND affinity with the weapon's family. */
export class WeaponSystem {
  readonly weapons: ActiveWeapon[] = [];
  private readonly consumedExecuteTokens = new Set<number>();

  constructor(private readonly host: WeaponHost) {}

  add(config: WeaponConfig): ActiveWeapon {
    const weapon = createActiveWeapon(config);
    this.weapons.push(weapon);
    return weapon;
  }

  get primary(): ActiveWeapon {
    return this.weapons[0];
  }

  has(id: WeaponConfig['id']): boolean {
    return this.weapons.some((weapon) => weapon.config.id === id);
  }

  /** Called after every upgrade pick (level-up, starting screen, chest) — shared progress across the loadout. */
  countUpgrade(): void {
    this.weapons.forEach((weapon) => { weapon.upgradeCount += 1; });
  }

  update(deltaMs: number): void {
    this.weapons.forEach((weapon) => this.attackWithWeapon(weapon));
    this.weapons.filter((weapon) => weapon.config.type === 'cone').forEach((weapon) => this.updateWhirlwind(weapon));
    this.updateThrownSwordVolley();
    this.updateProjectiles(deltaMs);
  }

  private exclusiveUnlocked(weapon: ActiveWeapon): boolean {
    return weapon.upgradeCount >= WEAPON_TUNING.exclusiveUpgradeThreshold && this.host.hasAffinity(weapon.config);
  }

  attackRange(weapon: ActiveWeapon): number {
    return weapon.config.range + (weapon.config.type === 'cone' ? this.host.player.meleeRangeBonus : 0);
  }

  private attackWithWeapon(weapon: ActiveWeapon): void {
    const { player, clock } = this.host;
    const now = clock.now;
    const attackSpeed = player.effectiveAttackSpeedMultiplier();
    if (weapon.config.type === 'aura') {
      const cooldown = Math.max(200, this.auraStats(weapon).cooldown - player.auraTickSpeedBonusMs);
      if (now < weapon.lastAttackAt + cooldown / attackSpeed) return;
      weapon.lastAttackAt = now;
      this.performAuraTick(weapon);
      return;
    }
    if (now < weapon.lastAttackAt + weapon.config.cooldown / attackSpeed) return;
    const enemy = this.host.nearestEnemy(player, this.attackRange(weapon));
    if (!enemy) return;
    if (weapon.config.type === 'cone') {
      weapon.lastAttackAt = now;
      const direction = normalize(enemy.x - player.x, enemy.y - player.y);
      this.performMeleeAttack(weapon, direction);
      this.queueMeleeExtraAttacks(weapon, direction);
      return;
    }
    const baseAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    const executeToken = this.staffExecuteTokenForAttack(weapon);
    const isBoomerang = weapon.config.type === 'boomerang';
    const kind: ProjectileKind = isBoomerang ? (this.isBananaTransformActive(weapon) ? 'banana' : 'boomerang') : 'bolt';
    let launched = false;
    projectileAngles(baseAngle, 1 + player.projectileExtraCount).forEach((angle) => {
      launched = this.launchProjectile(weapon, angle, kind, executeToken) || launched;
    });
    if (launched) weapon.lastAttackAt = now;
  }

  // ── Melee (Espada / Chicote) ──────────────────────────────────────────────────────────────────────────────

  private performMeleeAttack(weapon: ActiveWeapon, direction: Vec2): EnemyState[] {
    const { player } = this.host;
    const minDot = Math.cos(degToRad((weapon.config.coneAngle ?? 90) / 2));
    const range = this.attackRange(weapon);
    const hits = this.host.enemiesWithin(player, range).filter((enemy) => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const length = Math.hypot(dx, dy);
      return length > 0 && (direction.x * dx + direction.y * dy) / length >= minDot;
    });
    hits.forEach((enemy) => this.host.damageEnemy(enemy, weapon.config.baseDamage * player.damageMultiplier, weapon.config.id));
    this.host.events.emit('melee-swing', { x: player.x, y: player.y, dirX: direction.x, dirY: direction.y, range, coneAngle: weapon.config.coneAngle ?? 90, weaponId: weapon.config.id });
    if (weapon.config.id === 'whip' && hits.length > 0) this.applyWhipChainAndBuff(weapon, hits);
    return hits;
  }

  /** Each hit chains to one more nearby enemy (which chains onward too) up to the target cap; enough connections
   *  with the exclusive unlocked fire the AoE burst. */
  private applyWhipChainAndBuff(weapon: ActiveWeapon, initialHits: EnemyState[]): void {
    const hit = new Set(initialHits);
    const queue = [...initialHits];
    const damage = weapon.config.baseDamage * this.host.player.damageMultiplier;
    while (queue.length > 0 && hit.size < WEAPON_TUNING.whipChainMaxTargets) {
      const source = queue.shift()!;
      const next = this.host.nearestEnemy(source, WEAPON_TUNING.whipChainRadius, (enemy) => hit.has(enemy));
      if (!next) continue;
      this.host.damageEnemy(next, damage, weapon.config.id);
      const direction = normalize(next.x - source.x, next.y - source.y);
      this.host.events.emit('melee-swing', { x: next.x, y: next.y, dirX: direction.x, dirY: direction.y, range: 60, coneAngle: weapon.config.coneAngle ?? 140, weaponId: weapon.config.id });
      hit.add(next);
      queue.push(next);
    }
    if (this.exclusiveUnlocked(weapon) && hit.size >= WEAPON_TUNING.whipBuffTriggerCount) this.triggerWhipAoeBurst(weapon);
  }

  private triggerWhipAoeBurst(weapon: ActiveWeapon): void {
    const { player } = this.host;
    const damage = weapon.config.baseDamage * player.damageMultiplier;
    const inRange = this.host.enemiesWithin(player, WEAPON_TUNING.whipBuffAoeRadius);
    inRange.forEach((enemy) => this.host.damageEnemy(enemy, damage, weapon.config.id));
    const alive = inRange.filter((enemy) => enemy.alive);
    if (alive.length > 0) {
      const bonus = pickOne(this.host.rng, alive);
      this.host.damageEnemy(bonus, damage, weapon.config.id);
    }
    this.host.events.emit('whip-burst', { radius: WEAPON_TUNING.whipBuffAoeRadius });
  }

  private queueMeleeExtraAttacks(weapon: ActiveWeapon, direction: Vec2): void {
    const { player, rng, clock } = this.host;
    if (player.meleeExtraAttackMax <= 0 || rng() >= player.meleeExtraAttackChance) return;
    for (let index = 1; index <= player.meleeExtraAttackMax; index += 1) {
      clock.delayedCall(index * WEAPON_TUNING.meleeExtraAttackDelayMs, () => {
        if (this.host.isOver()) return;
        const enemy = this.host.nearestEnemy(player, this.attackRange(weapon));
        this.performMeleeAttack(weapon, enemy ? normalize(enemy.x - player.x, enemy.y - player.y) : direction);
      });
    }
  }

  private updateWhirlwind(weapon: ActiveWeapon): void {
    const { player, clock } = this.host;
    if (!player.whirlwindUnlocked || clock.now < weapon.lastWhirlwindAt + WEAPON_TUNING.whirlwindIntervalMs) return;
    if (!this.host.nearestEnemy(player, this.attackRange(weapon))) return;
    weapon.lastWhirlwindAt = clock.now;
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }].forEach((direction, index) => {
      clock.delayedCall(index * WEAPON_TUNING.whirlwindStaggerMs, () => {
        if (!this.host.isOver()) this.performMeleeAttack(weapon, direction);
      });
    });
  }

  /** Espada exclusive: a ring of swords flies to the arena edge and back (twice), then a cooldown that shrinks
   *  with further upgrades. */
  private updateThrownSwordVolley(): void {
    const sword = this.weapons.find((weapon) => weapon.config.id === 'sword');
    if (!sword) return;
    if (sword.thrownSwordVolleyActive) {
      let flying = 0;
      this.host.projectiles.forEachActive((projectile) => { if (projectile.kind === 'thrownSword') flying += 1; });
      if (flying === 0) {
        sword.thrownSwordVolleyActive = false;
        sword.thrownSwordReadyAt = this.host.clock.now + thrownSwordCooldownMs(sword.upgradeCount);
      }
      return;
    }
    if (!this.exclusiveUnlocked(sword) || this.host.clock.now < sword.thrownSwordReadyAt) return;
    if (!this.host.nearestEnemy(this.host.player, WORLD_SIZE)) return;
    sword.thrownSwordVolleyActive = true;
    for (let index = 0; index < WEAPON_TUNING.thrownSwordDirections; index += 1) {
      this.launchThrownSword(sword, (Math.PI * 2 * index) / WEAPON_TUNING.thrownSwordDirections);
    }
  }

  private launchThrownSword(weapon: ActiveWeapon, angle: number): void {
    const projectile = this.host.projectiles.acquire();
    if (!projectile) return;
    const { player, clock } = this.host;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const start = { x: player.x + direction.x * WEAPON_TUNING.thrownSwordSpawnOffset, y: player.y + direction.y * WEAPON_TUNING.thrownSwordSpawnOffset };
    const distance = distanceToWorldEdge(start, direction);
    const speed = WEAPON_TUNING.thrownSwordSpeed;
    resetProjectile(projectile, 'thrownSword', weapon.config.id, start.x, start.y, speed, distance);
    projectile.radius = BODY_RADIUS.thrownSword;
    projectile.damage = weapon.config.baseDamage * player.damageMultiplier;
    projectile.remainingPierces = Number.POSITIVE_INFINITY;
    projectile.cyclesRemaining = WEAPON_TUNING.thrownSwordCycles;
    projectile.launchAngle = angle;
    // Every out-and-back leg must fit before expiry, or the sword would vanish mid-flight.
    projectile.expiresAt = clock.now + Math.ceil(((distance * 2 * WEAPON_TUNING.thrownSwordCycles) / speed) * 1000) + 600;
    projectile.aimAt(angle);
  }

  // ── Projectiles (Cajado / Bumerangue) ──────────────────────────────────────────────────────────────────────

  /** Fabri's transform: same "upgrades + affinity" gate as every other weapon exclusive. */
  private isBananaTransformActive(weapon: ActiveWeapon): boolean {
    const transform = CHARACTERS[this.host.characterId].boomerangBananaTransform;
    if (!transform || weapon.config.id !== 'boomerang') return false;
    return weapon.upgradeCount >= transform.upgradeThreshold && this.host.hasAffinity(weapon.config);
  }

  /** Cajado exclusive: every 4th attack carries an execute token (one-shots the first common enemy it hits, once
   *  per token across all its projectiles) and explodes on hit. */
  private staffExecuteTokenForAttack(weapon: ActiveWeapon): number {
    if (weapon.config.id !== 'staff' || !this.exclusiveUnlocked(weapon)) return 0;
    if (weapon.staffAttacksSinceExecute >= 3) {
      weapon.staffAttacksSinceExecute = 0;
      weapon.staffExecuteToken += 1;
      return weapon.staffExecuteToken;
    }
    weapon.staffAttacksSinceExecute += 1;
    return 0;
  }

  private launchProjectile(weapon: ActiveWeapon, angle: number, kind: ProjectileKind, executeToken: number): boolean {
    const projectile = this.host.projectiles.acquire();
    if (!projectile) return false;
    const { player, clock } = this.host;
    const speed = weapon.config.projectileSpeed ?? WEAPON_CONFIG.projectileSpeed;
    resetProjectile(projectile, kind, weapon.config.id, player.x, player.y, speed, weapon.config.range);
    projectile.sizeMultiplier = 1 + player.projectileSizeBonus;
    projectile.radius = (kind === 'bolt' ? BODY_RADIUS.bolt : BODY_RADIUS.boomerang) * projectile.sizeMultiplier;
    projectile.damage = weapon.config.baseDamage * player.damageMultiplier;
    projectile.expiresAt = clock.now + (weapon.config.projectileLifetime ?? WEAPON_CONFIG.lifetimeMs);
    projectile.remainingPierces = WEAPON_CONFIG.pierces;
    projectile.remainingRicochets = player.projectileRicochetMax;
    projectile.executeToken = executeToken;
    projectile.criticalChance = kind !== 'bolt' && this.exclusiveUnlocked(weapon) ? 0.15 + weapon.upgradeCount * 0.025 : 0;
    projectile.aimAt(angle);
    this.host.events.emit('projectile-fired', { x: projectile.x, y: projectile.y, kind });
    return true;
  }

  private updateProjectiles(deltaMs: number): void {
    const now = this.host.clock.now;
    const spent: ProjectileState[] = [];
    this.host.projectiles.forEachActive((projectile) => {
      if (projectile.kind !== 'bolt') {
        if (!this.steerReturning(projectile)) { spent.push(projectile); return; }
        projectile.spin += (projectile.returning ? -1 : 1) * (projectile.kind === 'thrownSword' ? 0.28 : 0.2) * (deltaMs / (1000 / 60));
      }
      projectile.x += (projectile.velocityX * deltaMs) / 1000;
      projectile.y += (projectile.velocityY * deltaMs) / 1000;
      if (now >= projectile.expiresAt) { spent.push(projectile); return; }
      for (const enemy of this.host.enemiesOverlapping(projectile.x, projectile.y, projectile.radius)) {
        if (!projectile.claimHit(enemy)) continue;
        if (this.resolveProjectileHit(projectile, enemy)) { spent.push(projectile); return; }
      }
    });
    spent.forEach((projectile) => this.host.projectiles.release(projectile));
  }

  /** Boomerang / thrown sword flight: turn back at max range, home on the player, get caught (or relaunch the
   *  thrown sword for its next trip). Returns false once the projectile should disappear. */
  private steerReturning(projectile: ProjectileState): boolean {
    const { player } = this.host;
    if (!projectile.returning && Math.hypot(projectile.x - projectile.originX, projectile.y - projectile.originY) >= projectile.range) projectile.returning = true;
    if (!projectile.returning) return true;
    projectile.aimAt(Math.atan2(player.y - projectile.y, player.x - projectile.x));
    const catchRadius = projectile.kind === 'thrownSword' ? WEAPON_TUNING.thrownSwordCatchRadius : WEAPON_TUNING.boomerangCatchRadius;
    if (Math.hypot(player.x - projectile.x, player.y - projectile.y) >= catchRadius) return true;
    if (projectile.kind !== 'thrownSword') return false;
    projectile.cyclesRemaining -= 1;
    if (projectile.cyclesRemaining <= 0) return false;
    projectile.returning = false;
    projectile.originX = projectile.x;
    projectile.originY = projectile.y;
    projectile.outboundHits.clear();
    projectile.returnHits.clear();
    projectile.aimAt(projectile.launchAngle);
    return true;
  }

  /** Applies one hit; returns true when the projectile is used up. */
  private resolveProjectileHit(projectile: ProjectileState, enemy: EnemyState): boolean {
    const { amount, critical } = this.projectileDamage(projectile, enemy);
    this.host.damageEnemy(enemy, amount, projectile.weaponId, critical);
    if (projectile.kind === 'banana') this.host.onBananaHit(enemy);
    this.triggerStaffExplosion(projectile, enemy);
    if (this.tryRicochet(projectile, enemy)) return false;
    if (projectile.kind === 'bolt') {
      if (projectile.remainingPierces <= 0) return true;
      projectile.remainingPierces -= 1;
    }
    return false;
  }

  private projectileDamage(projectile: ProjectileState, enemy: EnemyState): { amount: number; critical: boolean } {
    if (projectile.executeToken > 0 && enemy.isCommon && !this.consumedExecuteTokens.has(projectile.executeToken)) {
      this.consumedExecuteTokens.add(projectile.executeToken);
      return { amount: enemy.health, critical: false };
    }
    if (projectile.criticalChance > 0 && this.host.rng() < projectile.criticalChance) return { amount: projectile.damage * 2, critical: true };
    return { amount: projectile.damage, critical: false };
  }

  private triggerStaffExplosion(projectile: ProjectileState, hitEnemy: EnemyState): void {
    if (projectile.executeToken <= 0) return;
    const upgradeCount = this.weapons.find((weapon) => weapon.config.id === projectile.weaponId)?.upgradeCount ?? 0;
    const explosions = 1 + Math.max(0, upgradeCount - WEAPON_TUNING.exclusiveUpgradeThreshold);
    const radius = WEAPON_TUNING.staffExplosionRadius;
    for (let index = 0; index < explosions; index += 1) {
      this.host.events.emit('staff-explosion', { x: hitEnemy.x, y: hitEnemy.y, radius, index });
      this.host.enemiesOverlapping(hitEnemy.x, hitEnemy.y, radius)
        .filter((enemy) => enemy !== hitEnemy && Math.hypot(enemy.x - hitEnemy.x, enemy.y - hitEnemy.y) <= radius)
        .forEach((enemy) => this.host.damageEnemy(enemy, projectile.damage, projectile.weaponId));
    }
  }

  private tryRicochet(projectile: ProjectileState, hitEnemy: EnemyState): boolean {
    if (projectile.isReturning) return false;
    if (projectile.remainingRicochets <= 0 || this.host.rng() >= this.host.player.projectileRicochetChance) return false;
    const target = this.host.nearestEnemy(projectile, projectile.range, (enemy) => enemy === hitEnemy || projectile.hasHit(enemy));
    if (!target) return false;
    projectile.remainingRicochets -= 1;
    projectile.returning = false;
    // Boomerangs keep their original launch point so the return leg still measures from the hero's throw.
    if (projectile.kind === 'bolt') {
      projectile.originX = projectile.x;
      projectile.originY = projectile.y;
    }
    projectile.expiresAt = Math.max(projectile.expiresAt, this.host.clock.now + WEAPON_TUNING.ricochetMinLifetimeMs);
    projectile.aimAt(Math.atan2(target.y - projectile.y, target.x - projectile.x));
    return true;
  }

  // ── Aura (Relíquia Divina) ─────────────────────────────────────────────────────────────────────────────────

  /** "Transforma amuletos em relíquias": Relíquia's own base numbers replace the amulet's, for any source. */
  private auraStats(weapon: ActiveWeapon): { baseDamage: number; cooldown: number; range: number } {
    return CHARACTERS[this.host.characterId].auraWeaponOverrides ?? { baseDamage: weapon.config.baseDamage, cooldown: weapon.config.cooldown, range: weapon.config.range };
  }

  auraRadius(weapon: ActiveWeapon): number {
    return this.auraStats(weapon).range * (1 + this.host.player.auraRadiusBonusPercent) * (this.exclusiveUnlocked(weapon) ? 1.5 : 1);
  }

  private performAuraTick(weapon: ActiveWeapon): void {
    const { player, rng } = this.host;
    if (weapon.auraRampSyncedAt !== player.lastDamagedAt) {
      weapon.auraRampPercent = 0;
      weapon.auraTotalDamageDealt = 0;
      weapon.auraRampSyncedAt = player.lastDamagedAt;
    }
    const stats = this.auraStats(weapon);
    const buffUnlocked = this.exclusiveUnlocked(weapon);
    const radius = this.auraRadius(weapon);
    const multiStrike = buffUnlocked && rng() < 0.3 + Math.max(0, weapon.upgradeCount - WEAPON_TUNING.exclusiveUpgradeThreshold) * 0.035;
    const damage = (stats.baseDamage + player.auraDamageBonus) * player.damageMultiplier * (1 + weapon.auraRampPercent) * (multiStrike ? 2 : 1);
    const targets = this.host.enemiesWithin(player, radius);
    targets.forEach((enemy) => this.host.damageEnemy(enemy, damage, weapon.config.id));
    if (targets.length > 0) {
      weapon.auraRampPercent += 0.0025;
      weapon.auraTotalDamageDealt += damage;
      player.auraDamageTakenBonus = Math.min(weapon.auraTotalDamageDealt * 0.015, WEAPON_TUNING.auraDamageTakenBonusCap);
    }
    this.host.events.emit('aura-pulse', { radius, multiStrike, buffUnlocked });
  }
}

export function thrownSwordCooldownMs(upgradeCount: number): number {
  return Math.max(1000, 10000 - Math.max(0, upgradeCount - WEAPON_TUNING.exclusiveUpgradeThreshold) * 1000);
}

/** Base angle first, then alternating ±30° steps — Benção Arcana's fan of extra projectiles. */
export function projectileAngles(baseAngle: number, count: number): number[] {
  const spread = degToRad(WEAPON_TUNING.projectileSpreadDegrees);
  const angles = [baseAngle];
  for (let step = 1; angles.length < count; step += 1) {
    angles.push(baseAngle - spread * step);
    if (angles.length < count) angles.push(baseAngle + spread * step);
  }
  return angles;
}

function distanceToWorldEdge(start: Vec2, direction: Vec2): number {
  const candidates: number[] = [];
  if (direction.x > 0) candidates.push((WORLD_SIZE - start.x) / direction.x);
  if (direction.x < 0) candidates.push(-start.x / direction.x);
  if (direction.y > 0) candidates.push((WORLD_SIZE - start.y) / direction.y);
  if (direction.y < 0) candidates.push(-start.y / direction.y);
  const positive = candidates.filter((candidate) => candidate > 0);
  return positive.length > 0 ? Math.min(...positive) : 0;
}

function normalize(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function resetProjectile(projectile: ProjectileState, kind: ProjectileKind, weaponId: WeaponConfig['id'], x: number, y: number, speed: number, range: number): void {
  projectile.kind = kind;
  projectile.weaponId = weaponId;
  projectile.x = x;
  projectile.y = y;
  snapPrevious(projectile);
  projectile.originX = x;
  projectile.originY = y;
  projectile.speed = speed;
  projectile.range = range;
  projectile.returning = false;
  projectile.remainingPierces = 0;
  projectile.remainingRicochets = 0;
  projectile.executeToken = 0;
  projectile.criticalChance = 0;
  projectile.sizeMultiplier = 1;
  projectile.cyclesRemaining = 0;
  projectile.spin = 0;
  projectile.outboundHits.clear();
  projectile.returnHits.clear();
}
