import { ALL_ENEMY_VARIANTS, ENEMY_CONFIG, PLAYER_CONFIG, ENEMY_VARIANTS, GUARDIAN_FIGHT_SPAWNS, HEALTH_POTION_DROP_CHANCE, HEALTH_POTION_HEAL_AMOUNT, LEVEL_UPGRADE_CONFIG, LOOT_CHEST_DROP_CHANCE, NEUTRAL_VARIANTS, requiredExperience } from '../../config/balance';
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
import { NEUTRAL_TUNING, NeutralEvents, NeutralSystem } from '../systems/NeutralSystem';
import { QUEST_NPCS, QuestEvents, QuestNpcId, QuestReward, QuestSystem } from '../systems/QuestSystem';
import { HERO_ABILITY_TUNING, HeroAbilityEvents, HeroAbilitySystem } from '../systems/HeroAbilitySystem';
import { FLEE_SPEED_MULTIPLIER, PULL_SPEED, PowerTierEvents, PowerTierSystem } from '../systems/PowerTierSystem';
import { DifficultyTier, HeroId, MetaBonuses, NO_META_BONUSES, RunSummary, difficultyTier } from '../progress/Progress';
import { CompanionKind, MINI_BOSSES, MiniBossEvents, MiniBossKind, MiniBossSystem, guardianRotation } from '../systems/MiniBossSystem';
import { DifficultySystem } from '../systems/DifficultySystem';
import { EnemySpawnScheduler, EnemyVariantId, NeutralVariantId } from '../systems/EnemySpawnScheduler';
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
/** The guardian's entrance scatters the plain horde out of sight (thinHorde). */
const THIN_HORDE_VARIANTS: EnemyVariantId[] = ['skeleton', 'apparitionWraith'];
const THIN_HORDE_DISTANCE = { announced: 650, risen: 250 };
const PEEL = { spawnChance: 0.03, minRadius: 40, maxRadius: 130, lifetimeMs: 12000 } as const;
const SLIPPERY_VARIANTS: ReadonlySet<string> = new Set(['skeleton', 'apparitionWraith', 'superSkeleton']);
/** Soft push between overlapping enemies (fraction of the overlap resolved per step). New in 3D: without it a horde
 *  converging on the hero collapses into one solid block of models. Static enemies and bosses are never pushed. */
const SEPARATION_STRENGTH = 0.25;
/** How often the enemy flow field is rebuilt from the hero's position (only when the hero changed grid cell). */
const FLOW_FIELD_REFRESH_MS = 250;
/** Boss-wave portals: spawn this far apart above the hero, used within reach. */
const PORTAL = { spread: 110, rise: 160, reach: 70 } as const;
/** A zone guardian slain is worth this many of the hero's current levels in experience: a jump mid-stage, where the
 *  horde alone levels slowest. */
export const GUARDIAN_EXPERIENCE_LEVELS = 1;
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

