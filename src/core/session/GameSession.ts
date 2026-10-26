import { ALL_ENEMY_VARIANTS, ENEMY_CONFIG, ENEMY_VARIANTS, HEALTH_POTION_DROP_CHANCE, HEALTH_POTION_HEAL_AMOUNT, LEVEL_UPGRADE_CONFIG, LOOT_CHEST_DROP_CHANCE, requiredExperience } from '../../config/balance';
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
import { CompanionEvents, CompanionSystem, MAX_COMPANION_LEVEL, MAX_COMPANIONS } from '../systems/CompanionSystem';
import { MerchantEvents, MerchantSystem } from '../systems/MerchantSystem';
import { QuestEvents, QuestReward, QuestSystem } from '../systems/QuestSystem';
import { CompanionKind, MINI_BOSSES, MINI_BOSS_ROTATION, MiniBossEvents, MiniBossKind, MiniBossSystem } from '../systems/MiniBossSystem';
import { DifficultySystem } from '../systems/DifficultySystem';
import { EnemySpawnScheduler, EnemyVariantId } from '../systems/EnemySpawnScheduler';
import { Upgrade, UpgradeSystem } from '../systems/UpgradeSystem';
import { WeaponEvents, WeaponHost, WeaponSystem, WEAPON_TUNING } from '../systems/WeaponSystem';
import { ArenaMap } from '../world/ArenaMap';
import { FlowField } from '../world/FlowField';
import { BODY_RADIUS, ENEMY_DYING_MS, ENEMY_HIT_STUN_MS, ENEMY_SLIP_MS, EnemyState, PeelState, PickupKind, PickupState, PlayerState, ProjectileState, SOUL_CONFIG, SoulState, snapPrevious } from './entities';

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
const PEEL = { spawnChance: 0.03, minRadius: 40, maxRadius: 130, lifetimeMs: 12000 } as const;
const SLIPPERY_VARIANTS: ReadonlySet<string> = new Set(['skeleton', 'apparitionWraith', 'superSkeleton']);
/** Soft push between overlapping enemies (fraction of the overlap resolved per step). New in 3D: without it a horde
 *  converging on the hero collapses into one solid block of models. Static enemies and bosses are never pushed. */
const SEPARATION_STRENGTH = 0.25;
/** How often the enemy flow field is rebuilt from the hero's position (only when the hero changed grid cell). */
const FLOW_FIELD_REFRESH_MS = 250;
/** Boss-wave portals (Phaser: GameScene.onBossWaveCleared): spawn this far apart above the hero, used within reach. */
const PORTAL = { spread: 110, rise: 160, reach: 70 } as const;
/** Each guardian slain this cycle: the Necromancer comes in with this much less health (and one beam fewer). */
export const GUARDIAN_WEAKENING = 0.05;

export type PortalKind = 'end' | 'continue';

/** A companion card: join `companion` at `level` (level > 1 = strengthen the one you have). */
export interface CompanionOffer { companion: CompanionKind; level: number }

export type PendingChoice =
  | { kind: 'starting'; upgrades: Upgrade[]; picksRemaining: number; picksTotal: number }
  | { kind: 'level-up'; level: number; upgrades: Upgrade[]; extraWeapon: WeaponConfig | null }
  /** After a zone mini-boss falls: its zone's companion, or strengthening one already following you. */
  | { kind: 'companion'; from: MiniBossKind; offers: CompanionOffer[] }
  /** The merchant's Tomo de Afinidade: unlock one weapon family's upgrade pool. */
  | { kind: 'affinity'; families: WeaponFamily[] };

