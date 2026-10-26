import { GRAVEYARD, TEMPLE, ZoneKind } from '../../config/arenaLayout';
import { MINI_BOSS_VARIANTS } from '../../config/balance';
import { EventBus } from '../EventBus';
import { Rng, Vec2, floatBetween, pickOne } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';
import { MiniBossVariantId } from './EnemySpawnScheduler';

// Zone mini-bosses: one guardian per area, two per cycle (see GameSession's schedule), each testing one skill on its
// own terrain and paying out a companion from that zone. Like BossSystem, everything runs on the sim clock inside
// the boss's own state, and this system moves its bosses itself (the Guardião turns slowly and charges in a line,
// which the horde's flow-field pursuit can't do).

export type MiniBossKind = MiniBossVariantId;
export type CompanionKind = 'skeletonArcher' | 'stoneGolem';

export interface MiniBossSpec {
  name: string;
  /** Where it's announced: "O Coveiro desperta no cemitério!" */
  where: string;
  zone: ZoneKind;
  anchor: Vec2;
  /** Leaves its zone only this far: beyond it, it walks home and regenerates. */
  leashRadius: number;
  companion: CompanionKind;
}

export const MINI_BOSSES: Record<MiniBossKind, MiniBossSpec> = {
  gravedigger: { name: 'O Coveiro', where: 'no cemitério', zone: 'graveyard', anchor: GRAVEYARD.center, leashRadius: 700, companion: 'skeletonArcher' },
  templeGuardian: { name: 'Guardião do Templo', where: 'nas ruínas', zone: 'ruins', anchor: TEMPLE.center, leashRadius: 720, companion: 'stoneGolem' }
};
/** Rotation order of the per-cycle mini-boss slots. */
export const MINI_BOSS_ROTATION: MiniBossKind[] = ['gravedigger', 'templeGuardian'];

export const MINI_BOSS_TUNING = {
  warningMs: 2200,
  /** Leashing: walk home this much faster, regenerating this fraction of max health per second. */
  leashSpeedMultiplier: 1.6,
  leashRegenPerSecond: 0.03,
  // ── O Coveiro ──
  raiseIntervalMs: 6000,
  raiseCount: 5,
  raisePoseMs: 900,
  slamTriggerRange: 170,
  slamCooldownMs: 3500,
  slamTelegraphMs: 800,
  slamReach: 90,
  slamRadius: 100,
  slamDamage: 25,
  burrowCooldownMs: 11000,
  burrowMinDistance: 260,
  burrowSinkMs: 600,
  burrowTunnelMs: 1200,
  burrowTunnelSpeed: 420,
  burrowEmergeMs: 700,
  burrowRadius: 110,
  burrowDamage: 30,
  recoverMs: 450,
  // ── Guardião do Templo ──
  guardianTurnRate: (70 * Math.PI) / 180,
  /** Hits from within this half-angle of where it faces land on stone. */
  frontArc: (60 * Math.PI) / 180,
  frontDamageMultiplier: 0.3,
  chargeCooldownMs: 9000,
  chargeMinDistance: 220,
  chargeTelegraphMs: 1000,
  chargeMs: 900,
  chargeSpeed: 850,
  chargeDamage: 35,
  /** Hitting a wall mid-charge stuns it — its back and front both open up. */
  stunMs: 1800,
  stunDamageMultiplier: 1.5,
  shockwaveTriggerRange: 300,
  shockwaveCooldownMs: 6000,
  shockwaveTelegraphMs: 1200,
  shockwaveMs: 800,
  shockwaveRadius: 380,
  shockwaveDamage: 30
};

export type MiniBossAttackType = 'raise' | 'slam' | 'burrow' | 'charge' | 'shockwave';

export interface MiniBossAttack {
  type: MiniBossAttackType;
  /** telegraph → active → recover; the burrow goes sink → tunnel → emerge (its telegraph) → recover. */
  phase: 'telegraph' | 'active' | 'recover' | 'sink' | 'tunnel' | 'emerge';
  elapsedMs: number;
  /** Target point (slam, burrow exit) or charge direction. */
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  hit: boolean;
}

/** One live mini-boss. Public for the renderer (poses, telegraphs). */
export interface MiniBossState {
  kind: MiniBossKind;
  enemy: EnemyState;
  anchor: Vec2;
  leashing: boolean;
  /** Facing angle (sim, radians). The Guardião turns slowly; the Coveiro snaps. */
  facing: number;
  attack: MiniBossAttack | null;
  cooldowns: Record<'raise' | 'slam' | 'burrow' | 'charge' | 'shockwave', number>;
  stunnedMs: number;
}