export interface SessionEvents extends WeaponEvents, BossEvents, MiniBossEvents, CompanionEvents, MerchantEvents, QuestEvents, HeroAbilityEvents, PowerTierEvents, NeutralEvents {
  /** A mission's upgrade reward: what was granted. */
  'quest-gifts': { names: string[] };
  'enemy-hit': { enemy: EnemyState; amount: number; critical: boolean; weaponId: WeaponConfig['id'] | null };
  'enemy-defeated': { x: number; y: number; variantId: EnemyVariantId; divineRelic: boolean };
  /** A guardian fell: its experience is on the way (a level's worth). */
  'guardian-experience': { x: number; y: number };
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
  /** Segunda chance: back on their feet once, at half health. */
  'player-revived': Record<string, never>;
  /** Between runs: the exit portal (start a run), a waiting hero (pick them), Sergio (his upgrades), the record
   *  book. */
  'hub-exit': Record<string, never>;
  'hub-records': Record<string, never>;
  'hub-sergio': Record<string, never>;
  /** During a run's visit: Sergio's store (the run's items) opens. */
  'merchant-shop': Record<string, never>;
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
  /** Sergio's permanent upgrades bought between runs (none by default). */
  meta?: MetaBonuses;
  /** Missions already done with each regular in earlier runs: they pick up at the next one. */
  questTiers?: Partial<Record<QuestNpcId, number>>;
  /** Regulars already in the roster: they're no longer at the tavern. */
  regularsAway?: QuestNpcId[];
  /** The tavern between runs: the hero starts in the room, nothing spawns, no run clock. */
  hub?: boolean;
  /** Difficulty tier (1 = normal): enemy health and contact damage scale up. */
  tier?: number;
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
  readonly abilities: HeroAbilitySystem;
  /** The hero's in-run power tiers (levels 5/12/20). */
  readonly powers: PowerTierSystem;
  /** Wildlife living on the map (calm until hurt). */
  readonly neutrals: NeutralSystem;
  /** Grimbo's Tudo ou Nada rolled a six: the next level-up pick is followed by another. */
  private jackpotPending = false;
  /** Sergio's Loja Portátil can open again at this sim time. */
  portableShopReadyAt = 0;
  /** The tavern regular you're talking to (QUEST_NPCS index), or null. */
  dialogue: number | null = null;
  /** Zone guardians slain this cycle (each weakens the Necromancer). */
  guardiansDefeated = 0;
  /** Run totals for the results screen and the save (guardiansDefeated resets every cycle). */
  readonly stats = { guardians: 0, bosses: 0, missions: 0, killsByVariant: {} as Record<string, number>, guardiansByKind: {} as Record<string, number> };
  /** Segunda chance revives still to use this run. */
  revivesLeft = 0;
  /** The Tomo do Sábio: more experience per kill. */
  private experienceMultiplier = 1;
  readonly tier: DifficultyTier;
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
  /** Sandbox toggles (the F9 panel's switches). */
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
    this.tier = difficultyTier(options.tier ?? 1);
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
      pushPlayer: (dx, dy) => this.pushPlayer(dx, dy),
      slowPlayer: (percent, ms) => {
        this.player.applySlow(percent, ms, this.clock.now);
        this.events.emit('player-status', { text: `LENTO +${Math.round(percent * 100)}%`, tone: 'slow' });
      }
    });
    this.neutrals = new NeutralSystem({
      player: this.player,
      rng: this.rng,
      arena: this.arena,
      events: this.events,
      now: () => this.clock.now,
      spawnEnemy: (variantId, x, y) => this.spawnEnemy(variantId, x, y),
      hurtPlayer: (amount) => this.hurtPlayer(amount, this.clock.now),
      pushPlayer: (dx, dy) => this.pushPlayer(dx, dy)
    });
    this.quests = new QuestSystem({ player: this.player, rng: this.rng, arena: this.arena, events: this.events }, options.questTiers);
    this.events.on('quest-claimed', () => { this.stats.missions += 1; });
    // A guardian's fight is about the guardian: the plain horde scatters down to the fight's cap — out of sight when
    // it's announced, then all but the hero's closest when it rises (the camera is on the guardian by then).
    this.events.on('miniboss-warning', () => this.thinHorde(GUARDIAN_FIGHT_SPAWNS.enemyCap, THIN_HORDE_DISTANCE.announced));
    this.events.on('miniboss-spawned', () => this.thinHorde(GUARDIAN_FIGHT_SPAWNS.enemyCap, THIN_HORDE_DISTANCE.risen));
    this.abilities = new HeroAbilitySystem({
      player: this.player,
      clock: this.clock,
      rng: this.rng,
      characterId: this.characterId,
      arena: this.arena,
      events: this.events,
      primaryWeapon: () => this.weapons.primary,
      hasAffinity: (weapon) => this.hasAffinity(weapon),
      enemiesWithin: (from, radius) => this.enemiesWithin(from, radius),
      nearestEnemy: (from, range) => this.nearestEnemy(from, range),
      damageEnemy: (enemy, amount, weaponId) => this.damageEnemy(enemy, amount, weaponId),
      stunEnemy: (enemy, ms) => this.stunEnemy(enemy, ms),
      healPlayer: (amount) => this.healPlayer(amount),
      addFreeItem: () => { this.merchant.freeItems += 1; }
    });
    this.powers = new PowerTierSystem({
      player: this.player,
      clock: this.clock,
      rng: this.rng,
      characterId: this.characterId,
      arena: this.arena,
      events: this.events,
      level: () => this.level,
      signatureWeapon: () => this.weapons.weapons.find((weapon) => weapon.config.id === character.preferredWeaponId) ?? null,
      enemiesWithin: (from, radius) => this.enemiesWithin(from, radius),
      nearestEnemy: (from, range, exclude) => this.nearestEnemy(from, range, exclude),
      damageEnemy: (enemy, amount, weaponId) => this.damageEnemy(enemy, amount, weaponId),
      stunEnemy: (enemy, ms) => this.stunEnemy(enemy, ms),
      defeatEnemy: (enemy) => this.defeatEnemy(enemy),
      healPlayer: (amount) => this.healPlayer(amount),
      dropPickup: (kind, x, y, value, magnet) => this.dropPickup(kind, x, y, value, magnet),
      dropPeel: (x, y) => this.dropPeel(x, y),
      orbitBoomerangs: (weapon, count, ms) => this.weapons.launchOrbiting(weapon, count, ms),
      shieldCap: () => { const shield = CHARACTERS[this.characterId].hitShield; return shield ? this.player.maxHealth * shield.maxHealthFraction : 0; },
      auraRadius: (weapon) => this.weapons.auraRadius(weapon),
      orbs: (weapon) => this.weapons.crystalOrbs(weapon)
    });
    this.events.on('aura-pulse', () => this.powers.onAuraPulse());
    this.events.on('arrow-rain', ({ x, y, radius }) => this.powers.onArrowRain(x, y, radius));
    this.merchant = new MerchantSystem({
      player: this.player,
      rng: this.rng,
      arena: this.arena,
      events: this.events,
      affinities: () => this.affinities,
      priceMultiplier: () => (this.characterId === 'grimbo' ? HERO_ABILITY_TUNING.grimboPrices : 1),
      encounterActive: () => this.bosses.hasActiveEncounter() || this.awaitingPortalChoice
    });
    QUEST_NPCS.forEach((npc, index) => { if (options.regularsAway?.includes(npc.id)) this.merchant.away.add(index); });
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
      guardianFight: () => this.miniBosses.active,
      liveEnemyCount: () => this.enemies.activeCount - this.neutrals.liveCount,
      difficultyStageFor: (elapsedMs) => this.difficulty.stageFor(elapsedMs),
      spawn: (request) => { this.spawnEnemy(request.variantId, request.x, request.y, request.maxHealth); }
    }, this.rng, this.arena.size);
    if (options.hub) {
      this.skeletonSpawnEnabled = false;
      this.variantSpawnEnabled = false;
      this.merchant.enterHub();
    }
    // Open test fields have no wildlife; tests populate it themselves.
    if (!options.hub && this.arena.authored) this.neutrals.populate();
    const meta = options.meta ?? NO_META_BONUSES;
    this.applyMeta(meta);
    if (!options.skipStartingUpgrades && character.preferredWeaponId === startingWeapon.id && character.startingWeaponUpgradeChoices) {
      const total = character.startingWeaponUpgradeChoices + meta.extraStartingPicks;
      this.openChoice({ kind: 'starting', upgrades: shuffled(this.rng, this.upgradeSystem.weaponUpgradePool(startingWeapon, this.player)).slice(0, total), picksRemaining: total, picksTotal: total });
    }
  }

  /** Sergio's permanent upgrades, on top of the character's own stats. */
  private applyMeta(meta: MetaBonuses): void {
    const { player } = this;
    player.maxHealth += meta.maxHealth;
    player.health = player.maxHealth;
    player.damageMultiplier += meta.damage;
    player.movementSpeed *= 1 + meta.speed;
    player.pickupRange *= 1 + meta.pickupRange;
    this.currency += meta.startingCoins;
    this.revivesLeft = meta.revives;
    this.experienceMultiplier = 1 + meta.experience;
  }

  /** What this run counts, for the results screen and the save. */
  runSummary(heroId: HeroId, endedAt: number): RunSummary {
    return {
      heroId,
      victory: this.victory,
      elapsedMs: this.elapsedMs,
      kills: this.kills,
      guardians: this.stats.guardians,
      bosses: this.stats.bosses,
      missions: this.stats.missions,
      coins: this.currency,
      cycle: this.bossCycle,
      killsByVariant: { ...this.stats.killsByVariant },
      guardiansByKind: { ...this.stats.guardiansByKind },
      arena: this.arena.layout.id,
      questTiers: Object.fromEntries(this.quests.quests.map((quest) => [quest.npc.id, quest.tier])),
      endedAt,
      tier: this.tier.tier
    };
  }

  // ── Control surface (renderer / UI) ───────────────────────────────────────────────────────────────────────

  get paused(): boolean {
    return this.userPaused;
  }

  set paused(value: boolean) {
    this.userPaused = value;
    this.syncClockPause();
  }

  /** Set by the renderer while a reveal plays (the chest roll): the simulation holds still
   *  without counting as the pause menu. */
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
    // Grimbo's Tudo ou Nada: a six on the die is a second pick at this level.
    if (choice.kind === 'level-up' && this.jackpotPending) {
      this.jackpotPending = false;
      const extra = this.upgradeSystem.choices(this.weapons.primary.config, this.player, LEVEL_UPGRADE_CONFIG.defaultChoiceAmount, this.secondaryWithAffinity());
      if (extra.length > 0) {
        this.openChoice({ kind: 'level-up', level: this.level, upgrades: extra, extraWeapon: null });
        return;
      }
    }
    this.processExperience();
  }

  /** Sergio's Loja Portátil: opens the tavern portal at his feet (on a cooldown, never during the boss). */
  openPortableShop(): boolean {
    if (this.characterId !== 'sergio' || this.over || this.clock.paused) return false;
    if (this.merchant.portal || this.merchant.inside || this.bosses.hasActiveEncounter() || this.clock.now < this.portableShopReadyAt) return false;
    this.portableShopReadyAt = this.clock.now + HERO_ABILITY_TUNING.portableShopCooldownMs;
    this.merchant.openPortalAt(this.player.x, this.player.y, HERO_ABILITY_TUNING.portableShopMarkup);
    return true;
  }

  /** Zora's Previsão: the next zone guardian and where it will rise, shown this long before it's announced. */
  prophecy(): { kind: MiniBossKind; x: number; y: number } | null {
    if (this.characterId !== 'zora' || this.miniBosses.active || this.miniBosses.pending) return null;
    const slots = this.bossCycle >= 3 ? 3 : 2;
    if (this.miniBossSlotsThisPhase >= slots) return null;
    const slotMs = this.phaseDurationMs() / (slots + 1);
    const untilNext = (this.miniBossSlotsThisPhase + 1) * slotMs - (this.elapsedMs - this.phaseStartedAtMs);
    if (untilNext > HERO_ABILITY_TUNING.prophecyLeadMs) return null;
    const rotation = guardianRotation(this.arena.layout);
    const kind = rotation[this.miniBossRotation % rotation.length];
    return { kind, ...MINI_BOSSES[kind].anchor(this.arena.layout) };
  }

  /** The Tomo de Afinidade's pick. */
  chooseAffinity(family: WeaponFamily): void {
    const choice = this.pendingChoice;
    if (!choice || choice.kind !== 'affinity' || !choice.families.includes(family)) return;
    this.grantAffinity(family);
    this.closeChoice();
  }

  /** Buys this visit's offer `index` from Sergio's store and applies it. The
   *  Tomo de Afinidade opens its family choice. Returns false if it couldn't be bought. */
  buyMerchantItem(index: number): boolean {
    const offer = this.merchant.buy(index, this.currency);
    if (!offer) return false;
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
    return true;
  }

  /** The dialogue's main button: accept the mission on offer or claim a finished one's reward; otherwise just closes. */
  answerDialogue(): void {
    const index = this.dialogue;
    if (index === null) return;
    // Between runs the regulars only tell you how far you've come; missions are taken during a run.
    if (this.merchant.hub) {
      this.dialogue = null;
      return;
    }
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
    enemy.activate(variantId, x, y, maxHealth * this.tier.enemyHealth, this.clock.now);
    enemy.contactDamage *= this.tier.enemyDamage;
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
    this.neutrals.update(deltaMs);
    this.merchant.update(deltaMs);
    this.quests.update(deltaMs);
    this.topUpStressEnemies();
    this.rebuildEnemyHash();
    this.updateEnemies(deltaMs, now);
    this.updatePlayerStatus(deltaMs, now);
    this.weapons.update(deltaMs);
    this.companions.update(deltaMs);
    this.abilities.update(deltaMs);
    this.powers.update(deltaMs);
    this.updateSouls(deltaMs, now);
    this.updatePeels(now);
    this.updatePickups(deltaMs);
    if (!this.player.alive && !this.over) {
      // Fúria Imortal: the Bárbaro won't go down (once a stage).
      if (this.powers.cheatDeath()) return;
      if (this.revivesLeft > 0) {
        // Segunda chance: half health and a moment of grace.
        this.revivesLeft -= 1;
        this.player.health = this.player.maxHealth * 0.5;
        this.player.invulnerableUntil = now + 2500;
        this.events.emit('player-revived', {});
        return;
      }
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
      const held = now < enemy.heldUntil || now < enemy.liftedUntil;
      if (now < enemy.pullUntil && !enemy.isStatic) {
        // Zora's Eclipse drags it in, stunned or not.
        this.chase(enemy, { x: enemy.pullX, y: enemy.pullY }, deltaMs, PULL_SPEED);
      } else if (!enemy.isStatic && !held && now >= enemy.hitStunUntil && now >= enemy.slipUntil && !this.bosses.holdsStill(enemy) && !this.miniBosses.controls(enemy) && !this.neutrals.controls(enemy)) {
        // The golem companion pulls nearby enemies off the hero (bosses ignore it).
        const taunt = enemy.isCommon ? this.companions.tauntTarget(enemy) : null;
        if (now < enemy.fleeUntil) this.flee(enemy, deltaMs, now);
        else if (taunt) this.chase(enemy, taunt, deltaMs);
        else this.pursuePlayer(enemy, deltaMs, now);
      }
      if (this.enemySeparation && !enemy.isStatic && enemy.variantId !== 'finalBoss' && !this.miniBosses.controls(enemy)) this.separate(enemy);
      // Every walker - floating wraiths included - slides along walls and stays out of the lake.
      // Mini-bosses resolve their own collisions (a lake spirit in the water, a Coveiro tunnelling under walls), and so
      // do the neutrals (a charging boar needs to know it hit a tree).
      if (!enemy.isStatic && !this.miniBosses.controls(enemy) && !this.neutrals.controls(enemy)) this.arena.resolve(enemy);
      // Lifted off the ground (the Mago's hurricane), it can't reach the hero.
      if (enemy.contactDamage > 0 && now >= enemy.liftedUntil && circlesOverlap(enemy, this.player)) {
        const shielded = this.player.damageBuffer > 0;
        const dealt = this.hurtPlayer(enemy.contactDamage, now);
        if (dealt > 0) this.powers.onContactHit(enemy, dealt, shielded);
      }
      if (enemy.variantId === 'necromancerWraith' && now >= enemy.nextSoulAt) {
        enemy.nextSoulAt = now + ENEMY_VARIANTS.necromancerWraith.soulCooldownMs;
        this.fireSoul(enemy, now);
      }
      if (enemy.hasRottenAura && !enemy.rottenAuraSuppressed && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= enemy.rottenAuraRadius) this.player.refreshRottenAura(now);
    });
    finished.forEach((enemy) => this.enemies.release(enemy));
  }

  /** Removes plain skeletons and wraiths beyond `minDistance` of the hero, farthest first, until at most `cap` enemies
   *  are left. Elites, bosses and anything closer stay. */
  private thinHorde(cap: number, minDistance: number): void {
    const far: Array<{ enemy: EnemyState; distance: number }> = [];
    this.enemies.forEachActive((enemy) => {
      if (!enemy.alive || !THIN_HORDE_VARIANTS.includes(enemy.variantId)) return;
      const distance = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (distance > minDistance) far.push({ enemy, distance });
    });
    far.sort((a, b) => b.distance - a.distance);
    for (const { enemy } of far) {
      // The wildlife doesn't count against the fight's cap.
      if (this.enemies.activeCount - this.neutrals.liveCount <= cap) break;
      this.enemies.release(enemy);
    }
  }

  /** Straight at a nearby target (a taunting companion, the eclipse's pull at `speed`). */
  private chase(enemy: EnemyState, target: Vec2, deltaMs: number, speed = enemy.effectiveMovementSpeed(this.clock.now)): void {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const step = Math.min(length, (speed * deltaMs) / 1000);
    enemy.facingX = dx / length;
    enemy.facingY = dy / length;
    enemy.x += enemy.facingX * step;
    enemy.y += enemy.facingY * step;
  }

  /** Follow the flow field downhill (routes around walls, through doorways), or walk straight at the hero on an
   *  open map / once close enough that the field has nothing better to say. */
  /** Running from the hero (the Bárbaro's war cry). */
  private flee(enemy: EnemyState, deltaMs: number, now: number): void {
    const dx = enemy.x - this.player.x;
    const dy = enemy.y - this.player.y;
    const length = Math.hypot(dx, dy) || 1;
    const step = (enemy.effectiveMovementSpeed(now) * FLEE_SPEED_MULTIPLIER * deltaMs) / 1000;
    enemy.facingX = dx / length;
    enemy.facingY = dy / length;
    enemy.x += enemy.facingX * step;
    enemy.y += enemy.facingY * step;
  }

  private pursuePlayer(enemy: EnemyState, deltaMs: number, now: number): void {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const route = this.flowField?.direction(enemy.x, enemy.y) ?? null;
    const step = Math.min(length, (enemy.effectiveMovementSpeed(now) * deltaMs) / 1000);
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

  private hurtPlayer(amount: number, now: number, unavoidable = false): number {
    const { player } = this;
    // Zora's Visão do Futuro: a hit that would land is foreseen, and the moment of grace after it still follows.
    if (!player.invincible && (unavoidable || now >= player.invulnerableUntil) && this.powers.foresee()) {
      player.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
      return 0;
    }
    const dealt = player.damage(amount, now, unavoidable);
    if (dealt > 0) this.events.emit('player-damaged', { amount: dealt });
    return dealt;
  }

  private updatePlayerStatus(deltaMs: number, now: number): void {
    const prevented = this.player.updatePassiveHealing(deltaMs, now);
    if (Math.round(prevented) > 0) this.events.emit('player-status', { text: `CURA -${Math.round(prevented)}`, tone: 'heal-cut' });
    const rot = this.player.updateRotten(deltaMs, now);
    if (rot > 0) this.events.emit('player-status', { text: `HP -${Math.round(rot)}`, tone: 'rot' });
  }

  // ── Sandbox (the F9 panel) ──────────────────────────────────────────────────────────────────────────────────

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

  /** The portal the hero stands at, if any (the end portal wins a tie). */
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
      if (this.merchant.hub) {
        // Between runs the room's stations are the renderer's to answer; the regulars still talk.
        if (spot?.kind === 'exit') this.events.emit('hub-exit', {});
        if (spot?.kind === 'sergio') this.events.emit('hub-sergio', {});
        if (spot?.kind === 'records') this.events.emit('hub-records', {});
        if (spot?.kind === 'npc') this.dialogue = spot.index;
        return;
      }
      if (spot?.kind === 'exit') this.merchant.leave();
      if (spot?.kind === 'sergio') this.events.emit('merchant-shop', {});
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
    const rotation = guardianRotation(this.arena.layout);
    this.miniBosses.announce(rotation[this.miniBossRotation % rotation.length]);
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
    this.powers.newStage();
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
      // The wildlife isn't part of the horde a boss sweeps away.
      if (keep(enemy) || enemy.neutral || !enemy.alive) return;
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
    // Zora's Destino Selado: a marked enemy takes double; the Bárbaro's Fúria hits twice as hard.
    if (this.abilities.isMarked(enemy)) amount *= 2;
    if (weaponId) amount *= this.powers.damageDealtMultiplier();
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
    this.neutrals.onHit(enemy);
    this.powers.onHit(enemy, amount, weaponId);
    if (enemy.health <= 0 && enemy.alive) {
      this.defeatEnemy(enemy);
      this.powers.onKill(enemy, weaponId);
    }
  }

  healPlayer(amount: number): void {
    const prevented = this.player.heal(amount, this.clock.now);
    if (Math.round(prevented) > 0) this.events.emit('player-status', { text: `CURA -${Math.round(prevented)}`, tone: 'heal-cut' });
  }

  /** Dead: counted, credited and dropping its loot (bosses and guardians have their own ends). */
  private defeatEnemy(enemy: EnemyState): void {
    enemy.phase = 'dying';
    enemy.phaseEndsAt = this.clock.now + ENEMY_DYING_MS;
    this.kills += 1;
    this.abilities.onDefeated(enemy);
    this.stats.killsByVariant[enemy.variantId] = (this.stats.killsByVariant[enemy.variantId] ?? 0) + 1;
    if (this.miniBosses.bossFor(enemy)) {
      // A zone guardian: a chest and a burst of crystals, a level's worth of experience, a companion to pick, and the
      // Necromancer weakens.
      this.dropPickup('chest', enemy.x, enemy.y, 0);
      for (let index = 0; index < 6; index += 1) {
        const point = randomPointAround(this.rng, enemy, 20, 60);
        this.dropPickup('gem', point.x, point.y, 10);
      }
      this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId, divineRelic: this.weapons.has('amulet') });
      const kind = this.miniBosses.defeat(enemy)!;
      this.guardiansDefeated += 1;
      this.stats.guardians += 1;
      this.stats.guardiansByKind[kind] = (this.stats.guardiansByKind[kind] ?? 0) + 1;
      this.experience += this.experienceNeeded * GUARDIAN_EXPERIENCE_LEVELS * this.experienceMultiplier;
      this.events.emit('guardian-experience', { x: enemy.x, y: enemy.y });
      this.offerCompanion(kind);
      // The level-up waits for the companion card (chooseCompanion picks it up); with none on offer it comes now.
      this.processExperience();
      return;
    }
    if (this.bosses.bossFor(enemy)) {
      // Bosses give no XP or drops; the last wave boss opens the portals.
      this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId, divineRelic: this.weapons.has('amulet') });
      if (this.bosses.defeat(enemy)) {
        this.stats.bosses += 1;
        if (!this.bosses.hasActiveWaveBosses()) this.onBossWaveCleared();
      }
      return;
    }
    this.experience += enemy.reward * this.experienceMultiplier;
    for (let index = 0; index < enemy.currencyDrops; index += 1) {
      const point = index === 0 ? enemy : randomPointAround(this.rng, enemy, 12, 28);
      this.dropPickup('gem', point.x, point.y, enemy.reward);
    }
    if ((enemy.variantId === 'superSkeleton' || enemy.variantId === 'necromancerWraith') && this.rng() < LOOT_CHEST_DROP_CHANCE) this.dropPickup('chest', enemy.x, enemy.y, 0);
    if (this.rng() < HEALTH_POTION_DROP_CHANCE) this.dropPickup('potion', enemy.x, enemy.y, HEALTH_POTION_HEAL_AMOUNT);
    // Wildlife leaves its own loot: the deer a potion, the hive its honey, the mimic the chest it pretended to be.
    const loot = enemy.neutral ? NEUTRAL_VARIANTS[enemy.variantId as NeutralVariantId].loot : null;
    if (loot) this.dropPickup(loot, enemy.x, enemy.y, loot === 'chest' ? 0 : HEALTH_POTION_HEAL_AMOUNT);
    this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId, divineRelic: this.weapons.has('amulet') });
    this.processExperience();
  }

  private dropPickup(kind: PickupKind, x: number, y: number, value: number, magnet = false): void {
    const pickup = this.pickups.acquire();
    if (!pickup) return;
    pickup.kind = kind;
    pickup.value = value;
    pickup.magnet = magnet;
    pickup.radius = BODY_RADIUS[kind];
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
      if ((distSq <= rangeSq || pickup.magnet) && distSq > 0) {
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
    // Grimbo's Mão Leve: half as many coins again.
    if (pickup.kind === 'gem') this.currency += this.characterId === 'grimbo' ? Math.round(pickup.value * HERO_ABILITY_TUNING.grimboCoins) : pickup.value;
    if (pickup.kind === 'potion') this.healPlayer(pickup.value);
    if (pickup.kind === 'honey') {
      this.healPlayer(pickup.value);
      this.player.hasteUntil = this.clock.now + NEUTRAL_TUNING.honeyHasteMs;
      this.player.hastePercent = NEUTRAL_TUNING.honeyHastePercent;
      this.events.emit('player-status', { text: `MEL! +${Math.round(NEUTRAL_TUNING.honeyHastePercent * 100)}% VELOCIDADE`, tone: 'heal' });
    }
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
    const angle = floatBetween(this.rng, 0, Math.PI * 2);
    const distance = floatBetween(this.rng, PEEL.minRadius, PEEL.maxRadius);
    this.dropPeel(this.player.x + Math.cos(angle) * distance, this.player.y + Math.sin(angle) * distance);
  }

  /** A banana peel on the ground near (x, y). */
  private dropPeel(x: number, y: number): void {
    const peel = this.peels.acquire();
    if (!peel) return;
    const spot = this.arena.nearestWalkable(x, y, peel.radius);
    peel.x = spot.x;
    peel.y = spot.y;
    snapPrevious(peel);
    peel.expiresAt = this.clock.now + PEEL.lifetimeMs;
  }

  /** Down on the ground for ENEMY_SLIP_MS. Only the horde slips: bosses (and anything else) keep their footing. */
  private slipEnemy(enemy: EnemyState, now: number, ms = ENEMY_SLIP_MS): void {
    if (!SLIPPERY_VARIANTS.has(enemy.variantId)) return;
    enemy.slipUntil = Math.max(enemy.slipUntil, now + ms);
    this.events.emit('enemy-slipped', { enemy });
  }

  /** Knocks an enemy down for `ms` (the Mochila's frying pan, Brom's barrel foam). */
  stunEnemy(enemy: EnemyState, ms: number): void {
    this.slipEnemy(enemy, this.clock.now, ms);
  }

  private updatePeels(now: number): void {
    const spent: PeelState[] = [];
    this.peels.forEachActive((peel) => {
      if (now >= peel.expiresAt) { spent.push(peel); return; }
      const victim = this.enemiesOverlapping(peel.x, peel.y, peel.radius)[0];
      if (!victim) return;
      this.slipEnemy(victim, now);
      this.powers.onPeelSlip(victim);
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
    // Zora's Previsão: one more card on every choice.
    const amount = (bonusLevel ? LEVEL_UPGRADE_CONFIG.bonusChoiceAmount : LEVEL_UPGRADE_CONFIG.defaultChoiceAmount) + (this.characterId === 'zora' ? 1 : 0);
    if (this.abilities.rollJackpot()) this.jackpotPending = true;
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
      // Aimed shots look past calm wildlife; only area damage can pick that fight by accident.
      if (!enemy.alive || enemy.calmNeutral || exclude?.(enemy)) continue;
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
    const candidates = this.enemiesWithin(from, range).filter((enemy) => !enemy.calmNeutral).sort((a, b) => distanceSq(a) - distanceSq(b));
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
