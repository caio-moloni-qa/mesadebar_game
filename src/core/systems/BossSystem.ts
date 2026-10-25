import { EventBus } from '../EventBus';
import { Rng, floatBetween } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { EnemyVariantId } from './EnemySpawnScheduler';

// Port of the Phaser build's src/systems/BossSystem.ts (BOSS_REWORK_TEMP.md, every stage done) onto the sim clock:
// every scene.time.delayedCall / tween became a timer inside the boss's own state, advanced by update(delta), so it
// pauses with the session and is deterministic. The renderer draws straight from `bosses`, `meteors` and the events.

export const BOSS_TUNING = {
  messageMs: 2600,
  summonIntervalMs: 5000,
  meleeCooldownMs: 7000,
  /** First melee comes a little sooner than a full cooldown. */
  meleeInitialElapsed: 1600,
  channelIntervalMs: 15000,
  channelDurationMs: 15000,
  shieldDeadlineMs: 20000,
  cleanupMs: 30000,
  shieldMaxHealthScaling: 0.15,
  meleeTriggerRadius: 250,
  meleeDamage: 40,
  explosionRadius: 700,
  waveSpawnDistance: 980,
  extraBossSpawnDistance: 520,
  meleeTelegraphMs: 2000,
  meleeSwingRadius: 170,
  meleeSwordHitRadius: 70,
  meleeSweepMs: 320,
  beamIntervalMs: 20000,
  beamLockOnMs: 3000,
  beamLockOnBlinkStartMs: 320,
  beamLockOnBlinkEndMs: 45,
  beamDurationMs: 6000,
  beamDurationPhase2Ms: 10000,
  beamWidth: 46,
  beamTravelSpeed: 2600,
  beamDamage: 20,
  beamFollowTurnRate: (15 * Math.PI) / 180,
  beamCountPhase2: 10,
  beamCountPhase1: 5,
  beamLaunchStaggerMs: 500,
  beamLifetimeMs: 2100,
  undeadSquadSize: 15,
  undeadSquadSporadicChance: 0.25,
  apparitionCount: 30,
  meteorIntervalMs: 500,
  meteorTelegraphMs: 1500,
  meteorTelegraphPhase2Ms: 1000,
  meteorRadius: 90,
  meteorDamage: 25,
  phaseTwoHealthRatio: 0.5,
  dashTelegraphMs: 600,
  dashTravelMs: 400,
  dashCooldownMs: 4000,
  dashMaxPerChannel: 4,
  dashRadius: 130,
  dashDamage: 18,
  /** The arena clear-out feeds the boss: +this max/current health per enemy removed. */
  cleanupHealthPerEnemy: 20,
  /** Keeps spawns off the arena's very edge. */
  edgeMargin: 260
} as const;

export interface BeamState {
  angle: number;
  /** Time since this beam launched — its own growth clock. */
  elapsedMs: number;
}

export interface MeteorState {
  x: number;
  y: number;
  elapsedMs: number;
  telegraphMs: number;
}

/** One boss encounter. Public so the renderer can draw the sword, beams, shield and dash straight from it. */
export interface BossState {
  enemy: EnemyState;
  /** First boss of a timer wave: owns the arena-clear countdown. */
  isMain: boolean;
  /** Belongs to a timer wave (all must die before the portals open); sandbox extras don't. */
  isWaveBoss: boolean;
  cleanupPending: boolean;
  cleanupElapsed: number;
  summonElapsed: number;
  channelElapsed: number;
  meleeCooldownElapsed: number;
  beamElapsed: number;
  channelActive: boolean;
  shieldActive: boolean;
  channelRuntimeElapsed: number;
  shield: number;
  maxShield: number;
  meteorElapsed: number;
  shieldCountdownLastShown: number;
  /** Telegraph sword: parked beside the boss for meleeTelegraphMs, then one 360° sweep. */
  melee: { phase: 'telegraph' | 'sweep'; elapsedMs: number; startAngle: number; angle: number } | null;
  beamState: 'idle' | 'lockon' | 'active';
  beamLockOnElapsed: number;
  beamLockOnBlinkAt: number;
  /** The lock-on reticle and line blink faster and faster; this is their current visibility. */
  beamLockOnVisible: boolean;
  beamActiveElapsed: number;
  beams: BeamState[];
  beamsLaunched: number;
  beamCount: number;
  beamDurationMs: number;
  dash: { phase: 'idle' | 'telegraph' | 'dashing'; elapsedMs: number; fromX: number; fromY: number; targetX: number; targetY: number };
  dashCooldownElapsed: number;
  dashCountThisChannel: number;
}

