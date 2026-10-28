import { NeutralSpot } from '../../config/arenaLayout';
import { NEUTRAL_VARIANTS } from '../../config/balance';
import { EventBus } from '../EventBus';
import { Rng, Vec2, floatBetween } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { ArenaMap, lakeShoreDistance } from '../world/ArenaMap';
import { NeutralVariantId } from './EnemySpawnScheduler';

// Neutral creatures: wildlife living at fixed spots of the map. Calm, they graze around home and bolt when the hero
// comes close ("!" and a startled hop first); hurt one and its whole group turns on the hero, until the hero has been
// far away long enough and they walk home to heal. They sit outside the horde: no schedule, no cap, and the aimed
// weapons look past them while calm (area weapons still hit, so wading into a herd with an aura picks a fight).
// Like MiniBossSystem, this system moves its creatures itself.
//
// Javali and Cervo (the stag) charge down a lane; the does only ever run. A Colmeia never moves: hurt, it lets out a
// swarm that chases the hero (the lake's shore shakes it off). A Mímico sits still passing for a chest, shivers as
// the hero walks up, and springs when touched, hopping after the hero to bite.

export const NEUTRAL_TUNING = {
  /** A calm creature notices the hero this close, hops for startleMs, then runs for fleeMs. */
  noticeRadius: 230,
  startleMs: 400,
  fleeMs: 2200,
  fleeSpeedMultiplier: 1.5,
  /** Grazing: short walks to a point this far from home, at this fraction of its speed, every wander interval. */
  wanderRadius: 110,
  wanderSpeedMultiplier: 0.35,
  wanderIntervalMs: [1800, 4200] as const,
  /** Anger fades when the hero stays this far away for this long; then it walks home healing this much per second. */
  calmDistance: 600,
  calmAfterMs: 8000,
  returnRegenPerSecond: 0.08,
  /** A slain group comes back this long later, once the hero is far from its home. */
  respawnMs: 120_000,
  respawnClearance: 700,
  /** Taming (Beast's missions): while it's on, calm creatures don't bolt; stand this close to one this long and it's
   *  yours — it never runs from the hero again, until hurt. */
  tameReach: 110,
  tameMs: 3000,
  /** Hurt does keep running this much longer than a plain scare. */
  provokedFleeMultiplier: 2.5,
  // ── Javali ──
  /** Closes in to this range, digs in (windup), then charges in a straight line. */
  boarChargeRange: 340,
  boarWindupMs: 650,
  boarChargeMs: 700,
  boarChargeSpeed: 440,
  boarChargeDamage: 22,
  boarChargePush: 70,
  boarRecoverMs: 700,
  /** Running into a tree or a wall leaves it dizzy this long. */
  boarDazedMs: 1000,
  // ── Cervo (the stag): a longer, faster charge that throws the hero further ──
  stagChargeRange: 380,
  stagWindupMs: 600,
  stagChargeMs: 650,
  stagChargeSpeed: 540,
  stagChargeDamage: 20,
  stagChargePush: 110,
  stagRecoverMs: 900,
  // ── Colmeia ──
  /** An angry hive lets out a swarm this often (one at a time); the swarm chases for swarmMs. */
  hiveSwarmEveryMs: 7000,
  swarmMs: 6000,
  swarmSpeed: 175,
  /** Stings anyone within this radius, this much every sting interval. */
  swarmRadius: 46,
  swarmDamage: 4,
  swarmStingMs: 450,
  /** The hero on the lake's shore or in the shallows (within this of the deep water's edge) shakes it off. */
  swarmShoreReach: 70,
  /** Honey: heals like a potion, plus this much speed for this long. */
  honeyHastePercent: 0.15,
  honeyHasteMs: 10_000,
  // ── Mímico ──
  /** It shivers while the hero is this close, and springs when the hero comes within springRadius. */
  mimicTrembleRadius: 170,
  mimicSpringRadius: 70,
  /** Hops after the hero; within biteRange it opens wide (windup), then snaps. */
  mimicBiteRange: 60,
  mimicWindupMs: 380,
  mimicBiteDamage: 25,
  mimicRecoverMs: 550
};

