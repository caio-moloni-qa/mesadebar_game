import { SnowfieldAttacks } from './SnowfieldAttacks';
import { EventBus } from '../EventBus';
import { Rng, Vec2, floatBetween } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { EnemyVariantId } from './EnemySpawnScheduler';

// The boss fight on the sim clock (BOSS_REWORK_TEMP.md), with the 3D rework: fewer, deliberate summons; a visible enrage instead of the hidden clear-out health gain; the
// shield explosion as heavy damage that cover blocks; a stagger as the reward for breaking the shield; telegraphed
// undead risings; a phase-2 roar; a reverse sweep plus centre blast in phase 2; a lunge against kiting; and a
// coordinator so several bosses never beam or channel together. Every timer lives in the boss's own state, advanced
// by update(delta), so it pauses with the session and is deterministic. The renderer draws straight from `bosses`,
// `meteors`, `risings` and the events.

/** Live tuning: a plain mutable object so the sandbox panel can change any value mid-fight. */
export const BOSS_TUNING = {
  messageMs: 2600,
  /** Apparitions per summon, every summonIntervalMs (30 every 5 s used to flood the 240-enemy cap). */
  summonIntervalMs: 10000,
  apparitionCount: 8,
  meleeCooldownMs: 7000,
  /** First melee comes a little sooner than a full cooldown. */
  meleeInitialElapsed: 1600,
  channelIntervalMs: 15000,
  channelDurationMs: 15000,
  shieldDeadlineMs: 20000,
  shieldMaxHealthScaling: 0.15,
  /** Unbroken-shield explosion: this fraction of the player's max health (1 = lethal). Tall
   *  obstacles between boss and player block it entirely. */
  explosionRadius: 700,
  explosionDamageRatio: 0.6,
  /** Breaking the shield: the boss kneels this long, taking extra damage. */
  staggerMs: 3000,
  staggerDamageMultiplier: 1.5,
  /** The main boss's countdown: when it runs out the field is cleared and the boss enrages. */
  cleanupMs: 30000,
  cleanupHealthPerEnemy: 5,
  enrageSpeedMultiplier: 1.6,
  /** Enraged: every ability timer runs this much faster. */
  enrageTimerRate: 1.35,
  meleeTriggerRadius: 250,
  meleeDamage: 40,
  meleeTelegraphMs: 2000,
  meleeSwingRadius: 170,
  meleeSwordHitRadius: 70,
  meleeSweepMs: 320,
  /** Phase 2: the sweep comes back the other way, and a blast covers the blind spot at the boss's feet. */
  meleeCenterRadius: 110,
  meleeCenterDamage: 25,
  beamIntervalMs: 20000,
  beamLockOnMs: 3000,
  beamLockOnBlinkStartMs: 320,
  beamLockOnBlinkEndMs: 45,
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
  /** Ground cracks before each skeleton of the squad climbs out. */
  undeadRiseMs: 800,
  meteorIntervalMs: 500,
  meteorTelegraphMs: 1500,
  meteorTelegraphPhase2Ms: 1000,
  meteorRadius: 90,
  meteorDamage: 25,
  phaseTwoHealthRatio: 0.5,
  /** Phase-2 roar: the boss stands invulnerable this long; at roarShockwaveAt the shockwave clears the summons and
   *  shoves the player back. */
  phaseTransitionMs: 1600,
  roarShockwaveAt: 600,
  roarShockwaveRadius: 320,
  roarShockwaveDamage: 20,
  roarShockwavePush: 260,
  dashTelegraphMs: 600,
  dashTravelMs: 400,
  dashCooldownMs: 4000,
  dashMaxPerChannel: 4,
  dashRadius: 130,
  dashDamage: 18,
  /** Lunge: when the player kites beyond lungeMinDistance, the boss crouches and leaps lungeDistance towards them. */
  lungeMinDistance: 600,
  lungeCooldownMs: 8000,
  lungeTelegraphMs: 700,
  lungeTravelMs: 500,
  lungeDistance: 380,
  lungeRadius: 130,
  lungeDamage: 18,
  waveSpawnDistance: 980,
  extraBossSpawnDistance: 520,
  /** Keeps spawns off the arena's very edge. */
  edgeMargin: 260
};
export type BossTuning = typeof BOSS_TUNING;
/** The shipped values, for the sandbox's reset button. */
export const BOSS_TUNING_DEFAULTS: Readonly<BossTuning> = { ...BOSS_TUNING };

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