export interface BossEvents extends Record<string, unknown> {
  /** "O sobrevivente sente uma presença maligna no ar!" — the wave lands BOSS_TUNING.messageMs later. */
  'boss-warning': { bossCount: number };
  'boss-spawned': { enemy: EnemyState };
  'boss-explosion': { x: number; y: number; radius: number; kind: 'shield' | 'dash' | 'meteor' };
  /** Last 10 s before an unbroken shield explodes: "10...", "9...", ... above the boss. */
  'boss-shield-countdown': { enemy: EnemyState; seconds: number };
  /** The main boss's countdown ran out: every other enemy is gone and the boss absorbed them. */
  'boss-arena-consumed': { cleared: number };
}

export interface BossHost {
  readonly player: PlayerState;
  readonly rng: Rng;
  readonly arenaSize: number;
  readonly events: Pick<EventBus<BossEvents>, 'emit'>;
  now(): number;
  spawnEnemy(variantId: EnemyVariantId, x: number, y: number): EnemyState | null;
  /** Damage through the player's normal path (i-frames, armor, the damage callout). */
  hurtPlayer(amount: number): void;
  /** The unbroken shield's explosion: instant death unless invincible. */
  killPlayer(): void;
  /** Removes every active enemy except `preserve`; returns how many. */
  clearEnemyField(preserve: EnemyState): number;
}

export class BossSystem {
  readonly bosses: BossState[] = [];
  readonly meteors: MeteorState[] = [];
  private triggered = false;
  private pendingWaveCount = 0;
  /** Counts down the warning banner before the wave spawns; null when no wave is pending. */
  private pendingSpawnIn: number | null = null;

  constructor(private readonly host: BossHost) {}

  /** Shows the warning and spawns `bossCount` wave bosses after it. Once per wave until rearm(). */
  warn(bossCount = 1): void {
    if (this.triggered) return;
    this.triggered = true;
    this.pendingWaveCount = bossCount;
    this.pendingSpawnIn = BOSS_TUNING.messageMs;
    this.host.events.emit('boss-warning', { bossCount });
  }

  /** Lets the next cycle's wave fire. */
  rearm(): void {
    this.triggered = false;
  }

  /** True while the warning is up or any boss lives — enemy spawning and the merchant wait meanwhile. */
  hasActiveEncounter(): boolean {
    return this.pendingSpawnIn !== null || this.bosses.length > 0;
  }

  hasActiveWaveBosses(): boolean {
    return this.bosses.some((boss) => boss.isWaveBoss);
  }

  get warningActive(): boolean {
    return this.pendingSpawnIn !== null;
  }

  bossFor(enemy: EnemyState): BossState | undefined {
    return this.bosses.find((boss) => boss.enemy === enemy);
  }

  /** Stands still for the whole shield sequence, while beaming and while dashing (the dash moves it itself). */
  holdsStill(enemy: EnemyState): boolean {
    const boss = this.bossFor(enemy);
    return !!boss && (boss.channelActive || boss.shieldActive || boss.beamState !== 'idle' || boss.dash.phase !== 'idle');
  }

