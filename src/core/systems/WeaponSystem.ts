import { WEAPON_CONFIG } from '../../config/balance';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { EventBus } from '../EventBus';
import { Pool } from '../Pool';
import { SimClock } from '../SimClock';
import { Rng, Vec2, degToRad, pickOne } from '../math';
import { BODY_RADIUS, EnemyState, PlayerState, ProjectileKind, ProjectileState, isReturningKind, snapPrevious } from '../session/entities';

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
  ricochetMinLifetimeMs: 650,
  /** Martelo de Forja: the shockwave lands this far along the swing, this wide, for this share of the damage. */
  hammerQuakeReach: 0.75,
  hammerQuakeRadius: 70,
  hammerQuakeDamage: 0.5,
  /** Mochila de Tralhas: the pan knocks down, the bottle bursts, the potion heals the thrower (share of max). */
  panStunMs: 900,
  bottleBurstRadius: 65,
  bottleBurstDamage: 0.8,
  potionHeal: 0.03,
  /** Bola de Cristal: orbs (2, +1 every 3 upgrades, up to 5) circle at the weapon's range, each hitting an enemy
   *  at most once per the weapon's cooldown. */
  crystalOrbs: 2,
  crystalMaxOrbs: 5,
  crystalOrbRadius: 22,
  crystalSpin: 2.6,
  /** Lyra's Olho de Falcão: extra crit chance on targets this far away. */
  falconEyeDistance: 300,
  falconEyeCrit: 0.25,
  /** Fabri's Macaco Furioso: the circling boomerangs' reach and turn rate, and how often each can hit an enemy again. */
  orbitRadius: 95,
  orbitSpin: 7,
  orbitRehitMs: 350,
  /** Sergio's Combo do Mercador: the gap between the three throws. */
  packComboGapMs: 120
} as const;

/** The heroes' power tiers, as far as the weapons go (core/systems/PowerTierSystem fills this in). */
export interface WeaponPowers {
  /** More headings for this volley, on top of the usual fan (Lyra's leque, Fabri's second boomerang). */
  extraAngles(weapon: ActiveWeapon, baseAngle: number): number[];
  /** Throw these, one after another, instead of one pick (Sergio's combo); null = the usual throw. */
  packSequence(weapon: ActiveWeapon): ProjectileKind[] | null;
  /** This hammer blow's shockwave: how much bigger. */
  quakeScale(weapon: ActiveWeapon): number;
  /** What the shockwave caught (cracks, the anvil's knock-down). */
  afterQuake(x: number, y: number, radius: number, caught: EnemyState[]): void;
  /** A projectile just left: extra pierces, ricochets, a golden coin... */
  dressProjectile(weapon: ActiveWeapon, projectile: ProjectileState): void;
  /** A projectile hit (the spark that jumps, the golden coin's burst). */
  onProjectileHit(projectile: ProjectileState, enemy: EnemyState, amount: number): void;
}

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
  /** Bola de Cristal: where the orbs are in their circle, and when each enemy was last hit by one. */
  orbAngle: number;
  orbHits: Map<EnemyState, number>;
}

export function createActiveWeapon(config: WeaponConfig): ActiveWeapon {
  // -Infinity: the first attack is available immediately.
  return { config, upgradeCount: 0, lastAttackAt: -Infinity, lastWhirlwindAt: -Infinity, thrownSwordReadyAt: -Infinity, thrownSwordVolleyActive: false, staffAttacksSinceExecute: 0, staffExecuteToken: 0, auraRampPercent: 0, auraTotalDamageDealt: 0, auraRampSyncedAt: -Infinity, orbAngle: 0, orbHits: new Map() };
}