export interface MiniBossEvents extends Record<string, unknown> {
  'miniboss-warning': { kind: MiniBossKind };
  'miniboss-spawned': { kind: MiniBossKind; enemy: EnemyState };
  'miniboss-impact': { kind: MiniBossKind; attack: MiniBossAttackType; x: number; y: number; radius: number };
  'miniboss-stunned': { kind: MiniBossKind; enemy: EnemyState };
  'miniboss-defeated': { kind: MiniBossKind; x: number; y: number };
}

export interface MiniBossHost {
  readonly player: PlayerState;
  readonly rng: Rng;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<MiniBossEvents>, 'emit'>;
  spawnEnemy(variantId: MiniBossKind, x: number, y: number, maxHealth: number): EnemyState | null;
  hurtPlayer(amount: number): void;
  /** A skeleton climbing out of the ground here shortly (the boss fight's rising, reused). */
  queueRising(x: number, y: number): void;
  /** Difficulty-stage health multiplier right now. */
  healthMultiplier(): number;
}

export class MiniBossSystem {
  readonly bosses: MiniBossState[] = [];
  /** Announced, spawning when the countdown ends. */
  pending: { kind: MiniBossKind; inMs: number } | null = null;

  constructor(private readonly host: MiniBossHost) {}

  get active(): boolean {
    return this.pending !== null || this.bosses.length > 0;
  }

  bossFor(enemy: EnemyState): MiniBossState | undefined {
    return this.bosses.find((boss) => boss.enemy === enemy);
  }

  /** The session never pursues for these: this system moves them. */
  controls(enemy: EnemyState): boolean {
    return !!this.bossFor(enemy);
  }

  /** Announces `kind`, spawning it at its zone after the warning. Ignored while another is up. */
  announce(kind: MiniBossKind): boolean {
    if (this.active) return false;
    this.pending = { kind, inMs: MINI_BOSS_TUNING.warningMs };
    this.host.events.emit('miniboss-warning', { kind });
    return true;
  }

  /** Hit multiplier: 0 underground, the Guardião's stone front, extra while stunned. */
  damageTakenMultiplier(enemy: EnemyState): number {
    const boss = this.bossFor(enemy);
    if (!boss) return 1;
    if (boss.attack?.type === 'burrow' && (boss.attack.phase === 'sink' || boss.attack.phase === 'tunnel' || boss.attack.phase === 'emerge')) return 0;
    if (boss.stunnedMs > 0) return MINI_BOSS_TUNING.stunDamageMultiplier;
    if (boss.kind === 'templeGuardian') {
      const { player } = this.host;
      const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      if (Math.abs(wrapAngle(toPlayer - boss.facing)) <= MINI_BOSS_TUNING.frontArc) return MINI_BOSS_TUNING.frontDamageMultiplier;
    }
    return 1;
  }

  /** Forgets a defeated mini-boss; returns its kind. */
  defeat(enemy: EnemyState): MiniBossKind | null {
    const index = this.bosses.findIndex((boss) => boss.enemy === enemy);
    if (index === -1) return null;
    const [boss] = this.bosses.splice(index, 1);
    this.host.events.emit('miniboss-defeated', { kind: boss.kind, x: enemy.x, y: enemy.y });
    return boss.kind;
  }

  /** Drops everything (the final boss's wave clears the field). */
  clear(): void {
    this.bosses.length = 0;
    this.pending = null;
  }

  update(delta: number): void {
    for (let index = this.bosses.length - 1; index >= 0; index -= 1) {
      if (!this.bosses[index].enemy.alive) this.bosses.splice(index, 1);
    }
    if (this.pending) {
      this.pending.inMs -= delta;
      if (this.pending.inMs <= 0) {
        const { kind } = this.pending;
        this.pending = null;
        this.spawn(kind);
      }
    }
    [...this.bosses].forEach((boss) => {
      if (!boss.enemy.alive) return;
      (Object.keys(boss.cooldowns) as Array<keyof MiniBossState['cooldowns']>).forEach((key) => { boss.cooldowns[key] += delta; });
      if (boss.stunnedMs > 0) {
        boss.stunnedMs = Math.max(0, boss.stunnedMs - delta);
        return;
      }
      if (boss.attack) {
        if (boss.kind === 'gravedigger') this.updateCoveiroAttack(boss, delta);
        else this.updateGuardianAttack(boss, delta);
        return;
      }
      if (this.updateLeash(boss, delta)) return;
      if (boss.kind === 'gravedigger') this.thinkCoveiro(boss, delta);
      else this.thinkGuardian(boss, delta);
    });
  }