/** A skeleton of the undead squad about to climb out of the ground. */
export interface RisingState {
  variantId?: EnemyVariantId;
  x: number;
  y: number;
  elapsedMs: number;
}

export type MeleePhase = 'telegraph' | 'sweep' | 'sweepBack';

/** One boss encounter. Public so the renderer can draw and animate straight from it. */
export interface BossState {
  winter: boolean;
  winterLanceElapsed: number;
  enemy: EnemyState;
  /** First boss of a timer wave: owns the arena-clear countdown. */
  isMain: boolean;
  /** Belongs to a timer wave (all must die before the portals open); sandbox extras don't. */
  isWaveBoss: boolean;
  cleanupPending: boolean;
  cleanupElapsed: number;
  enraged: boolean;
  /** Set once at the phase-2 roar (abilities read this, not the live health ratio). */
  phaseTwo: boolean;
  /** Remaining phase-2 roar (invulnerable, standing still); 0 when not roaring. */
  transitionMs: number;
  /** Remaining stagger after the shield broke (kneeling, taking extra damage); 0 when not staggered. */
  staggerMs: number;
  summonElapsed: number;
  /** Counts up to the last summon's raised-arms pose (renderer). */
  summonPoseMs: number;
  channelElapsed: number;
  meleeCooldownElapsed: number;
  beamElapsed: number;
  lungeCooldownElapsed: number;
  channelActive: boolean;
  shieldActive: boolean;
  channelRuntimeElapsed: number;
  shield: number;
  maxShield: number;
  meteorElapsed: number;
  shieldCountdownLastShown: number;
  /** Telegraph sword: parked beside the boss, then one orbit (and in phase 2 one back). */
  melee: { phase: MeleePhase; elapsedMs: number; startAngle: number; angle: number } | null;
  beamState: 'idle' | 'lockon' | 'active';
  beamLockOnElapsed: number;
  beamLockOnBlinkAt: number;
  /** The lock-on reticle and line blink faster and faster; this is their current visibility. */
  beamLockOnVisible: boolean;
  beamActiveElapsed: number;
  beams: BeamState[];
  beamsLaunched: number;
  beamCount: number;
  /** Beams fewer per volley (one per guardian slain before it arrived). */
  beamPenalty: number;
  /** Shield dash (phase 2, while channelling) or lunge (any time the player kites far away). */
  dash: { kind: 'shield' | 'lunge'; phase: 'idle' | 'telegraph' | 'dashing'; elapsedMs: number; fromX: number; fromY: number; targetX: number; targetY: number };
  dashCooldownElapsed: number;
  dashCountThisChannel: number;
}

export interface BossEvents extends Record<string, unknown> {
  /** "O sobrevivente sente uma presença maligna no ar!" — the wave lands BOSS_TUNING.messageMs later. */
  'boss-warning': { bossCount: number };
  'boss-spawned': { enemy: EnemyState };
  /** `blocked`: the unbroken-shield explosion didn't reach the player (cover or distance didn't matter). */
  'boss-explosion': { x: number; y: number; radius: number; kind: 'shield' | 'dash' | 'lunge' | 'meteor' | 'center'; blocked?: boolean };
  /** Last 10 s before an unbroken shield explodes: "10...", "9...", ... above the boss. */
  'boss-shield-countdown': { enemy: EnemyState; seconds: number };
  'boss-shield-broken': { enemy: EnemyState };
  'boss-phase-two': { enemy: EnemyState };
  'boss-shockwave': { x: number; y: number; radius: number };
  /** The main boss's countdown ran out: the field is cleared and the boss enrages. */
  'boss-enraged': { enemy: EnemyState; cleared: number; healthGained: number };
}

