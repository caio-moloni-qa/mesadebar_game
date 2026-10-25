import { ENEMY_CONFIG, ENEMY_VARIANTS, HEALTH_POTION_DROP_CHANCE, HEALTH_POTION_HEAL_AMOUNT, LEVEL_UPGRADE_CONFIG, LOOT_CHEST_DROP_CHANCE, requiredExperience } from '../../config/balance';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { RUN_DURATION_MS } from '../../config/world';
import { MAX_ACTIVE_WEAPONS, WEAPONS, WeaponConfig, WeaponFamily, weaponFamily } from '../../config/weapons';
import { EventBus } from '../EventBus';
import { Pool } from '../Pool';
import { SimClock } from '../SimClock';
import { SpatialHash } from '../SpatialHash';
import { circlesOverlap } from '../collision';
import { Rng, Vec2, createRng, floatBetween, pickOne, randomPointAround, shuffled } from '../math';
import { BossEvents, BossSystem } from '../systems/BossSystem';
import { DifficultySystem } from '../systems/DifficultySystem';
import { EnemySpawnScheduler, EnemyVariantId } from '../systems/EnemySpawnScheduler';
import { Upgrade, UpgradeSystem } from '../systems/UpgradeSystem';
import { WeaponEvents, WeaponHost, WeaponSystem, WEAPON_TUNING } from '../systems/WeaponSystem';
import { ArenaMap } from '../world/ArenaMap';
import { FlowField } from '../world/FlowField';
import { BODY_RADIUS, ENEMY_DYING_MS, ENEMY_HIT_STUN_MS, EnemyState, PeelState, PickupKind, PickupState, PlayerState, ProjectileState, SOUL_CONFIG, SoulState, snapPrevious } from './entities';

/** Fixed simulation step. The renderer accumulates frame time and calls step() this many ms at a time. */
export const STEP_MS = 1000 / 60;

const PICKUP_ATTRACT_SPEED = 300;
const MAX_PROJECTILES = 400;
const MAX_PICKUPS = 600;
const MAX_SOULS = 80;
const MAX_PEELS = 40;
/** Broad-phase cell size: a bit bigger than the largest common body so most queries touch few cells. */
const SPATIAL_CELL_SIZE = 96;
/** Largest rangePadding any enemy has (the boss: 390 × 0.35) — queries widen by this, then test exactly. */
const MAX_RANGE_PADDING = 137;
/** Fabri's banana peels (GameScene constants). */
const PEEL = { spawnChance: 0.03, minRadius: 40, maxRadius: 130, lifetimeMs: 12000, slipMs: 900 } as const;
/** Soft push between overlapping enemies (fraction of the overlap resolved per step). New in 3D: without it a horde
 *  converging on the hero collapses into one solid block of models. Static enemies and bosses are never pushed. */
const SEPARATION_STRENGTH = 0.25;
/** How often the enemy flow field is rebuilt from the hero's position (only when the hero changed grid cell). */
const FLOW_FIELD_REFRESH_MS = 250;
/** Boss-wave portals (Phaser: GameScene.onBossWaveCleared): spawn this far apart above the hero, used within reach. */
const PORTAL = { spread: 110, rise: 160, reach: 70 } as const;

export type PortalKind = 'end' | 'continue';

export type PendingChoice =
  | { kind: 'starting'; upgrades: Upgrade[]; picksRemaining: number; picksTotal: number }
  | { kind: 'level-up'; level: number; upgrades: Upgrade[]; extraWeapon: WeaponConfig | null };

export interface SessionEvents extends WeaponEvents, BossEvents {
  'enemy-hit': { enemy: EnemyState; amount: number; critical: boolean };
  'enemy-defeated': { x: number; y: number; variantId: EnemyVariantId; divineRelic: boolean };
  'player-damaged': { amount: number };
  /** Floating callouts above the hero (CURA -N, LENTO +20%, HP -3). */
  'player-status': { text: string; tone: 'heal-cut' | 'slow' | 'rot' | 'heal' };
  'pickup-collected': { kind: PickupKind; value: number; x: number; y: number };
  'chest-opened': { upgrade: Upgrade; rolled: Upgrade[] };
  'choice-opened': PendingChoice;
  'upgrade-applied': { upgrade: Upgrade };
  'weapon-added': { weapon: WeaponConfig };
  'soul-fired': { x: number; y: number };
  'enemy-slipped': { enemy: EnemyState };
  'player-died': Record<string, never>;
  /** Every wave boss is dead: the arena is cleared and the end / continue portals open. */
  'boss-wave-cleared': { cycle: number };
  'run-ended': { victory: boolean };
}