  /** Sandbox: an instant extra boss that gates nothing. */
  spawnExtraBoss(): void {
    const { player, rng } = this.host;
    const angle = floatBetween(rng, 0, Math.PI * 2);
    this.spawnBossAt(player.x + Math.cos(angle) * BOSS_TUNING.extraBossSpawnDistance, player.y + Math.sin(angle) * BOSS_TUNING.extraBossSpawnDistance, false, false);
  }

  update(delta: number): void {
    if (this.pendingSpawnIn !== null) {
      this.pendingSpawnIn -= delta;
      if (this.pendingSpawnIn <= 0) this.spawnWave();
    }
    [...this.bosses].forEach((boss) => this.updateBoss(boss, delta));
    this.updateMeteors(delta);
  }

  /** Damage into an active shield. null = not a shielded boss (apply normally); otherwise the overflow to apply. */
  absorbDamage(enemy: EnemyState, amount: number): number | null {
    const boss = this.bossFor(enemy);
    if (!boss || !boss.shieldActive || boss.shield <= 0) return null;
    const overflow = Math.max(0, amount - boss.shield);
    boss.shield = Math.max(0, boss.shield - amount);
    if (boss.shield <= 0) this.endChannel(boss);
    return overflow;
  }

  /** Forgets a defeated boss. Returns whether it belonged to the current wave. */
  defeat(enemy: EnemyState): boolean {
    const index = this.bosses.findIndex((boss) => boss.enemy === enemy);
    if (index === -1) return false;
    const [boss] = this.bosses.splice(index, 1);
    this.endChannel(boss);
    boss.beamState = 'idle';
    boss.beams = [];
    boss.melee = null;
    if (this.bosses.length === 0) this.meteors.length = 0;
    return boss.isWaveBoss;
  }

  isPhaseTwo(boss: BossState): boolean {
    return boss.enemy.health <= boss.enemy.maxHealth * BOSS_TUNING.phaseTwoHealthRatio;
  }

  /** How far a beam's leading edge has travelled (it grows from the boss instead of appearing full length). */
  beamLength(beam: BeamState): number {
    return Math.min(this.host.arenaSize * 1.5, (beam.elapsedMs / 1000) * BOSS_TUNING.beamTravelSpeed);
  }

  /** The telegraph sword's position: parked at its start angle, then orbiting the live boss during the sweep. */
  swordPosition(boss: BossState): { x: number; y: number; angle: number } | null {
    if (!boss.melee) return null;
    const angle = boss.melee.angle;
    return { x: boss.enemy.x + Math.cos(angle) * BOSS_TUNING.meleeSwingRadius, y: boss.enemy.y + Math.sin(angle) * BOSS_TUNING.meleeSwingRadius, angle };
  }

  // ── Waves ───────────────────────────────────────────────────────────────────────────────────────────────────

