import { GRAVEYARD, LAKE, TEMPLE, ZoneKind } from '../../config/arenaLayout';
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
export type CompanionKind = 'gravedigger' | 'stoneGolem' | 'waterFairy';

export interface MiniBossSpec {
  name: string;
  /** Where it's announced: "O Coveiro desperta no cemitério!" */
  where: string;
  zone: ZoneKind;
  anchor: Vec2;
  /** Leaves its zone only this far: beyond it, it walks home and regenerates. */
  leashRadius: number;
  companion: CompanionKind;
  /** Appears right where its anchor is, even in deep water (the lake spirit rises from the middle of the lake). */
  spawnInWater?: boolean;
}

export const MINI_BOSSES: Record<MiniBossKind, MiniBossSpec> = {
  gravedigger: { name: 'O Coveiro', where: 'no cemitério', zone: 'graveyard', get anchor() { return GRAVEYARD.center; }, leashRadius: 700, companion: 'gravedigger' },
  templeGuardian: { name: 'Guardião do Templo', where: 'nas ruínas', zone: 'ruins', get anchor() { return TEMPLE.center; }, leashRadius: 720, companion: 'stoneGolem' },
  lakeSpirit: { name: 'O Espírito do Lago', where: 'no lago', zone: 'lake', get anchor() { return LAKE.center; }, leashRadius: 1000, companion: 'waterFairy', spawnInWater: true }
};
/** Rotation order of the per-cycle mini-boss slots. */
export const MINI_BOSS_ROTATION: MiniBossKind[] = ['gravedigger', 'lakeSpirit', 'templeGuardian'];

export const MINI_BOSS_TUNING = {
  warningMs: 2200,
  /** Leashing: walk home this much faster, regenerating this fraction of max health per second, up to
   *  leashRegenCap of max health per retreat. */
  leashSpeedMultiplier: 1.6,
  leashRegenPerSecond: 0.03,
  leashRegenCap: 0.2,
  // ── O Coveiro ──
  raiseIntervalMs: 9000,
  raiseCount: 4,
  raisePoseMs: 900,
  slamTriggerRange: 170,
  slamCooldownMs: 5000,
  slamTelegraphMs: 800,
  slamReach: 90,
  slamRadius: 100,
  slamDamage: 16,
  burrowCooldownMs: 16000,
  burrowMinDistance: 260,
  burrowSinkMs: 600,
  burrowTunnelMs: 1200,
  burrowTunnelSpeed: 420,
  burrowEmergeMs: 700,
  burrowRadius: 110,
  burrowDamage: 20,
  recoverMs: 450,
  // ── Guardião do Templo ──
  guardianTurnRate: (70 * Math.PI) / 180,
  /** Hits from within this half-angle of where it faces land on stone. */
  frontArc: (60 * Math.PI) / 180,
  frontDamageMultiplier: 0.3,
  chargeCooldownMs: 13000,
  chargeMinDistance: 220,
  chargeTelegraphMs: 1000,
  chargeMs: 900,
  chargeSpeed: 850,
  chargeDamage: 22,
  /** Hitting a wall mid-charge stuns it — its back and front both open up. */
  stunMs: 1800,
  stunDamageMultiplier: 1.5,
  shockwaveTriggerRange: 300,
  shockwaveCooldownMs: 9000,
  shockwaveTelegraphMs: 1200,
  shockwaveMs: 800,
  shockwaveRadius: 380,
  shockwaveDamage: 20,
  // ── O Espírito do Lago ──
  /** Rises small from the middle of the lake and drinks it dry, growing, untouchable meanwhile. */
  drainMs: 4500,
  spiritSmallSize: 80,
  spiritBigSize: 230,
  spiritSmallRadius: 24,
  spiritBigRadius: 56,
  /** Tidal wave: a wall of water rolling out from it, a long band perpendicular to the throw. */
  waveCooldownMs: 11000,
  waveTelegraphMs: 1000,
  waveSpeed: 650,
  waveRange: 700,
  waveThickness: 70,
  waveHalfLength: 150,
  waveDamage: 18,
  wavePush: 110,
  /** Geysers: erupt one after another wherever the player stands. */
  geyserCooldownMs: 8500,
  geyserCount: 3,
  geyserGapMs: 450,
  geyserTelegraphMs: 900,
  geyserRadius: 75,
  geyserDamage: 14,
  /** Whirlpool: drags the player towards it; its core hurts. */
  whirlCooldownMs: 18000,
  whirlMs: 3200,
  whirlRange: 650,
  whirlPull: 120,
  whirlCoreRadius: 130,
  whirlDamage: 8,
  whirlTickMs: 500
};