  private spawn(kind: MiniBossKind): void {
    const spec = MINI_BOSSES[kind];
    const spot = this.host.arena.nearestWalkable(spec.anchor.x, spec.anchor.y, 40);
    const enemy = this.host.spawnEnemy(kind, spot.x, spot.y, MINI_BOSS_VARIANTS[kind].maxHealth * this.host.healthMultiplier());
    if (!enemy) return;
    const { player } = this.host;
    this.bosses.push({
      kind,
      enemy,
      anchor: spot,
      leashing: false,
      facing: Math.atan2(player.y - spot.y, player.x - spot.x),
      attack: null,
      // A little grace before the first of each attack.
      cooldowns: { raise: MINI_BOSS_TUNING.raiseIntervalMs - 1500, slam: 0, burrow: 4000, charge: 4000, shockwave: 2500 },
      stunnedMs: 0
    });
    this.host.events.emit('miniboss-spawned', { kind, enemy });
  }

  /** Beyond its zone, the mini-boss gives up the chase: it walks home, regenerating, until the player comes back. */
  private updateLeash(boss: MiniBossState, delta: number): boolean {
    const { player } = this.host;
    const leash = MINI_BOSSES[boss.kind].leashRadius;
    const playerFromHome = Math.hypot(player.x - boss.anchor.x, player.y - boss.anchor.y);
    if (!boss.leashing && playerFromHome > leash) boss.leashing = true;
    if (boss.leashing && playerFromHome <= leash * 0.85) boss.leashing = false;
    if (!boss.leashing) return false;
    const { enemy } = boss;
    enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * MINI_BOSS_TUNING.leashRegenPerSecond * (delta / 1000));
    this.walkTowards(boss, boss.anchor.x, boss.anchor.y, enemy.movementSpeed * MINI_BOSS_TUNING.leashSpeedMultiplier, delta, true);
    return true;
  }

  private walkTowards(boss: MiniBossState, x: number, y: number, speed: number, delta: number, snapFacing: boolean): number {
    const { enemy } = boss;
    const dx = x - enemy.x;
    const dy = y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return 0;
    if (snapFacing) boss.facing = Math.atan2(dy, dx);
    const step = Math.min(distance, (speed * delta) / 1000);
    const beforeX = enemy.x;
    const beforeY = enemy.y;
    enemy.x += Math.cos(boss.facing) * step;
    enemy.y += Math.sin(boss.facing) * step;
    this.host.arena.resolve(enemy);
    enemy.facingX = Math.cos(boss.facing);
    enemy.facingY = Math.sin(boss.facing);
    return Math.hypot(enemy.x - beforeX, enemy.y - beforeY);
  }

  private start(boss: MiniBossState, type: MiniBossAttackType, phase: MiniBossAttack['phase'], x = 0, y = 0, dirX = 0, dirY = 0): void {
    boss.attack = { type, phase, elapsedMs: 0, x, y, dirX, dirY, hit: false };
  }

  private impact(boss: MiniBossState, attack: MiniBossAttackType, x: number, y: number, radius: number, damage: number): void {
    this.host.events.emit('miniboss-impact', { kind: boss.kind, attack, x, y, radius });
    const { player } = this.host;
    if (Math.hypot(player.x - x, player.y - y) <= radius + player.radius) this.host.hurtPlayer(damage);
  }

  // ── O Coveiro: raises the dead from the graves, shovel slams, burrows under you ──────────────────────────────

  private thinkCoveiro(boss: MiniBossState, delta: number): void {
    const T = MINI_BOSS_TUNING;
    const { player } = this.host;
    const { enemy } = boss;
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (boss.cooldowns.raise >= T.raiseIntervalMs) {
      boss.cooldowns.raise = 0;
      this.start(boss, 'raise', 'active');
      this.raiseDead(boss);
      return;
    }
    if (distance >= T.burrowMinDistance && boss.cooldowns.burrow >= T.burrowCooldownMs) {
      boss.cooldowns.burrow = 0;
      this.start(boss, 'burrow', 'sink');
      return;
    }
    if (distance <= T.slamTriggerRange && boss.cooldowns.slam >= T.slamCooldownMs) {
      boss.cooldowns.slam = 0;
      boss.facing = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      this.start(boss, 'slam', 'telegraph', enemy.x + Math.cos(boss.facing) * T.slamReach, enemy.y + Math.sin(boss.facing) * T.slamReach);
      return;
    }
    if (distance > enemy.radius + player.radius) this.walkTowards(boss, player.x, player.y, enemy.movementSpeed, delta, true);
  }

  /** Skeletons claw out of the graves nearest the player (or around the Coveiro if no grave is close). */
  private raiseDead(boss: MiniBossState): void {
    const { arena, player, rng } = this.host;
    const graves = arena.obstacles.filter((obstacle) => obstacle.kind === 'gravestone' && Math.hypot(obstacle.x - boss.anchor.x, obstacle.y - boss.anchor.y) < MINI_BOSSES.gravedigger.leashRadius);
    for (let index = 0; index < MINI_BOSS_TUNING.raiseCount; index += 1) {
      const grave = graves.length > 0 ? pickOne(rng, graves) : null;
      const angle = floatBetween(rng, 0, Math.PI * 2);
      const origin = grave ?? boss.enemy;
      const reach = grave ? 26 : floatBetween(rng, 80, 160);
      const spot = arena.nearestWalkable(origin.x + Math.cos(angle) * reach, origin.y + Math.sin(angle) * reach, 14);
      // Keep them from popping up right on top of the player.
      if (Math.hypot(spot.x - player.x, spot.y - player.y) < 60) continue;
      this.host.queueRising(spot.x, spot.y);
    }
  }

  private updateCoveiroAttack(boss: MiniBossState, delta: number): void {
    const T = MINI_BOSS_TUNING;
    const attack = boss.attack!;
    const { enemy } = boss;
    const { player } = this.host;
    attack.elapsedMs += delta;
    switch (attack.type) {
      case 'raise':
        if (attack.elapsedMs >= T.raisePoseMs) boss.attack = null;
        return;
      case 'slam':
        if (attack.phase === 'telegraph' && attack.elapsedMs >= T.slamTelegraphMs) {
          this.impact(boss, 'slam', attack.x, attack.y, T.slamRadius, T.slamDamage);
          this.next(attack, 'recover');
        } else if (attack.phase === 'recover' && attack.elapsedMs >= T.recoverMs) boss.attack = null;
        return;
      case 'burrow':
        if (attack.phase === 'sink' && attack.elapsedMs >= T.burrowSinkMs) this.next(attack, 'tunnel');
        else if (attack.phase === 'tunnel') {
          // Underground, homing on the player (walls don't stop it); the crack trail on the ground gives it away.
          const dx = player.x - enemy.x;
          const dy = player.y - enemy.y;
          const distance = Math.hypot(dx, dy);
          const step = Math.min(distance, (T.burrowTunnelSpeed * delta) / 1000);
          if (distance > 0) {
            boss.facing = Math.atan2(dy, dx);
            enemy.x += (dx / distance) * step;
            enemy.y += (dy / distance) * step;
          }
          if (attack.elapsedMs >= T.burrowTunnelMs || distance < 20) {
            const exit = this.host.arena.nearestWalkable(enemy.x, enemy.y, enemy.radius);
            enemy.x = exit.x;
            enemy.y = exit.y;
            attack.x = exit.x;
            attack.y = exit.y;
            this.next(attack, 'emerge');
          }
        } else if (attack.phase === 'emerge' && attack.elapsedMs >= T.burrowEmergeMs) {
          this.impact(boss, 'burrow', attack.x, attack.y, T.burrowRadius, T.burrowDamage);
          this.next(attack, 'recover');
        } else if (attack.phase === 'recover' && attack.elapsedMs >= T.recoverMs) boss.attack = null;
        return;
      default:
        boss.attack = null;
    }
  }

  // ── Guardião do Templo: stone front, slow turn, charges that stun it on walls, shockwaves pillars block ──────

  private thinkGuardian(boss: MiniBossState, delta: number): void {
    const T = MINI_BOSS_TUNING;
    const { player } = this.host;
    const { enemy } = boss;
    const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    this.turnTowards(boss, toPlayer, T.guardianTurnRate, delta);
    if (distance <= T.shockwaveTriggerRange && boss.cooldowns.shockwave >= T.shockwaveCooldownMs) {
      boss.cooldowns.shockwave = 0;
      this.start(boss, 'shockwave', 'telegraph', enemy.x, enemy.y);
      return;
    }
    if (distance >= T.chargeMinDistance && boss.cooldowns.charge >= T.chargeCooldownMs) {
      boss.cooldowns.charge = 0;
      this.start(boss, 'charge', 'telegraph');
      return;
    }
    // Walks only roughly where it faces: get behind it and it has to turn first.
    if (Math.abs(wrapAngle(toPlayer - boss.facing)) < Math.PI / 3 && distance > enemy.radius + player.radius) this.walkTowards(boss, player.x, player.y, enemy.movementSpeed, delta, false);
  }

  private turnTowards(boss: MiniBossState, target: number, rate: number, delta: number): void {
    const difference = wrapAngle(target - boss.facing);
    const step = rate * (delta / 1000);
    boss.facing = Math.abs(difference) <= step ? target : boss.facing + Math.sign(difference) * step;
    boss.enemy.facingX = Math.cos(boss.facing);
    boss.enemy.facingY = Math.sin(boss.facing);
  }

  private updateGuardianAttack(boss: MiniBossState, delta: number): void {
    const T = MINI_BOSS_TUNING;
    const attack = boss.attack!;
    const { enemy } = boss;
    const { player, arena } = this.host;
    attack.elapsedMs += delta;
    if (attack.type === 'charge') {
      if (attack.phase === 'telegraph') {
        // Lines up quickly for most of the wind-up, then commits.
        if (attack.elapsedMs < T.chargeTelegraphMs * 0.6) this.turnTowards(boss, Math.atan2(player.y - enemy.y, player.x - enemy.x), T.guardianTurnRate * 3, delta);
        if (attack.elapsedMs >= T.chargeTelegraphMs) {
          attack.dirX = Math.cos(boss.facing);
          attack.dirY = Math.sin(boss.facing);
          this.next(attack, 'active');
        }
        return;
      }
      if (attack.phase === 'active') {
        const expected = (T.chargeSpeed * delta) / 1000;
        const moved = this.walkTowards(boss, enemy.x + attack.dirX * 1000, enemy.y + attack.dirY * 1000, T.chargeSpeed, delta, false);
        if (!attack.hit && Math.hypot(player.x - enemy.x, player.y - enemy.y) <= enemy.radius + player.radius + 12) {
          attack.hit = true;
          this.host.hurtPlayer(T.chargeDamage);
        }
        if (moved < expected * 0.5) {
          // Slammed into a wall or pillar: dazed.
          boss.attack = null;
          boss.stunnedMs = T.stunMs;
          this.host.events.emit('miniboss-impact', { kind: boss.kind, attack: 'charge', x: enemy.x, y: enemy.y, radius: enemy.radius * 2 });
          this.host.events.emit('miniboss-stunned', { kind: boss.kind, enemy });
          return;
        }
        if (attack.elapsedMs >= T.chargeMs) this.next(attack, 'recover');
        return;
      }
      if (attack.elapsedMs >= T.recoverMs) boss.attack = null;
      return;
    }
    if (attack.type === 'shockwave') {
      if (attack.phase === 'telegraph') {
        if (attack.elapsedMs >= T.shockwaveTelegraphMs) {
          this.host.events.emit('miniboss-impact', { kind: boss.kind, attack: 'shockwave', x: attack.x, y: attack.y, radius: T.shockwaveRadius });
          this.next(attack, 'active');
        }
        return;
      }
      if (attack.phase === 'active') {
        // An expanding ring: it hits once as it passes the player — unless a pillar or wall is in the way.
        const radius = T.shockwaveRadius * Math.min(1, attack.elapsedMs / T.shockwaveMs);
        const distance = Math.hypot(player.x - attack.x, player.y - attack.y);
        if (!attack.hit && Math.abs(distance - radius) <= player.radius + 16 && arena.hasLineOfSight({ x: attack.x, y: attack.y }, player)) {
          attack.hit = true;
          this.host.hurtPlayer(T.shockwaveDamage);
        }
        if (attack.elapsedMs >= T.shockwaveMs) this.next(attack, 'recover');
        return;
      }
      if (attack.elapsedMs >= T.recoverMs) boss.attack = null;
      return;
    }
    boss.attack = null;
  }

  private next(attack: MiniBossAttack, phase: MiniBossAttack['phase']): void {
    attack.phase = phase;
    attack.elapsedMs = 0;
  }
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