export interface WeaponEvents extends Record<string, unknown> {
  'melee-swing': { x: number; y: number; dirX: number; dirY: number; range: number; coneAngle: number; weaponId: WeaponConfig['id'] };
  'aura-pulse': { radius: number; multiStrike: boolean; buffUnlocked: boolean };
  'whip-burst': { radius: number };
  'staff-explosion': { x: number; y: number; radius: number; index: number };
  'projectile-fired': { x: number; y: number; dirX: number; dirY: number; kind: ProjectileKind; weaponId: WeaponConfig['id'] };
  /** A projectile hit a tall obstacle (wall, tree, pillar...) - bolts vanish, boomerangs/thrown swords turn back. */
  'projectile-blocked': { x: number; y: number; kind: ProjectileKind };
  'hammer-quake': { x: number; y: number; radius: number };
  'bottle-burst': { x: number; y: number; radius: number };
  'potion-heal': { x: number; y: number };
}

/** What WeaponSystem needs from the session — kept narrow (same Host pattern as the other systems). */
export interface WeaponHost {
  readonly player: PlayerState;
  readonly clock: SimClock;
  readonly rng: Rng;
  readonly characterId: CharacterId;
  /** Side of the square play area — thrown swords fly to its edge. */
  readonly worldSize: number;
  readonly projectiles: Pool<ProjectileState>;
  /** Only emits — any bus whose event map includes WeaponEvents (the session's) fits. */
  readonly events: Pick<EventBus<WeaponEvents>, 'emit'>;
  hasAffinity(weapon: WeaponConfig): boolean;
  isOver(): boolean;
  /** Nearest living enemy to `from` within `range` (+ each enemy's rangePadding), skipping `exclude`. */
  nearestEnemy(from: Vec2, range: number, exclude?: (enemy: EnemyState) => boolean): EnemyState | null;
  /** Living enemies whose center is within `radius` (+ rangePadding) of `from`. */
  enemiesWithin(from: Vec2, radius: number): EnemyState[];
  /** Nearest living enemy within `range` with a clear line of sight from `from` - projectile weapons don't
   *  waste shots on enemies behind walls. */
  nearestVisibleEnemy(from: Vec2, range: number): EnemyState | null;
  /** True when a projectile body at this point is inside a tall obstacle. */
  blocksProjectile(x: number, y: number, radius: number): boolean;
  /** Living enemies overlapping a circle (broad phase + exact test) — projectile hits. Pass `out` to reuse an
   *  array on hot paths; never share one `out` between nested calls. */
  enemiesOverlapping(x: number, y: number, radius: number, out?: EnemyState[]): EnemyState[];
  damageEnemy(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id'], critical?: boolean): void;
  /** Knocks an enemy down for `ms` (bosses keep their footing). */
  stunEnemy(enemy: EnemyState, ms: number): void;
  healPlayer(amount: number): void;
  /** Fabri's banana hit side effects (slow stack + chance to drop a peel). */
  onBananaHit(enemy: EnemyState): void;
  readonly powers?: WeaponPowers;
}

/** All player weapons, ported from GameScene's attack code: Cajado (projectiles + execute/explosion exclusive),
 *  Espada/Chicote (cone, extra attacks, Redemoinho, thrown-sword volley, whip chain + burst), Bumerangue (out and
 *  back, crits, Fabri's banana transform) and Relíquia Divina (aura ticks, streak ramp, multi-strike). Weapon
 *  exclusives keep the repo's guardrail: upgradeCount >= 5 AND affinity with the weapon's family. */
export class WeaponSystem {
  readonly weapons: ActiveWeapon[] = [];
  private readonly consumedExecuteTokens = new Set<number>();
  /** Reused by updateProjectiles' hit test (runs per projectile per step). Nested queries (staff explosion) use
   *  their own arrays, so this one is never overwritten mid-iteration. */
  private readonly hitCandidates: EnemyState[] = [];

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
    // Frozen solid (Congelamento), the hero can't swing or throw; what's already in the air flies on.
    if (!this.host.player.isFrozen(this.host.clock.now)) {
      this.weapons.forEach((weapon) => this.attackWithWeapon(weapon, deltaMs));
      this.weapons.filter((weapon) => weapon.config.type === 'cone').forEach((weapon) => this.updateWhirlwind(weapon));
      this.updateThrownSwordVolley();
    }
    this.updateProjectiles(deltaMs);
  }