export type NeutralAttackPhase = 'none' | 'windup' | 'charge' | 'bite' | 'recover' | 'dazed';

/** One creature slot of the map. `enemy` is null while it's dead and waiting to respawn. */
export interface NeutralCreature {
  variant: NeutralVariantId;
  spot: NeutralSpot;
  packId: number;
  enemy: EnemyState | null;
  respawnAt: number;
  /** Mood timers: end of the flee, when the hero was last close while angry, the next wander. */
  moodEndsAt: number;
  lastNearAt: number;
  nextWanderAt: number;
  wanderX: number;
  wanderY: number;
  /** The attack in progress (the view reads it for the telegraph). */
  attack: NeutralAttackPhase;
  attackEndsAt: number;
  dirX: number;
  dirY: number;
  hitThisCharge: boolean;
  baseContactDamage: number;
  /** A hive's next swarm. */
  nextSwarmAt: number;
  /** Tamed: calm around the hero for good (until hurt). `tameMs`: how long the hero has stood by it so far. */
  tamed: boolean;
  tameMs: number;
}

/** A Colmeia's swarm: a cloud of bees chasing the hero. */
export interface Swarm {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  endsAt: number;
  nextStingAt: number;
  /** The hive it came from (one swarm out per hive). */
  hive: NeutralCreature;
}

export interface NeutralEvents extends Record<string, unknown> {
  /** A calm creature noticed the hero: "!" and a hop, then it runs. */
  'neutral-startled': { enemy: EnemyState };
  /** Hurt: it (and its group) now fights. */
  'neutral-provoked': { enemy: EnemyState };
  /** Lost interest and is heading home. */
  'neutral-calmed': { enemy: EnemyState };
  /** Won over (Beast's missions): it stays calm by the hero. */
  'neutral-tamed': { enemy: EnemyState; variant: NeutralVariantId };
  'neutral-windup': { enemy: EnemyState; dirX: number; dirY: number };
  'neutral-charge-hit': { enemy: EnemyState };
  /** Charged into a tree or a wall. */
  'neutral-dazed': { enemy: EnemyState };
  /** A mimic's snap (hit says whether it caught the hero). */
  'neutral-bite': { enemy: EnemyState; hit: boolean };
  'swarm-released': { x: number; y: number };
  'swarm-sting': { x: number; y: number };
  /** The swarm gave up: timed out, or the hero reached the water. */
  'swarm-dispersed': { x: number; y: number; byWater: boolean };
}

export interface NeutralHost {
  player: PlayerState;
  rng: Rng;
  arena: ArenaMap;
  events: Pick<EventBus<NeutralEvents>, 'emit'>;
  now(): number;
  spawnEnemy(variantId: NeutralVariantId, x: number, y: number): EnemyState | null;
  hurtPlayer(amount: number): number;
  pushPlayer(dx: number, dy: number): void;
}

const isNeutralVariant = (id: string | undefined): id is NeutralVariantId => !!id && id in NEUTRAL_VARIANTS;

/** How each kind fights once angry. */
interface ChargeTuning { range: number; windupMs: number; chargeMs: number; speed: number; damage: number; push: number; recoverMs: number }
const T = NEUTRAL_TUNING;
const CHARGES: Partial<Record<NeutralVariantId, ChargeTuning>> = {
  boar: { range: T.boarChargeRange, windupMs: T.boarWindupMs, chargeMs: T.boarChargeMs, speed: T.boarChargeSpeed, damage: T.boarChargeDamage, push: T.boarChargePush, recoverMs: T.boarRecoverMs },
  stag: { range: T.stagChargeRange, windupMs: T.stagWindupMs, chargeMs: T.stagChargeMs, speed: T.stagChargeSpeed, damage: T.stagChargeDamage, push: T.stagChargePush, recoverMs: T.stagRecoverMs }
};

