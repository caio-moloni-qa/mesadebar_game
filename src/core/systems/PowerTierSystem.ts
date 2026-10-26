import { CHARACTERS, CharacterId } from '../../config/characters';
import { POWER_TIERS, POWER_TIER_LEVELS } from '../../config/powerTiers';
import { WeaponConfig } from '../../config/weapons';
import { EventBus } from '../EventBus';
import { SimClock } from '../SimClock';
import { Rng, Vec2, floatBetween, pickOne } from '../math';
import { EnemyState, PickupKind, PlayerState, ProjectileKind, ProjectileState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';
import { ActiveWeapon, WeaponPowers } from './WeaponSystem';

// Every hero grows three powers stronger during a run, at the levels in POWER_TIER_LEVELS (see config/powerTiers for
// what each one is). The weapon side (more arrows, the merchant's combo, the anvil...) goes through WeaponPowers; the
// rest runs on timers here, or hooks into the session's own hits, kills and wounds. Powers ride on the hero's own
// weapon: a hero who started with another one gets none.

export const POWER_TUNING = {
  // Mago
  sparkTargets: 2,
  sparkRange: 160,
  sparkDamage: 0.4,
  stormIntervalMs: 6000,
  stormRange: 450,
  stormDamage: 3,
  stormStunMs: 500,
  hurricaneIntervalMs: 15_000,
  hurricaneLifeMs: 4500,
  hurricaneSpeed: 150,
  hurricaneRadius: 110,
  hurricaneTickMs: 500,
  hurricaneDamage: 0.6,
  hurricaneLiftMs: 1500,
  hurricaneArcs: 5,
  // Bárbaro
  bleedMs: 3000,
  /** Share of the cut bled out over the whole bleed. */
  bleedShare: 0.6,
  bleedTickMs: 500,
  warCryHealth: 0.5,
  warCryCooldownMs: 20_000,
  warCryRadius: 240,
  warCryPush: 130,
  warCryFleeMs: 2000,
  furyMs: 5000,
  furyDamage: 2,
  furyKillHeal: 0.04,
  // Relíquia
  reflectShare: 0.5,
  holyPulseEvery: 5,
  holyPulseDamage: 2,
  /** The shield counts as full from this share of its cap. */
  shieldFullAt: 0.95,
  sanctuaryBurst: 3,
  sanctuaryBurstRadius: 220,
  sanctuaryRadius: 120,
  sanctuaryMs: 5000,
  sanctuaryHealPerSecond: 12,
  // Fabri
  peelIntervalMs: 4000,
  peelCount: 3,
  peelSlipDamage: 1.5,
  monkeyIntervalMs: 12_000,
  monkeyMs: 4000,
  monkeyBoomerangs: 4,
  // Brom
  crackSlow: 0.3,
  crackSlowMs: 2000,
  anvilEvery: 3,
  anvilScale: 1.5,
  anvilStunMs: 600,
  meteorIntervalMs: 15_000,
  meteorFallMs: 650,
  meteorRadius: 170,
  meteorDamage: 4,
  emberRadius: 150,
  emberMs: 4000,
  emberTickMs: 500,
  emberDamage: 0.35,
  // Lyra
  livingArrowPierces: 2,
  fanDegrees: 14,
  hawkOrbit: 70,
  hawkIntervalMs: 2500,
  hawkRange: 500,
  hawkSpeed: 900,
  hawkDamage: 3,
  rootMs: 2000,
  // Grimbo
  goldenEvery: 5,
  goldenDamage: 1.5,
  goldenRadius: 75,
  profitChance: 0.1,
  profitCoins: 3,
  goldRainIntervalMs: 15_000,
  goldRainRange: 600,
  goldRainRadius: 210,
  goldRainDamage: 3,
  goldStatueChance: 0.1,
  // Zora
  trailEveryMs: 120,
  trailLifeMs: 1200,
  trailRadius: 28,
  trailSlow: 0.35,
  trailSlowMs: 400,
  foresightRechargeMs: 10_000,
  eclipseIntervalMs: 20_000,
  eclipseRange: 350,
  eclipsePullRadius: 280,
  eclipsePullMs: 3000,
  eclipseDamage: 6,
  eclipseBlastRadius: 210,
  // Sergio
  crateIntervalMs: 12_000,
  crateFlightMs: 700,
  crateRange: 450,
  crateRadius: 110,
  crateDamage: 2,
  crateCoins: 5,
  saleIntervalMs: 20_000,
  saleItems: 15,
  saleSpreadMs: 1500,
  saleRadius: 260,
  saleItemRadius: 65,
  saleItemDamage: 1.2,
  saleStunMs: 900,
  saleHeal: 0.02
} as const;

const T = POWER_TUNING;
/** How fast a pulled enemy is dragged to the eclipse, and how fast a fleeing one runs. */
export const PULL_SPEED = 190;
export const FLEE_SPEED_MULTIPLIER = 1.3;

export type PowerBlast = 'storm' | 'warcry' | 'holy' | 'sanctuary' | 'meteor' | 'gold' | 'gold-rain' | 'eclipse' | 'crate' | 'hawk' | 'roots' | 'crack' | 'anvil' | 'peel-slip';

export interface PowerTierEvents extends Record<string, unknown> {
  /** A tier switched on (the renderer announces it). */
  'power-unlocked': { tier: number; level: number; name: string; text: string };
  /** A lightning arc through these points, in order (the Mago's spark, storm and hurricane). */
  'power-arc': { points: Vec2[] };
  /** A one-shot blast of some power, for its burst on the ground. */
  'power-blast': { kind: PowerBlast; x: number; y: number; radius: number };
  /** Something started that the hero shows (Fúria, a hurricane, the monkey's spin, a crate thrown, the sale...). */
  'power-cast': { kind: 'fury' | 'fury-end' | 'hurricane' | 'monkey' | 'meteor' | 'crate' | 'sale' | 'eclipse' | 'foresight' | 'foresight-ready'; x: number; y: number };
  /** Liquidação Total: one item landed. */
  'power-item': { kind: 'pan' | 'bottle' | 'potion'; x: number; y: number };
}

export interface PowerHost {
  readonly player: PlayerState;
  readonly clock: SimClock;
  readonly rng: Rng;
  readonly characterId: CharacterId;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<PowerTierEvents>, 'emit'>;
  level(): number;
  /** The hero's own weapon, if it's in the loadout. */
  signatureWeapon(): ActiveWeapon | null;
  enemiesWithin(from: Vec2, radius: number): EnemyState[];
  nearestEnemy(from: Vec2, range: number, exclude?: (enemy: EnemyState) => boolean): EnemyState | null;
  damageEnemy(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id']): void;
  stunEnemy(enemy: EnemyState, ms: number): void;
  /** Kills it outright with full credit (a gold statue). */
  defeatEnemy(enemy: EnemyState): void;
  healPlayer(amount: number): void;
  dropPickup(kind: PickupKind, x: number, y: number, value: number, magnet?: boolean): void;
  dropPeel(x: number, y: number): void;
  orbitBoomerangs(weapon: ActiveWeapon, count: number, ms: number): void;
  /** The Relíquia's shield cap (0 for everyone else). */
  shieldCap(): number;
  /** Where the crystal orbs are right now. */
  orbs(weapon: ActiveWeapon): Vec2[];
  /** The aura's radius right now. */
  auraRadius(weapon: ActiveWeapon): number;
}

export interface Hurricane { x: number; y: number; prevX: number; prevY: number; dirX: number; dirY: number; lifeMs: number; tickIn: number; spin: number }
export interface PowerZone { kind: 'embers' | 'sanctuary'; x: number; y: number; radius: number; endsAt: number; startedAt: number; tickIn: number }
export interface Hawk { x: number; y: number; prevX: number; prevY: number; angle: number; target: EnemyState | null; returning: boolean }
export interface Crate { fromX: number; fromY: number; toX: number; toY: number; elapsedMs: number }
export interface Eclipse { x: number; y: number; startedAt: number; endsAt: number }
export interface TrailPoint { x: number; y: number; expiresAt: number }

export class PowerTierSystem implements WeaponPowers {
  /** Tiers announced so far (0..3). */
  private announced = 0;
  readonly hurricanes: Hurricane[] = [];
  readonly zones: PowerZone[] = [];
  readonly crates: Crate[] = [];
  readonly trail: TrailPoint[] = [];
  hawk: Hawk | null = null;
  eclipse: Eclipse | null = null;
  /** Zora's Visão do Futuro: the next hit is foreseen. */
  foresightReady = false;
  /** Bárbaro's Fúria Imortal: running until this sim time; spent for this stage once used. */
  furyUntil = 0;
  private furyUsed = false;
  private readonly timers: Record<string, number> = {};
  private readonly bleeding = new Set<EnemyState>();
  private coinCount = 0;
  private quakeCount = 0;
  private auraPulses = 0;
  private shieldWasFull = false;
  private warCryReadyAt = 0;
  /** Set while a power deals its own damage, so its hits don't set off more powers. */
  private dealing = false;

  constructor(private readonly host: PowerHost) {}

  /** Tiers the hero's level has reached (0..3). */
  get tier(): number {
    const level = this.host.level();
    return POWER_TIER_LEVELS.filter((threshold) => level >= threshold).length;
  }

  /** This hero has tier `n` (1..3) switched on, with their own weapon in hand. */
  has(n: number): boolean {
    return this.tier >= n && this.host.signatureWeapon() !== null;
  }

  get furious(): boolean {
    return this.host.clock.now < this.furyUntil;
  }

  private is(hero: CharacterId, n: number): boolean {
    return this.host.characterId === hero && this.has(n);
  }

  /** The hero weapon's own damage, grown with its upgrades like the regulars' kits, times `scale`. */
  private damage(scale: number): number {
    const weapon = this.host.signatureWeapon();
    if (!weapon) return 0;
    const base = CHARACTERS[this.host.characterId].auraWeaponOverrides?.baseDamage ?? weapon.config.baseDamage;
    return base * this.host.player.damageMultiplier * (1 + 0.03 * weapon.upgradeCount) * scale;
  }

  private hit(enemy: EnemyState, amount: number): void {
    const weapon = this.host.signatureWeapon();
    if (!weapon || !enemy.alive) return;
    this.dealing = true;
    this.host.damageEnemy(enemy, amount, weapon.config.id);
    this.dealing = false;
  }

  private tick(name: string, delta: number, interval: number): boolean {
    this.timers[name] = (this.timers[name] ?? 0) + delta;
    if (this.timers[name] < interval) return false;
    this.timers[name] = 0;
    return true;
  }

  /** A new boss cycle: the Fúria can save the hero once more. */
  newStage(): void {
    this.furyUsed = false;
  }

  // ── Every step ──────────────────────────────────────────────────────────────────────────────────────────────

  update(delta: number): void {
    this.checkUnlocks();
    if (this.tier === 0 || !this.host.signatureWeapon()) return;
    switch (this.host.characterId) {
      case 'mage': this.updateMage(delta); break;
      case 'barbarian': this.updateBarbarian(delta); break;
      case 'reliquia': this.updateReliquia(); break;
      case 'fabri': this.updateFabri(delta); break;
      case 'brom': this.updateBrom(delta); break;
      case 'lyra': this.updateLyra(delta); break;
      case 'grimbo': if (this.is('grimbo', 3) && this.tick('goldRain', delta, T.goldRainIntervalMs)) this.goldRain(); break;
      case 'zora': this.updateZora(delta); break;
      case 'sergio': this.updateSergio(delta); break;
    }
    this.updateZones(delta);
  }

  private checkUnlocks(): void {
    const tier = this.tier;
    while (this.announced < tier) {
      const info = POWER_TIERS[this.host.characterId][this.announced];
      this.announced += 1;
      if (this.announced === 2 && this.host.characterId === 'zora') this.foresightReady = true;
      this.host.events.emit('power-unlocked', { tier: this.announced, level: POWER_TIER_LEVELS[this.announced - 1], name: info.name, text: info.text });
    }
  }

  // ── Session hooks ───────────────────────────────────────────────────────────────────────────────────────────

  /** Multiplies every hit the hero deals (the Fúria). */
  damageDealtMultiplier(): number {
    return this.furious ? T.furyDamage : 1;
  }

  /** Any hit the hero landed (after it was dealt). */
  onHit(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id'] | null): void {
    if (this.dealing || !weaponId) return;
    if (weaponId === 'sword' && this.is('barbarian', 1) && enemy.alive) {
      // Golpe Sangrento: a fresh cut restarts the bleed at the stronger of the two.
      const now = this.host.clock.now;
      const perSecond = (amount * T.bleedShare) / (T.bleedMs / 1000);
      enemy.bleedPerSecond = now < enemy.bleedUntil ? Math.max(enemy.bleedPerSecond, perSecond) : perSecond;
      enemy.bleedUntil = now + T.bleedMs;
      this.bleeding.add(enemy);
    }
  }

  /** The killing blow landed (after the kill was counted). */
  onKill(enemy: EnemyState, weaponId: WeaponConfig['id'] | null): void {
    const { player } = this.host;
    if (this.furious) this.host.healPlayer(player.maxHealth * T.furyKillHeal);
    // Lucro Rápido: coins knock loose a few more, which fly to Grimbo.
    if (weaponId === 'coins' && enemy.isCommon && this.is('grimbo', 2) && this.host.rng() < T.profitChance) {
      for (let index = 0; index < T.profitCoins; index += 1) this.host.dropPickup('gem', enemy.x + floatBetween(this.host.rng, -20, 20), enemy.y + floatBetween(this.host.rng, -20, 20), Math.max(1, enemy.reward), true);
    }
  }

  /** The hero is about to take a hit: Zora's foresight cancels it. Returns true if it was foreseen. */
  foresee(): boolean {
    if (!this.foresightReady || this.host.characterId !== 'zora' || !this.has(2)) return false;
    this.foresightReady = false;
    this.timers.foresight = 0;
    this.host.events.emit('power-cast', { kind: 'foresight', x: this.host.player.x, y: this.host.player.y });
    return true;
  }

  /** An enemy's touch got through while the Relíquia had shield up: half of it goes back. */
  onContactHit(enemy: EnemyState, dealt: number, shielded: boolean): void {
    if (!shielded || !this.is('reliquia', 1)) return;
    this.hit(enemy, dealt * T.reflectShare);
  }

  /** Health hit 0: the Fúria Imortal keeps the Bárbaro up. True if the hero was saved. */
  cheatDeath(): boolean {
    const { player, clock } = this.host;
    if (this.furious) {
      player.health = 1;
      return true;
    }
    if (this.furyUsed || !this.is('barbarian', 3)) return false;
    this.furyUsed = true;
    this.furyUntil = clock.now + T.furyMs;
    player.health = 1;
    this.host.events.emit('power-cast', { kind: 'fury', x: player.x, y: player.y });
    clock.delayedCall(T.furyMs, () => this.host.events.emit('power-cast', { kind: 'fury-end', x: this.host.player.x, y: this.host.player.y }));
    return true;
  }

  /** A banana peel threw an enemy down: it hits the ground hard. */
  onPeelSlip(enemy: EnemyState): void {
    if (!this.is('fabri', 2)) return;
    this.hit(enemy, this.damage(T.peelSlipDamage));
    this.host.events.emit('power-blast', { kind: 'peel-slip', x: enemy.x, y: enemy.y, radius: 30 });
  }

  /** The aura pulsed: every fifth, a ring of light runs out to twice its reach. */
  onAuraPulse(): void {
    const weapon = this.host.signatureWeapon();
    if (!weapon || !this.is('reliquia', 2) || weapon.config.type !== 'aura') return;
    this.auraPulses += 1;
    if (this.auraPulses % T.holyPulseEvery !== 0) return;
    const { player } = this.host;
    const radius = this.host.auraRadius(weapon) * 2;
    const damage = this.damage(T.holyPulseDamage);
    this.host.enemiesWithin(player, radius).forEach((enemy) => this.hit(enemy, damage));
    this.host.events.emit('power-blast', { kind: 'holy', x: player.x, y: player.y, radius });
  }

  /** Lyra's rain of arrows: with the forest spirit, roots hold what it lands on. */
  onArrowRain(x: number, y: number, radius: number): void {
    if (!this.is('lyra', 3)) return;
    const until = this.host.clock.now + T.rootMs;
    this.host.enemiesWithin({ x, y }, radius).forEach((enemy) => { if (enemy.isCommon) enemy.heldUntil = Math.max(enemy.heldUntil, until); });
    this.host.events.emit('power-blast', { kind: 'roots', x, y, radius });
  }

  // ── WeaponPowers ────────────────────────────────────────────────────────────────────────────────────────────

  extraAngles(weapon: ActiveWeapon, baseAngle: number): number[] {
    if (weapon.config.id === 'bow' && this.is('lyra', 2)) {
      const spread = (T.fanDegrees * Math.PI) / 180;
      return [baseAngle - spread, baseAngle + spread];
    }
    if (weapon.config.id === 'boomerang' && this.is('fabri', 1)) return [baseAngle + Math.PI];
    return [];
  }

  packSequence(weapon: ActiveWeapon): ProjectileKind[] | null {
    return weapon.config.id === 'pack' && this.is('sergio', 1) ? ['pan', 'bottle', 'potion'] : null;
  }

  quakeScale(weapon: ActiveWeapon): number {
    if (weapon.config.id !== 'hammer' || !this.is('brom', 2)) return 1;
    this.quakeCount += 1;
    return this.quakeCount % T.anvilEvery === 0 ? T.anvilScale : 1;
  }

  afterQuake(x: number, y: number, radius: number, caught: EnemyState[]): void {
    if (!this.is('brom', 1)) return;
    const now = this.host.clock.now;
    const anvil = this.is('brom', 2) && this.quakeCount % T.anvilEvery === 0;
    caught.forEach((enemy) => {
      enemy.applySlow(T.crackSlow, T.crackSlowMs, now);
      if (anvil) this.host.stunEnemy(enemy, T.anvilStunMs);
    });
    this.host.events.emit('power-blast', { kind: anvil ? 'anvil' : 'crack', x, y, radius });
  }

  dressProjectile(_weapon: ActiveWeapon, projectile: ProjectileState): void {
    if (projectile.kind === 'arrow' && this.is('lyra', 1)) {
      projectile.remainingPierces += T.livingArrowPierces;
      projectile.innateRicochets += 1;
    }
    if (projectile.kind === 'coin' && this.is('grimbo', 1)) {
      this.coinCount += 1;
      if (this.coinCount % T.goldenEvery === 0) {
        projectile.golden = true;
        projectile.damage *= T.goldenDamage;
      }
    }
  }

  onProjectileHit(projectile: ProjectileState, enemy: EnemyState, amount: number): void {
    if (this.dealing) return;
    if (projectile.golden) {
      projectile.golden = false;
      this.host.enemiesWithin(enemy, T.goldenRadius).filter((other) => other !== enemy).forEach((other) => this.hit(other, projectile.damage));
      this.host.events.emit('power-blast', { kind: 'gold', x: enemy.x, y: enemy.y, radius: T.goldenRadius });
    }
    if (projectile.kind === 'bolt' && projectile.weaponId === 'staff' && this.is('mage', 1)) this.spark(enemy, amount * T.sparkDamage, T.sparkTargets);
  }

  // ── Mago ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** A lightning arc from `from` through up to `jumps` more enemies, each the nearest not yet struck. */
  private spark(from: EnemyState, damage: number, jumps: number, struck = new Set<EnemyState>([from])): void {
    const points: Vec2[] = [{ x: from.x, y: from.y }];
    let source: EnemyState = from;
    for (let jump = 0; jump < jumps; jump += 1) {
      const next = this.host.nearestEnemy(source, T.sparkRange, (enemy) => struck.has(enemy));
      if (!next) break;
      struck.add(next);
      points.push({ x: next.x, y: next.y });
      this.hit(next, damage);
      source = next;
    }
    if (points.length > 1) this.host.events.emit('power-arc', { points });
  }

  private updateMage(delta: number): void {
    const { player, clock } = this.host;
    if (this.has(2) && this.tick('storm', delta, T.stormIntervalMs)) {
      const target = this.host.enemiesWithin(player, T.stormRange).filter((enemy) => enemy.alive).sort((a, b) => b.health - a.health)[0];
      if (target) {
        this.hit(target, this.damage(T.stormDamage));
        this.host.stunEnemy(target, T.stormStunMs);
        target.heldUntil = Math.max(target.heldUntil, clock.now + T.stormStunMs);
        this.host.events.emit('power-blast', { kind: 'storm', x: target.x, y: target.y, radius: 50 });
      }
    }
    if (this.has(3) && this.tick('hurricane', delta, T.hurricaneIntervalMs)) {
      const target = this.host.nearestEnemy(player, 600);
      const dx = target ? target.x - player.x : player.facingX;
      const dy = target ? target.y - player.y : player.facingY;
      const length = Math.hypot(dx, dy) || 1;
      this.hurricanes.push({ x: player.x, y: player.y, prevX: player.x, prevY: player.y, dirX: dx / length, dirY: dy / length, lifeMs: T.hurricaneLifeMs, tickIn: 0, spin: 0 });
      this.host.events.emit('power-cast', { kind: 'hurricane', x: player.x, y: player.y });
    }
    for (let index = this.hurricanes.length - 1; index >= 0; index -= 1) {
      const storm = this.hurricanes[index];
      storm.prevX = storm.x;
      storm.prevY = storm.y;
      // It drifts toward the thick of the horde, slowly turning after the nearest enemy.
      const near = this.host.nearestEnemy(storm, 300);
      if (near) {
        const dx = near.x - storm.x;
        const dy = near.y - storm.y;
        const length = Math.hypot(dx, dy) || 1;
        const turn = Math.min(1, delta / 600);
        storm.dirX += (dx / length - storm.dirX) * turn;
        storm.dirY += (dy / length - storm.dirY) * turn;
        const norm = Math.hypot(storm.dirX, storm.dirY) || 1;
        storm.dirX /= norm;
        storm.dirY /= norm;
      }
      storm.x = Math.max(0, Math.min(this.host.arena.size, storm.x + (storm.dirX * T.hurricaneSpeed * delta) / 1000));
      storm.y = Math.max(0, Math.min(this.host.arena.size, storm.y + (storm.dirY * T.hurricaneSpeed * delta) / 1000));
      storm.spin += delta / 1000;
      storm.lifeMs -= delta;
      storm.tickIn -= delta;
      if (storm.tickIn <= 0) {
        storm.tickIn = T.hurricaneTickMs;
        const inside = this.host.enemiesWithin(storm, T.hurricaneRadius).filter((enemy) => enemy.alive);
        const until = clock.now + T.hurricaneLiftMs;
        const damage = this.damage(T.hurricaneDamage);
        inside.forEach((enemy) => {
          if (enemy.isCommon) enemy.liftedUntil = Math.max(enemy.liftedUntil, until);
          this.hit(enemy, damage);
        });
        // Lightning jumps between what it carries.
        const carried = inside.filter((enemy) => enemy.alive).slice(0, T.hurricaneArcs + 1);
        if (carried.length > 1) this.host.events.emit('power-arc', { points: carried.map((enemy) => ({ x: enemy.x, y: enemy.y })) });
      }
      if (storm.lifeMs <= 0) this.hurricanes.splice(index, 1);
    }
  }

  // ── Bárbaro ─────────────────────────────────────────────────────────────────────────────────────────────────

  private updateBarbarian(delta: number): void {
    const { player, clock } = this.host;
    if (this.tick('bleed', delta, T.bleedTickMs)) {
      this.bleeding.forEach((enemy) => {
        if (!enemy.alive || clock.now >= enemy.bleedUntil) {
          this.bleeding.delete(enemy);
          return;
        }
        this.hit(enemy, (enemy.bleedPerSecond * T.bleedTickMs) / 1000);
      });
    }
    if (this.has(2) && player.alive && player.health < player.maxHealth * T.warCryHealth && clock.now >= this.warCryReadyAt) {
      this.warCryReadyAt = clock.now + T.warCryCooldownMs;
      const until = clock.now + T.warCryFleeMs;
      this.host.enemiesWithin(player, T.warCryRadius).forEach((enemy) => {
        if (!enemy.isCommon) return;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const length = Math.hypot(dx, dy) || 1;
        enemy.x += (dx / length) * T.warCryPush;
        enemy.y += (dy / length) * T.warCryPush;
        this.host.arena.resolve(enemy);
        enemy.fleeUntil = until;
      });
      this.host.events.emit('power-blast', { kind: 'warcry', x: player.x, y: player.y, radius: T.warCryRadius });
    }
    if (this.furious && player.health < 1) player.health = 1;
  }

  // ── Relíquia ────────────────────────────────────────────────────────────────────────────────────────────────

  private updateReliquia(): void {
    if (!this.has(3)) return;
    const { player, clock } = this.host;
    const cap = this.host.shieldCap();
    if (cap <= 0) return;
    if (player.damageBuffer >= cap * T.shieldFullAt) this.shieldWasFull = true;
    if (!this.shieldWasFull || player.damageBuffer > 0) return;
    // A full shield just broke: it bursts into holy light and leaves a sanctuary behind.
    this.shieldWasFull = false;
    const damage = cap * T.sanctuaryBurst * (this.host.player.damageMultiplier);
    this.host.enemiesWithin(player, T.sanctuaryBurstRadius).forEach((enemy) => this.hit(enemy, damage));
    this.host.events.emit('power-blast', { kind: 'sanctuary', x: player.x, y: player.y, radius: T.sanctuaryBurstRadius });
    this.zones.push({ kind: 'sanctuary', x: player.x, y: player.y, radius: T.sanctuaryRadius, startedAt: clock.now, endsAt: clock.now + T.sanctuaryMs, tickIn: 0 });
  }

  // ── Fabri ───────────────────────────────────────────────────────────────────────────────────────────────────

  private updateFabri(delta: number): void {
    const { player, rng } = this.host;
    if (this.has(2) && this.tick('peels', delta, T.peelIntervalMs)) {
      for (let index = 0; index < T.peelCount; index += 1) {
        const angle = floatBetween(rng, 0, Math.PI * 2);
        const distance = floatBetween(rng, 60, 170);
        this.host.dropPeel(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance);
      }
    }
    const weapon = this.host.signatureWeapon();
    if (weapon && this.has(3) && this.tick('monkey', delta, T.monkeyIntervalMs)) {
      this.host.orbitBoomerangs(weapon, T.monkeyBoomerangs + player.projectileExtraCount, T.monkeyMs);
      this.host.events.emit('power-cast', { kind: 'monkey', x: player.x, y: player.y });
    }
  }

  // ── Brom ────────────────────────────────────────────────────────────────────────────────────────────────────

  private updateBrom(delta: number): void {
    if (!this.has(3) || !this.tick('meteor', delta, T.meteorIntervalMs)) return;
    const { player, clock } = this.host;
    this.host.events.emit('power-cast', { kind: 'meteor', x: player.x, y: player.y });
    clock.delayedCall(T.meteorFallMs, () => {
      const at = { x: this.host.player.x, y: this.host.player.y };
      const damage = this.damage(T.meteorDamage);
      this.host.enemiesWithin(at, T.meteorRadius).forEach((enemy) => {
        this.hit(enemy, damage);
        this.host.stunEnemy(enemy, 500);
      });
      this.host.events.emit('power-blast', { kind: 'meteor', x: at.x, y: at.y, radius: T.meteorRadius });
      this.zones.push({ kind: 'embers', x: at.x, y: at.y, radius: T.emberRadius, startedAt: this.host.clock.now, endsAt: this.host.clock.now + T.emberMs, tickIn: T.emberTickMs });
    });
  }

  private updateZones(delta: number): void {
    const now = this.host.clock.now;
    const { player } = this.host;
    for (let index = this.zones.length - 1; index >= 0; index -= 1) {
      const zone = this.zones[index];
      if (now >= zone.endsAt) { this.zones.splice(index, 1); continue; }
      zone.tickIn -= delta;
      if (zone.kind === 'sanctuary') {
        if (Math.hypot(player.x - zone.x, player.y - zone.y) <= zone.radius) this.host.healPlayer((T.sanctuaryHealPerSecond * delta) / 1000);
        continue;
      }
      if (zone.tickIn > 0) continue;
      zone.tickIn = T.emberTickMs;
      const damage = this.damage(T.emberDamage);
      this.host.enemiesWithin(zone, zone.radius).forEach((enemy) => this.hit(enemy, damage));
    }
  }

  // ── Lyra ────────────────────────────────────────────────────────────────────────────────────────────────────

  private updateLyra(delta: number): void {
    if (!this.has(3)) {
      this.hawk = null;
      return;
    }
    const { player } = this.host;
    const hawk = this.hawk ?? (this.hawk = { x: player.x, y: player.y, prevX: player.x, prevY: player.y, angle: 0, target: null, returning: false });
    hawk.prevX = hawk.x;
    hawk.prevY = hawk.y;
    const step = (T.hawkSpeed * delta) / 1000;
    if (hawk.target && (!hawk.target.alive || hawk.returning)) hawk.target = null;
    if (!hawk.target && !hawk.returning && this.tick('hawk', delta, T.hawkIntervalMs)) {
      hawk.target = this.host.enemiesWithin(player, T.hawkRange).filter((enemy) => enemy.alive).sort((a, b) => b.health - a.health)[0] ?? null;
    }
    if (hawk.target) {
      // Diving.
      const dx = hawk.target.x - hawk.x;
      const dy = hawk.target.y - hawk.y;
      const length = Math.hypot(dx, dy);
      if (length <= step + hawk.target.radius) {
        this.hit(hawk.target, this.damage(T.hawkDamage));
        this.host.events.emit('power-blast', { kind: 'hawk', x: hawk.target.x, y: hawk.target.y, radius: 40 });
        hawk.target = null;
        hawk.returning = true;
      } else {
        hawk.x += (dx / length) * step;
        hawk.y += (dy / length) * step;
      }
      return;
    }
    // Circling the hero (flying back to the circle first after a dive).
    hawk.angle += (2.2 * delta) / 1000;
    const goalX = player.x + Math.cos(hawk.angle) * T.hawkOrbit;
    const goalY = player.y + Math.sin(hawk.angle) * T.hawkOrbit;
    const dx = goalX - hawk.x;
    const dy = goalY - hawk.y;
    const length = Math.hypot(dx, dy);
    if (hawk.returning && length > step) {
      hawk.x += (dx / length) * step;
      hawk.y += (dy / length) * step;
      return;
    }
    hawk.returning = false;
    hawk.x = goalX;
    hawk.y = goalY;
  }

  // ── Grimbo ──────────────────────────────────────────────────────────────────────────────────────────────────

  private goldRain(): void {
    const { player, rng } = this.host;
    const spot = this.thickestKnot(player, T.goldRainRange, T.goldRainRadius);
    if (!spot) return;
    const damage = this.damage(T.goldRainDamage);
    this.host.enemiesWithin(spot, T.goldRainRadius).forEach((enemy) => {
      if (enemy.isCommon && rng() < T.goldStatueChance) {
        // Turned to gold on the spot.
        enemy.gilded = true;
        enemy.health = 0;
        this.host.defeatEnemy(enemy);
        return;
      }
      this.hit(enemy, damage);
    });
    this.host.events.emit('power-blast', { kind: 'gold-rain', x: spot.x, y: spot.y, radius: T.goldRainRadius });
  }

  /** The enemy around which most others stand within `radius` (of the first 40 within `range`), or null. */
  private thickestKnot(from: Vec2, range: number, radius: number): Vec2 | null {
    const candidates = this.host.enemiesWithin(from, range).filter((enemy) => enemy.alive).slice(0, 40);
    if (candidates.length === 0) return null;
    let best = candidates[0];
    let bestCount = -1;
    candidates.forEach((enemy) => {
      const crowd = candidates.filter((other) => Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius).length;
      if (crowd > bestCount) { bestCount = crowd; best = enemy; }
    });
    return { x: best.x, y: best.y };
  }

  // ── Zora ────────────────────────────────────────────────────────────────────────────────────────────────────

  private updateZora(delta: number): void {
    const { clock } = this.host;
    const now = clock.now;
    const weapon = this.host.signatureWeapon();
    for (let index = this.trail.length - 1; index >= 0; index -= 1) if (now >= this.trail[index].expiresAt) this.trail.splice(index, 1);
    if (weapon && weapon.config.id === 'crystal' && this.tick('trail', delta, T.trailEveryMs)) {
      this.orbPositions(weapon).forEach((orb) => this.trail.push({ x: orb.x, y: orb.y, expiresAt: now + T.trailLifeMs }));
      this.trail.forEach((point) => this.host.enemiesWithin(point, T.trailRadius).forEach((enemy) => enemy.applySlow(T.trailSlow, T.trailSlowMs, now)));
    }
    if (this.has(2) && !this.foresightReady && this.tick('foresight', delta, T.foresightRechargeMs)) {
      this.foresightReady = true;
      this.host.events.emit('power-cast', { kind: 'foresight-ready', x: this.host.player.x, y: this.host.player.y });
    }
    if (this.has(3) && !this.eclipse && this.tick('eclipse', delta, T.eclipseIntervalMs)) {
      const spot = this.thickestKnot(this.host.player, T.eclipseRange, T.eclipsePullRadius * 0.5);
      if (spot) {
        this.eclipse = { x: spot.x, y: spot.y, startedAt: now, endsAt: now + T.eclipsePullMs };
        this.host.events.emit('power-cast', { kind: 'eclipse', x: spot.x, y: spot.y });
      }
    }
    if (this.eclipse) {
      const eclipse = this.eclipse;
      this.host.enemiesWithin(eclipse, T.eclipsePullRadius).forEach((enemy) => {
        if (!enemy.isCommon) return;
        enemy.pullUntil = now + 100;
        enemy.pullX = eclipse.x;
        enemy.pullY = eclipse.y;
      });
      if (now >= eclipse.endsAt) {
        const damage = this.damage(T.eclipseDamage);
        this.host.enemiesWithin(eclipse, T.eclipseBlastRadius).forEach((enemy) => this.hit(enemy, damage));
        this.host.events.emit('power-blast', { kind: 'eclipse', x: eclipse.x, y: eclipse.y, radius: T.eclipseBlastRadius });
        this.eclipse = null;
      }
    }
  }

  /** Where the crystal orbs are (the same circle WeaponSystem.crystalOrbs draws). */
  private orbPositions(weapon: ActiveWeapon): Vec2[] {
    return this.host.orbs(weapon);
  }

  // ── Sergio ──────────────────────────────────────────────────────────────────────────────────────────────────

  private updateSergio(delta: number): void {
    const { player, rng, clock } = this.host;
    if (this.has(2) && this.tick('crate', delta, T.crateIntervalMs)) {
      const target = this.host.nearestEnemy(player, T.crateRange);
      const angle = floatBetween(rng, 0, Math.PI * 2);
      const to = target ? { x: target.x, y: target.y } : { x: player.x + Math.cos(angle) * 180, y: player.y + Math.sin(angle) * 180 };
      const spot = this.host.arena.nearestWalkable(to.x, to.y, 20);
      this.crates.push({ fromX: player.x, fromY: player.y, toX: spot.x, toY: spot.y, elapsedMs: 0 });
      this.host.events.emit('power-cast', { kind: 'crate', x: player.x, y: player.y });
    }
    for (let index = this.crates.length - 1; index >= 0; index -= 1) {
      const crate = this.crates[index];
      crate.elapsedMs += delta;
      if (crate.elapsedMs < T.crateFlightMs) continue;
      this.crates.splice(index, 1);
      const at = { x: crate.toX, y: crate.toY };
      const damage = this.damage(T.crateDamage);
      this.host.enemiesWithin(at, T.crateRadius).forEach((enemy) => this.hit(enemy, damage));
      for (let coin = 0; coin < T.crateCoins; coin += 1) this.host.dropPickup('gem', at.x + floatBetween(rng, -45, 45), at.y + floatBetween(rng, -45, 45), 3);
      this.host.dropPickup(rng() < 0.2 ? 'chest' : 'potion', at.x, at.y, 25);
      this.host.events.emit('power-blast', { kind: 'crate', x: at.x, y: at.y, radius: T.crateRadius });
    }
    if (this.has(3) && this.tick('sale', delta, T.saleIntervalMs)) {
      this.host.events.emit('power-cast', { kind: 'sale', x: player.x, y: player.y });
      for (let item = 0; item < T.saleItems; item += 1) {
        clock.delayedCall((item / T.saleItems) * T.saleSpreadMs, () => this.landSaleItem());
      }
    }
  }

  private landSaleItem(): void {
    const { player, rng } = this.host;
    const angle = floatBetween(rng, 0, Math.PI * 2);
    const distance = floatBetween(rng, 50, T.saleRadius);
    const at = { x: player.x + Math.cos(angle) * distance, y: player.y + Math.sin(angle) * distance };
    const kind = pickOne(rng, ['pan', 'bottle', 'potion'] as const);
    const damage = this.damage(T.saleItemDamage);
    this.host.enemiesWithin(at, T.saleItemRadius).forEach((enemy) => {
      this.hit(enemy, damage);
      if (kind === 'pan') this.host.stunEnemy(enemy, T.saleStunMs);
    });
    if (kind === 'potion') this.host.healPlayer(player.maxHealth * T.saleHeal);
    this.host.events.emit('power-item', { kind, x: at.x, y: at.y });
  }
}