  private spawnWave(): void {
    this.pendingSpawnIn = null;
    const { player, rng } = this.host;
    const count = this.pendingWaveCount;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + floatBetween(rng, -0.15, 0.15);
      this.spawnBossAt(player.x + Math.cos(angle) * BOSS_TUNING.waveSpawnDistance, player.y + Math.sin(angle) * BOSS_TUNING.waveSpawnDistance, index === 0, true);
    }
  }

  private spawnBossAt(x: number, y: number, isMain: boolean, isWaveBoss: boolean): void {
    const margin = BOSS_TUNING.edgeMargin;
    const size = this.host.arenaSize;
    const enemy = this.host.spawnEnemy('finalBoss', clamp(x, margin, size - margin), clamp(y, margin, size - margin));
    if (!enemy) return;
    this.bosses.push({
      enemy,
      isMain,
      isWaveBoss,
      cleanupPending: isMain,
      cleanupElapsed: 0,
      summonElapsed: 0,
      channelElapsed: 0,
      meleeCooldownElapsed: BOSS_TUNING.meleeInitialElapsed,
      beamElapsed: 0,
      channelActive: false,
      shieldActive: false,
      channelRuntimeElapsed: 0,
      shield: 0,
      maxShield: 0,
      meteorElapsed: 0,
      shieldCountdownLastShown: -1,
      melee: null,
      beamState: 'idle',
      beamLockOnElapsed: 0,
      beamLockOnBlinkAt: 0,
      beamLockOnVisible: true,
      beamActiveElapsed: 0,
      beams: [],
      beamsLaunched: 0,
      beamCount: 1,
      beamDurationMs: BOSS_TUNING.beamDurationMs,
      dash: { phase: 'idle', elapsedMs: 0, fromX: 0, fromY: 0, targetX: 0, targetY: 0 },
      dashCooldownElapsed: 0,
      dashCountThisChannel: 0
    });
    this.host.events.emit('boss-spawned', { enemy });
  }

  // ── Per-boss update (same priority order as the Phaser updateBoss) ──────────────────────────────────────────

  private updateBoss(boss: BossState, delta: number): void {
    if (!boss.enemy.alive) return;
    if (boss.isMain && boss.cleanupPending) {
      boss.cleanupElapsed += delta;
      if (boss.cleanupElapsed >= BOSS_TUNING.cleanupMs) {
        const cleared = this.host.clearEnemyField(boss.enemy);
        boss.enemy.maxHealth += cleared * BOSS_TUNING.cleanupHealthPerEnemy;
        boss.enemy.health += cleared * BOSS_TUNING.cleanupHealthPerEnemy;
        boss.cleanupPending = false;
        this.host.events.emit('boss-arena-consumed', { cleared });
      }
    }
    // The sword, once summoned, plays out regardless of what the boss starts next.
    this.updateMelee(boss, delta);
    this.updateDash(boss, delta);
    if (boss.channelActive) {
      boss.meteorElapsed += delta;
      if (boss.meteorElapsed >= BOSS_TUNING.meteorIntervalMs) {
        boss.meteorElapsed = 0;
        this.launchMeteor(boss);
      }
      boss.dashCooldownElapsed += delta;
      if (this.isPhaseTwo(boss) && boss.dash.phase === 'idle' && boss.dashCountThisChannel < BOSS_TUNING.dashMaxPerChannel && boss.dashCooldownElapsed >= BOSS_TUNING.dashCooldownMs) {
        boss.dashCooldownElapsed = 0;
        boss.dashCountThisChannel += 1;
        this.startDash(boss);
      }
      boss.channelRuntimeElapsed += delta;
      this.updateShieldCountdown(boss);
      if (boss.channelRuntimeElapsed >= BOSS_TUNING.channelDurationMs) {
        boss.channelActive = false;
        boss.enemy.rottenAuraSuppressed = false;
      }
      return;
    }
    if (boss.shieldActive) {
      // Visible channelling ended but the shield is still up: the boss waits for the deadline.
      boss.channelRuntimeElapsed += delta;
      this.updateShieldCountdown(boss);
      if (boss.channelRuntimeElapsed >= BOSS_TUNING.shieldDeadlineMs) this.completeChannel(boss);
      return;
    }
    if (boss.beamState !== 'idle') {
      this.updateBeam(boss, delta);
      return;
    }
    boss.summonElapsed += delta;
    boss.channelElapsed += delta;
    boss.beamElapsed += delta;
    boss.meleeCooldownElapsed += delta;
    if (boss.summonElapsed >= BOSS_TUNING.summonIntervalMs) {
      boss.summonElapsed = 0;
      this.summonApparitions(boss);
      if (this.isPhaseTwo(boss) || this.host.rng() < BOSS_TUNING.undeadSquadSporadicChance) this.summonUndeadSquad();
    }
    if (boss.channelElapsed >= BOSS_TUNING.channelIntervalMs) { this.startChannel(boss); return; }
    if (boss.beamElapsed >= BOSS_TUNING.beamIntervalMs) { this.startBeamLockOn(boss); return; }
    this.tryMelee(boss);
  }

  private summonApparitions(boss: BossState): void {
    const { rng } = this.host;
    for (let index = 0; index < BOSS_TUNING.apparitionCount; index += 1) {
      const angle = (Math.PI * 2 * index) / BOSS_TUNING.apparitionCount + floatBetween(rng, -0.12, 0.12);
      const radius = floatBetween(rng, 175, 255);
      this.host.spawnEnemy('apparitionWraith', boss.enemy.x + Math.cos(angle) * radius, boss.enemy.y + Math.sin(angle) * radius);
    }
  }

  /** "Solo dos Mortos Vivos": skeletons right around the player. */
  private summonUndeadSquad(): void {
    const { player, rng } = this.host;
    for (let index = 0; index < BOSS_TUNING.undeadSquadSize; index += 1) {
      const angle = floatBetween(rng, 0, Math.PI * 2);
      const distance = floatBetween(rng, 90, 180);
      this.host.spawnEnemy('skeleton', player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance);
    }
  }

  // ── Melee: telegraph sword + 360° sweep ────────────────────────────────────────────────────────────────────

  private tryMelee(boss: BossState): void {
    const { player } = this.host;
    if (boss.melee || boss.meleeCooldownElapsed < BOSS_TUNING.meleeCooldownMs) return;
    if (Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y) > BOSS_TUNING.meleeTriggerRadius) return;
    boss.meleeCooldownElapsed = 0;
    // The sword appears beside the boss, perpendicular to the line towards the player.
    const toPlayer = Math.atan2(player.y - boss.enemy.y, player.x - boss.enemy.x);
    const startAngle = toPlayer + Math.PI / 2;
    boss.melee = { phase: 'telegraph', elapsedMs: 0, startAngle, angle: startAngle };
  }

  private updateMelee(boss: BossState, delta: number): void {
    const melee = boss.melee;
    if (!melee) return;
    melee.elapsedMs += delta;
    if (melee.phase === 'telegraph') {
      if (melee.elapsedMs < BOSS_TUNING.meleeTelegraphMs) return;
      melee.phase = 'sweep';
      melee.elapsedMs = 0;
    }
    const progress = Math.min(1, melee.elapsedMs / BOSS_TUNING.meleeSweepMs);
    melee.angle = melee.startAngle + Math.PI * 2 * progress;
    // Contact-based: only the blade's current position hurts (the player's i-frames stop repeat hits).
    const sword = this.swordPosition(boss)!;
    const { player } = this.host;
    if (Math.hypot(sword.x - player.x, sword.y - player.y) <= BOSS_TUNING.meleeSwordHitRadius) this.host.hurtPlayer(BOSS_TUNING.meleeDamage);
    if (progress >= 1) boss.melee = null;
  }

  // ── Necro-Beam ──────────────────────────────────────────────────────────────────────────────────────────────

  private startBeamLockOn(boss: BossState): void {
    boss.beamElapsed = 0;
    boss.beamState = 'lockon';
    boss.beamLockOnElapsed = 0;
    boss.beamLockOnBlinkAt = 0;
    boss.beamLockOnVisible = true;
  }

  private updateBeam(boss: BossState, delta: number): void {
    if (boss.beamState === 'lockon') {
      boss.beamLockOnElapsed += delta;
      if (boss.beamLockOnElapsed >= boss.beamLockOnBlinkAt) {
        boss.beamLockOnVisible = !boss.beamLockOnVisible;
        const progress = clamp(boss.beamLockOnElapsed / BOSS_TUNING.beamLockOnMs, 0, 1);
        boss.beamLockOnBlinkAt = boss.beamLockOnElapsed + BOSS_TUNING.beamLockOnBlinkStartMs + (BOSS_TUNING.beamLockOnBlinkEndMs - BOSS_TUNING.beamLockOnBlinkStartMs) * progress;
      }
      if (boss.beamLockOnElapsed >= BOSS_TUNING.beamLockOnMs) this.activateBeam(boss);
      return;
    }
    boss.beamActiveElapsed += delta;
    if (boss.beamsLaunched < boss.beamCount && boss.beamActiveElapsed >= boss.beamsLaunched * BOSS_TUNING.beamLaunchStaggerMs) this.launchBeam(boss);
    const { player } = this.host;
    boss.beams.forEach((beam) => {
      beam.elapsedMs += delta;
      // Slowly swings toward the player's current spot (15°/s: walking across it gains real separation).
      const target = Math.atan2(player.y - boss.enemy.y, player.x - boss.enemy.x);
      beam.angle = rotateTowards(beam.angle, target, BOSS_TUNING.beamFollowTurnRate * (delta / 1000));
      if (this.distanceToBeam(boss, beam) <= BOSS_TUNING.beamWidth / 2) this.host.hurtPlayer(BOSS_TUNING.beamDamage);
    });
    // Each beam retires on its own lifetime, so a removal never lands on the same frame as the next launch.
    boss.beams = boss.beams.filter((beam) => beam.elapsedMs < BOSS_TUNING.beamLifetimeMs);
    if (boss.beamsLaunched >= boss.beamCount && boss.beams.length === 0) boss.beamState = 'idle';
  }

  private activateBeam(boss: BossState): void {
    const phaseTwo = this.isPhaseTwo(boss);
    boss.beamState = 'active';
    boss.beamActiveElapsed = 0;
    boss.beamDurationMs = phaseTwo ? BOSS_TUNING.beamDurationPhase2Ms : BOSS_TUNING.beamDurationMs;
    boss.beamCount = phaseTwo ? BOSS_TUNING.beamCountPhase2 : BOSS_TUNING.beamCountPhase1;
    boss.beams = [];
    boss.beamsLaunched = 0;
    this.launchBeam(boss);
    this.summonUndeadSquad();
  }

  private launchBeam(boss: BossState): void {
    const { player } = this.host;
    boss.beams.push({ angle: Math.atan2(player.y - boss.enemy.y, player.x - boss.enemy.x), elapsedMs: 0 });
    boss.beamsLaunched += 1;
  }

  /** Distance from the player to the part of the beam already drawn (beyond the tip or behind the boss is safe). */
  private distanceToBeam(boss: BossState, beam: BeamState): number {
    const { player } = this.host;
    const dirX = Math.cos(beam.angle);
    const dirY = Math.sin(beam.angle);
    const along = clamp((player.x - boss.enemy.x) * dirX + (player.y - boss.enemy.y) * dirY, 0, this.beamLength(beam));
    return Math.hypot(player.x - (boss.enemy.x + dirX * along), player.y - (boss.enemy.y + dirY * along));
  }

  // ── Shield channel, meteors, dash ───────────────────────────────────────────────────────────────────────────

  private startChannel(boss: BossState): void {
    boss.channelActive = true;
    boss.shieldActive = true;
    boss.channelRuntimeElapsed = 0;
    boss.maxShield = boss.enemy.maxHealth * BOSS_TUNING.shieldMaxHealthScaling;
    boss.shield = boss.maxShield;
    boss.channelElapsed = 0;
    boss.meteorElapsed = 0;
    boss.shieldCountdownLastShown = -1;
    boss.dashCooldownElapsed = 0;
    boss.dashCountThisChannel = 0;
    boss.enemy.rottenAuraSuppressed = true;
  }

  /** The deadline passed with the shield still up: it explodes, killing a player inside the radius. */
  private completeChannel(boss: BossState): void {
    if (boss.shield <= 0) { this.endChannel(boss); return; }
    const { player } = this.host;
    this.host.events.emit('boss-explosion', { x: boss.enemy.x, y: boss.enemy.y, radius: BOSS_TUNING.explosionRadius, kind: 'shield' });
    const caught = Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y) <= BOSS_TUNING.explosionRadius;
    this.endChannel(boss);
    if (caught) this.host.killPlayer();
  }

  private endChannel(boss: BossState): void {
    boss.channelActive = false;
    boss.shieldActive = false;
    boss.shield = 0;
    boss.enemy.rottenAuraSuppressed = false;
    // No dashing without a shield: a pending telegraph is cancelled, a dash already in motion finishes.
    if (boss.dash.phase === 'telegraph') boss.dash.phase = 'idle';
  }

  private updateShieldCountdown(boss: BossState): void {
    const remainingMs = BOSS_TUNING.shieldDeadlineMs - boss.channelRuntimeElapsed;
    if (remainingMs > 10000 || remainingMs < 0) return;
    const seconds = Math.ceil(remainingMs / 1000);
    if (seconds === boss.shieldCountdownLastShown) return;
    boss.shieldCountdownLastShown = seconds;
    if (seconds > 0) this.host.events.emit('boss-shield-countdown', { enemy: boss.enemy, seconds });
  }

  private launchMeteor(boss: BossState): void {
    const { player } = this.host;
    this.meteors.push({ x: player.x, y: player.y, elapsedMs: 0, telegraphMs: this.isPhaseTwo(boss) ? BOSS_TUNING.meteorTelegraphPhase2Ms : BOSS_TUNING.meteorTelegraphMs });
  }

  private updateMeteors(delta: number): void {
    const { player } = this.host;
    for (let index = this.meteors.length - 1; index >= 0; index -= 1) {
      const meteor = this.meteors[index];
      meteor.elapsedMs += delta;
      if (meteor.elapsedMs < meteor.telegraphMs) continue;
      this.meteors.splice(index, 1);
      this.host.events.emit('boss-explosion', { x: meteor.x, y: meteor.y, radius: BOSS_TUNING.meteorRadius, kind: 'meteor' });
      if (Math.hypot(meteor.x - player.x, meteor.y - player.y) <= BOSS_TUNING.meteorRadius) this.host.hurtPlayer(BOSS_TUNING.meteorDamage);
    }
  }

  private startDash(boss: BossState): void {
    const { player } = this.host;
    boss.dash = { phase: 'telegraph', elapsedMs: 0, fromX: boss.enemy.x, fromY: boss.enemy.y, targetX: player.x, targetY: player.y };
  }

  private updateDash(boss: BossState, delta: number): void {
    const dash = boss.dash;
    if (dash.phase === 'idle') return;
    dash.elapsedMs += delta;
    if (dash.phase === 'telegraph') {
      if (dash.elapsedMs < BOSS_TUNING.dashTelegraphMs) return;
      dash.phase = 'dashing';
      dash.elapsedMs = 0;
      dash.fromX = boss.enemy.x;
      dash.fromY = boss.enemy.y;
    }
    const t = Math.min(1, dash.elapsedMs / BOSS_TUNING.dashTravelMs);
    const eased = t * t * t; // Cubic.In, like the Phaser tween
    boss.enemy.x = dash.fromX + (dash.targetX - dash.fromX) * eased;
    boss.enemy.y = dash.fromY + (dash.targetY - dash.fromY) * eased;
    if (t < 1) return;
    dash.phase = 'idle';
    this.host.events.emit('boss-explosion', { x: dash.targetX, y: dash.targetY, radius: BOSS_TUNING.dashRadius, kind: 'dash' });
    const { player } = this.host;
    if (Math.hypot(dash.targetX - player.x, dash.targetY - player.y) <= BOSS_TUNING.dashRadius) this.host.hurtPlayer(BOSS_TUNING.dashDamage);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Phaser.Math.Angle.RotateTo: step `angle` toward `target` by at most `maxStep`, the short way round. */
function rotateTowards(angle: number, target: number, maxStep: number): number {
  const difference = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  return Math.abs(difference) <= maxStep ? target : angle + Math.sign(difference) * maxStep;
}