export class NeutralSystem {
  readonly creatures: NeutralCreature[] = [];
  readonly swarms: Swarm[] = [];
  private readonly byEnemy = new Map<EnemyState, NeutralCreature>();
  /** Set by the session while a taming mission is under way: calm creatures let the hero walk up. */
  taming = false;

  constructor(private readonly host: NeutralHost) {}

  /** Places every group of `spots` (the arena's layout by default) around its home. */
  populate(spots: NeutralSpot[] = this.host.arena.layout.neutrals ?? []): void {
    spots.forEach((spot) => this.addGroup(spot));
  }

  /** One more group living at `spot` (the sandbox drops them next to the hero). */
  addGroup(spot: NeutralSpot): void {
    if (!isNeutralVariant(spot.variant)) return;
    const packId = this.creatures.length;
    for (let index = 0; index < spot.count; index += 1) {
      const variant = index === 0 && isNeutralVariant(spot.leader) ? spot.leader : spot.variant;
      const creature: NeutralCreature = {
        variant, spot, packId, enemy: null, respawnAt: 0, moodEndsAt: 0, lastNearAt: 0, nextWanderAt: 0,
        wanderX: spot.home.x, wanderY: spot.home.y, attack: 'none', attackEndsAt: 0, dirX: 0, dirY: 1, hitThisCharge: false,
        baseContactDamage: 0, nextSwarmAt: 0, tamed: false, tameMs: 0
      };
      this.creatures.push(creature);
      this.spawn(creature, index);
    }
  }

  /** True for the creatures this system moves (GameSession leaves their movement and walls to it). */
  controls(enemy: EnemyState): boolean {
    return this.creatureFor(enemy) !== null;
  }

  /** How many live creatures are on the field (kept out of the horde's cap). */
  get liveCount(): number {
    let count = 0;
    this.creatures.forEach((creature) => { if (this.live(creature)) count += 1; });
    return count;
  }

  creatureFor(enemy: EnemyState): NeutralCreature | null {
    const creature = this.byEnemy.get(enemy);
    return creature && this.live(creature) ? creature : null;
  }

  /** Any hurt angers the creature and the rest of its group. */
  onHit(enemy: EnemyState): void {
    const creature = this.creatureFor(enemy);
    if (!creature) return;
    this.creatures.forEach((other) => {
      if (other.packId !== creature.packId || !this.live(other) || other.enemy!.mood === 'angry') return;
      this.provoke(other);
    });
  }

  update(deltaMs: number): void {
    const now = this.host.now();
    this.creatures.forEach((creature, index) => {
      if (!this.live(creature)) {
        if (now >= creature.respawnAt && this.distanceToHero(creature.spot.home) > T.respawnClearance) this.spawn(creature, index);
        return;
      }
      const enemy = creature.enemy!;
      const stunned = now < enemy.hitStunUntil || now < enemy.slipUntil || now < enemy.heldUntil || now < enemy.liftedUntil;
      switch (enemy.mood) {
        case 'calm': this.graze(creature, enemy, deltaMs, now); break;
        case 'startled':
          this.face(enemy, enemy.x - this.host.player.x, enemy.y - this.host.player.y);
          if (now >= enemy.startledUntil) {
            enemy.mood = 'fleeing';
            creature.moodEndsAt = Math.max(creature.moodEndsAt, now + T.fleeMs);
          }
          break;
        case 'fleeing':
          if (!stunned) this.move(enemy, enemy.x - this.host.player.x, enemy.y - this.host.player.y, enemy.effectiveMovementSpeed(now) * T.fleeSpeedMultiplier, deltaMs);
          if (now >= creature.moodEndsAt) this.calm(creature, now);
          break;
        case 'angry': this.fight(creature, enemy, deltaMs, now, stunned); break;
        case 'returning': this.walkHome(creature, enemy, deltaMs, now, stunned); break;
      }
      if (!enemy.isStatic) this.host.arena.resolve(enemy);
    });
    this.updateSwarms(deltaMs, now);
  }