export type MiniBossAttackType = 'raise' | 'slam' | 'burrow' | 'charge' | 'shockwave' | 'drain' | 'wave' | 'geyser' | 'whirlpool';

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
  /** Geysers launched so far (geyser volley), damage ticks dealt (whirlpool). */
  count: number;
}

/** A geyser about to erupt. */
export interface GeyserState {
  x: number;
  y: number;
  elapsedMs: number;
}

/** One live mini-boss. Public for the renderer (poses, telegraphs). */
export interface MiniBossState {
  kind: MiniBossKind;
  enemy: EnemyState;
  anchor: Vec2;
  leashing: boolean;
  /** Health regenerated during the current retreat (capped at leashRegenCap of max). */
  leashHealed: number;
  /** Facing angle (sim, radians). The Guardião turns slowly; the Coveiro snaps. */
  facing: number;
  attack: MiniBossAttack | null;
  cooldowns: Record<'raise' | 'slam' | 'burrow' | 'charge' | 'shockwave' | 'wave' | 'geyser' | 'whirlpool', number>;
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
  /** Lake fill, 0..1 (the session reroutes the horde when it drains or refills). */
  setLakeLevel(level: number): void;
  /** Shoves the player by (dx, dy), sliding along walls. */
  pushPlayer(dx: number, dy: number): void;
}

export class MiniBossSystem {
  readonly bosses: MiniBossState[] = [];
  readonly geysers: GeyserState[] = [];
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

  /** Hit multiplier: 0 underground or while drinking the lake, the Guardião's stone front, extra while stunned. */
  damageTakenMultiplier(enemy: EnemyState): number {
    const boss = this.bossFor(enemy);
    if (!boss) return 1;
    if (boss.attack?.type === 'drain') return 0;
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
    this.forget(boss);
    this.host.events.emit('miniboss-defeated', { kind: boss.kind, x: enemy.x, y: enemy.y });
    return boss.kind;
  }

  /** Drops everything (the final boss's wave clears the field). */
  clear(): void {
    this.bosses.forEach((boss) => this.forget(boss));
    this.bosses.length = 0;
    this.pending = null;
  }

  /** Cleanup when a mini-boss leaves the field: the lake spirit's water comes back. */
  private forget(boss: MiniBossState): void {
    if (boss.kind !== 'lakeSpirit') return;
    this.geysers.length = 0;
    this.host.setLakeLevel(1);
  }