export interface GameSessionOptions {
  characterId: CharacterId;
  seed: number;
  /** Defaults to the character's preferred weapon. */
  startingWeaponId?: WeaponConfig['id'];
  /** Sandbox/perf aid: keep the field topped up to this many skeletons around the player. */
  stressEnemyCount?: number;
  /** Skip the "choose your starting weapon upgrades" screen (tests, quick sandbox runs). */
  skipStartingUpgrades?: boolean;
  /** The arena to play in. Defaults to the authored map with this run's seed; tests pass ArenaMap.open(size). */
  arena?: ArenaMap;
}

/** Engine-agnostic run simulation — the GameScene replacement described in THREEJS_3D_MIGRATION_TEMP.md. Covers
 *  movement, spawning, every weapon (WeaponSystem), enemy behaviours (pursuit, necromancer souls, Aura Podre,
 *  banana slows/peels), drops, XP/levels and the upgrade/extra-weapon choice flow. Boss and merchant come later.
 *  Units are game units (= old 2D pixels). Nothing in here reads wall-clock time. */
export class GameSession implements WeaponHost {
  readonly clock = new SimClock();
  readonly events = new EventBus<SessionEvents>();
  readonly rng: Rng;
  readonly characterId: CharacterId;
  readonly player: PlayerState;
  readonly arena: ArenaMap;
  readonly enemies = new Pool(() => new EnemyState(), ENEMY_CONFIG.maxActive);
  readonly projectiles = new Pool(() => new ProjectileState(), MAX_PROJECTILES);
  readonly pickups = new Pool(() => new PickupState(), MAX_PICKUPS);
  readonly souls = new Pool(() => new SoulState(), MAX_SOULS);
  readonly peels = new Pool(() => new PeelState(), MAX_PEELS);
  readonly difficulty = new DifficultySystem();
  readonly weapons: WeaponSystem;
  readonly affinities = new Set<WeaponFamily>();
  readonly selectedUpgradeCounts = new Map<string, number>();
  kills = 0;
  level = 1;
  experience = 0;
  experienceNeeded = requiredExperience(1);
  currency = 0;
  elapsedMs = 0;
  over = false;
  /** Set when the run ends through the end portal (VITÓRIA) rather than by dying. */
  victory = false;
  pendingChoice: PendingChoice | null = null;
  readonly bosses: BossSystem;
  /** Boss-wave cycle: cycle 1 is the base 3-minute run; each continue portal adds a minute, 1× difficulty and a boss. */
  bossCycle = 1;
  /** While true (every wave boss dead, portals open) the clock, spawns and combat stand still; only walking and
   *  loot pickup continue until the player takes a portal. */
  awaitingPortalChoice = false;
  portals: Record<PortalKind, { x: number; y: number }> | null = null;
  private phaseStartedAtMs = 0;
  private phaseBossTriggered = false;
  /** Sandbox toggles (same switches the F9 panel has in the Phaser build). */
  skeletonSpawnEnabled = true;
  variantSpawnEnabled = true;
  enemySeparation = true;

  private readonly upgradeSystem: UpgradeSystem;
  private readonly scheduler: EnemySpawnScheduler;
  private readonly enemyHash = new SpatialHash<EnemyState>(SPATIAL_CELL_SIZE);
  /** Pathing for the horde (null on an open map, where walking straight at the hero is already optimal). */
  private readonly flowField: FlowField | null;
  private flowFieldRefreshIn = 0;
  private userPaused = false;
  private revealHold = false;
  private moveX = 0;
  private moveY = 0;
  private readonly scratch: EnemyState[] = [];
  private readonly probe = { x: 0, y: 0, radius: 0 };