export interface SessionEvents extends WeaponEvents, BossEvents, MiniBossEvents, CompanionEvents, MerchantEvents, QuestEvents {
  /** A mission's upgrade reward: what was granted. */
  'quest-gifts': { names: string[] };
  'enemy-hit': { enemy: EnemyState; amount: number; critical: boolean; weaponId: WeaponConfig['id'] | null };
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
  readonly miniBosses: MiniBossSystem;
  readonly companions: CompanionSystem;
  readonly merchant: MerchantSystem;
  readonly quests: QuestSystem;
  /** The tavern regular you're talking to (QUEST_NPCS index), or null. */
  dialogue: number | null = null;
  /** Zone guardians slain this cycle (each weakens the Necromancer). */
  guardiansDefeated = 0;
  private miniBossSlotsThisPhase = 0;
  private miniBossRotation = 0;
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
    this.arena.lakeLevel = 1;
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
      spawnEnemy: (variantId, x, y) => this.spawnEnemy(variantId, x, y),
      hurtPlayer: (amount, unavoidable) => this.hurtPlayer(amount, this.clock.now, unavoidable),
      killPlayer: () => { if (!this.player.invincible) this.player.health = 0; },
      pushPlayer: (dx, dy) => this.pushPlayer(dx, dy),
      clearEnemyField: (keep) => this.clearEnemyField(keep),
      hasLineOfSight: (from, to) => this.arena.hasLineOfSight(from, to),
      weakening: () => this.guardiansDefeated
    });
    this.miniBosses = new MiniBossSystem({
      player: this.player,
      rng: this.rng,
      arena: this.arena,
      events: this.events,
      spawnEnemy: (variantId, x, y, maxHealth) => this.spawnEnemy(variantId, x, y, maxHealth),
      hurtPlayer: (amount) => this.hurtPlayer(amount, this.clock.now),
      queueRising: (x, y) => { this.bosses.risings.push({ x, y, elapsedMs: 0 }); },
      healthMultiplier: () => this.difficulty.stageFor(this.elapsedMs).healthMultiplier,
      setLakeLevel: (level) => this.setLakeLevel(level),
      pushPlayer: (dx, dy) => this.pushPlayer(dx, dy)
    });
    this.quests = new QuestSystem({ player: this.player, rng: this.rng, arena: this.arena, events: this.events });
    this.merchant = new MerchantSystem({
      player: this.player,
      rng: this.rng,
      arena: this.arena,
      events: this.events,
      affinities: () => this.affinities,
      encounterActive: () => this.bosses.hasActiveEncounter() || this.awaitingPortalChoice
    });
    this.companions = new CompanionSystem({
      player: this.player,
      arena: this.arena,
      events: this.events,
      now: () => this.clock.now,
      heroLevel: () => this.level,
      nearestEnemy: (from, range) => this.nearestEnemy(from, range),
      enemiesNear: (from, radius) => this.enemiesWithin(from, radius + BODY_RADIUS.enemy),
      damageEnemy: (enemy, amount) => this.damageEnemy(enemy, amount, null),
      healPlayer: (amount) => this.healPlayer(amount)
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
    if (!choice || choice.kind === 'companion' || choice.kind === 'affinity') return;
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

  /** The Tomo de Afinidade's pick. */
  chooseAffinity(family: WeaponFamily): void {
    const choice = this.pendingChoice;
    if (!choice || choice.kind !== 'affinity' || !choice.families.includes(family)) return;
    this.grantAffinity(family);
    this.closeChoice();
  }

  /** Buys pedestal `index` in the merchant's room and applies it (Phaser MerchantSystem item effects). */
  private buyFromMerchant(index: number): void {
    const offer = this.merchant.buy(index, this.currency);
    if (!offer) return;
    this.currency -= offer.cost;
    const { player } = this;
    switch (offer.id) {
      case 'divine-blessing': player.addDivineBlessing(); break;
      case 'arcane-curse': player.addArcaneCurse(); break;
      case 'heal': this.healPlayer(40); break;
      case 'damage': player.damageMultiplier += 0.15; break;
      case 'speed': player.movementSpeed += 15; break;
      case 'max-health':
        player.maxHealth += 20;
        this.healPlayer(player.maxHealth * 0.5);
        break;
      case 'affinity-tome': this.openChoice({ kind: 'affinity', families: this.merchant.availableFamilies() }); break;
    }
  }

  /** The dialogue's main button: accept the mission on offer or claim a finished one's reward; otherwise just closes. */
  answerDialogue(): void {
    const index = this.dialogue;
    if (index === null) return;
    const quest = this.quests.quests[index];
    if (quest.status === 'offer') this.quests.accept(index);
    else if (quest.status === 'ready') {
      const reward = this.quests.claim(index);
      if (reward) this.grantQuestReward(reward);
    }
    this.dialogue = null;
  }

  closeDialogue(): void {
    this.dialogue = null;
  }

  private grantQuestReward(reward: QuestReward): void {
    const { player } = this;
    switch (reward.type) {
      case 'currency': this.currency += reward.amount; break;
      case 'max-health':
        player.maxHealth += reward.amount;
        this.healPlayer(reward.amount);
        break;
      case 'damage': player.damageMultiplier += reward.percent / 100; break;
      case 'upgrades': {
        const names: string[] = [];
        for (let index = 0; index < reward.count; index += 1) {
          const rolled = this.upgradeSystem.choices(this.weapons.primary.config, this.player, 5, this.secondaryWithAffinity());
          if (rolled.length === 0) break;
          const upgrade = pickOne(this.rng, rolled);
          this.applyUpgrade(upgrade);
          names.push(upgrade.name);
        }
        if (names.length > 0) this.events.emit('quest-gifts', { names });
        break;
      }
    }
  }

  private walkInMerchantRoom(deltaMs: number): void {
    if (this.dialogue !== null) return;
    const distance = (this.player.effectiveMovementSpeed(this.clock.now) * deltaMs) / 1000;
    this.player.x += this.moveX * distance;
    this.player.y += this.moveY * distance;
    this.merchant.confine(this.player);
    if (this.moveX !== 0 || this.moveY !== 0) {
      this.player.facingX = this.moveX;
      this.player.facingY = this.moveY;
    }
  }

  /** Sandbox: open the merchant's portal now (near the hero). */
  openMerchantPortal(): void {
    if (!this.merchant.inside) this.merchant.openPortal();
  }

  /** Takes a companion card. */
  chooseCompanion(index: number): void {
    const choice = this.pendingChoice;
    if (!choice || choice.kind !== 'companion') return;
    const offer = choice.offers[index];
    if (!offer) return;
    this.companions.add(offer.companion);
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

  spawnEnemy(variantId: EnemyVariantId, x: number, y: number, maxHealth: number = ALL_ENEMY_VARIANTS[variantId].maxHealth): EnemyState | null {
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
    if (this.merchant.inside) {
      // In the merchant's room the whole arena stands still (its clock too): only the hero walks around in here.
      snapPrevious(this.player);
      this.walkInMerchantRoom(deltaMs);
      return;
    }
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
    this.scheduleMiniBosses();
    this.bosses.update(deltaMs);
    this.miniBosses.update(deltaMs);
    this.merchant.update(deltaMs);
    this.quests.update(deltaMs);
    this.topUpStressEnemies();
    this.rebuildEnemyHash();
    this.updateEnemies(deltaMs, now);
    this.updatePlayerStatus(deltaMs, now);
    this.weapons.update(deltaMs);
    this.companions.update(deltaMs);
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
      if (!enemy.isStatic && now >= enemy.hitStunUntil && now >= enemy.slipUntil && !this.bosses.holdsStill(enemy) && !this.miniBosses.controls(enemy)) {
        // The golem companion pulls nearby enemies off the hero (bosses ignore it).
        const taunt = enemy.isCommon ? this.companions.tauntTarget(enemy) : null;
        if (taunt) this.chase(enemy, taunt, deltaMs);
        else this.pursuePlayer(enemy, deltaMs);
      }
      if (this.enemySeparation && !enemy.isStatic && enemy.variantId !== 'finalBoss' && !this.miniBosses.controls(enemy)) this.separate(enemy);
      // Every walker - floating wraiths included - slides along walls and stays out of the lake.
      // Mini-bosses resolve their own collisions (a lake spirit in the water, a Coveiro tunnelling under walls).
      if (!enemy.isStatic && !this.miniBosses.controls(enemy)) this.arena.resolve(enemy);
      if (enemy.contactDamage > 0 && circlesOverlap(enemy, this.player)) this.hurtPlayer(enemy.contactDamage, now);
      if (enemy.variantId === 'necromancerWraith' && now >= enemy.nextSoulAt) {
        enemy.nextSoulAt = now + ENEMY_VARIANTS.necromancerWraith.soulCooldownMs;
        this.fireSoul(enemy, now);
      }
      if (enemy.hasRottenAura && !enemy.rottenAuraSuppressed && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= enemy.rottenAuraRadius) this.player.refreshRottenAura(now);
    });
    finished.forEach((enemy) => this.enemies.release(enemy));
  }

  /** Straight at a nearby target (a taunting companion). */
  private chase(enemy: EnemyState, target: Vec2, deltaMs: number): void {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const step = Math.min(length, (enemy.effectiveMovementSpeed() * deltaMs) / 1000);
    enemy.facingX = dx / length;
    enemy.facingY = dy / length;
    enemy.x += enemy.facingX * step;
    enemy.y += enemy.facingY * step;
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

  private hurtPlayer(amount: number, now: number, unavoidable = false): void {
    const dealt = this.player.damage(amount, now, unavoidable);
    if (dealt > 0) this.events.emit('player-damaged', { amount: dealt });
  }

  private updatePlayerStatus(deltaMs: number, now: number): void {
    const prevented = this.player.updatePassiveHealing(deltaMs, now);
    if (Math.round(prevented) > 0) this.events.emit('player-status', { text: `CURA -${Math.round(prevented)}`, tone: 'heal-cut' });
    const rot = this.player.updateRotten(deltaMs, now);
    if (rot > 0) this.events.emit('player-status', { text: `HP -${Math.round(rot)}`, tone: 'rot' });
  }

  // ── Sandbox (the F9 panel, Phaser: SandboxDebugPanel) ───────────────────────────────────────────────────────

  addCurrency(amount: number): void {
    this.currency += amount;
  }

  /** Kills every active enemy (bosses included) with full credit: XP, drops, wave progress. */
  killAllEnemies(): void {
    const alive: EnemyState[] = [];
    this.enemies.forEachActive((enemy) => { if (enemy.alive) alive.push(enemy); });
    alive.forEach((enemy) => {
      enemy.health = 0;
      this.defeatEnemy(enemy);
    });
  }

  /** Moves the run clock (and so the difficulty stage and the next boss timer); never below 0. */
  adjustElapsedMs(deltaMs: number): void {
    this.elapsedMs = Math.max(0, this.elapsedMs + deltaMs);
  }

  setForcedDifficultyStage(stage: number | null): void {
    this.difficulty.setForcedStage(stage);
  }

  setEnemySpawnCap(cap: number): void {
    this.enemies.capacity = cap;
  }

  /** The same spot real "near the player" spawns use. */
  spawnNearPlayer(variantId: EnemyVariantId, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const point = this.scheduler.pointNearPlayer();
      this.spawnEnemy(variantId, point.x, point.y);
    }
  }

  /** One random upgrade from the equipped weapons' own pools (deduped), or from the basic attribute pool. */
  grantSandboxUpgrade(kind: 'weapon' | 'attribute'): Upgrade | null {
    const pool = kind === 'attribute'
      ? this.upgradeSystem.basicUpgradePool()
      : [...new Map(this.weapons.weapons.flatMap((weapon) => this.upgradeSystem.weaponUpgradePool(weapon.config, this.player)).map((upgrade) => [upgrade.id, upgrade])).values()];
    if (pool.length === 0) return null;
    const upgrade = pickOne(this.rng, pool);
    this.applyUpgrade(upgrade);
    return upgrade;
  }

  /** The lake drains (O Espírito do Lago) and refills; the horde's routes follow when it crosses half full. Refilling
   *  washes anyone on the lake bed up to the shore on their next move (the water blocks again). */
  private setLakeLevel(level: number): void {
    const blocked = this.arena.lakeBlocks;
    this.arena.lakeLevel = Math.max(0, Math.min(1, level));
    if (this.arena.lakeBlocks === blocked) return;
    this.flowField?.refreshPassable();
    this.arena.resolve(this.player);
  }

  /** Shoves the hero (boss shockwave), sliding along walls and staying in the arena. */
  private pushPlayer(dx: number, dy: number): void {
    const { radius } = this.player;
    this.player.x = clamp(this.player.x + dx, radius, this.arena.size - radius);
    this.player.y = clamp(this.player.y + dy, radius, this.arena.size - radius);
    this.arena.resolve(this.player);
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

  /** The interact key (E): the merchant's portal; in the tavern an item, a regular (talk, or answer them) or the exit;
   *  otherwise the end/continue portal in reach. */
  interact(): void {
    if (this.over || this.clock.paused) return;
    if (this.merchant.inside) {
      if (this.dialogue !== null) {
        this.answerDialogue();
        return;
      }
      const spot = this.merchant.roomSpot;
      if (spot?.kind === 'exit') this.merchant.leave();
      if (spot?.kind === 'slot') this.buyFromMerchant(spot.index);
      if (spot?.kind === 'npc') this.dialogue = spot.index;
      return;
    }
    if (this.merchant.portalInReach) {
      this.merchant.enter();
      return;
    }
    const portal = this.portalInReach;
    if (portal === 'end') this.finish(true);
    if (portal === 'continue') this.continueToNextCycle();
  }

  private onBossWaveCleared(): void {
    this.awaitingPortalChoice = true;
    this.clearEnemyField(() => false);
    const place = (offsetX: number) => this.arena.nearestWalkable(this.player.x + offsetX, this.player.y - PORTAL.rise, 30);
    this.portals = { end: place(-PORTAL.spread), continue: place(PORTAL.spread) };
    this.events.emit('boss-wave-cleared', { cycle: this.bossCycle });
  }

  /** The zone's companion first (joining, or strengthening it), then strengthening each other one you have. */
  private offerCompanion(from: MiniBossKind): void {
    const zone = MINI_BOSSES[from].companion;
    const offers: CompanionOffer[] = [];
    const owned = this.companions.has(zone);
    if (owned ? owned.level < MAX_COMPANION_LEVEL : this.companions.companions.length < MAX_COMPANIONS) offers.push({ companion: zone, level: owned ? owned.level + 1 : 1 });
    this.companions.companions.forEach((companion) => {
      if (companion.kind !== zone && companion.level < MAX_COMPANION_LEVEL) offers.push({ companion: companion.kind, level: companion.level + 1 });
    });
    if (offers.length > 0) this.openChoice({ kind: 'companion', from, offers });
  }

  /** Slots at 1:00 and 2:00 of every phase (and 3:00 from cycle 3): the next guardian in the rotation is announced
   *  — never while the Necromancer's wave is coming or up, nor over another live guardian (that slot is skipped). */
  private scheduleMiniBosses(): void {
    const slots = this.bossCycle >= 3 ? 3 : 2;
    // Spread evenly over the phase (a 5-minute first phase: 1:40 and 3:20).
    const slotMs = this.phaseDurationMs() / (slots + 1);
    const due = Math.min(slots, Math.floor((this.elapsedMs - this.phaseStartedAtMs) / slotMs));
    if (due <= this.miniBossSlotsThisPhase) return;
    this.miniBossSlotsThisPhase = due;
    if (this.bosses.hasActiveEncounter() || this.miniBosses.active) return;
    this.miniBosses.announce(MINI_BOSS_ROTATION[this.miniBossRotation % MINI_BOSS_ROTATION.length]);
    this.miniBossRotation += 1;
  }

  /** Sandbox: call a guardian now (ignored while one is up). */
  spawnMiniBoss(kind: MiniBossKind): boolean {
    return this.miniBosses.announce(kind);
  }

  /** Sandbox: a companion joins (or levels up) without a fight. */
  addCompanion(kind: CompanionKind): boolean {
    return this.companions.add(kind);
  }

  /** +1 boss, +1 minute next phase, +1× difficulty — all keyed off bossCycle, so the loop repeats indefinitely. */
  private continueToNextCycle(): void {
    this.awaitingPortalChoice = false;
    this.guardiansDefeated = 0;
    this.miniBossSlotsThisPhase = 0;
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

  /** Every active enemy `keep` rejects dies on the spot (no kill credit, no drops). Returns how many. */
  private clearEnemyField(keep: (enemy: EnemyState) => boolean): number {
    let cleared = 0;
    const now = this.clock.now;
    this.enemies.forEachActive((enemy) => {
      if (keep(enemy) || !enemy.alive) return;
      enemy.phase = 'dying';
      enemy.phaseEndsAt = now + ENEMY_DYING_MS;
      cleared += 1;
    });
    return cleared;
  }

  // ── Enemy damage, death and drops ─────────────────────────────────────────────────────────────────────────

  /** `weaponId` null = a companion's hit (no life steal). */
  damageEnemy(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id'] | null, critical = false): void {
    if (!enemy.alive) return;
    const now = this.clock.now;
    // A roaring boss shrugs hits off and a staggered one takes extra; then a channelling boss's shield soaks hits
    // first and only the overflow reaches its health.
    amount *= this.bosses.damageTakenMultiplier(enemy) * this.miniBosses.damageTakenMultiplier(enemy);
    if (amount <= 0) {
      enemy.lastHitAt = now;
      return;
    }
    const overflow = this.bosses.absorbDamage(enemy, amount);
    if (overflow !== null) {
      enemy.lastHitAt = now;
      if (overflow <= 0) return;
      amount = overflow;
    }
    const dealt = Math.min(amount, enemy.health);
    // Roubo de Vida applies to any cone (melee-family) weapon, not just the Espada.
    if (weaponId && WEAPONS[weaponId].type === 'cone' && this.player.lifeStealPercent > 0) this.healPlayer(dealt * this.player.lifeStealPercent);
    enemy.health -= amount;
    this.gainHitShield();
    enemy.hitStunUntil = now + ENEMY_HIT_STUN_MS;
    enemy.lastHitAt = now;
    this.events.emit('enemy-hit', { enemy, amount, critical, weaponId });
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
    if (this.miniBosses.bossFor(enemy)) {
      // A zone guardian: a chest and a burst of crystals, a companion to pick, and the Necromancer weakens.
      this.dropPickup('chest', enemy.x, enemy.y, 0);
      for (let index = 0; index < 6; index += 1) {
        const point = randomPointAround(this.rng, enemy, 20, 60);
        this.dropPickup('gem', point.x, point.y, 10);
      }
      this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId, divineRelic: this.weapons.has('amulet') });
      const kind = this.miniBosses.defeat(enemy)!;
      this.guardiansDefeated += 1;
      this.offerCompanion(kind);
      return;
    }
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

  /** Relíquia: each landed hit banks shield on top of health (the sandbox's buffer can sit above the cap). */
  private gainHitShield(): void {
    const shield = CHARACTERS[this.characterId].hitShield;
    if (!shield) return;
    const { player } = this;
    const cap = player.maxHealth * shield.maxHealthFraction;
    if (player.damageBuffer < cap) player.damageBuffer = Math.min(cap, player.damageBuffer + shield.perHit);
  }

  onBananaHit(enemy: EnemyState): void {
    const transform = CHARACTERS[this.characterId].boomerangBananaTransform;
    if (!transform) return;
    enemy.slowStackPercent = Math.min(WEAPON_TUNING.bananaSlowCap, enemy.slowStackPercent + transform.slowPercentPerHit);
    if (enemy.alive && this.rng() < transform.slipChancePerHit) this.slipEnemy(enemy, this.clock.now);
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

  /** Down on the ground for ENEMY_SLIP_MS. Only the horde slips: bosses (and anything else) keep their footing. */
  private slipEnemy(enemy: EnemyState, now: number): void {
    if (!SLIPPERY_VARIANTS.has(enemy.variantId)) return;
    enemy.slipUntil = now + ENEMY_SLIP_MS;
    this.events.emit('enemy-slipped', { enemy });
  }

  private updatePeels(now: number): void {
    const spent: PeelState[] = [];
    this.peels.forEachActive((peel) => {
      if (now >= peel.expiresAt) { spent.push(peel); return; }
      const victim = this.enemiesOverlapping(peel.x, peel.y, peel.radius)[0];
      if (!victim) return;
      this.slipEnemy(victim, now);
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