  update(delta: number): void {
    for (let index = this.bosses.length - 1; index >= 0; index -= 1) {
      if (this.bosses[index].enemy.alive) continue;
      this.forget(this.bosses[index]);
      this.bosses.splice(index, 1);
    }
    this.updateGeysers(delta);
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
        else if (boss.kind === 'templeGuardian') this.updateGuardianAttack(boss, delta);
        else this.updateSpiritAttack(boss, delta);
        return;
      }
      if (this.updateLeash(boss, delta)) return;
      if (boss.kind === 'gravedigger') this.thinkCoveiro(boss, delta);
      else if (boss.kind === 'templeGuardian') this.thinkGuardian(boss, delta);
      else this.thinkSpirit(boss, delta);
    });
  }

  private spawn(kind: MiniBossKind): void {
    const spec = MINI_BOSSES[kind];
    const spot = spec.spawnInWater ? { ...spec.anchor } : this.host.arena.nearestWalkable(spec.anchor.x, spec.anchor.y, 40);
    const enemy = this.host.spawnEnemy(kind, spot.x, spot.y, MINI_BOSS_VARIANTS[kind].maxHealth * this.host.healthMultiplier());
    if (!enemy) return;
    // The spawn snapped it to dry land; the lake spirit really is in the middle of the water.
    enemy.x = enemy.prevX = spot.x;
    enemy.y = enemy.prevY = spot.y;
    const { player } = this.host;
    this.bosses.push({
      kind,
      enemy,
      anchor: spot,
      leashing: false,
      leashHealed: 0,
      facing: Math.atan2(player.y - spot.y, player.x - spot.x),
      attack: null,
      // A little grace before the first of each attack.
      cooldowns: { raise: MINI_BOSS_TUNING.raiseIntervalMs - 1500, slam: 0, burrow: 4000, charge: 4000, shockwave: 2500, wave: 3000, geyser: 1500, whirlpool: 4000 },
      stunnedMs: 0
    });
    if (kind === 'lakeSpirit') this.bosses[this.bosses.length - 1].attack = { type: 'drain', phase: 'active', elapsedMs: 0, x: spot.x, y: spot.y, dirX: 0, dirY: 0, hit: false, count: 0 };
    this.host.events.emit('miniboss-spawned', { kind, enemy });
  }

  /** Beyond its zone, the mini-boss gives up the chase: it walks home, regenerating, until the player comes back. */
  private updateLeash(boss: MiniBossState, delta: number): boolean {
    const { player } = this.host;
    const leash = MINI_BOSSES[boss.kind].leashRadius;
    const playerFromHome = Math.hypot(player.x - boss.anchor.x, player.y - boss.anchor.y);
    if (!boss.leashing && playerFromHome > leash) {
      boss.leashing = true;
      boss.leashHealed = 0;
    }
    if (boss.leashing && playerFromHome <= leash * 0.85) boss.leashing = false;
    if (!boss.leashing) return false;
    const { enemy } = boss;
    const allowance = enemy.maxHealth * MINI_BOSS_TUNING.leashRegenCap - boss.leashHealed;
    const healed = Math.max(0, Math.min(enemy.maxHealth - enemy.health, allowance, enemy.maxHealth * MINI_BOSS_TUNING.leashRegenPerSecond * (delta / 1000)));
    enemy.health += healed;
    boss.leashHealed += healed;
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
    boss.attack = { type, phase, elapsedMs: 0, x, y, dirX, dirY, hit: false, count: 0 };
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
    if (Math.abs(wrapAngle(toPlayer - boss.facing)) < Math.PI / 3 && distance > enemy.radius + player.radius) {
      const expected = (enemy.movementSpeed * delta) / 1000;
      const moved = this.walkTowards(boss, player.x, player.y, enemy.movementSpeed, delta, false);
      if (moved < expected * 0.4) this.sidestep(boss, toPlayer, expected);
    }
  }

  /** Blocked head-on by a pillar or wall: slides sideways along it (towards the side the player is on) instead of
   *  standing still behind it. */
  private sidestep(boss: MiniBossState, toPlayer: number, step: number): void {
    const { enemy } = boss;
    const side = wrapAngle(toPlayer - boss.facing) >= 0 ? 1 : -1;
    for (const turn of [side, -side]) {
      const angle = boss.facing + turn * (Math.PI / 2);
      const beforeX = enemy.x;
      const beforeY = enemy.y;
      enemy.x += Math.cos(angle) * step;
      enemy.y += Math.sin(angle) * step;
      this.host.arena.resolve(enemy);
      if (Math.hypot(enemy.x - beforeX, enemy.y - beforeY) >= step * 0.4) return;
    }
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

  // ── O Espírito do Lago: drinks the lake, tidal waves, geysers, a whirlpool ───────────────────────────────────

  private thinkSpirit(boss: MiniBossState, delta: number): void {
    const T = MINI_BOSS_TUNING;
    const { player } = this.host;
    const { enemy } = boss;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= T.whirlRange && boss.cooldowns.whirlpool >= T.whirlCooldownMs) {
      boss.cooldowns.whirlpool = 0;
      this.start(boss, 'whirlpool', 'active', enemy.x, enemy.y);
      return;
    }
    if (boss.cooldowns.wave >= T.waveCooldownMs) {
      boss.cooldowns.wave = 0;
      boss.facing = Math.atan2(dy, dx);
      this.start(boss, 'wave', 'telegraph', enemy.x, enemy.y, Math.cos(boss.facing), Math.sin(boss.facing));
      return;
    }
    if (boss.cooldowns.geyser >= T.geyserCooldownMs) {
      boss.cooldowns.geyser = 0;
      this.start(boss, 'geyser', 'active');
      return;
    }
    if (distance > enemy.radius + player.radius) this.walkTowards(boss, player.x, player.y, enemy.movementSpeed, delta, true);
  }

  private updateSpiritAttack(boss: MiniBossState, delta: number): void {
    const T = MINI_BOSS_TUNING;
    const attack = boss.attack!;
    const { enemy } = boss;
    const { player } = this.host;
    attack.elapsedMs += delta;
    switch (attack.type) {
      case 'drain': {
        // Drinks the lake: the water falls as the spirit swells.
        const t = Math.min(1, attack.elapsedMs / T.drainMs);
        enemy.displaySize = T.spiritSmallSize + (T.spiritBigSize - T.spiritSmallSize) * t;
        enemy.radius = T.spiritSmallRadius + (T.spiritBigRadius - T.spiritSmallRadius) * t;
        this.host.setLakeLevel(1 - t);
        boss.facing = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        if (t >= 1) boss.attack = null;
        return;
      }
      case 'wave': {
        if (attack.phase === 'telegraph') {
          if (attack.elapsedMs >= T.waveTelegraphMs) {
            this.host.events.emit('miniboss-impact', { kind: boss.kind, attack: 'wave', x: attack.x, y: attack.y, radius: 0 });
            this.next(attack, 'active');
          }
          return;
        }
        if (attack.phase === 'active') {
          // The wall of water's front, rolling out along the throw; it hits once as it passes the player.
          const front = T.waveSpeed * (attack.elapsedMs / 1000);
          const relX = player.x - attack.x;
          const relY = player.y - attack.y;
          const along = relX * attack.dirX + relY * attack.dirY;
          const across = Math.abs(relX * -attack.dirY + relY * attack.dirX);
          if (!attack.hit && along > 0 && Math.abs(along - front) <= T.waveThickness / 2 + player.radius && across <= T.waveHalfLength) {
            attack.hit = true;
            this.host.hurtPlayer(T.waveDamage);
            this.host.pushPlayer(attack.dirX * T.wavePush, attack.dirY * T.wavePush);
          }
          if (front >= T.waveRange) this.next(attack, 'recover');
          return;
        }
        if (attack.elapsedMs >= T.recoverMs) boss.attack = null;
        return;
      }
      case 'geyser': {
        // A geyser under the player, then another, then another — keep moving.
        while (attack.count < T.geyserCount && attack.elapsedMs >= attack.count * T.geyserGapMs) {
          this.geysers.push({ x: player.x, y: player.y, elapsedMs: 0 });
          attack.count += 1;
        }
        if (attack.count >= T.geyserCount && attack.elapsedMs >= T.geyserCount * T.geyserGapMs) boss.attack = null;
        return;
      }
      case 'whirlpool': {
        // Drags the player in; standing in its core hurts.
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 1) {
          const pull = Math.min(distance, (T.whirlPull * delta) / 1000);
          this.host.pushPlayer((dx / distance) * pull, (dy / distance) * pull);
        }
        const ticks = Math.floor(attack.elapsedMs / T.whirlTickMs);
        if (ticks > attack.count) {
          attack.count = ticks;
          if (distance <= T.whirlCoreRadius + player.radius) this.host.hurtPlayer(T.whirlDamage);
        }
        if (attack.elapsedMs >= T.whirlMs) boss.attack = null;
        return;
      }
      default:
        boss.attack = null;
    }
  }

  private updateGeysers(delta: number): void {
    const T = MINI_BOSS_TUNING;
    const { player } = this.host;
    for (let index = this.geysers.length - 1; index >= 0; index -= 1) {
      const geyser = this.geysers[index];
      geyser.elapsedMs += delta;
      if (geyser.elapsedMs < T.geyserTelegraphMs) continue;
      this.geysers.splice(index, 1);
      this.host.events.emit('miniboss-impact', { kind: 'lakeSpirit', attack: 'geyser', x: geyser.x, y: geyser.y, radius: T.geyserRadius });
      if (Math.hypot(player.x - geyser.x, player.y - geyser.y) <= T.geyserRadius + player.radius) this.host.hurtPlayer(T.geyserDamage);
    }
  }

  private next(attack: MiniBossAttack, phase: MiniBossAttack['phase']): void {
    attack.phase = phase;
    attack.elapsedMs = 0;
  }
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