  constructor(private readonly options: GameSessionOptions) {
    this.rng = createRng(options.seed);
    this.characterId = options.characterId;
    const character = CHARACTERS[options.characterId];
    this.player = new PlayerState(character);
    this.arena = options.arena ?? ArenaMap.generate(options.seed);
    this.player.x = this.arena.center.x;
    this.player.y = this.arena.center.y;
    snapPrevious(this.player);
    this.flowField = this.arena.obstacles.length > 0 || this.arena.authored ? new FlowField(this.arena) : null;
    this.upgradeSystem = new UpgradeSystem(this.rng);
    this.weapons = new WeaponSystem(this);
    const startingWeapon = WEAPONS[options.startingWeaponId ?? character.preferredWeaponId ?? 'staff'];
    this.weapons.add(startingWeapon);
    // The starting weapon is the one family the character has affinity with for free.
    this.affinities.add(weaponFamily(startingWeapon));
    this.bosses = new BossSystem({
      player: this.player,
      rng: this.rng,
      arenaSize: this.arena.size,
      events: this.events,
      now: () => this.clock.now,
      spawnEnemy: (variantId, x, y) => this.spawnEnemy(variantId, x, y),
      hurtPlayer: (amount) => this.hurtPlayer(amount, this.clock.now),
      killPlayer: () => { if (!this.player.invincible) this.player.health = 0; },
      clearEnemyField: (preserve) => this.clearEnemyField(preserve)
    });
    this.scheduler = new EnemySpawnScheduler({
      getPlayerPosition: () => this.player,
      isSkeletonSpawnEnabled: () => this.skeletonSpawnEnabled,
      isVariantSpawnEnabled: () => this.variantSpawnEnabled,
      hasActiveEncounter: () => this.bosses.hasActiveEncounter(),
      difficultyStageFor: (elapsedMs) => this.difficulty.stageFor(elapsedMs),
      spawn: (request) => { this.spawnEnemy(request.variantId, request.x, request.y, request.maxHealth); }
    }, this.rng, this.arena.size);
    if (!options.skipStartingUpgrades && character.preferredWeaponId === startingWeapon.id && character.startingWeaponUpgradeChoices) {
      const total = character.startingWeaponUpgradeChoices;
      this.openChoice({ kind: 'starting', upgrades: shuffled(this.rng, this.upgradeSystem.weaponUpgradePool(startingWeapon, this.player)).slice(0, total), picksRemaining: total, picksTotal: total });
    }
  }

  // ── Control surface (renderer / UI) ───────────────────────────────────────────────────────────────────────

  get paused(): boolean {
    return this.userPaused;
  }

  set paused(value: boolean) {
    this.userPaused = value;
    this.syncClockPause();
  }

  /** Set by the renderer while a reveal plays (the chest roll): the simulation holds still, like the Phaser build's
   *  pauseGameplay() during it, without counting as the pause menu. */
  get revealing(): boolean {
    return this.revealHold;
  }

  set revealing(value: boolean) {
    this.revealHold = value;
    this.syncClockPause();
  }

  /** True while anything (pause menu, upgrade choice, a reveal) is holding the simulation still. */
  get frozen(): boolean {
    return this.clock.paused;
  }

  /** Desired movement direction in game-plane coordinates; any length, normalised here. (0, 0) = stand still. */
  setMoveInput(x: number, y: number): void {
    const length = Math.hypot(x, y);
    this.moveX = length > 0 ? x / length : 0;
    this.moveY = length > 0 ? y / length : 0;
  }

  /** Picks one of the offered upgrades from the open choice (level-up card or starting-upgrade card). */
  chooseUpgrade(upgradeId: string): void {
    const choice = this.pendingChoice;
    if (!choice) return;
    const upgrade = choice.upgrades.find((candidate) => candidate.id === upgradeId);
    if (!upgrade) return;
    this.applyUpgrade(upgrade);
    if (choice.kind === 'starting') {
      choice.picksRemaining -= 1;
      if (choice.picksRemaining > 0) return;
    }
    this.closeChoice();
    this.processExperience();
  }

  /** Takes the level-up's bonus weapon card instead of an upgrade. */
  chooseExtraWeapon(): void {
    const choice = this.pendingChoice;
    if (!choice || choice.kind !== 'level-up' || !choice.extraWeapon) return;
    this.weapons.add(choice.extraWeapon);
    this.events.emit('weapon-added', { weapon: choice.extraWeapon });
    this.closeChoice();
    this.processExperience();
  }

  /** Tomo de Afinidade (merchant) / sandbox: unlock a weapon family's upgrade pool. */
  grantAffinity(family: WeaponFamily): void {
    this.affinities.add(family);
  }

  /** Sandbox: put a weapon in the loadout directly (respects MAX_ACTIVE_WEAPONS). */
  addWeapon(id: WeaponConfig['id']): boolean {
    if (this.weapons.has(id) || this.weapons.weapons.length >= MAX_ACTIVE_WEAPONS) return false;
    this.weapons.add(WEAPONS[id]);
    this.events.emit('weapon-added', { weapon: WEAPONS[id] });
    return true;
  }

  /** Sandbox: apply a random upgrade from the current choice pool without opening a screen. */
  grantRandomUpgrade(): Upgrade {
    const upgrade = pickOne(this.rng, this.upgradeSystem.choices(this.weapons.primary.config, this.player, 5, this.secondaryWithAffinity()));
    this.applyUpgrade(upgrade);
    return upgrade;
  }