  private live(creature: NeutralCreature): boolean {
    const enemy = creature.enemy;
    // The pooled body is reused once it's released: it's only still ours while it's this neutral and alive.
    const owned = !!enemy && this.byEnemy.get(enemy) === creature;
    if (!enemy || !owned || !enemy.alive || !enemy.neutral) {
      if (enemy) {
        if (owned) this.byEnemy.delete(enemy);
        creature.enemy = null;
        creature.respawnAt = this.host.now() + T.respawnMs;
      }
      return false;
    }
    return true;
  }

  private spawn(creature: NeutralCreature, index: number): void {
    // Group members stand in a small ring around the shared home.
    const angle = index * 2.4;
    const ring = creature.spot.count > 1 ? 45 : 0;
    const enemy = this.host.spawnEnemy(creature.variant, creature.spot.home.x + Math.cos(angle) * ring, creature.spot.home.y + Math.sin(angle) * ring);
    if (!enemy) return;
    enemy.packId = creature.packId;
    enemy.homeX = creature.spot.home.x;
    enemy.homeY = creature.spot.home.y;
    creature.enemy = enemy;
    creature.baseContactDamage = enemy.contactDamage;
    enemy.contactDamage = 0;
    creature.attack = 'none';
    creature.nextWanderAt = 0;
    creature.moodEndsAt = 0;
    creature.tamed = false;
    creature.tameMs = 0;
    this.byEnemy.set(enemy, creature);
  }

  private provoke(creature: NeutralCreature): void {
    const enemy = creature.enemy!;
    const now = this.host.now();
    creature.tamed = false;
    creature.tameMs = 0;
    if (creature.variant === 'doe') {
      // A doe never fights: hurt, it runs further than a plain scare.
      if (enemy.mood !== 'fleeing' && enemy.mood !== 'startled') this.host.events.emit('neutral-startled', { enemy });
      enemy.mood = 'fleeing';
      creature.moodEndsAt = now + T.fleeMs * T.provokedFleeMultiplier;
      return;
    }
    enemy.mood = 'angry';
    enemy.contactDamage = creature.baseContactDamage;
    enemy.trembleUntil = 0;
    creature.lastNearAt = now;
    creature.attack = 'none';
    // A hive's first swarm comes out at once.
    creature.nextSwarmAt = now;
    this.host.events.emit('neutral-provoked', { enemy });
  }

  private calm(creature: NeutralCreature, now: number): void {
    creature.enemy!.mood = 'calm';
    creature.nextWanderAt = now;
  }

  private graze(creature: NeutralCreature, enemy: EnemyState, deltaMs: number, now: number): void {
    const distance = this.distanceToHero(enemy);
    if (creature.variant === 'hive') return;
    if (creature.variant === 'mimic') {
      // Keeps up the act: never wanders, shivers as the hero comes up, and springs on a touch.
      if (distance <= T.mimicSpringRadius) this.onHit(enemy);
      else if (distance <= T.mimicTrembleRadius) enemy.trembleUntil = now + 120;
      return;
    }
    if (creature.tamed || this.taming) {
      if (!creature.tamed && distance <= T.tameReach) {
        creature.tameMs += deltaMs;
        if (creature.tameMs >= T.tameMs) {
          creature.tamed = true;
          this.host.events.emit('neutral-tamed', { enemy, variant: creature.variant });
        }
      } else creature.tameMs = 0;
    } else if (distance <= T.noticeRadius) {
      enemy.mood = 'startled';
      enemy.startledUntil = now + T.startleMs;
      this.host.events.emit('neutral-startled', { enemy });
      return;
    }
    if (now >= creature.nextWanderAt) {
      const angle = floatBetween(this.host.rng, 0, Math.PI * 2);
      const reach = floatBetween(this.host.rng, 0, T.wanderRadius);
      creature.wanderX = enemy.homeX + Math.cos(angle) * reach;
      creature.wanderY = enemy.homeY + Math.sin(angle) * reach;
      creature.nextWanderAt = now + floatBetween(this.host.rng, ...T.wanderIntervalMs);
    }
    const dx = creature.wanderX - enemy.x;
    const dy = creature.wanderY - enemy.y;
    if (Math.hypot(dx, dy) > 6) this.move(enemy, dx, dy, enemy.effectiveMovementSpeed(now) * T.wanderSpeedMultiplier, deltaMs);
  }