export interface BossHost {
  readonly snowfield?: boolean;
  slowPlayer?(percent: number, ms: number): void;
  frostPlayer?(stacks: number): void;
  readonly player: PlayerState;
  readonly rng: Rng;
  readonly arenaSize: number;
  readonly events: Pick<EventBus<BossEvents>, 'emit'>;
  spawnEnemy(variantId: EnemyVariantId, x: number, y: number): EnemyState | null;
  /** Damage through the player's normal path (i-frames, armor, the damage callout); `unavoidable` skips i-frames. */
  hurtPlayer(amount: number, unavoidable?: boolean): void;
  /** Lethal explosion setting (ratio ≥ 1): instant death unless invincible. */
  killPlayer(): void;
  /** Shoves the player by (dx, dy) game units, sliding along walls. */
  pushPlayer(dx: number, dy: number): void;
  /** Removes every active enemy `keep` rejects; returns how many. */
  clearEnemyField(keep: (enemy: EnemyState) => boolean): number;
  hasLineOfSight(from: Vec2, to: Vec2): boolean;
  /** Zone guardians slain this cycle: each takes GUARDIAN weakening off the next boss (health, one beam). */
  weakening(): number;
}

export class BossSystem {
  readonly bosses: BossState[] = [];
  readonly meteors: MeteorState[] = [];
  readonly risings: RisingState[] = [];
  private triggered = false;
  private pendingWaveCount = 0;
  /** Counts down the warning banner before the wave spawns; null when no wave is pending. */
  private pendingSpawnIn: number | null = null;

  readonly snow: SnowfieldAttacks;
  readonly braziers: Array<{ owner: EnemyState; x: number; y: number; radius: number }> = [];
  private winterTime = 0;
  constructor(private readonly host: BossHost) {
    this.snow = new SnowfieldAttacks({
      player: host.player,
      hurtPlayer: damage => host.hurtPlayer(damage),
      slowPlayer: (p, ms) => host.slowPlayer?.(p, ms),
      pushPlayer: (x, y) => host.pushPlayer(x, y),
      frostPlayer: stacks => host.frostPlayer?.(stacks)
    });
  }

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

  /** Stands still through the shield sequence, beams, dashes/lunges, the stagger and the roar. */
  holdsStill(enemy: EnemyState): boolean {
    const boss = this.bossFor(enemy);
    return !!boss && (boss.channelActive || boss.shieldActive || boss.beamState !== 'idle' || boss.dash.phase !== 'idle' || boss.staggerMs > 0 || boss.transitionMs > 0);
  }

  /** Damage multiplier for hits on `enemy`: 0 while roaring (invulnerable), extra while staggered, else 1. */
  damageTakenMultiplier(enemy: EnemyState): number {
    const boss = this.bossFor(enemy);
    if (!boss) return 1;
    if (boss.transitionMs > 0) return 0;
    return boss.staggerMs > 0 ? BOSS_TUNING.staggerDamageMultiplier : 1;
  }

  /** Sandbox: an instant extra boss that gates nothing. */
  spawnExtraBoss(): void {
    const { player, rng } = this.host;
    const angle = floatBetween(rng, 0, Math.PI * 2);
    this.spawnBossAt(player.x + Math.cos(angle) * BOSS_TUNING.extraBossSpawnDistance, player.y + Math.sin(angle) * BOSS_TUNING.extraBossSpawnDistance, false, false);
  }

  update(delta: number): void {
    this.winterTime += delta;
    this.snow.update(delta);
    if (this.pendingSpawnIn !== null) {
      this.pendingSpawnIn -= delta;
      if (this.pendingSpawnIn <= 0) this.spawnWave();
    }
    [...this.bosses].forEach((boss) => this.updateBoss(boss, delta));
    this.updateMeteors(delta);
    this.updateRisings(delta);
  }

  /** Damage into an active shield. null = not a shielded boss (apply normally); otherwise the overflow to apply.
   *  Breaking the shield ends the channel and staggers the boss. */
  absorbDamage(enemy: EnemyState, amount: number): number | null {
    const boss = this.bossFor(enemy);
    if (!boss || !boss.shieldActive || boss.shield <= 0) return null;
    const overflow = Math.max(0, amount - boss.shield);
    boss.shield = Math.max(0, boss.shield - amount);
    if (boss.shield <= 0) {
      this.endChannel(boss);
      boss.staggerMs = BOSS_TUNING.staggerMs;
      boss.melee = null;
      this.host.events.emit('boss-shield-broken', { enemy });
    }
    return overflow;
  }