  spawnEnemy(variantId: EnemyVariantId, x: number, y: number, maxHealth: number = ENEMY_VARIANTS[variantId].maxHealth): EnemyState | null {
    const enemy = this.enemies.acquire();
    if (!enemy) return null;
    enemy.activate(variantId, x, y, maxHealth, this.clock.now);
    // Spawn points come from the schedule (rings around the hero, the border, anywhere for necromancers) and know
    // nothing about the map - move them to the nearest ground the enemy actually fits on.
    const spot = this.arena.nearestWalkable(enemy.x, enemy.y, enemy.radius);
    enemy.x = spot.x;
    enemy.y = spot.y;
    snapPrevious(enemy);
    return enemy;
  }

  // ── Simulation step ───────────────────────────────────────────────────────────────────────────────────────

  step(deltaMs: number = STEP_MS): void {
    if (this.over || this.clock.paused) return;
    this.clock.advance(deltaMs);
    const now = this.clock.now;
    this.snapshotPositions();
    this.movePlayer(deltaMs, now);
    if (this.awaitingPortalChoice) {
      // Between cycles: the run's clock is frozen and the field is empty; every leftover drop flies to the hero.
      this.updatePickups(deltaMs, Number.POSITIVE_INFINITY);
      return;
    }
    this.elapsedMs += deltaMs;
    if (!this.phaseBossTriggered && this.elapsedMs - this.phaseStartedAtMs >= this.phaseDurationMs()) {
      this.phaseBossTriggered = true;
      this.bosses.warn(this.bossCycle);
    }
    this.refreshFlowField(deltaMs);
    this.scheduler.update(deltaMs, this.elapsedMs);
    this.bosses.update(deltaMs);
    this.topUpStressEnemies();
    this.rebuildEnemyHash();
    this.updateEnemies(deltaMs, now);
    this.updatePlayerStatus(deltaMs, now);
    this.weapons.update(deltaMs);
    this.updateSouls(deltaMs, now);
    this.updatePeels(now);
    this.updatePickups(deltaMs);
    if (!this.player.alive && !this.over) {
      this.events.emit('player-died', {});
      this.finish(false);
    }
  }

  private snapshotPositions(): void {
    snapPrevious(this.player);
    this.enemies.forEachActive(snapPrevious);
    this.projectiles.forEachActive(snapPrevious);
    this.pickups.forEachActive(snapPrevious);
    this.souls.forEachActive(snapPrevious);
  }

  private movePlayer(deltaMs: number, now: number): void {
    const distance = (this.player.effectiveMovementSpeed(now) * deltaMs) / 1000;
    const { radius } = this.player;
    this.player.x = clamp(this.player.x + this.moveX * distance, radius, this.arena.size - radius);
    this.player.y = clamp(this.player.y + this.moveY * distance, radius, this.arena.size - radius);
    this.arena.resolve(this.player);
    if (this.moveX !== 0 || this.moveY !== 0) {
      this.player.facingX = this.moveX;
      this.player.facingY = this.moveY;
    }
  }

  private refreshFlowField(deltaMs: number): void {
    if (!this.flowField) return;
    this.flowFieldRefreshIn -= deltaMs;
    if (this.flowFieldRefreshIn > 0) return;
    this.flowFieldRefreshIn = FLOW_FIELD_REFRESH_MS;
    this.flowField.update(this.player);
  }

  private topUpStressEnemies(): void {
    const target = this.options.stressEnemyCount ?? 0;
    while (this.enemies.activeCount < target) {
      const point = randomPointAround(this.rng, this.player, 300, 1000);
      if (!this.spawnEnemy('skeleton', point.x, point.y)) break;
    }
  }

  private rebuildEnemyHash(): void {
    this.enemyHash.clear();
    this.enemies.forEachActive((enemy) => {
      if (enemy.alive) this.enemyHash.insert(enemy, enemy.radius);
    });
  }

  private updateEnemies(deltaMs: number, now: number): void {
    const finished: EnemyState[] = [];
    this.enemies.forEachActive((enemy) => {
      if (!enemy.alive) {
        if (now >= enemy.phaseEndsAt) finished.push(enemy);
        return;
      }
      if (!enemy.isStatic && now >= enemy.hitStunUntil && now >= enemy.slipUntil && !this.bosses.holdsStill(enemy)) this.pursuePlayer(enemy, deltaMs);
      if (this.enemySeparation && !enemy.isStatic && enemy.variantId !== 'finalBoss') this.separate(enemy);
      // Every walker - floating wraiths included - slides along walls and stays out of the lake.
      if (!enemy.isStatic) this.arena.resolve(enemy);
      if (enemy.contactDamage > 0 && circlesOverlap(enemy, this.player)) this.hurtPlayer(enemy.contactDamage, now);
      if (enemy.variantId === 'necromancerWraith' && now >= enemy.nextSoulAt) {
        enemy.nextSoulAt = now + ENEMY_VARIANTS.necromancerWraith.soulCooldownMs;
        this.fireSoul(enemy, now);
      }
      if (enemy.hasRottenAura && !enemy.rottenAuraSuppressed && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= enemy.rottenAuraRadius) this.player.refreshRottenAura(now);
    });
    finished.forEach((enemy) => this.enemies.release(enemy));
  }