  private fight(creature: NeutralCreature, enemy: EnemyState, deltaMs: number, now: number, stunned: boolean): void {
    const distance = this.distanceToHero(enemy);
    if (distance < T.calmDistance) creature.lastNearAt = now;
    else if (now - creature.lastNearAt >= T.calmAfterMs && creature.attack === 'none') {
      enemy.mood = 'returning';
      enemy.contactDamage = 0;
      this.host.events.emit('neutral-calmed', { enemy });
      return;
    }
    const charge = CHARGES[creature.variant];
    if (charge) this.fightByCharging(creature, enemy, charge, distance, deltaMs, now, stunned);
    else if (creature.variant === 'mimic') this.fightByBiting(creature, enemy, distance, deltaMs, now, stunned);
    else if (creature.variant === 'hive' && now >= creature.nextSwarmAt && !this.swarms.some((swarm) => swarm.hive === creature)) {
      creature.nextSwarmAt = now + T.hiveSwarmEveryMs;
      this.swarms.push({ x: enemy.x, y: enemy.y, prevX: enemy.x, prevY: enemy.y, endsAt: now + T.swarmMs, nextStingAt: now, hive: creature });
      this.host.events.emit('swarm-released', { x: enemy.x, y: enemy.y });
    }
  }

  /** Javali, Cervo: close in, dig in facing the hero (the lane shows), then run that line; a wall stops it dizzy. */
  private fightByCharging(creature: NeutralCreature, enemy: EnemyState, charge: ChargeTuning, distance: number, deltaMs: number, now: number, stunned: boolean): void {
    const { player } = this.host;
    if (creature.attack === 'none') {
      if (stunned) return;
      if (distance <= charge.range) {
        creature.attack = 'windup';
        creature.attackEndsAt = now + charge.windupMs;
        enemy.windupUntil = creature.attackEndsAt;
        creature.dirX = (player.x - enemy.x) / (distance || 1);
        creature.dirY = (player.y - enemy.y) / (distance || 1);
        enemy.windupDirX = creature.dirX;
        enemy.windupDirY = creature.dirY;
        enemy.windupReach = charge.speed * (charge.chargeMs / 1000);
        this.face(enemy, creature.dirX, creature.dirY);
        this.host.events.emit('neutral-windup', { enemy, dirX: creature.dirX, dirY: creature.dirY });
      } else {
        this.move(enemy, player.x - enemy.x, player.y - enemy.y, enemy.effectiveMovementSpeed(now), deltaMs);
      }
      return;
    }
    if (creature.attack === 'charge') {
      const step = (charge.speed * deltaMs) / 1000;
      const targetX = enemy.x + creature.dirX * step;
      const targetY = enemy.y + creature.dirY * step;
      enemy.x = targetX;
      enemy.y = targetY;
      this.host.arena.resolve(enemy);
      // Walls push it back against its heading: it ran into something solid.
      if (Math.hypot(enemy.x - targetX, enemy.y - targetY) > step * 0.4) {
        creature.attack = 'dazed';
        creature.attackEndsAt = now + T.boarDazedMs;
        this.host.events.emit('neutral-dazed', { enemy });
        return;
      }
      if (!creature.hitThisCharge && Math.hypot(player.x - enemy.x, player.y - enemy.y) <= player.radius + enemy.radius) {
        creature.hitThisCharge = true;
        this.host.hurtPlayer(charge.damage);
        this.host.pushPlayer(creature.dirX * charge.push, creature.dirY * charge.push);
        this.host.events.emit('neutral-charge-hit', { enemy });
      }
    }
    if (now < creature.attackEndsAt) return;
    if (creature.attack === 'windup') {
      creature.attack = 'charge';
      creature.attackEndsAt = now + charge.chargeMs;
      creature.hitThisCharge = false;
    } else if (creature.attack === 'charge') {
      creature.attack = 'recover';
      creature.attackEndsAt = now + charge.recoverMs;
    } else {
      creature.attack = 'none';
    }
  }