  /** Forgets a defeated boss. Returns whether it belonged to the current wave. */
  defeat(enemy: EnemyState): boolean {
    const index = this.bosses.findIndex((boss) => boss.enemy === enemy);
    if (index === -1) return false;
    const [boss] = this.bosses.splice(index, 1);
    this.endChannel(boss);
    this.snow.clear(enemy);
    boss.beamState = 'idle';
    boss.beams = [];
    boss.melee = null;
    if (this.bosses.length === 0) {
      this.meteors.length = 0;
      this.risings.length = 0;
    }
    return boss.isWaveBoss;
  }

  isPhaseTwo(boss: BossState): boolean {
    return boss.phaseTwo;
  }

  /** How far a beam's leading edge has travelled (it grows from the boss instead of appearing full length). */
  beamLength(beam: BeamState): number {
    return Math.min(this.host.arenaSize * 1.5, (beam.elapsedMs / 1000) * BOSS_TUNING.beamTravelSpeed);
  }

  /** The telegraph sword's position: parked at its start angle, then orbiting the live boss. */
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
    if (this.host.snowfield) { enemy.hasRottenAura = false; enemy.hasFrostAura = true; }
    const weakening = this.host.weakening();
    enemy.maxHealth = Math.round(enemy.maxHealth * Math.max(0.5, 1 - 0.05 * weakening));
    enemy.health = enemy.maxHealth;
    this.bosses.push({
      winter: !!this.host.snowfield,
      winterLanceElapsed: 0,
      enemy,
      isMain,
      isWaveBoss,
      cleanupPending: isMain,
      cleanupElapsed: 0,
      enraged: false,
      phaseTwo: false,
      transitionMs: 0,
      staggerMs: 0,
      summonElapsed: 0,
      summonPoseMs: Infinity,
      channelElapsed: 0,
      meleeCooldownElapsed: BOSS_TUNING.meleeInitialElapsed,
      beamElapsed: 0,
      lungeCooldownElapsed: 0,
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
      beamPenalty: weakening,
      dash: { kind: 'lunge', phase: 'idle', elapsedMs: 0, fromX: 0, fromY: 0, targetX: 0, targetY: 0 },
      dashCooldownElapsed: 0,
      dashCountThisChannel: 0
    });
    this.host.events.emit('boss-spawned', { enemy });
  }

  // ── Per-boss update ─────────────────────────────────────────────────────────────────────────────────────────

  private updateBoss(boss: BossState, delta: number): void {
    if (!boss.enemy.alive) return;
    boss.summonPoseMs += delta;
    if (boss.winter) this.updateWinter(boss, delta);
    this.updateCleanup(boss, delta);
    // A summoned sword and a dash in motion always play out.
    this.updateMelee(boss, delta);
    this.updateDash(boss, delta);
    if (boss.transitionMs > 0) {
      this.updateRoar(boss, delta);
      return;
    }
    if (boss.staggerMs > 0) {
      boss.staggerMs = Math.max(0, boss.staggerMs - delta);
      return;
    }
    // Phase 2 begins with the roar — not in the middle of a shield sequence or a beam volley.
    if (!boss.phaseTwo && boss.enemy.health <= boss.enemy.maxHealth * BOSS_TUNING.phaseTwoHealthRatio && !boss.shieldActive && boss.beamState === 'idle') {
      this.startRoar(boss);
      return;
    }
    if (boss.channelActive) {
      this.updateChannel(boss, delta);
      return;
    }
    if (boss.shieldActive) {
      // Visible channelling ended but the shield is still up: the boss waits for the deadline.
      boss.channelRuntimeElapsed += delta;
      this.updateShieldCountdown(boss);
      if (boss.channelRuntimeElapsed >= (boss.winter ? 15000 : BOSS_TUNING.shieldDeadlineMs)) this.completeChannel(boss);
      return;
    }
    if (boss.beamState !== 'idle') {
      this.updateBeam(boss, delta);
      return;
    }
    if (boss.dash.phase !== 'idle') return;
    const scaled = delta * (boss.enraged ? BOSS_TUNING.enrageTimerRate : 1);
    boss.summonElapsed += scaled;
    boss.channelElapsed += scaled;
    boss.beamElapsed += scaled;
    boss.meleeCooldownElapsed += scaled;
    boss.lungeCooldownElapsed += scaled;
    if (boss.summonElapsed >= BOSS_TUNING.summonIntervalMs) {
      boss.summonElapsed = 0;
      boss.summonPoseMs = 0;
      this.summonApparitions(boss);
      if (boss.phaseTwo || this.host.rng() < BOSS_TUNING.undeadSquadSporadicChance) this.summonUndeadSquad();
    }
    // Big abilities take turns between bosses: one channelling or beaming at a time.
    const othersBusy = this.bosses.some((other) => other !== boss && (other.shieldActive || other.beamState !== 'idle'));
    if (!othersBusy && boss.channelElapsed >= BOSS_TUNING.channelIntervalMs) { this.startChannel(boss); return; }
    if (!othersBusy && boss.beamElapsed >= BOSS_TUNING.beamIntervalMs) { this.startBeamLockOn(boss); return; }
    if (this.tryLunge(boss)) return;
    this.tryMelee(boss);
  }

  /** The main boss's countdown: at zero the field empties and the boss enrages (faster, abilities sooner). */

  private updateWinter(boss: BossState, delta: number): void {
    if (boss.transitionMs > 0 || boss.staggerMs > 0) return;
    const { player } = this.host;
    if (boss.phaseTwo) {
      const direction = Math.floor(this.winterTime / 8000) * Math.PI / 2;
      this.host.pushPlayer(Math.cos(direction) * delta * 0.018, Math.sin(direction) * delta * 0.018);
    }
    boss.winterLanceElapsed += delta;
    if (boss.winterLanceElapsed < 9000 || boss.shieldActive) return;
    boss.winterLanceElapsed = 0;
    const a = Math.atan2(player.y - boss.enemy.y, player.x - boss.enemy.x);
    for (let i = 0; i < 6; i++) this.snow.add(boss.enemy, 'lance', player.x + Math.cos(a) * i * 75, player.y + Math.sin(a) * i * 75, 42, 20, 1100 + i * 180, 550);
  }

  private updateCleanup(boss: BossState, delta: number): void {
    if (!boss.isMain || !boss.cleanupPending) return;
    boss.cleanupElapsed += delta;
    if (boss.cleanupElapsed < BOSS_TUNING.cleanupMs) return;
    boss.cleanupPending = false;
    const cleared = this.host.clearEnemyField((enemy) => !!this.bossFor(enemy));
    const healthGained = cleared * BOSS_TUNING.cleanupHealthPerEnemy;
    boss.enemy.maxHealth += healthGained;
    boss.enemy.health += healthGained;
    boss.enraged = true;
    boss.enemy.movementSpeed *= BOSS_TUNING.enrageSpeedMultiplier;
    this.host.events.emit('boss-enraged', { enemy: boss.enemy, cleared, healthGained });
  }

  private summonApparitions(boss: BossState): void {
    const { rng } = this.host;
    const count = Math.round(BOSS_TUNING.apparitionCount);
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + floatBetween(rng, -0.12, 0.12);
      const radius = floatBetween(rng, 175, 255);
      this.host.spawnEnemy(boss.winter ? 'iceWolf' : 'apparitionWraith', boss.enemy.x + Math.cos(angle) * radius, boss.enemy.y + Math.sin(angle) * radius);
    }
  }

  /** "Solo dos Mortos Vivos": cracks open around the player; the skeletons climb out undeadRiseMs later. */
  private summonUndeadSquad(): void {
    const { player, rng } = this.host;
    for (let index = 0; index < Math.round(BOSS_TUNING.undeadSquadSize); index += 1) {
      const angle = floatBetween(rng, 0, Math.PI * 2);
      const distance = floatBetween(rng, 90, 180);
      this.risings.push({ x: player.x + Math.cos(angle) * distance, y: player.y + Math.sin(angle) * distance, elapsedMs: 0 });
    }
  }

  private updateRisings(delta: number): void {
    for (let index = this.risings.length - 1; index >= 0; index -= 1) {
      const rising = this.risings[index];
      rising.elapsedMs += delta;
      if (rising.elapsedMs < BOSS_TUNING.undeadRiseMs) continue;
      this.risings.splice(index, 1);
      this.host.spawnEnemy(rising.variantId ?? (this.host.snowfield ? 'frostSkeleton' : 'skeleton'), rising.x, rising.y);
    }
  }

  // ── Phase-2 roar ────────────────────────────────────────────────────────────────────────────────────────────

  private startRoar(boss: BossState): void {
    boss.phaseTwo = true;
    boss.transitionMs = BOSS_TUNING.phaseTransitionMs;
    boss.melee = null;
    this.host.events.emit('boss-phase-two', { enemy: boss.enemy });
  }

  private updateRoar(boss: BossState, delta: number): void {
    const before = BOSS_TUNING.phaseTransitionMs - boss.transitionMs;
    boss.transitionMs = Math.max(0, boss.transitionMs - delta);
    const after = BOSS_TUNING.phaseTransitionMs - boss.transitionMs;
    if (before >= BOSS_TUNING.roarShockwaveAt || after < BOSS_TUNING.roarShockwaveAt) return;
    // The shockwave: summons are swept away and the player is shoved back (a breather before phase 2).
    const { player } = this.host;
    const { x, y } = boss.enemy;
    this.host.clearEnemyField((enemy) => !!this.bossFor(enemy));
    this.risings.length = 0;
    this.host.events.emit('boss-shockwave', { x, y, radius: BOSS_TUNING.roarShockwaveRadius });
    const distance = Math.hypot(player.x - x, player.y - y);
    if (distance > BOSS_TUNING.roarShockwaveRadius) return;
    const dirX = distance > 0 ? (player.x - x) / distance : 1;
    const dirY = distance > 0 ? (player.y - y) / distance : 0;
    this.host.pushPlayer(dirX * BOSS_TUNING.roarShockwavePush, dirY * BOSS_TUNING.roarShockwavePush);
    this.host.hurtPlayer(BOSS_TUNING.roarShockwaveDamage);
  }

  // ── Melee: telegraph sword, 360° sweep (and back, with a centre blast, in phase 2) ─────────────────────────

  private tryMelee(boss: BossState): void {
    const { player } = this.host;
    if (boss.melee || boss.meleeCooldownElapsed < BOSS_TUNING.meleeCooldownMs) return;
    if (Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y) > BOSS_TUNING.meleeTriggerRadius) return;
    boss.meleeCooldownElapsed = 0;
    // The sword appears beside the boss, perpendicular to the line towards the player.
    const startAngle = Math.atan2(player.y - boss.enemy.y, player.x - boss.enemy.x) + Math.PI / 2;
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
      if (boss.winter) for (let i = 0; i < 9; i++) { const a = melee.startAngle + i * Math.PI * 2 / 9; this.snow.add(boss.enemy, 'iceTrail', boss.enemy.x + Math.cos(a) * 170, boss.enemy.y + Math.sin(a) * 170, 48, 4, 100, 4000); }
      if (boss.phaseTwo) this.centerBlast(boss);
    }
    const progress = Math.min(1, melee.elapsedMs / BOSS_TUNING.meleeSweepMs);
    const turn = Math.PI * 2 * progress;
    melee.angle = melee.phase === 'sweep' ? melee.startAngle + turn : melee.startAngle + Math.PI * 2 - turn;
    // Contact-based: only the blade's current position hurts (the player's i-frames stop repeat hits).
    const sword = this.swordPosition(boss)!;
    const { player } = this.host;
    if (Math.hypot(sword.x - player.x, sword.y - player.y) <= BOSS_TUNING.meleeSwordHitRadius) this.host.hurtPlayer(BOSS_TUNING.meleeDamage);
    if (progress < 1) return;
    if (melee.phase === 'sweep' && boss.phaseTwo) {
      melee.phase = 'sweepBack';
      melee.elapsedMs = 0;
      return;
    }
    boss.melee = null;
  }

  /** Phase 2: hugging the boss is no longer safe — a blast at its feet as the sweep starts. */
  private centerBlast(boss: BossState): void {
    const { player } = this.host;
    this.host.events.emit('boss-explosion', { x: boss.enemy.x, y: boss.enemy.y, radius: BOSS_TUNING.meleeCenterRadius, kind: 'center' });
    if (Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y) <= BOSS_TUNING.meleeCenterRadius) this.host.hurtPlayer(BOSS_TUNING.meleeCenterDamage);
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
      if (boss.beamLockOnElapsed >= (boss.winter ? 2000 : BOSS_TUNING.beamLockOnMs)) this.activateBeam(boss);
      return;
    }
    boss.beamActiveElapsed += delta;
    if (boss.beamsLaunched < boss.beamCount && boss.beamActiveElapsed >= boss.beamsLaunched * BOSS_TUNING.beamLaunchStaggerMs) this.launchBeam(boss);
    const { player } = this.host;
    boss.beams.forEach((beam) => {
      const before = beam.elapsedMs;
      beam.elapsedMs += delta;
      if (boss.winter && Math.floor(before / 450) !== Math.floor(beam.elapsedMs / 450)) {
        const length = Math.min(700, this.beamLength(beam));
        this.snow.add(boss.enemy, 'iceTrail', boss.enemy.x + Math.cos(beam.angle) * length, boss.enemy.y + Math.sin(beam.angle) * length, 65, 5, 300, 4000);
      }
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
    boss.beamState = 'active';
    boss.beamActiveElapsed = 0;
    boss.beamCount = boss.winter ? (boss.phaseTwo ? 3 : 1) : Math.max(1, Math.round(boss.phaseTwo ? BOSS_TUNING.beamCountPhase2 : BOSS_TUNING.beamCountPhase1) - boss.beamPenalty);
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
    if (boss.winter) {
      this.braziers.splice(0, this.braziers.length, ...[0, 1, 2].map(i => ({ owner: boss.enemy, x: clamp(boss.enemy.x + Math.cos(i * Math.PI * 2 / 3) * 320, 180, this.host.arenaSize - 180), y: clamp(boss.enemy.y + Math.sin(i * Math.PI * 2 / 3) * 320, 180, this.host.arenaSize - 180), radius: 115 })));
    }
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

  private updateChannel(boss: BossState, delta: number): void {
    boss.meteorElapsed += delta;
    if (boss.meteorElapsed >= BOSS_TUNING.meteorIntervalMs) {
      boss.meteorElapsed = 0;
      this.launchMeteor(boss);
    }
    boss.dashCooldownElapsed += delta;
    if (boss.phaseTwo && boss.dash.phase === 'idle' && boss.dashCountThisChannel < BOSS_TUNING.dashMaxPerChannel && boss.dashCooldownElapsed >= BOSS_TUNING.dashCooldownMs) {
      boss.dashCooldownElapsed = 0;
      boss.dashCountThisChannel += 1;
      this.startDash(boss, 'shield', this.host.player.x, this.host.player.y);
    }
    boss.channelRuntimeElapsed += delta;
    this.updateShieldCountdown(boss);
    if (boss.channelRuntimeElapsed >= (boss.winter ? 15000 : BOSS_TUNING.channelDurationMs)) {
      boss.channelActive = false;
      boss.enemy.rottenAuraSuppressed = false;
      if (boss.winter) this.completeChannel(boss);
    }
  }

  /** The deadline passed with the shield still up: it explodes. Heavy damage (or death at ratio ≥ 1) inside the
   *  radius — unless a tall obstacle stands between the boss and the player. */
  private completeChannel(boss: BossState): void {
    if (boss.shield <= 0) { this.endChannel(boss); return; }
    const { player } = this.host;
    const inRange = boss.winter || Math.hypot(boss.enemy.x - player.x, boss.enemy.y - player.y) <= BOSS_TUNING.explosionRadius;
    const covered = boss.winter ? this.braziers.some(b => b.owner === boss.enemy && Math.hypot(player.x - b.x, player.y - b.y) <= b.radius) : inRange && !this.host.hasLineOfSight(boss.enemy, player);
    this.host.events.emit('boss-explosion', { x: boss.enemy.x, y: boss.enemy.y, radius: BOSS_TUNING.explosionRadius, kind: 'shield', blocked: covered });
    this.endChannel(boss);
    if (!inRange || covered) return;
    if (boss.winter) this.host.frostPlayer?.(5);
    if (BOSS_TUNING.explosionDamageRatio >= 1) this.host.killPlayer();
    else this.host.hurtPlayer(player.maxHealth * BOSS_TUNING.explosionDamageRatio, true);
  }

  private endChannel(boss: BossState): void {
    for (let i = this.braziers.length - 1; i >= 0; i--) if (this.braziers[i].owner === boss.enemy) this.braziers.splice(i, 1);
    boss.channelActive = false;
    boss.shieldActive = false;
    boss.shield = 0;
    boss.enemy.rottenAuraSuppressed = false;
    // No shield dash without a shield: a pending telegraph is cancelled, a dash already in motion finishes.
    if (boss.dash.kind === 'shield' && boss.dash.phase === 'telegraph') boss.dash.phase = 'idle';
  }

  private updateShieldCountdown(boss: BossState): void {
    const remainingMs = (boss.winter ? 15000 : BOSS_TUNING.shieldDeadlineMs) - boss.channelRuntimeElapsed;
    if (remainingMs > 10000 || remainingMs < 0) return;
    const seconds = Math.ceil(remainingMs / 1000);
    if (seconds === boss.shieldCountdownLastShown) return;
    boss.shieldCountdownLastShown = seconds;
    if (seconds > 0) this.host.events.emit('boss-shield-countdown', { enemy: boss.enemy, seconds });
  }

  private launchMeteor(boss: BossState): void {
    const { player } = this.host;
    this.meteors.push({ x: player.x, y: player.y, elapsedMs: 0, telegraphMs: boss.phaseTwo ? BOSS_TUNING.meteorTelegraphPhase2Ms : BOSS_TUNING.meteorTelegraphMs });
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

  /** Against kiting: a crouch, then a leap lungeDistance towards the player. */
  private tryLunge(boss: BossState): boolean {
    const { player } = this.host;
    const dx = player.x - boss.enemy.x;
    const dy = player.y - boss.enemy.y;
    const distance = Math.hypot(dx, dy);
    if (boss.lungeCooldownElapsed < BOSS_TUNING.lungeCooldownMs || distance < BOSS_TUNING.lungeMinDistance) return false;
    boss.lungeCooldownElapsed = 0;
    const reach = Math.min(BOSS_TUNING.lungeDistance, distance);
    this.startDash(boss, 'lunge', boss.enemy.x + (dx / distance) * reach, boss.enemy.y + (dy / distance) * reach);
    return true;
  }

  private startDash(boss: BossState, kind: 'shield' | 'lunge', targetX: number, targetY: number): void {
    const margin = BOSS_TUNING.edgeMargin / 2;
    const size = this.host.arenaSize;
    boss.dash = { kind, phase: 'telegraph', elapsedMs: 0, fromX: boss.enemy.x, fromY: boss.enemy.y, targetX: clamp(targetX, margin, size - margin), targetY: clamp(targetY, margin, size - margin) };
  }

  private updateDash(boss: BossState, delta: number): void {
    const dash = boss.dash;
    if (dash.phase === 'idle') return;
    dash.elapsedMs += delta;
    const telegraphMs = dash.kind === 'lunge' ? BOSS_TUNING.lungeTelegraphMs : BOSS_TUNING.dashTelegraphMs;
    const travelMs = dash.kind === 'lunge' ? BOSS_TUNING.lungeTravelMs : BOSS_TUNING.dashTravelMs;
    if (dash.phase === 'telegraph') {
      if (dash.elapsedMs < telegraphMs) return;
      dash.phase = 'dashing';
      dash.elapsedMs = 0;
      dash.fromX = boss.enemy.x;
      dash.fromY = boss.enemy.y;
    }
    const t = Math.min(1, dash.elapsedMs / travelMs);
    const eased = t * t * t; // Cubic.In
    boss.enemy.x = dash.fromX + (dash.targetX - dash.fromX) * eased;
    boss.enemy.y = dash.fromY + (dash.targetY - dash.fromY) * eased;
    if (t < 1) return;
    dash.phase = 'idle';
    const radius = dash.kind === 'lunge' ? BOSS_TUNING.lungeRadius : BOSS_TUNING.dashRadius;
    const damage = dash.kind === 'lunge' ? BOSS_TUNING.lungeDamage : BOSS_TUNING.dashDamage;
    this.host.events.emit('boss-explosion', { x: dash.targetX, y: dash.targetY, radius, kind: dash.kind === 'lunge' ? 'lunge' : 'dash' });
    const { player } = this.host;
    if (Math.hypot(dash.targetX - player.x, dash.targetY - player.y) <= radius) this.host.hurtPlayer(damage);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Steps `angle` toward `target` by at most `maxStep`, the short way round. */
function rotateTowards(angle: number, target: number, maxStep: number): number {
  const difference = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  return Math.abs(difference) <= maxStep ? target : angle + Math.sign(difference) * maxStep;
}