  /** Follow the flow field downhill (routes around walls, through doorways), or walk straight at the hero on an
   *  open map / once close enough that the field has nothing better to say. */
  private pursuePlayer(enemy: EnemyState, deltaMs: number): void {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const route = this.flowField?.direction(enemy.x, enemy.y) ?? null;
    const step = Math.min(length, (enemy.effectiveMovementSpeed() * deltaMs) / 1000);
    enemy.facingX = route ? route.x : dx / length;
    enemy.facingY = route ? route.y : dy / length;
    enemy.x += enemy.facingX * step;
    enemy.y += enemy.facingY * step;
  }

  private separate(enemy: EnemyState): void {
    this.scratch.length = 0;
    for (const other of this.enemyHash.queryRadius(enemy, enemy.radius * 2, this.scratch)) {
      if (other === enemy || !other.alive) continue;
      let dx = enemy.x - other.x;
      let dy = enemy.y - other.y;
      let distance = Math.hypot(dx, dy);
      const minimum = enemy.radius + other.radius;
      if (distance >= minimum) continue;
      if (distance === 0) {
        const angle = floatBetween(this.rng, 0, Math.PI * 2);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const push = ((minimum - distance) / distance) * SEPARATION_STRENGTH;
      enemy.x += dx * push;
      enemy.y += dy * push;
    }
  }

  private hurtPlayer(amount: number, now: number): void {
    const dealt = this.player.damage(amount, now);
    if (dealt > 0) this.events.emit('player-damaged', { amount: dealt });
  }

  private updatePlayerStatus(deltaMs: number, now: number): void {
    const prevented = this.player.updatePassiveHealing(deltaMs, now);
    if (Math.round(prevented) > 0) this.events.emit('player-status', { text: `CURA -${Math.round(prevented)}`, tone: 'heal-cut' });
    const rot = this.player.updateRotten(deltaMs, now);
    if (rot > 0) this.events.emit('player-status', { text: `HP -${Math.round(rot)}`, tone: 'rot' });
  }

  // ── Boss waves, portals and cycles ─────────────────────────────────────────────────────────────────────────

  /** Cycle 1 is RUN_DURATION_MS; every continuation adds a minute. */
  phaseDurationMs(cycle: number = this.bossCycle): number {
    return RUN_DURATION_MS + (cycle - 1) * 60_000;
  }

  /** Sandbox: start this cycle's boss warning right now. */
  triggerBossWave(): void {
    if (this.phaseBossTriggered || this.awaitingPortalChoice) return;
    this.phaseBossTriggered = true;
    this.bosses.warn(this.bossCycle);
  }

  /** The portal the hero stands at, if any (the end portal wins a tie, like the Phaser build). */
  get portalInReach(): PortalKind | null {
    if (!this.portals) return null;
    const near = (portal: { x: number; y: number }) => Math.hypot(this.player.x - portal.x, this.player.y - portal.y) <= PORTAL.reach;
    if (near(this.portals.end)) return 'end';
    if (near(this.portals.continue)) return 'continue';
    return null;
  }

  /** The interact key (E): takes the portal in reach. */
  interact(): void {
    if (this.over || this.clock.paused) return;
    const portal = this.portalInReach;
    if (portal === 'end') this.finish(true);
    if (portal === 'continue') this.continueToNextCycle();
  }

  private onBossWaveCleared(): void {
    this.awaitingPortalChoice = true;
    this.clearEnemyField(null);
    const place = (offsetX: number) => this.arena.nearestWalkable(this.player.x + offsetX, this.player.y - PORTAL.rise, 30);
    this.portals = { end: place(-PORTAL.spread), continue: place(PORTAL.spread) };
    this.events.emit('boss-wave-cleared', { cycle: this.bossCycle });
  }

  /** +1 boss, +1 minute next phase, +1× difficulty — all keyed off bossCycle, so the loop repeats indefinitely. */
  private continueToNextCycle(): void {
    this.awaitingPortalChoice = false;
    this.portals = null;
    this.bossCycle += 1;
    this.phaseStartedAtMs = this.elapsedMs;
    this.phaseBossTriggered = false;
    this.difficulty.setCycleMultiplier(this.bossCycle);
    this.bosses.rearm();
  }

  private finish(victory: boolean): void {
    this.over = true;
    this.victory = victory;
    this.portals = null;
    this.events.emit('run-ended', { victory });
  }

  /** Every active enemy except `preserve` dies on the spot (no kill credit, no drops). Returns how many. */
  private clearEnemyField(preserve: EnemyState | null): number {
    let cleared = 0;
    const now = this.clock.now;
    this.enemies.forEachActive((enemy) => {
      if (enemy === preserve || !enemy.alive) return;
      enemy.phase = 'dying';
      enemy.phaseEndsAt = now + ENEMY_DYING_MS;
      cleared += 1;
    });
    return cleared;
  }

  // ── Enemy damage, death and drops ─────────────────────────────────────────────────────────────────────────

  damageEnemy(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id'], critical = false): void {
    if (!enemy.alive) return;
    const now = this.clock.now;
    // A channelling boss's shield soaks hits first; only the overflow reaches its health.
    const overflow = this.bosses.absorbDamage(enemy, amount);
    if (overflow !== null) {
      enemy.lastHitAt = now;
      if (overflow <= 0) return;
      amount = overflow;
    }
    const dealt = Math.min(amount, enemy.health);
    // Roubo de Vida applies to any cone (melee-family) weapon, not just the Espada.
    if (WEAPONS[weaponId].type === 'cone' && this.player.lifeStealPercent > 0) this.healPlayer(dealt * this.player.lifeStealPercent);
    enemy.health -= amount;
    enemy.hitStunUntil = now + ENEMY_HIT_STUN_MS;
    enemy.lastHitAt = now;
    this.events.emit('enemy-hit', { enemy, amount, critical });
    if (enemy.health <= 0) this.defeatEnemy(enemy);
  }

  private healPlayer(amount: number): void {
    const prevented = this.player.heal(amount, this.clock.now);
    if (Math.round(prevented) > 0) this.events.emit('player-status', { text: `CURA -${Math.round(prevented)}`, tone: 'heal-cut' });
  }

  private defeatEnemy(enemy: EnemyState): void {
    enemy.phase = 'dying';
    enemy.phaseEndsAt = this.clock.now + ENEMY_DYING_MS;
    this.kills += 1;
    if (this.bosses.bossFor(enemy)) {
      // Bosses give no XP or drops; the last wave boss opens the portals.
      this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId, divineRelic: this.weapons.has('amulet') });
      if (this.bosses.defeat(enemy) && !this.bosses.hasActiveWaveBosses()) this.onBossWaveCleared();
      return;
    }
    this.experience += enemy.reward;
    for (let index = 0; index < enemy.currencyDrops; index += 1) {
      const point = index === 0 ? enemy : randomPointAround(this.rng, enemy, 12, 28);
      this.dropPickup('gem', point.x, point.y, enemy.reward);
    }
    if ((enemy.variantId === 'superSkeleton' || enemy.variantId === 'necromancerWraith') && this.rng() < LOOT_CHEST_DROP_CHANCE) this.dropPickup('chest', enemy.x, enemy.y, 0);
    if (this.rng() < HEALTH_POTION_DROP_CHANCE) this.dropPickup('potion', enemy.x, enemy.y, HEALTH_POTION_HEAL_AMOUNT);
    this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId, divineRelic: this.weapons.has('amulet') });
    this.processExperience();
  }

  private dropPickup(kind: PickupKind, x: number, y: number, value: number): void {
    const pickup = this.pickups.acquire();
    if (!pickup) return;
    pickup.kind = kind;
    pickup.value = value;
    pickup.radius = kind === 'gem' ? BODY_RADIUS.gem : kind === 'chest' ? BODY_RADIUS.chest : BODY_RADIUS.potion;
    // Never inside a wall or the lake (a burst of gems from a kill next to a wall would otherwise be unreachable).
    const spot = this.arena.nearestWalkable(x, y, pickup.radius);
    pickup.x = spot.x;
    pickup.y = spot.y;
    snapPrevious(pickup);
  }

  private updatePickups(deltaMs: number, range: number = this.player.pickupRange): void {
    const collected: PickupState[] = [];
    const rangeSq = range * range;
    this.pickups.forEachActive((pickup) => {
      const dx = this.player.x - pickup.x;
      const dy = this.player.y - pickup.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= rangeSq && distSq > 0) {
        const length = Math.sqrt(distSq);
        const step = Math.min(length, (PICKUP_ATTRACT_SPEED * deltaMs) / 1000);
        pickup.x += (dx / length) * step;
        pickup.y += (dy / length) * step;
      }
      if (circlesOverlap(pickup, this.player)) collected.push(pickup);
    });
    collected.forEach((pickup) => {
      this.pickups.release(pickup);
      this.collect(pickup);
    });
  }

  private collect(pickup: PickupState): void {
    if (pickup.kind === 'gem') this.currency += pickup.value;
    if (pickup.kind === 'potion') this.healPlayer(pickup.value);
    if (pickup.kind === 'chest') {
      // Baú: one random upgrade from the same 5-option pool the bonus level-up screen offers, applied on pickup.
      const rolled = this.upgradeSystem.choices(this.weapons.primary.config, this.player, 5, this.secondaryWithAffinity());
      if (rolled.length > 0) {
        const upgrade = pickOne(this.rng, rolled);
        this.applyUpgrade(upgrade);
        this.events.emit('chest-opened', { upgrade, rolled });
      }
    }
    this.events.emit('pickup-collected', { kind: pickup.kind, value: pickup.value, x: pickup.x, y: pickup.y });
  }

  // ── Necromancer souls, banana peels ───────────────────────────────────────────────────────────────────────

  private fireSoul(enemy: EnemyState, now: number): void {
    const soul = this.souls.acquire();
    if (!soul) return;
    soul.x = enemy.x;
    soul.y = enemy.y;
    snapPrevious(soul);
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    soul.velocityX = Math.cos(angle) * SOUL_CONFIG.speed;
    soul.velocityY = Math.sin(angle) * SOUL_CONFIG.speed;
    soul.expiresAt = now + SOUL_CONFIG.lifetimeMs;
    this.events.emit('soul-fired', { x: soul.x, y: soul.y });
  }

  private updateSouls(deltaMs: number, now: number): void {
    const spent: SoulState[] = [];
    this.souls.forEachActive((soul) => {
      soul.x += (soul.velocityX * deltaMs) / 1000;
      soul.y += (soul.velocityY * deltaMs) / 1000;
      // Walls are cover against the necromancer's skulls too.
      if (now >= soul.expiresAt || this.arena.blocksProjectile(soul.x, soul.y, soul.radius)) { spent.push(soul); return; }
      if (!circlesOverlap(soul, this.player)) return;
      this.player.applySlow(SOUL_CONFIG.slowPercent, SOUL_CONFIG.slowDurationMs, now);
      this.events.emit('player-status', { text: `LENTO +${Math.round(SOUL_CONFIG.slowPercent * 100)}%`, tone: 'slow' });
      this.hurtPlayer(SOUL_CONFIG.damage, now);
      spent.push(soul);
    });
    spent.forEach((soul) => this.souls.release(soul));
  }

  onBananaHit(enemy: EnemyState): void {
    const transform = CHARACTERS[this.characterId].boomerangBananaTransform;
    if (!transform) return;
    enemy.slowStackPercent = Math.min(WEAPON_TUNING.bananaSlowCap, enemy.slowStackPercent + transform.slowPercentPerHit);
    if (this.rng() >= PEEL.spawnChance) return;
    const peel = this.peels.acquire();
    if (!peel) return;
    const angle = floatBetween(this.rng, 0, Math.PI * 2);
    const distance = floatBetween(this.rng, PEEL.minRadius, PEEL.maxRadius);
    const spot = this.arena.nearestWalkable(this.player.x + Math.cos(angle) * distance, this.player.y + Math.sin(angle) * distance, peel.radius);
    peel.x = spot.x;
    peel.y = spot.y;
    snapPrevious(peel);
    peel.expiresAt = this.clock.now + PEEL.lifetimeMs;
  }

  private updatePeels(now: number): void {
    const spent: PeelState[] = [];
    this.peels.forEachActive((peel) => {
      if (now >= peel.expiresAt) { spent.push(peel); return; }
      const victim = this.enemiesOverlapping(peel.x, peel.y, peel.radius)[0];
      if (!victim) return;
      victim.slipUntil = now + PEEL.slipMs;
      this.events.emit('enemy-slipped', { enemy: victim });
      spent.push(peel);
    });
    spent.forEach((peel) => this.peels.release(peel));
  }

  // ── Level-ups, upgrades and choices ───────────────────────────────────────────────────────────────────────

  hasAffinity(weapon: WeaponConfig): boolean {
    return this.affinities.has(weaponFamily(weapon));
  }

  private secondaryWithAffinity(): WeaponConfig | undefined {
    const secondary = this.weapons.weapons[1];
    return secondary && this.hasAffinity(secondary.config) ? secondary.config : undefined;
  }

  private applyUpgrade(upgrade: Upgrade): void {
    upgrade.apply(this.player);
    this.weapons.countUpgrade();
    this.selectedUpgradeCounts.set(upgrade.id, (this.selectedUpgradeCounts.get(upgrade.id) ?? 0) + 1);
    this.events.emit('upgrade-applied', { upgrade });
  }

  /** One level at a time, like GameScene: each level-up waits for its choice before the next one is checked. */
  private processExperience(): void {
    if (this.pendingChoice || this.experience < this.experienceNeeded) return;
    this.experience -= this.experienceNeeded;
    this.level += 1;
    this.experienceNeeded = requiredExperience(this.level);
    const bonusLevel = this.level % LEVEL_UPGRADE_CONFIG.bonusChoiceInterval === 0;
    const amount = bonusLevel ? LEVEL_UPGRADE_CONFIG.bonusChoiceAmount : LEVEL_UPGRADE_CONFIG.defaultChoiceAmount;
    const extraWeapon = this.rollExtraWeaponOffer(bonusLevel);
    const upgrades = this.upgradeSystem.choices(this.weapons.primary.config, this.player, extraWeapon ? amount - 1 : amount, this.secondaryWithAffinity());
    this.openChoice({ kind: 'level-up', level: this.level, upgrades, extraWeapon });
  }

  private rollExtraWeaponOffer(bonusLevel: boolean): WeaponConfig | null {
    if (!bonusLevel || this.weapons.weapons.length >= MAX_ACTIVE_WEAPONS) return null;
    const candidates = Object.values(WEAPONS).filter((weapon) => !this.weapons.has(weapon.id));
    return candidates.length > 0 ? pickOne(this.rng, candidates) : null;
  }

  private openChoice(choice: PendingChoice): void {
    this.pendingChoice = choice;
    this.syncClockPause();
    this.events.emit('choice-opened', choice);
  }

  private closeChoice(): void {
    this.pendingChoice = null;
    this.syncClockPause();
  }

  private syncClockPause(): void {
    this.clock.paused = this.userPaused || this.revealHold || this.pendingChoice !== null;
  }

  // ── WeaponHost queries ────────────────────────────────────────────────────────────────────────────────────

  get worldSize(): number {
    return this.arena.size;
  }

  isOver(): boolean {
    return this.over;
  }

  nearestEnemy(from: Vec2, range: number, exclude?: (enemy: EnemyState) => boolean): EnemyState | null {
    let best: EnemyState | null = null;
    let bestSq = Number.POSITIVE_INFINITY;
    this.scratch.length = 0;
    for (const enemy of this.enemyHash.queryRadius(from, range + MAX_RANGE_PADDING, this.scratch)) {
      if (!enemy.alive || exclude?.(enemy)) continue;
      const reach = range + enemy.rangePadding;
      const distSq = (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2;
      if (distSq <= reach * reach && distSq < bestSq) {
        best = enemy;
        bestSq = distSq;
      }
    }
    return best;
  }

  nearestVisibleEnemy(from: Vec2, range: number): EnemyState | null {
    // Closest first, then the first with a clear line - usually the very first candidate.
    const distanceSq = (enemy: EnemyState) => (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2;
    const candidates = this.enemiesWithin(from, range).sort((a, b) => distanceSq(a) - distanceSq(b));
    return candidates.find((enemy) => this.arena.hasLineOfSight(from, enemy)) ?? null;
  }

  blocksProjectile(x: number, y: number, radius: number): boolean {
    return this.arena.blocksProjectile(x, y, radius);
  }

  enemiesWithin(from: Vec2, radius: number): EnemyState[] {
    this.scratch.length = 0;
    return this.enemyHash.queryRadius(from, radius + MAX_RANGE_PADDING, this.scratch).filter((enemy) => {
      if (!enemy.alive) return false;
      const reach = radius + enemy.rangePadding;
      return (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2 <= reach * reach;
    });
  }

  enemiesOverlapping(x: number, y: number, radius: number, out: EnemyState[] = []): EnemyState[] {
    this.probe.x = x;
    this.probe.y = y;
    this.probe.radius = radius;
    this.scratch.length = 0;
    out.length = 0;
    for (const enemy of this.enemyHash.queryRadius(this.probe, radius, this.scratch)) {
      if (enemy.alive && circlesOverlap(this.probe, enemy)) out.push(enemy);
    }
    return out;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