  /** Mímico: hop after the hero; at arm's length open wide, then snap shut on whatever is still there. */
  private fightByBiting(creature: NeutralCreature, enemy: EnemyState, distance: number, deltaMs: number, now: number, stunned: boolean): void {
    const { player } = this.host;
    if (creature.attack === 'none') {
      if (stunned) return;
      if (distance <= T.mimicBiteRange + player.radius) {
        creature.attack = 'windup';
        creature.attackEndsAt = now + T.mimicWindupMs;
        enemy.windupUntil = creature.attackEndsAt;
        enemy.windupReach = 0;
        this.face(enemy, player.x - enemy.x, player.y - enemy.y);
        this.host.events.emit('neutral-windup', { enemy, dirX: enemy.facingX, dirY: enemy.facingY });
      } else {
        this.move(enemy, player.x - enemy.x, player.y - enemy.y, enemy.effectiveMovementSpeed(now), deltaMs);
      }
      return;
    }
    if (now < creature.attackEndsAt) return;
    if (creature.attack === 'windup') {
      const hit = distance <= T.mimicBiteRange + player.radius + 12;
      if (hit) this.host.hurtPlayer(T.mimicBiteDamage);
      this.host.events.emit('neutral-bite', { enemy, hit });
      creature.attack = 'recover';
      creature.attackEndsAt = now + T.mimicRecoverMs;
    } else {
      creature.attack = 'none';
    }
  }

  private updateSwarms(deltaMs: number, now: number): void {
    const { player, arena } = this.host;
    const byWater = arena.authored && lakeShoreDistance(player.x, player.y, arena.layout) <= T.swarmShoreReach;
    for (let index = this.swarms.length - 1; index >= 0; index -= 1) {
      const swarm = this.swarms[index];
      swarm.prevX = swarm.x;
      swarm.prevY = swarm.y;
      if (now >= swarm.endsAt || byWater || !player.alive) {
        this.swarms.splice(index, 1);
        this.host.events.emit('swarm-dispersed', { x: swarm.x, y: swarm.y, byWater });
        continue;
      }
      const dx = player.x - swarm.x;
      const dy = player.y - swarm.y;
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        const step = Math.min(length, (T.swarmSpeed * deltaMs) / 1000);
        swarm.x += (dx / length) * step;
        swarm.y += (dy / length) * step;
      }
      if (length <= T.swarmRadius + player.radius && now >= swarm.nextStingAt) {
        swarm.nextStingAt = now + T.swarmStingMs;
        this.host.hurtPlayer(T.swarmDamage);
        this.host.events.emit('swarm-sting', { x: swarm.x, y: swarm.y });
      }
    }
  }

  private walkHome(creature: NeutralCreature, enemy: EnemyState, deltaMs: number, now: number, stunned: boolean): void {
    enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * T.returnRegenPerSecond * (deltaMs / 1000));
    const dx = enemy.homeX - enemy.x;
    const dy = enemy.homeY - enemy.y;
    if (Math.hypot(dx, dy) <= 20 || enemy.isStatic) {
      if (!enemy.isStatic) enemy.health = enemy.maxHealth;
      if (enemy.health >= enemy.maxHealth) this.calm(creature, now);
      return;
    }
    if (!stunned) this.move(enemy, dx, dy, enemy.effectiveMovementSpeed(now), deltaMs);
  }

  private move(enemy: EnemyState, dx: number, dy: number, speed: number, deltaMs: number): void {
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const step = Math.min(length, (speed * deltaMs) / 1000);
    this.face(enemy, dx, dy);
    enemy.x += enemy.facingX * step;
    enemy.y += enemy.facingY * step;
  }

  private face(enemy: EnemyState, dx: number, dy: number): void {
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    enemy.facingX = dx / length;
    enemy.facingY = dy / length;
  }

  private distanceToHero(point: Vec2): number {
    return Math.hypot(point.x - this.host.player.x, point.y - this.host.player.y);
  }
}