  private exclusiveUnlocked(weapon: ActiveWeapon): boolean {
    return weapon.upgradeCount >= WEAPON_TUNING.exclusiveUpgradeThreshold && this.host.hasAffinity(weapon.config);
  }

  attackRange(weapon: ActiveWeapon): number {
    return weapon.config.range + (weapon.config.type === 'cone' ? this.host.player.meleeRangeBonus : 0);
  }

  private attackWithWeapon(weapon: ActiveWeapon, deltaMs: number): void {
    const { player, clock } = this.host;
    const now = clock.now;
    const attackSpeed = player.effectiveAttackSpeedMultiplier();
    if (weapon.config.id === 'crystal') {
      this.updateCrystal(weapon, deltaMs, attackSpeed);
      return;
    }
    if (weapon.config.type === 'aura') {
      const cooldown = Math.max(200, this.auraStats(weapon).cooldown - player.auraTickSpeedBonusMs);
      if (now < weapon.lastAttackAt + cooldown / attackSpeed) return;
      weapon.lastAttackAt = now;
      this.performAuraTick(weapon);
      return;
    }
    if (now < weapon.lastAttackAt + weapon.config.cooldown / attackSpeed) return;
    // Melee swings reach around corners; projectile weapons only aim at what they can actually see.
    const enemy = weapon.config.type === 'cone'
      ? this.host.nearestEnemy(player, this.attackRange(weapon))
      : this.host.nearestVisibleEnemy(player, this.attackRange(weapon));
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
    const angles = [...projectileAngles(baseAngle, 1 + player.projectileExtraCount), ...(this.host.powers?.extraAngles(weapon, baseAngle) ?? [])];
    const sequence = weapon.config.id === 'pack' ? this.host.powers?.packSequence(weapon) ?? null : null;
    if (sequence) {
      // One after another, each aimed at whoever is nearest by then.
      weapon.lastAttackAt = now;
      sequence.forEach((kind, index) => {
        const throwAll = () => {
          const target = this.host.nearestVisibleEnemy(player, this.attackRange(weapon));
          const heading = target ? Math.atan2(target.y - player.y, target.x - player.x) : baseAngle;
          angles.forEach((angle) => this.launchProjectile(weapon, angle - baseAngle + heading, kind, 0));
        };
        if (index === 0) throwAll();
        else this.host.clock.delayedCall(index * WEAPON_TUNING.packComboGapMs, () => { if (!this.host.isOver()) throwAll(); });
      });
      return;
    }
    let launched = false;
    angles.forEach((angle) => {
      launched = this.launchProjectile(weapon, angle, this.projectileKind(weapon), executeToken) !== null || launched;
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
    if (weapon.config.id === 'hammer') this.hammerQuake(weapon, direction, range, hits);
    return hits;
  }

  /** Martelo de Forja: the blow lands with a shockwave a little ahead, hurting what the cone missed. */
  private hammerQuake(weapon: ActiveWeapon, direction: Vec2, range: number, hits: EnemyState[]): void {
    const { player } = this.host;
    const T = WEAPON_TUNING;
    const x = player.x + direction.x * range * T.hammerQuakeReach;
    const y = player.y + direction.y * range * T.hammerQuakeReach;
    const radius = T.hammerQuakeRadius * (this.host.powers?.quakeScale(weapon) ?? 1);
    const damage = weapon.config.baseDamage * player.damageMultiplier * T.hammerQuakeDamage;
    const caught = this.host.enemiesWithin({ x, y }, radius);
    caught.filter((enemy) => !hits.includes(enemy)).forEach((enemy) => this.host.damageEnemy(enemy, damage, weapon.config.id));
    this.host.events.emit('hammer-quake', { x, y, radius });
    this.host.powers?.afterQuake(x, y, radius, caught.filter((enemy) => enemy.alive));
  }

  // ── Bola de Cristal ────────────────────────────────────────────────────────────────────────────────────────

  /** Where each crystal orb is right now (the renderer draws them; the orbit uses the aura family's upgrades). */
  crystalOrbs(weapon: ActiveWeapon): Vec2[] {
    const { player } = this.host;
    const T = WEAPON_TUNING;
    const count = Math.min(T.crystalMaxOrbs, T.crystalOrbs + Math.floor(weapon.upgradeCount / 3));
    const radius = weapon.config.range * (1 + player.auraRadiusBonusPercent);
    return Array.from({ length: count }, (_value, index) => {
      const angle = weapon.orbAngle + (index / count) * Math.PI * 2;
      return { x: player.x + Math.cos(angle) * radius, y: player.y + Math.sin(angle) * radius };
    });
  }

  private updateCrystal(weapon: ActiveWeapon, deltaMs: number, attackSpeed: number): void {
    const { player, clock } = this.host;
    const T = WEAPON_TUNING;
    weapon.orbAngle = (weapon.orbAngle + (deltaMs / 1000) * T.crystalSpin * attackSpeed) % (Math.PI * 2);
    const interval = Math.max(200, weapon.config.cooldown - player.auraTickSpeedBonusMs);
    const damage = (weapon.config.baseDamage + player.auraDamageBonus) * player.damageMultiplier;
    if (weapon.orbHits.size > 400) weapon.orbHits.clear();
    this.crystalOrbs(weapon).forEach((orb) => {
      this.host.enemiesOverlapping(orb.x, orb.y, T.crystalOrbRadius).forEach((enemy) => {
        if (clock.now - (weapon.orbHits.get(enemy) ?? -Infinity) < interval) return;
        weapon.orbHits.set(enemy, clock.now);
        this.host.damageEnemy(enemy, damage, weapon.config.id);
      });
    });
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
    if (!this.host.nearestEnemy(this.host.player, this.host.worldSize)) return;
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
    const distance = distanceToWorldEdge(start, direction, this.host.worldSize);
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

  /** What a weapon throws: the boomerang (or Fabri's banana), the Cajado's bolt, the Arco's arrow, the Moedas' coin,
   *  or whatever the Mochila pulls out this time. */
  private projectileKind(weapon: ActiveWeapon): ProjectileKind {
    switch (weapon.config.id) {
      case 'boomerang': return this.isBananaTransformActive(weapon) ? 'banana' : 'boomerang';
      case 'bow': return 'arrow';
      case 'coins': return 'coin';
      case 'pack': return pickOne(this.host.rng, ['pan', 'bottle', 'potion'] as const);
      default: return 'bolt';
    }
  }

  /** Fabri's transform: same "upgrades + affinity" gate as every other weapon exclusive. */
  isBananaTransformActive(weapon: ActiveWeapon): boolean {
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

  private launchProjectile(weapon: ActiveWeapon, angle: number, kind: ProjectileKind, executeToken: number): ProjectileState | null {
    const projectile = this.host.projectiles.acquire();
    if (!projectile) return null;
    const { player, clock } = this.host;
    const speed = weapon.config.projectileSpeed ?? WEAPON_CONFIG.projectileSpeed;
    resetProjectile(projectile, kind, weapon.config.id, player.x, player.y, speed, weapon.config.range);
    projectile.sizeMultiplier = 1 + player.projectileSizeBonus;
    const radius = kind === 'banana' ? BODY_RADIUS.boomerang : kind === 'potion' ? BODY_RADIUS.flask : BODY_RADIUS[kind];
    projectile.radius = radius * projectile.sizeMultiplier;
    projectile.damage = weapon.config.baseDamage * player.damageMultiplier;
    projectile.expiresAt = clock.now + (weapon.config.projectileLifetime ?? WEAPON_CONFIG.lifetimeMs);
    projectile.remainingPierces = weapon.config.pierces ?? WEAPON_CONFIG.pierces;
    projectile.remainingRicochets = player.projectileRicochetMax;
    projectile.innateRicochets = weapon.config.ricochets ?? 0;
    projectile.executeToken = executeToken;
    projectile.criticalChance = isReturningKind(kind) && this.exclusiveUnlocked(weapon) ? 0.15 + weapon.upgradeCount * 0.025 : 0;
    this.host.powers?.dressProjectile(weapon, projectile);
    projectile.aimAt(angle);
    this.host.events.emit('projectile-fired', { x: projectile.x, y: projectile.y, dirX: Math.cos(angle), dirY: Math.sin(angle), kind, weaponId: weapon.config.id });
    return projectile;
  }

  /** Fabri's Macaco Furioso: `count` boomerangs (bananas once transformed) circle the hero for `ms`, cutting through
   *  whatever they touch. */
  launchOrbiting(weapon: ActiveWeapon, count: number, ms: number): void {
    const kind = this.projectileKind(weapon);
    for (let index = 0; index < count; index += 1) {
      const projectile = this.launchProjectile(weapon, 0, kind, 0);
      if (!projectile) return;
      projectile.orbitUntil = this.host.clock.now + ms;
      projectile.orbitAngle = (index / count) * Math.PI * 2;
      projectile.orbitHitsResetAt = 0;
      projectile.expiresAt = projectile.orbitUntil;
    }
  }

  private updateOrbiting(projectile: ProjectileState, deltaMs: number, now: number): boolean {
    const { player } = this.host;
    const T = WEAPON_TUNING;
    if (now >= projectile.orbitUntil) return false;
    projectile.orbitAngle += (T.orbitSpin * deltaMs) / 1000;
    projectile.x = player.x + Math.cos(projectile.orbitAngle) * T.orbitRadius;
    projectile.y = player.y + Math.sin(projectile.orbitAngle) * T.orbitRadius;
    projectile.spin += 0.35 * (deltaMs / (1000 / 60));
    if (now >= projectile.orbitHitsResetAt) {
      projectile.outboundHits.clear();
      projectile.orbitHitsResetAt = now + T.orbitRehitMs;
    }
    for (const enemy of this.host.enemiesOverlapping(projectile.x, projectile.y, projectile.radius, this.hitCandidates)) {
      if (!projectile.claimHit(enemy)) continue;
      const { amount, critical } = this.projectileDamage(projectile, enemy);
      this.host.damageEnemy(enemy, amount, projectile.weaponId, critical);
      if (projectile.kind === 'banana') this.host.onBananaHit(enemy);
    }
    return true;
  }

  private updateProjectiles(deltaMs: number): void {
    const now = this.host.clock.now;
    const spent: ProjectileState[] = [];
    this.host.projectiles.forEachActive((projectile) => {
      if (projectile.orbitUntil > 0) {
        if (!this.updateOrbiting(projectile, deltaMs, now)) spent.push(projectile);
        return;
      }
      if (isReturningKind(projectile.kind)) {
        if (!this.steerReturning(projectile)) { spent.push(projectile); return; }
        projectile.spin += (projectile.returning ? -1 : 1) * (projectile.kind === 'thrownSword' ? 0.28 : 0.2) * (deltaMs / (1000 / 60));
      }
      projectile.x += (projectile.velocityX * deltaMs) / 1000;
      projectile.y += (projectile.velocityY * deltaMs) / 1000;
      if (now >= projectile.expiresAt) { spent.push(projectile); return; }
      if (this.host.blocksProjectile(projectile.x, projectile.y, projectile.radius)) {
        this.host.events.emit('projectile-blocked', { x: projectile.x, y: projectile.y, kind: projectile.kind });
        // A bolt is spent on the wall; boomerangs and thrown swords bounce back to the hero instead - unless
        // they're already coming back, in which case they would only grind against it.
        if (!isReturningKind(projectile.kind) || projectile.returning) { spent.push(projectile); return; }
        projectile.returning = true;
        projectile.aimAt(Math.atan2(this.host.player.y - projectile.y, this.host.player.x - projectile.x));
      }
      for (const enemy of this.host.enemiesOverlapping(projectile.x, projectile.y, projectile.radius, this.hitCandidates)) {
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
    this.host.powers?.onProjectileHit(projectile, enemy, amount);
    this.packEffect(projectile, enemy);
    this.triggerStaffExplosion(projectile, enemy);
    if (this.tryRicochet(projectile, enemy)) return false;
    if (!isReturningKind(projectile.kind)) {
      if (projectile.remainingPierces <= 0) return true;
      projectile.remainingPierces -= 1;
    }
    return false;
  }

  /** Mochila de Tralhas: the pan knocks the target down, the bottle bursts on it, the potion heals the thrower. */
  private packEffect(projectile: ProjectileState, enemy: EnemyState): void {
    const T = WEAPON_TUNING;
    if (projectile.kind === 'pan') this.host.stunEnemy(enemy, T.panStunMs);
    if (projectile.kind === 'bottle') {
      this.host.enemiesWithin(enemy, T.bottleBurstRadius).filter((other) => other !== enemy).forEach((other) => this.host.damageEnemy(other, projectile.damage * T.bottleBurstDamage, projectile.weaponId));
      this.host.events.emit('bottle-burst', { x: enemy.x, y: enemy.y, radius: T.bottleBurstRadius });
    }
    if (projectile.kind === 'potion') {
      this.host.healPlayer(this.host.player.maxHealth * T.potionHeal);
      this.host.events.emit('potion-heal', { x: enemy.x, y: enemy.y });
    }
  }

  private projectileDamage(projectile: ProjectileState, enemy: EnemyState): { amount: number; critical: boolean } {
    if (projectile.executeToken > 0 && enemy.isCommon && !this.consumedExecuteTokens.has(projectile.executeToken)) {
      this.consumedExecuteTokens.add(projectile.executeToken);
      return { amount: enemy.health, critical: false };
    }
    // Lyra's Olho de Falcão: far targets are easier to hit where it hurts.
    const { player } = this.host;
    const falconEye = this.host.characterId === 'lyra' && Math.hypot(enemy.x - player.x, enemy.y - player.y) > WEAPON_TUNING.falconEyeDistance ? WEAPON_TUNING.falconEyeCrit : 0;
    const criticalChance = projectile.criticalChance + falconEye;
    if (criticalChance > 0 && this.host.rng() < criticalChance) return { amount: projectile.damage * 2, critical: true };
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
    // The Moedas' own ricochets always jump; the Rebote Arcano upgrade's are a chance.
    const innate = projectile.innateRicochets > 0;
    if (!innate && (projectile.remainingRicochets <= 0 || this.host.rng() >= this.host.player.projectileRicochetChance)) return false;
    const target = this.host.nearestEnemy(projectile, projectile.range, (enemy) => enemy === hitEnemy || projectile.hasHit(enemy));
    if (!target) return false;
    if (innate) projectile.innateRicochets -= 1;
    else projectile.remainingRicochets -= 1;
    projectile.returning = false;
    // Boomerangs keep their original launch point so the return leg still measures from the hero's throw.
    if (!isReturningKind(projectile.kind)) {
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

function distanceToWorldEdge(start: Vec2, direction: Vec2, worldSize: number): number {
  const candidates: number[] = [];
  if (direction.x > 0) candidates.push((worldSize - start.x) / direction.x);
  if (direction.x < 0) candidates.push(-start.x / direction.x);
  if (direction.y > 0) candidates.push((worldSize - start.y) / direction.y);
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
  projectile.innateRicochets = 0;
  projectile.executeToken = 0;
  projectile.criticalChance = 0;
  projectile.sizeMultiplier = 1;
  projectile.cyclesRemaining = 0;
  projectile.spin = 0;
  projectile.golden = false;
  projectile.orbitUntil = 0;
  projectile.orbitAngle = 0;
  projectile.outboundHits.clear();
  projectile.returnHits.clear();
}
