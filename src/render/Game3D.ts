import { SnowAttackEffects } from './vfx/SnowAttackEffects';
import { BlizzardView } from './views/BlizzardView';
import { EskimoView } from './views/EskimoView';
import { SnowfieldView } from './views/SnowfieldView';
import * as THREE from 'three';
import { GameAudio } from '../audio/GameAudio';
import { SANDBOX_SPAWN_CAPS } from '../config/balance';
import { CHARACTERS, CharacterId } from '../config/characters';
import { WEAPONS, WeaponConfig } from '../config/weapons';
import { GameSession, STEP_MS } from '../core/session/GameSession';
import { ArenaMap } from '../core/world/ArenaMap';
import { ProjectileKind, snapPrevious } from '../core/session/entities';
import { EnemyVariantId } from '../core/systems/EnemySpawnScheduler';
import { HandAttack } from './models/clips';
import { ARENA_LAYOUTS, ZoneKind, useArenaLayout } from '../config/arenaLayout';
import { CameraRig } from './CameraRig';
import { ChoiceOverlay } from './ChoiceOverlay';
import { Hud } from './Hud';
import { PALETTE } from './materials';
import { PixelPipeline, ndcToCanvas } from './PixelPipeline';
import { RunChoice, StartMenu } from './StartMenu';
import { WORLD_SCALE, simToWorld } from './space';
import { FloatingTexts } from './ui/FloatingTexts';
import { RunResult, RunScreens } from './ui/RunScreens';
import { BossUi } from './ui/BossUi';
import { SandboxPanel } from './ui/SandboxPanel';
import { BossEffects } from './vfx/BossEffects';
import { BossViews } from './views/BossView';
import { CompanionViews, MiniBossViews } from './views/ZoneActorViews';
import { MerchantRoom } from './world/MerchantRoom';
import { QuestBarrels } from './world/QuestBarrels';
import { TavernDialog } from './ui/TavernDialog';
import { TavernDuel } from './tavern/TavernDuel';
import { SkillTreeScreen } from './tavern/SkillTreeScreen';
import { DICE_RULE, DUELS, DUEL_REWARDS, DuelId } from '../config/tavernBattle';
import { activeKit, duelXp, grantXp, regularState, resetTree, treeFor, withRegular } from '../core/tavern/SkillTree';
import { CompanionBars } from './ui/CompanionBars';
import { rewardText } from './ui/questText';
import { SheetEffects } from './vfx/SheetEffects';
import { MASTERY_THRESHOLDS, MAX_MASTERY, SaveData, applyRun, buyConsumable, buyUpgrade, emptySave, heroesToWelcome, masteryLevel, rosterFor, runBonuses } from '../core/progress/Progress';
import { HeroKitViews } from './views/HeroKitViews';
import { PowerViews } from './views/PowerViews';
import { PowerBanner } from './ui/PowerBanner';
import { RecordBook, SergioShop, TavernHeader, TierPicker } from './ui/TavernHub';
import { heroName } from './progress/heroNames';
import { SaveStore } from './progress/SaveStore';
import { GuardianIntro } from './GuardianIntro';
import { AREAS } from '../config/areas';
import { ALL_QUEST_NPCS, QuestNpcId } from '../core/systems/QuestSystem';
import { Tip, TipDialog } from './ui/TipDialog';
import { FIRST_RUN_TIP, GUARDIAN_TIP, welcomeTip } from './ui/tips';
import { MiniBossEffects } from './vfx/MiniBossEffects';
import { MINI_BOSSES } from '../core/systems/MiniBossSystem';
import { COMPANIONS } from '../core/systems/CompanionSystem';
import { ChestRoll } from './ui/ChestRoll';
import { Joystick, isTouchDevice } from './ui/Joystick';
import { CombatEffects } from './vfx/CombatEffects';
import { EnemyHordeView } from './views/EnemyHordeView';
import { HazardView, ParticleView, PickupView, ProjectileView } from './views/PickupAndProjectileViews';
import { Hand, HeroView } from './views/HeroView';
import { Arena } from './world/Arena';
import { createCollisionOverlay } from './world/CollisionOverlay';

/** Frame time is capped so a long stall (tab switch, breakpoint) can't make the sim run hundreds of catch-up steps. */
const MAX_FRAME_MS = 250;

export interface Game3DOptions {
  /** Show the on-screen joystick even off a touch screen (it shows on touch screens by default). */
  touch?: boolean;
  /** Skip the start menu and go straight into this run (test URLs: ?hero=…&weapon=…). */
  initialRun?: RunChoice;
  /** Fixed seed for every run (reproducible tests); otherwise each run rolls a new one. */
  seed?: number;
  stressEnemyCount?: number;
  invincible?: boolean;
  /** Debug: start the hero in a zone instead of the spawn clearing (?at=ruins|lake|forest|graveyard|camp|meadow). */
  startZone?: ZoneKind;
  /** Test URLs: play in this arena (?arena=snowfield) instead of Greenfield. */
  arena?: string;
  /** Debug: draw every collision shape (?debug=collision). */
  showCollision?: boolean;
  /** Debug close-up camera (1 = normal gameplay framing). */
  zoom?: number;
  /** Test keys: U random upgrade, I +5 upgrades on every weapon, O add another weapon, T toggle enemy separation,
   *  V spawn one of each enemy variant around the hero, B start this cycle's boss wave now. */
  debug?: boolean;
  /** Test URLs: open a Taverna em Turnos duel straight from the tavern (?duel=brom). */
  duel?: DuelId;
  /** Test URLs: Grimbo's bet, skipping the question (?bet=10). */
  duelBet?: number;
}

/** Floating callout colours per player-status tone. */
/** The hero's attack for each projectile: the bolt is cast, an arrow drawn and loosed, a coin flipped, whatever comes
 *  out of Sergio's pack lobbed overarm; boomerangs and the thrown sword go sidearm. */
const PROJECTILE_ATTACKS: Record<ProjectileKind, HandAttack> = { bolt: 'cast', arrow: 'shoot', coin: 'toss', pan: 'hurl', bottle: 'hurl', potion: 'hurl', boomerang: 'throw', banana: 'throw', thrownSword: 'throw' };
/** The puff an enemy dies in (anything not listed bursts spectral violet). */
const DEATH_BURST_COLORS: Partial<Record<EnemyVariantId, number>> = { skeleton: PALETTE.bone, superSkeleton: PALETTE.bone, frostSkeleton: 0xbfe6ff, frostSpirit: 0xdff6ff, snowShaman: 0x73dfff, snowman: 0xffffff, iceTroll: 0x91dcff, iceWolf: 0xdfeaf2 };
const STATUS_COLORS: Record<'heal-cut' | 'slow' | 'rot' | 'heal', string> = { 'heal-cut': '#ffb347', slow: '#8bbcff', rot: '#b98bff', heal: '#8effa0' };

/** The Three.js run: owns the WebGL renderer, the fixed-step loop and the views over one GameSession. */
/** The whip's sweep: the sword sheet dyed ember orange. */
const WHIP_TINT = 0xff9a5a;

export class Game3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cameraRig: CameraRig;
  private readonly roomFocus = new THREE.Vector3();
  private readonly tavernBackground = new THREE.Color(0x352c24);
  private readonly arenaBackground = new THREE.Color(PALETTE.background);
  private readonly pipeline: PixelPipeline;
  private arena: Arena;
  /** One map per page load: the authored layout with this load's detail seed, shared by every run (fixed zones). */
  private arenaMap: ArenaMap;
  /** The arena layout in play (config/arenaLayout), and the seed its detail is drawn from. */
  private arenaId = 'greenfield';
  private readonly arenaSeed: number;
  private readonly hud: Hud;
  private readonly screens: RunScreens;
  private readonly bossUi: BossUi;
  private readonly sandbox: SandboxPanel;
  private readonly bossViews = new BossViews();
  private readonly bossEffects: BossEffects;
  private readonly snowAttackEffects = new SnowAttackEffects();
  private readonly miniBossViews = new MiniBossViews();
  private readonly guardianIntro: GuardianIntro;
  private readonly tipDialog: TipDialog;
  private readonly powerBanner: PowerBanner;
  private readonly companionViews = new CompanionViews();
  private readonly heroKitViews = new HeroKitViews();
  /** Sandbox: every hero playable, without touching the save. */
  private allHeroesUnlocked = false;
  private merchantRoom?: MerchantRoom;
  /** The Nevasca's torches and storm snow, rebuilt with every session (empty where the arena has no blizzard). */
  private blizzardView?: BlizzardView;
  /** The Esquimó on his rounds and Joe's memory fragments (recreated with each session). */
  private eskimoView?: EskimoView;
  private readonly journeyFade = document.createElement('div');
  private readonly miniBossEffects: MiniBossEffects;
  private readonly chestRoll: ChestRoll;
  private readonly joystick: Joystick;
  private readonly showJoystick: boolean;
  private readonly choices: ChoiceOverlay;
  private readonly tavernDialog: TavernDialog;
  /** Taverna em Turnos: the duel overlay (the 3D loop pauses while it's open). Public for the probe. */
  readonly duel: TavernDuel;
  /** Taverna em Turnos: a regular's skill tree ("Habilidades" in their dialogue). Public for the probe. */
  readonly skillTree: SkillTreeScreen;
  private readonly companionBars: CompanionBars;
  private readonly questBarrels = new QuestBarrels();
  private readonly menu: StartMenu;
  private readonly audio: GameAudio;
  private run: RunChoice = { characterId: 'mage', weaponId: 'staff' };
  /** Progress between runs (browser storage), and what the last finished run banked. */
  private progress: SaveData = SaveStore.load();
  private result: RunResult = { outcome: null };
  private attract = false;
  /** The title menu, the tavern between runs, or a run. */
  private mode: 'menu' | 'hub' | 'run' = 'menu';
  /** The open run store is Sergio's at his igloo table rather than the room's counter. */
  private shopGuest = false;
  private readonly shop: SergioShop;
  private readonly tavernHeader: TavernHeader;
  private readonly tierPicker: TierPicker;
  private readonly recordBook: RecordBook;
  /** Difficulty tier for the next run (kept for "Tentar novamente"). */
  private tier = 1;
  private inMenu = false;
  private session!: GameSession;
  private playerView!: HeroView;
  /** Sized for the sandbox's highest spawn limit, so raising it never outgrows the instanced batches. */
  private readonly enemyView = new EnemyHordeView(SANDBOX_SPAWN_CAPS[SANDBOX_SPAWN_CAPS.length - 1]);
  private readonly snowfieldView = new SnowfieldView(SANDBOX_SPAWN_CAPS[SANDBOX_SPAWN_CAPS.length - 1]);
  private readonly projectileView = new ProjectileView(400);
  private readonly pickupView = new PickupView(600);
  private readonly hazardView = new HazardView(80);
  private readonly particles = new ParticleView(2000);
  private readonly powerViews = new PowerViews(this.particles);
  private readonly effects = new CombatEffects();
  private readonly sheetEffects: SheetEffects;
  private readonly keys = new Set<string>();
  private accumulator = 0;
  private lastFrameAt = 0;
  private readonly fps = { frames: 0, since: 0, value: 0 };
  private readonly scratch = new THREE.Vector3();
  private readonly floating: FloatingTexts;
  private readonly projected = new THREE.Vector3();
  /** Device pixels per CSS pixel the canvas is drawn at (see resize). */
  private pixelRatio = 1;
  /** Weapons currently attached to the hero's hands (see syncHeldWeapons). */
  private heldKey = '';

  constructor(private readonly container: HTMLElement, private readonly options: Game3DOptions) {
    this.audio = new GameAudio(container);
    this.cameraRig = new CameraRig(options.zoom);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.journeyFade.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:10000';
    this.journeyFade.setAttribute('aria-hidden', 'true');
    container.appendChild(this.journeyFade);
    this.pipeline = new PixelPipeline(this.renderer);
    this.scene.background = new THREE.Color(PALETTE.background);
    this.arenaSeed = options.seed ?? randomSeed();
    this.arenaMap = ArenaMap.generate(this.arenaSeed, ARENA_LAYOUTS[this.arenaId]);
    this.arena = new Arena(this.arenaMap, this.arenaSeed);
    if (options.showCollision) this.scene.add(createCollisionOverlay(this.arenaMap));
    this.bossEffects = new BossEffects(this.particles, this.bossViews);
    this.scene.add(this.bossEffects.root, this.bossViews.root);
    this.sheetEffects = new SheetEffects(this.cameraRig.camera);
    this.scene.add(this.sheetEffects.root);
    this.miniBossEffects = new MiniBossEffects(this.particles, this.miniBossViews);
    this.scene.add(this.snowAttackEffects.root, this.miniBossEffects.root, this.miniBossViews.root, this.companionViews.root);
    this.scene.add(this.arena.root, this.enemyView.root, this.projectileView.root, this.pickupView.root, this.hazardView.root, this.particles.mesh, this.effects.root);
    this.floating = new FloatingTexts(container);
    this.hud = new Hud(container, Boolean(options.debug), () => {
      if (!this.session.pendingChoice && !this.session.revealing && !this.session.over) this.session.paused = true;
    });
    this.bossUi = new BossUi(container, () => this.session.interact());
    this.sandbox = new SandboxPanel(container, {
      session: () => this.session,
      setFogVisible: (visible) => { this.arena.mist.root.visible = visible; },
      announce: (text) => this.floatAboveHero(text, '#8bff8b'),
      unlockAllHeroes: () => {
        this.allHeroesUnlocked = true;
        this.floatAboveHero('Sandbox: todos os heróis liberados', '#8bff8b');
      },
      addFichas: (amount) => {
        this.saveProgress({ fichas: this.progress.fichas + amount });
        this.floatAboveHero(`Sandbox: +${amount} Fichas`, '#8bff8b');
      },
      addMasteryLevel: () => {
        const hero = this.run.characterId;
        const level = masteryLevel(this.progress.mastery[hero] ?? 0);
        if (level >= MAX_MASTERY) return this.floatAboveHero('Sandbox: maestria já no máximo', '#8bff8b');
        this.saveProgress({ mastery: { ...this.progress.mastery, [hero]: MASTERY_THRESHOLDS[level] } });
        this.floatAboveHero(`Sandbox: maestria nível ${level + 1}`, '#8bff8b');
      },
      resetProgress: () => {
        if (!window.confirm('Apagar todo o progresso salvo (Fichas, maestria, missões, heróis liberados, dicas vistas)?')) return;
        this.allHeroesUnlocked = false;
        this.progress = emptySave();
        SaveStore.save(this.progress);
        this.showMenu();
      }
    });
    this.screens = new RunScreens(container, {
      resume: () => { this.session.paused = false; },
      restart: () => this.restart(),
      menu: () => this.showMenu(),
      tavern: () => this.enterHub(),
      exportSave: () => SaveStore.export(this.progress),
      importSave: () => {
        void SaveStore.import().then((save) => {
          if (!save) { this.floatAboveHero('Arquivo de progresso inválido', '#ff9a8a'); return; }
          this.progress = save;
          SaveStore.save(save);
          this.floatAboveHero(`Progresso importado: ${save.fichas} Fichas`, '#8dffa8');
        });
      }
    });
    this.choices = new ChoiceOverlay(container);
    this.tavernDialog = new TavernDialog(container, (hero) => this.menu.showCharacters(hero), (duel) => this.startDuel(duel), (regular) => this.openSkillTree(regular));
    this.duel = new TavernDuel(container, {
      settings: () => ({ assisted: this.progress.tavern.assisted, timingTrack: this.progress.tavern.timingTrack }),
      saveSettings: (settings) => this.saveProgress({ tavern: { ...this.progress.tavern, ...settings } }),
      // The hero fights with what the dueled regular has taught them.
      kit: (duel) => {
        const tree = treeFor(duel);
        return tree ? activeKit(tree, regularState(this.progress, duel)) : [];
      },
      finished: (duel, { won, parries, bet, loot }) => {
        if (!treeFor(duel)) return null;
        const xp = duelXp(won, parries);
        const { state, levelsGained } = grantXp(regularState(this.progress, duel), xp);
        // Grimbo's bet pays double on a win; what Mão Leve pocketed comes along either way.
        const fichas = (won ? bet * DICE_RULE.payout : 0) + loot;
        // A small gift for the next run (one of each waits in the save).
        const reward = won ? DUEL_REWARDS[duel] : undefined;
        const saved = withRegular(this.progress, duel, state);
        const boons = reward && !saved.tavern.boons.includes(reward.id) ? [...saved.tavern.boons, reward.id] : saved.tavern.boons;
        this.saveProgress({ ...saved, fichas: saved.fichas + fichas, tavern: { ...saved.tavern, boons } });
        return { xp, level: state.level, levelsGained, fichas, boon: reward ? `${reward.name} (${reward.description})` : null };
      },
      fichas: () => this.progress.fichas,
      stake: (amount) => {
        if (this.progress.fichas < amount) return false;
        this.saveProgress({ fichas: this.progress.fichas - amount });
        return true;
      },
      // Back in the 3D tavern where it was left: no catch-up for the time spent duelling.
      closed: () => {
        this.keys.clear();
        this.accumulator = 0;
        this.lastFrameAt = performance.now();
      }
    });
    this.skillTree = new SkillTreeScreen(container, {
      state: (regular) => ({ regular: regularState(this.progress, regular), fichas: this.progress.fichas }),
      save: (regular, state) => this.saveProgress(withRegular(this.progress, regular, state)),
      reset: (regular) => {
        const reset = resetTree(this.progress, regular);
        if (reset) this.saveProgress(reset);
        return reset !== null;
      },
      closed: () => this.keys.clear()
    });
    this.companionBars = new CompanionBars(container);
    this.scene.add(this.snowfieldView.root, this.questBarrels.root, this.heroKitViews.root, this.powerViews.root);
    this.chestRoll = new ChestRoll(container);
    this.tipDialog = new TipDialog(container);
    this.powerBanner = new PowerBanner(container, () => this.audio.fanfare());
    // After a guardian's entrance: Sergio explains guardians the first time, otherwise play resumes.
    this.guardianIntro = new GuardianIntro(container, () => {
      if (this.progress.guardianTipSeen) this.session.revealing = false;
      else this.showTip(GUARDIAN_TIP, () => this.saveProgress({ guardianTipSeen: true }));
    });
    this.joystick = new Joystick(container, () => !this.session.frozen && !this.session.over);
    this.showJoystick = Boolean(options.touch) || isTouchDevice();
    this.joystick.setVisible(false);
    this.shop = new SergioShop(container, {
      save: () => this.progress,
      buy: (id) => {
        const bought = buyUpgrade(this.progress, id);
        if (!bought) return;
        this.progress = bought;
        SaveStore.save(this.progress);
      },
      buyConsumable: (id) => {
        const bought = buyConsumable(this.progress, id);
        if (bought) this.saveProgress(bought);
      },
      runShop: () => {
        const { session } = this;
        if (this.mode !== 'run' || !session.merchant.inside || session.merchant.hub) return null;
        const guest = this.shopGuest;
        return {
          igloo: session.merchant.igloo && !guest,
          coins: session.currency,
          offers: guest ? session.merchant.guestOffers : session.merchant.offers,
          buy: (index) => {
            session.buyMerchantItem(index, guest);
            // The Tomo de Afinidade's family choice takes the screen.
            if (session.pendingChoice) this.shop.hide();
          }
        };
      },
      exportSave: () => SaveStore.export(this.progress),
      importSave: () => {
        void SaveStore.import().then((save) => {
          if (!save) return;
          this.progress = save;
          SaveStore.save(save);
          this.shop.render();
        });
      },
      close: () => this.shop.hide(),
      // Taverna em Turnos: Sergio isn't a mission regular, so his duel and tree open from his counter.
      duel: () => {
        this.shop.hide();
        this.startDuel('sergio');
      },
      skills: () => {
        this.shop.hide();
        this.openSkillTree('sergio');
      },
      canPlaySergio: () => this.roster().includes('sergio'),
      playSergio: () => {
        this.shop.hide();
        this.menu.showCharacters('sergio');
      }
    });
    this.tavernHeader = new TavernHeader(container);
    this.tierPicker = new TierPicker(container, (tier) => {
      this.tier = tier;
      this.tierPicker.hide();
      this.startRun(this.run);
    }, () => this.tierPicker.hide());
    this.recordBook = new RecordBook(container, () => this.recordBook.hide());
    // From the title "Jogar" opens the area picker, and an area its tavern; there, picking a hero (and weapon) makes
    // them yours in the room.
    this.menu = new StartMenu(container, (choice) => (this.mode === 'hub' ? this.departFromTavern(choice) : this.startRun(choice)), {
      save: () => this.progress,
      setSkin: (hero, skin) => {
        this.progress = { ...this.progress, skins: { ...this.progress.skins, [hero]: skin } };
        SaveStore.save(this.progress);
      },
      play: (arenaId) => {
        this.useArena(arenaId);
        this.enterHub();
      },
      arena: () => this.arenaId,
      closeToTavern: () => this.menu.hide(),
      roster: () => this.roster()
    });
    if (options.arena) this.useArena(options.arena);
    if (options.duel) {
      if (options.initialRun) this.run = options.initialRun;
      this.enterHub();
      this.startDuel(options.duel, options.duelBet);
    } else if (options.initialRun) this.startRun(options.initialRun);
    else this.showMenu();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { this.accumulator = 0; this.lastFrameAt = performance.now(); });
    this.lastFrameAt = performance.now();
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  startRun(choice: RunChoice): void {
    this.keys.clear();
    this.mode = 'run';
    this.shop.hide();
    this.tierPicker.hide();
    this.recordBook.hide();
    this.run = choice;
    this.inMenu = false;
    this.menu.hide();
    this.hud.setVisible(true);
    this.bossUi.setVisible(true);
    this.companionBars.setVisible(true);
    this.sandbox.setAllowed(true);
    this.joystick.setVisible(this.showJoystick);
    this.restart();
    // The very first run: Sergio says what it's about.
    if (!this.progress.firstRunTipSeen) this.showTip(FIRST_RUN_TIP, () => this.saveProgress({ firstRunTipSeen: true }));
  }

  /** Back to the title. Behind the menu the arena stays on screen with the last hero standing idle in an
   *  empty, spawn-free session. */
  showMenu(): void {
    this.keys.clear();
    this.mode = 'menu';
    this.shop.hide();
    this.inMenu = true;
    this.hud.setVisible(false);
    this.bossUi.setVisible(false);
    this.companionBars.setVisible(false);
    this.sandbox.setAllowed(false);
    this.joystick.setVisible(false);
    this.createSession({ skipStartingUpgrades: true, attract: true });
    this.menu.show();
  }

  private restart(): void {
    this.createSession({ skipStartingUpgrades: false, attract: false });
  }

  /** The tavern between runs: walk the room, spend Fichas with Sergio, pick a hero, leave by the portal to play. */
  enterHub(): void {
    this.keys.clear();
    this.mode = 'hub';
    this.inMenu = false;
    this.menu.hide();
    this.hud.setVisible(false);
    this.bossUi.setVisible(true);
    this.companionBars.setVisible(false);
    this.sandbox.setAllowed(true);
    this.joystick.setVisible(this.showJoystick);
    this.createSession({ skipStartingUpgrades: true, attract: false, hub: true });
    this.cameraRig.cut();
    if (!this.progress.tutorialSeen) {
      this.saveProgress({ tutorialSeen: true });
      this.shop.show(true);
    } else {
      this.welcomeNewHeroes();
    }
  }

  /** "Desafiar" in a regular's dialogue: the duel takes the screen over the paused tavern. */
  startDuel(duel: DuelId, bet?: number): void {
    if (this.session.dialogue !== null) this.session.closeDialogue();
    this.keys.clear();
    this.duel.start(duel, this.run.characterId, this.options.seed ?? randomSeed(), bet);
  }

  /** "Habilidades" in a regular's dialogue: their skill tree over the tavern. */
  openSkillTree(regular: string): void {
    const tree = treeFor(regular);
    if (!tree) return;
    if (this.session.dialogue !== null) this.session.closeDialogue();
    this.keys.clear();
    this.skillTree.show(tree, DUELS[regular as DuelId]?.enemy.name ?? regular);
  }

  /** The heroes the player may pick: the save's roster (or everyone, with the sandbox toggle). */
  private roster(): CharacterId[] {
    return this.allHeroesUnlocked ? (Object.keys(CHARACTERS) as CharacterId[]) : (rosterFor(this.progress) as CharacterId[]);
  }

  /** Leaving the tavern through its portal with the hero just picked (into the area chosen after "Jogar"): the
   *  difficulty next, once a harder one is open. */
  private departFromTavern(choice: RunChoice): void {
    this.run = choice;
    this.menu.hide();
    this.pickTierOrStart();
  }

  private pickTierOrStart(): void {
    if (this.progress.tierUnlocked > 1) this.tierPicker.show(this.progress, Math.min(this.tier, this.progress.tierUnlocked));
    else {
      this.tier = 1;
      this.startRun(this.run);
    }
  }

  /** Swaps the arena the runs are played in: the layout everything reads, the map and its scenery. */
  private useArena(id: string): void {
    const layout = ARENA_LAYOUTS[id];
    if (!layout || id === this.arenaId) return;
    this.arenaId = id;
    useArenaLayout(layout);
    this.scene.remove(this.arena.root);
    disposeTree(this.arena.root);
    this.arenaMap = ArenaMap.generate(this.arenaSeed, layout);
    this.arena = new Arena(this.arenaMap, this.arenaSeed);
    this.scene.add(this.arena.root);
  }

  /** Holds the game under a tip; `after` runs once it's dismissed. */
  private showTip(tip: Tip, after: () => void = () => {}): void {
    this.session.revealing = true;
    this.tipDialog.show(tip, () => {
      this.session.revealing = false;
      after();
    });
  }

  private saveProgress(changes: Partial<SaveData>): void {
    this.progress = { ...this.progress, ...changes };
    SaveStore.save(this.progress);
  }

  /** Back in the tavern: each hero unlocked since the last visit says they're playable now, one after another. */
  private welcomeNewHeroes(heroes = heroesToWelcome(this.progress)): void {
    const [hero, ...rest] = heroes;
    if (!hero || !(hero in CHARACTERS)) return;
    this.showTip(welcomeTip(hero as CharacterId), () => {
      this.saveProgress({ welcomed: [...new Set([...this.progress.welcomed, hero])] });
      this.welcomeNewHeroes(rest);
    });
  }

  /** Regulars missing from this tavern (or igloo): the ones already in your roster, and everyone from another area. */
  private regularsAway(): QuestNpcId[] {
    const here = AREAS.find((area) => area.id === this.arenaMap.layout.id)?.regulars ?? [];
    const roster = rosterFor(this.progress);
    return ALL_QUEST_NPCS.map((npc) => npc.id).filter((id) => !here.includes(id) || (roster as string[]).includes(id));
  }

  private createSession({ skipStartingUpgrades, attract, hub = false }: { skipStartingUpgrades: boolean; attract: boolean; hub?: boolean }): void {
    this.playerView?.dispose();
    this.bossViews.clear();
    this.miniBossViews.clear();
    this.companionViews.clear();
    this.miniBossEffects.clear();
    this.sheetEffects.clear();
    this.powerViews.clear();
    this.powerBanner.reset();
    if (this.merchantRoom) this.scene.remove(this.merchantRoom.root, this.merchantRoom.characters);
    this.floating.clear();
    this.chestRoll.stop();
    this.guardianIntro.reset();
    this.tipDialog.reset();
    const { characterId, weaponId } = this.run;
    this.attract = attract || hub;
    this.result = { outcome: null };
    this.session = new GameSession({
      characterId,
      startingWeaponId: weaponId,
      seed: this.options.seed ?? randomSeed(),
      stressEnemyCount: attract ? undefined : this.options.stressEnemyCount,
      skipStartingUpgrades,
      arena: this.arenaMap,
      // Sergio's permanent upgrades (and what's in the pack) and the regulars' mission progress carry into every real run.
      meta: attract || hub ? undefined : runBonuses(this.progress),
      questTiers: attract ? undefined : this.progress.regularMissions,
      regularsAway: this.regularsAway(),
      hub,
      tier: attract || hub ? 1 : this.tier
    });
    // The pack is spent on the run it came into.
    if (!attract && !hub && this.progress.pack.length > 0) this.saveProgress({ pack: [] });
    // So are the duel gifts (Taverna em Turnos).
    if (!attract && !hub && this.progress.tavern.boons.length > 0) this.saveProgress({ tavern: { ...this.progress.tavern, boons: [] } });
    this.audio.bind(this.session);
    this.merchantRoom = new MerchantRoom(this.session.merchant, this.session.quests);
    this.scene.add(this.merchantRoom.root, this.merchantRoom.characters);
    if (this.blizzardView) {
      this.scene.remove(this.blizzardView.root);
      disposeTree(this.blizzardView.root);
    }
    this.blizzardView = new BlizzardView(this.session.blizzard);
    this.scene.add(this.blizzardView.root);
    if (this.eskimoView) {
      this.scene.remove(this.eskimoView.root, this.eskimoView.glow);
      disposeTree(this.eskimoView.root);
      disposeTree(this.eskimoView.glow);
    }
    this.eskimoView = new EskimoView(this.session.shelter, this.session.quests);
    this.scene.add(this.eskimoView.root, this.eskimoView.glow);
    if (attract) {
      this.session.skeletonSpawnEnabled = false;
      this.session.variantSpawnEnabled = false;
    }
    this.session.player.invincible = Boolean(this.options.invincible);
    if (!attract) this.sandbox.applyTo(this.session, Boolean(this.options.invincible));
    const zone = this.arenaMap.layout.zones.find((spec) => spec.kind === this.options.startZone);
    if (zone && !attract) {
      // The lake's blob centre is deep water; aim at its south shore instead.
      const target = zone.kind === 'lake' ? { x: zone.blobs[0].x, y: zone.blobs[0].y + 560 } : zone.blobs[0];
      const spot = this.arenaMap.nearestWalkable(target.x, target.y, this.session.player.radius);
      Object.assign(this.session.player, spot);
      snapPrevious(this.session.player);
    }
    this.playerView = new HeroView(characterId, weaponId, this.progress.skins[characterId] ?? 'base');
    this.heldKey = weaponId;
    this.scene.add(this.playerView.root, this.playerView.effects);
    this.accumulator = 0;
    this.bindSessionEffects();
  }

  /** Banks the finished run into the save (not the menu's backdrop run, nor a sandbox or god-mode one). */
  private bankRun(): void {
    if (this.attract) return;
    if (this.sandbox.enabled || this.options.invincible) {
      this.result = { outcome: null, note: 'Partida de teste (sandbox ou modo deus): o progresso não foi salvo.' };
      return;
    }
    const outcome = applyRun(this.progress, this.session.runSummary(this.run.characterId, Date.now()));
    this.progress = outcome.save;
    const saved = SaveStore.save(this.progress);
    this.result = { outcome, note: saved ? undefined : 'Não foi possível salvar o progresso neste navegador.' };
  }

  /** Session events → particles and ground effects. Fresh listeners per session (the old bus is dropped with it). */
  private bindSessionEffects(): void {
    const { events } = this.session;
    events.on('run-ended', () => this.bankRun());
    // The portal starts the run, after picking the difficulty once a harder one is open.
    // The portal opens hero selection (with 3D previews); picking one leaves for the arena.
    events.on('hub-exit', () => this.menu.showCharacters(this.run.characterId));
    events.on('hub-records', () => this.recordBook.show(this.progress));
    events.on('hub-sergio', () => this.shop.show());
    events.on('hub-eskimo', () => this.shop.show(false, true));
    events.on('merchant-shop', ({ guest }) => {
      this.shopGuest = guest;
      this.shop.show();
    });
    events.on('player-revived', () => {
      this.floatAboveHero('SEGUNDA CHANCE!', '#ffe29a');
      this.effects.pulse(this.session.player.x, this.session.player.y, 140, 0xffe29a, 0.6, 0.8);
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, 0xffe29a, 30, 2.4, 1.6);
    });
    const at = (x: number, y: number) => simToWorld(x, y, 0, this.scratch);
    events.on('enemy-defeated', ({ x, y, variantId, divineRelic }) => {
      const point = at(x, y);
      this.particles.burst(point.x, point.z, DEATH_BURST_COLORS[variantId] ?? 0xb98cff, 10);
      if (divineRelic) {
        this.particles.burst(point.x, point.z, 0x4dff7a, 4, 1.6, 0.6);
        this.floating.spawn(simToWorld(x, y, 1.6, this.scratch), '▲', { color: '#4dff7a', size: 26, rise: 46, durationMs: 620 }, performance.now());
      }
    });
    events.on('enemy-hit', ({ enemy, amount, critical, weaponId }) => {
      if (weaponId === 'staff') this.sheetEffects.impact(enemy.x, enemy.y);
      const point = at(enemy.x, enemy.y);
      this.particles.burst(point.x, point.z, critical ? 0xffe45c : PALETTE.boltCore, critical ? 8 : 3, 1.1, 2);
      // CRIT! first, then the number 150 ms later; Relíquia Divina adds "DANO +" on the hero.
      const head = simToWorld(enemy.x, enemy.y, 2.1 * (enemy.displaySize / 62), this.scratch);
      const now = performance.now();
      if (critical) this.floating.spawn(head, 'CRIT!', { color: '#ffe45c' }, now);
      this.floating.spawn(head, `- ${Math.round(amount)}`, { color: '#ff5c5c', delayMs: critical ? 150 : 0 }, now);
      if (this.session.weapons.has('amulet')) this.floatAboveHero('DANO +', '#8effa0');
    });
    // The bees lose the hero at the water's edge; a mimic's snap throws splinters.
    events.on('swarm-dispersed', ({ x, y, byWater }) => {
      if (byWater) this.floatAboveHero('Despistou as abelhas!', '#ffd23a');
      this.particles.burst(x * WORLD_SCALE, y * WORLD_SCALE, 0xffd23a, 8, 1, 1.2);
    });
    events.on('neutral-bite', ({ enemy, hit }) => { if (hit) this.particles.burst(enemy.x * WORLD_SCALE, enemy.y * WORLD_SCALE, 0x8a5a2b, 10, 1, 1.4); });
    events.on('pickup-collected', ({ kind }) => {
      const color = kind === 'gem' ? PALETTE.gem : kind === 'potion' ? 0xff6b6b : 0xffd868;
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, color, kind === 'gem' ? 3 : 14, 0.8, 1.8);
    });
    events.on('melee-swing', ({ x, y, dirX, dirY, range, coneAngle, weaponId }) => {
      // Both blades draw the sweep sheet: the sword's steel-blue, the whip's ember-orange lash wider (its cone is 140°
      // to the sword's 90°) and a touch slower; its chain jumps between enemies are small flicks of the same.
      if (weaponId === 'sword') this.sheetEffects.sweep(x, y, dirX, dirY, range);
      else if (weaponId === 'whip') this.sheetEffects.sweep(x, y, dirX, dirY, range, WHIP_TINT, Math.max(1, coneAngle / 90), 0.28);
      else this.effects.swing(x, y, dirX, dirY, range, coneAngle, weaponId);
      // Whip chain links also emit swings, centred on the enemy they jump to — only the hero's own swing animates.
      if (x === this.session.player.x && y === this.session.player.y) {
        this.playerView.aim(dirX, dirY);
        this.playerView.play(weaponId === 'whip' ? 'lash' : weaponId === 'hammer' ? 'slam' : 'swing', this.handOf(weaponId));
      }
    });
    events.on('projectile-fired', ({ kind, dirX, dirY, weaponId }) => {
      this.playerView.aim(dirX, dirY);
      this.playerView.play(PROJECTILE_ATTACKS[kind], this.handOf(weaponId));
    });
    events.on('player-damaged', ({ amount }) => {
      this.playerView.play('hit');
      // With the Relíquia Divina equipped the hero's own damage reads green ("DANO -N").
      if (this.session.weapons.has('amulet')) this.floatAboveHero(`DANO -${Math.round(amount)}`, '#8effa0');
      else this.floatAboveHero(`- ${Math.round(amount)}`, '#ff5c5c');
    });
    events.on('player-status', ({ text, tone }) => this.floatAboveHero(text, STATUS_COLORS[tone]));
    events.on('player-died', () => this.playerView.die());
    events.on('snowman-burst', ({ x, y }) => { const p = at(x, y); this.particles.burst(p.x, p.z, 0xf1faff, 14); });
    events.on('troll-slam', ({ x, y }) => this.effects.pulse(x, y, 65, 0x75d9ff, 0.4, 0.6));
    events.on('icicle-landed', ({ x, y }) => { const p = at(x, y); this.particles.burst(p.x, p.z, 0x91dcff, 12); });
    events.on('aura-pulse', ({ radius, multiStrike, buffUnlocked }) => {
      const { player } = this.session;
      this.sheetEffects.ring(player.x, player.y, radius);
      // Multi-strike and the unlocked buff still flash their tinted ring over it.
      if (multiStrike || buffUnlocked) this.effects.pulse(player.x, player.y, radius, multiStrike ? 0xfff2a0 : 0xffc94d, 0.35, multiStrike ? 0.6 : 0.35);
      this.playerView.play('pulse', this.handOf('amulet'));
    });
    events.on('whip-burst', ({ radius }) => this.effects.burst(this.session.player.x, this.session.player.y, radius, 0xff6a3d, 0.3, 0.3));
    events.on('staff-explosion', ({ x, y, radius, index }) => this.effects.pulse(x, y, radius * (1 + index * 0.06), 0x6ee7ff, 0.22 + index * 0.045, 0.35));
    events.on('enemy-slipped', ({ enemy }) => {
      const point = at(enemy.x, enemy.y);
      this.particles.burst(point.x, point.z, 0xf2d33b, 6, 0.3, 1.5);
    });
    events.on('projectile-blocked', ({ x, y, kind }) => {
      const point = at(x, y);
      // Stone chips off the wall; bolts also spark.
      this.particles.burst(point.x, point.z, 0xbfb3a0, 5, 1.0, 1.6);
      if (kind === 'bolt') this.particles.burst(point.x, point.z, PALETTE.boltCore, 4, 1.1, 2.2);
    });
    events.on('boss-explosion', ({ x, y, radius, kind, blocked }) => {
      const winter = this.session.arena.layout.id === 'snowfield';
      const point = at(x, y);
      const big = kind === 'shield';
      this.effects.burst(x, y, radius, (winter ? 0x79dfff : 0x52ff45), big ? 0.6 : 0.36, 0.35);
      this.effects.pulse(x, y, radius, (winter ? 0xe8f8ff : 0xd8ffd0), big ? 0.6 : 0.32, 0.9);
      this.particles.burst(point.x, point.z, (winter ? 0x9fe5ff : 0x8cff8c), big ? 60 : 12, 1.2, big ? 10 : 3);
      if (kind === 'meteor') {
        this.bossEffects.scorch(x, y, radius);
        this.particles.emit(point.x, 0.4, point.z, 0x6b5a46, 10, { spread: 4, rise: 5, gravity: 16, life: 0.6, size: 1.2 });
        this.cameraRig.shake(0.12, 0.15);
      }
      if (kind === 'dash' || kind === 'lunge') {
        this.particles.emit(point.x, 0.3, point.z, 0x9a8a70, 30, { spread: 7, rise: 2, gravity: 6, life: 0.7, size: 1.6, jitter: 1 });
        this.cameraRig.shake(0.3, 0.3);
      }
      if (kind === 'center') this.cameraRig.shake(0.2, 0.2);
      if (big) {
        this.bossEffects.scorch(x, y, radius * 0.6);
        this.cameraRig.shake(0.8, 0.9);
        if (blocked) this.floatAboveHero('PROTEGIDO!', '#bfe4ff');
      }
    });
    events.on('boss-shield-broken', ({ enemy }) => {
      const winter = this.session.arena.layout.id === 'snowfield';
      const point = at(enemy.x, enemy.y);
      // The dome shatters into shards; the boss drops to a knee.
      this.particles.emit(point.x, 4, point.z, (winter ? 0x9fe5ff : 0x8cff8c), 70, { spread: 9, rise: 5, gravity: 14, life: 0.9, size: 1.3, jitter: 4 });
      this.effects.pulse(enemy.x, enemy.y, 230, 0xffffff, 0.45, 0.9);
      this.floating.spawn(simToWorld(enemy.x, enemy.y, 9, this.scratch), 'ATORDOADO!', { color: '#ffe45c', size: 32, rise: 50, durationMs: 1200 }, performance.now());
      this.cameraRig.shake(0.35, 0.35);
    });
    events.on('boss-phase-two', ({ enemy }) => {
      const winter = this.session.arena.layout.id === 'snowfield';
      this.floating.spawn(simToWorld(enemy.x, enemy.y, 10, this.scratch), winter ? 'O REI DO INVERNO DESPERTA!' : 'O NECROMANTE DESPERTA!', { color: winter ? '#9fe5ff' : '#8cff8c', size: 30, rise: 40, durationMs: 1800 }, performance.now());
      this.cameraRig.shake(0.15, 1.2);
    });
    events.on('boss-shockwave', ({ x, y, radius }) => {
      const winter = this.session.arena.layout.id === 'snowfield';
      const point = at(x, y);
      this.effects.pulse(x, y, radius, (winter ? 0xe8f8ff : 0xd8ffd0), 0.5, 1);
      this.effects.burst(x, y, radius, (winter ? 0x286a9b : 0x1f8a46), 0.6, 0.4);
      for (let index = 0; index < 24; index += 1) {
        const angle = (index / 24) * Math.PI * 2;
        const reach = radius * 0.7 * WORLD_SCALE;
        this.particles.emit(point.x + Math.cos(angle) * reach, 0.3, point.z + Math.sin(angle) * reach, (winter ? 0x7ce6ff : 0x6dff9a), 2, { spread: 3, rise: 3, gravity: 8, life: 0.6, size: 1.3 });
      }
      this.cameraRig.shake(0.6, 0.6);
    });
    events.on('miniboss-impact', ({ attack, x, y, radius }) => {
      const point = at(x, y);
      if (attack === 'geyser') {
        // A column of water bursting up.
        this.effects.pulse(x, y, radius, 0xe6f6ff, 0.35, 0.9);
        this.particles.emit(point.x, 0.2, point.z, 0x6fd3ff, 26, { spread: 1.6, rise: 10, gravity: 18, life: 0.9, size: 1.3, jitter: 0.6 });
        this.particles.emit(point.x, 0.2, point.z, 0xe6f6ff, 14, { spread: 3.5, rise: 5, gravity: 16, life: 0.6, size: 1 });
        this.cameraRig.shake(0.15, 0.2);
        return;
      }
      if (attack === 'iceSlash' || attack === 'iceWall') {
        // Shards of ice: a frozen arc where the blade lands, a burst of frost as the wall breaks through.
        this.effects.burst(x, y, radius, 0x9fe0ff, 0.35, 0.35);
        this.effects.pulse(x, y, radius, 0xe8f6ff, 0.4, 0.9);
        this.particles.emit(point.x, 0.4, point.z, 0xe8f6ff, attack === 'iceWall' ? 30 : 16, { spread: attack === 'iceWall' ? 6 : 4, rise: 4, gravity: 12, life: 0.6, size: 1.2, jitter: 0.6 });
        this.cameraRig.shake(attack === 'iceWall' ? 0.2 : 0.12, 0.25);
        return;
      }
      if (attack === 'wave') {
        this.particles.emit(point.x, 1, point.z, 0xe6f6ff, 30, { spread: 5, rise: 5, gravity: 12, life: 0.6, size: 1.2, jitter: 1.5 });
        this.cameraRig.shake(0.25, 0.35);
        return;
      }
      this.effects.burst(x, y, radius, 0xff7a3a, 0.35, 0.35);
      this.effects.pulse(x, y, radius, 0xffc890, 0.35, 0.9);
      this.particles.emit(point.x, 0.3, point.z, 0x6b5a46, attack === 'shockwave' ? 30 : 16, { spread: attack === 'shockwave' ? 8 : 5, rise: 4, gravity: 14, life: 0.6, size: 1.3, jitter: 0.5 });
      this.cameraRig.shake(attack === 'shockwave' || attack === 'charge' ? 0.35 : 0.2, 0.3);
    });
    // A guardian's entrance: the game holds while the camera goes to watch it rise (not from inside the tavern).
    events.on('miniboss-spawned', ({ kind, enemy, foreseen }) => {
      if (this.mode !== 'run' || this.attract || this.session.merchant.inside || this.session.over) return;
      // Zora's vision (a duel won in the tavern) weakened it.
      if (foreseen) this.floating.spawn(simToWorld(enemy.x, enemy.y, 9, this.scratch), 'VISÃO DA ZORA: -25% VIDA', { color: '#c58bff', size: 28, rise: 40, durationMs: 2200 }, performance.now());
      this.miniBossViews.playEntrance(enemy);
      this.guardianIntro.start(kind, enemy);
      this.session.revealing = true;
    });
    events.on('miniboss-enraged', ({ enemy }) => {
      const point = at(enemy.x, enemy.y);
      this.particles.emit(point.x, 2, point.z, 0x9fe0ff, 50, { spread: 7, rise: 5, gravity: 14, life: 0.9, size: 1.4, jitter: 1.5 });
      this.effects.pulse(enemy.x, enemy.y, 200, 0xe8f6ff, 0.6, 0.9);
      this.floating.spawn(simToWorld(enemy.x, enemy.y, 8, this.scratch), 'A ARMADURA SE PARTE!', { color: '#9fe0ff', size: 30, rise: 40, durationMs: 1600 }, performance.now());
      this.cameraRig.shake(0.3, 0.4);
    });
    events.on('miniboss-stunned', ({ enemy }) => {
      this.floating.spawn(simToWorld(enemy.x, enemy.y, 6, this.scratch), 'ATORDOADO!', { color: '#ffe45c', size: 28, rise: 40, durationMs: 1100 }, performance.now());
    });
    events.on('guardian-experience', ({ x, y }) => {
      window.setTimeout(() => this.floatAt(x, y, '+1 NÍVEL DE XP!', '#8dffa8'), 700);
    });
    events.on('miniboss-defeated', ({ kind, x, y }) => {
      const point = at(x, y);
      this.particles.emit(point.x, 2, point.z, kind === 'gravedigger' ? 0x6dff9a : kind === 'lakeSpirit' ? 0x6fd3ff : 0x9a8f7c, 50, { spread: 6, rise: 5, gravity: 12, life: 0.9, size: 1.4, jitter: 2 });
      this.floating.spawn(simToWorld(x, y, 7, this.scratch), `${MINI_BOSSES[kind].name} caiu!`, { color: '#ffe29a', size: 28, rise: 40, durationMs: 1600 }, performance.now());
      this.cameraRig.shake(0.25, 0.5);
    });
    events.on('companion-joined', ({ kind, level }) => {
      this.floatAboveHero(level > 1 ? `${COMPANIONS[kind].name} — nível ${level}!` : `${COMPANIONS[kind].name} se junta a você!`, '#8bffd0');
    });
    events.on('companion-attack', ({ kind, x, y, radius }) => {
      if (kind === 'frostKnight' || kind === 'iceSerpent' || kind === 'bellringer' || kind === 'ancientYeti') {
        this.effects.pulse(x, y, radius, kind === 'bellringer' ? 0xe8c875 : 0x91d9ef, 0.3, 0.7);
      }
      if (kind === 'stoneGolem') {
        this.effects.pulse(x, y, radius, 0xffd36a, 0.3, 0.7);
        const point = at(x, y);
        this.particles.emit(point.x, 0.2, point.z, 0x8f8574, 8, { spread: 3, rise: 3, gravity: 12, life: 0.45, size: 1.1 });
      }
    });
    events.on('companion-heal', ({ x, y, amount }) => {
      this.effects.pulse(x, y, 60, 0x9fe8ff, 0.5, 0.8);
      this.effects.burst(x, y, 50, 0x6fd3ff, 0.45, 0.25);
      this.floatAboveHero(`+${amount}`, '#8effc8');
    });
    events.on('companion-down', ({ kind, x, y }) => {
      const point = at(x, y);
      const color = kind === 'gravedigger' ? PALETTE.bone : kind === 'waterFairy' ? 0x9fe8ff : 0x9a8f7c;
      this.particles.emit(point.x, 1, point.z, color, 30, { spread: 4, rise: 3, gravity: 14, life: 0.8, size: 1.5, jitter: 1 });
      this.floatAt(x, y, 'Caiu!', '#ff9a8a');
    });
    // The Coveiro Aliado's skeletons climb out in a puff of grave-green and crumble into bones.
    events.on('ally-raised', ({ x, y }) => {
      const point = at(x, y);
      this.particles.emit(point.x, 0.2, point.z, 0x6dff9a, 14, { spread: 1.6, rise: 3, gravity: 3, life: 0.7, size: 1.1, jitter: 0.6 });
    });
    events.on('ally-down', ({ x, y }) => {
      const point = at(x, y);
      this.particles.emit(point.x, 0.8, point.z, PALETTE.bone, 12, { spread: 2.5, rise: 2, gravity: 12, life: 0.6, size: 1.1, jitter: 0.8 });
    });
    events.on('boss-enraged', ({ enemy, healthGained }) => {
      this.effects.pulse(enemy.x, enemy.y, 900, 0xff5a3a, 0.8, 0.6);
      this.floating.spawn(simToWorld(enemy.x, enemy.y, 9, this.scratch), healthGained > 0 ? `ENFURECIDO! +${healthGained} HP` : 'ENFURECIDO!', { color: '#ff7a5c', size: 30, rise: 40, durationMs: 1600 }, performance.now());
      this.cameraRig.shake(0.25, 0.6);
    });
    events.on('boss-shield-countdown', ({ enemy, seconds }) => {
      this.floating.spawn(simToWorld(enemy.x, enemy.y, 7, this.scratch), `${seconds}...`, { color: '#ffcc33', size: 26 }, performance.now());
    });
    events.on('boss-wave-cleared', () => {
      Object.values(this.session.portals ?? {}).forEach(({ x, y }) => this.effects.pulse(x, y, 70, 0xffffff, 0.5, 0.8));
    });
    // The regulars' kits.
    events.on('hammer-quake', ({ x, y, radius }) => {
      const point = at(x, y);
      this.effects.pulse(x, y, radius, 0xd9c7a0, 0.3, 0.6);
      this.particles.emit(point.x, 0.15, point.z, 0x8a7a5a, 12, { spread: 3, rise: 2.5, gravity: 10, life: 0.5, size: 1.2, jitter: 0.8 });
      this.cameraRig.shake(0.06, 0.15);
    });
    events.on('bottle-burst', ({ x, y, radius }) => {
      const point = at(x, y);
      this.effects.burst(x, y, radius, 0x6ad46a, 0.3, 0.45);
      this.particles.burst(point.x, point.z, 0x8affa0, 14, 1.8, 1.2);
    });
    events.on('potion-heal', ({ x, y }) => {
      const point = at(x, y);
      this.particles.burst(point.x, point.z, 0xff6a8a, 8, 1.2, 1.4);
    });
    events.on('barrel-burst', ({ x, y, radius }) => {
      const point = at(x, y);
      this.effects.burst(x, y, radius, 0xf5ecd0, 0.4, 0.55);
      this.particles.emit(point.x, 0.3, point.z, 0xf5ecd0, 26, { spread: 4.5, rise: 3, gravity: 6, life: 0.8, size: 1.6, jitter: 1 });
    });
    events.on('arrow-rain', ({ x, y, radius }) => {
      const point = at(x, y);
      this.effects.pulse(x, y, radius, 0x9fe08a, 0.25, 0.5);
      for (let index = 0; index < 10; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const reach = Math.random() * radius * WORLD_SCALE;
        this.particles.emit(point.x + Math.cos(angle) * reach, 4, point.z + Math.sin(angle) * reach, 0xe9dfc4, 1, { spread: 0.1, rise: -14, gravity: 20, life: 0.3, size: 1.4 });
      }
    });
    events.on('fate-burst', ({ x, y, radius }) => {
      const point = at(x, y);
      this.effects.burst(x, y, radius, 0xb26bff, 0.35, 0.5);
      this.particles.burst(point.x, point.z, 0xd8a8ff, 16, 2, 1.4);
    });
    this.bindPowerEffects();
    events.on('hero-ability', ({ kind }) => {
      const text = { mead: 'Hidromel!', jackpot: 'Tudo ou Nada: escolha dupla!', sale: 'Liquidação: um item grátis na loja!', fate: 'Destino Selado', rain: 'Chuva de Flechas!' }[kind];
      const color = { mead: '#ffd25a', jackpot: '#8dffa8', sale: '#ffc65a', fate: '#d8a8ff', rain: '#9fe08a' }[kind];
      this.floatAboveHero(text, color);
    });
    events.on('merchant-portal-opened', ({ x, y }) => {
      const point = at(x, y);
      this.particles.burst(point.x, point.z, 0xffc65a, 18, 2.2, 1.2);
    });
    const portalCut = (color: number) => {
      this.cameraRig.cut();
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, color, 16, 1.8, 1);
    };
    events.on('merchant-entered', () => portalCut(0xb48cff));
    events.on('merchant-left', () => portalCut(0xffc65a));
    events.on('quest-accepted', ({ title }) => this.floatAboveHero(`Missão aceita: ${title}`, '#ffd25a'));
    events.on('quest-completed', ({ title }) => {
      this.floatAboveHero(`${title} concluída! Volte à taverna`, '#8dffa8');
      this.effects.pulse(this.session.player.x, this.session.player.y, 70, 0x8dffa8, 0.5, 0.6);
    });
    events.on('quest-claimed', ({ reward }) => {
      this.floatAboveHero(`Recompensa: ${rewardText(reward)}`, '#ffd25a');
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, 0xffd25a, 16, 1.8, 1.4);
    });
    events.on('quest-gifts', ({ names }) => names.forEach((name, index) => window.setTimeout(() => this.floatAboveHero(`Presente: ${name}!`, '#ffe29a'), 500 + index * 450)));
    events.on('barrel-collected', ({ x, y }) => {
      const point = at(x, y);
      this.particles.burst(point.x, point.z, 0xffd25a, 14, 1.6, 1.2);
      this.floatAboveHero('Barril recuperado!', '#ffd25a');
    });
    events.on('merchant-purchase', ({ cost }) => {
      this.floatAboveHero(`-${cost} moedas`, '#ffd25a');
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, 0xffd25a, 12, 1.6, 1.4);
    });
    events.on('chest-opened', ({ upgrade, rolled }) => {
      this.effects.pulse(this.session.player.x, this.session.player.y, 60, 0xffd868, 0.5, 0.7);
      this.chestRoll.play(this.session, upgrade, rolled, () => this.floatAboveHero(`Baú: ${upgrade.name}!`, '#ffe29a'));
    });
  }

  /** First weapon in the right hand, second in the left. */
  /** The heroes' power tiers: the announcement, then each power's burst (persistent pieces are PowerViews'). */
  private bindPowerEffects(): void {
    const { events } = this.session;
    const at = (x: number, y: number) => simToWorld(x, y, 0, this.scratch);
    events.on('power-unlocked', ({ tier, level, name, text }) => {
      if (this.attract) return;
      // The run holds while the card is up (like any reveal), and goes on once the last one closes.
      this.session.revealing = true;
      this.powerBanner.show({ level, tier, name, text }, () => { this.session.revealing = false; });
      const { player } = this.session;
      this.effects.pulse(player.x, player.y, 90, 0xffe29a, 0.6, 0.8);
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, 0xffe29a, 24, 2, 2);
    });
    events.on('power-arc', ({ points }) => {
      this.powerViews.arc(points);
      const end = points[points.length - 1];
      const point = at(end.x, end.y);
      this.particles.emit(point.x, 1.1, point.z, 0xc8f4ff, 4, { spread: 2, rise: 2, gravity: 6, life: 0.25, size: 1 });
    });
    events.on('power-blast', ({ kind, x, y, radius }) => {
      const point = at(x, y);
      switch (kind) {
        case 'storm':
          this.powerViews.arc([{ x, y }], true);
          this.effects.pulse(x, y, radius * 1.6, 0xc8f4ff, 0.3, 0.9);
          this.particles.emit(point.x, 0.3, point.z, 0xe6faff, 14, { spread: 3, rise: 4, gravity: 10, life: 0.4, size: 1.2, jitter: 0.4 });
          this.cameraRig.shake(0.08, 0.12);
          break;
        case 'warcry':
          this.effects.pulse(x, y, radius, 0xff7a3a, 0.5, 0.9);
          this.effects.burst(x, y, radius, 0xff4a2a, 0.4, 0.3);
          this.particles.emit(point.x, 0.3, point.z, 0x9a8a70, 30, { spread: 8, rise: 2, gravity: 6, life: 0.6, size: 1.4, jitter: 1 });
          this.floatAboveHero('GRITO DE GUERRA!', '#ff9a6a');
          this.playerView.play('slam', 'R');
          this.cameraRig.shake(0.3, 0.35);
          break;
        case 'holy':
          this.sheetEffects.ring(x, y, radius, 0.6);
          this.effects.pulse(x, y, radius, 0xfff2a0, 0.55, 0.8);
          break;
        case 'sanctuary':
          this.effects.burst(x, y, radius, 0xfff6c0, 0.6, 0.5);
          this.effects.pulse(x, y, radius, 0xffffff, 0.7, 1);
          this.particles.emit(point.x, 0.4, point.z, 0xfff0a0, 50, { spread: 8, rise: 6, gravity: 4, life: 0.9, size: 1.4, jitter: 1.5 });
          this.floatAboveHero('SANTUÁRIO!', '#fff0a0');
          this.cameraRig.shake(0.25, 0.4);
          break;
        case 'meteor':
          this.effects.burst(x, y, radius, 0xff7a2a, 0.5, 0.5);
          this.effects.pulse(x, y, radius, 0xffd070, 0.45, 1);
          this.bossEffects.scorch(x, y, radius * 0.8);
          this.particles.emit(point.x, 0.3, point.z, 0xff8a2a, 40, { spread: 8, rise: 7, gravity: 14, life: 0.8, size: 1.6, jitter: 1 });
          this.particles.emit(point.x, 0.3, point.z, 0x6b5a46, 20, { spread: 6, rise: 4, gravity: 14, life: 0.7, size: 1.3 });
          this.cameraRig.shake(0.5, 0.45);
          break;
        case 'gold':
          this.effects.burst(x, y, radius, 0xffc93a, 0.3, 0.5);
          this.particles.burst(point.x, point.z, 0xffe066, 14, 1.4, 2.4);
          break;
        case 'gold-rain':
          this.effects.pulse(x, y, radius, 0xffc93a, 0.5, 0.8);
          for (let index = 0; index < 24; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const reach = Math.sqrt(Math.random()) * radius * WORLD_SCALE;
            this.particles.emit(point.x + Math.cos(angle) * reach, 6, point.z + Math.sin(angle) * reach, 0xffd84a, 1, { spread: 0.1, rise: -16, gravity: 20, life: 0.35, size: 1.5 });
          }
          this.floatAt(x, y, 'CHUVA DE OURO!', '#ffd84a');
          break;
        case 'eclipse':
          this.effects.burst(x, y, radius, 0x8a4dff, 0.5, 0.6);
          this.effects.pulse(x, y, radius, 0xd8a8ff, 0.5, 1);
          this.particles.emit(point.x, 2, point.z, 0xb26bff, 50, { spread: 9, rise: 4, gravity: 6, life: 0.8, size: 1.5, jitter: 1.5 });
          this.cameraRig.shake(0.35, 0.4);
          break;
        case 'crate':
          this.effects.burst(x, y, radius, 0xd8a25a, 0.35, 0.5);
          this.particles.emit(point.x, 0.6, point.z, 0x9a6a3a, 20, { spread: 5, rise: 5, gravity: 16, life: 0.7, size: 1.4, jitter: 0.5 });
          this.particles.burst(point.x, point.z, 0xffd84a, 12, 1.4, 2.4);
          this.cameraRig.shake(0.12, 0.15);
          break;
        case 'hawk':
          this.particles.emit(point.x, 1, point.z, 0xc8ffd8, 12, { spread: 3, rise: 3, gravity: 8, life: 0.4, size: 1.1 });
          break;
        case 'roots':
          this.effects.pulse(x, y, radius, 0x6fdc5a, 0.6, 0.7);
          for (let index = 0; index < 14; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const reach = Math.sqrt(Math.random()) * radius * WORLD_SCALE;
            this.particles.emit(point.x + Math.cos(angle) * reach, 0.1, point.z + Math.sin(angle) * reach, 0x4fa83a, 3, { spread: 0.2, rise: 3, gravity: 4, life: 0.7, size: 1.2 });
          }
          break;
        case 'crack':
          this.effects.pulse(x, y, radius, 0x6a5a3a, 0.5, 0.7);
          this.particles.emit(point.x, 0.1, point.z, 0x3a3022, 8, { spread: 2.5, rise: 1, gravity: 8, life: 0.5, size: 1 });
          break;
        case 'anvil':
          this.effects.pulse(x, y, radius, 0xffd070, 0.4, 0.9);
          this.effects.burst(x, y, radius, 0xd9c7a0, 0.35, 0.4);
          this.particles.emit(point.x, 0.3, point.z, 0xffc070, 16, { spread: 5, rise: 5, gravity: 16, life: 0.5, size: 1.1, jitter: 0.5 });
          this.cameraRig.shake(0.2, 0.2);
          break;
        case 'peel-slip':
          this.particles.burst(point.x, point.z, 0xf2d33b, 8, 0.4, 2);
          break;
      }
    });
    events.on('power-cast', ({ kind, x, y }) => {
      switch (kind) {
        case 'fury':
          this.floatAboveHero('FÚRIA IMORTAL!', '#ff5a3a');
          this.effects.pulse(x, y, 160, 0xff3a2a, 0.6, 1);
          this.cameraRig.shake(0.35, 0.5);
          break;
        case 'fury-end': this.floatAboveHero('A fúria passa', '#ff9a8a'); break;
        case 'hurricane': this.floatAboveHero('Furacão Arcano!', '#bfe9ff'); this.playerView.play('cast', this.handOf('staff')); break;
        case 'monkey': this.floatAboveHero('Macaco Furioso!', '#f2d33b'); this.playerView.play('swing', 'R'); break;
        case 'meteor': this.powerViews.meteor(x, y); this.playerView.play('slam', this.handOf('hammer')); break;
        case 'crate': this.playerView.play('hurl', this.handOf('pack')); break;
        case 'sale':
          this.floatAboveHero('LIQUIDAÇÃO TOTAL!', '#ffc65a');
          this.playerView.play('hurl', this.handOf('pack'));
          break;
        case 'eclipse': this.floatAt(x, y, 'Eclipse', '#d8a8ff'); break;
        case 'foresight':
          this.floatAboveHero('PREVISTO!', '#d8a8ff');
          this.effects.pulse(x, y, 50, 0xd8a8ff, 0.4, 0.9);
          break;
        case 'foresight-ready': this.effects.pulse(x, y, 40, 0xb26bff, 0.35, 0.5); break;
      }
    });
    events.on('power-item', ({ kind, x, y }) => {
      const point = at(x, y);
      this.particles.emit(point.x, 5, point.z, kind === 'pan' ? 0x9a9aa4 : kind === 'bottle' ? 0x6ad46a : 0xff6a8a, 3, { spread: 0.2, rise: -14, gravity: 20, life: 0.25, size: 1.4 });
      if (kind === 'pan') this.effects.pulse(x, y, 55, 0xd8d8e0, 0.25, 0.7);
      if (kind === 'bottle') this.effects.burst(x, y, 65, 0x6ad46a, 0.3, 0.45);
      if (kind === 'potion') this.particles.burst(point.x, point.z, 0xff6a8a, 8, 1.2, 1.4);
    });
  }

  private handOf(weaponId: WeaponConfig['id']): Hand {
    return this.session.weapons.weapons.findIndex((weapon) => weapon.config.id === weaponId) === 1 ? 'L' : 'R';
  }

  /** Keeps the hands matching the run: re-equips when a weapon is added or the boomerang becomes the banana, and
   *  empties a hand while its thrown weapon (boomerang, banana) is in the air. */
  private syncHeldWeapons(): void {
    const { weapons } = this.session.weapons;
    const ids = weapons.map((weapon) => (this.session.weapons.isBananaTransformActive(weapon) ? 'banana' : weapon.config.id));
    const key = ids.join(',');
    if (key !== this.heldKey) {
      this.heldKey = key;
      this.playerView.setWeapons(ids);
    }
    weapons.forEach((weapon, slot) => {
      let inFlight = false;
      this.session.projectiles.forEachActive((projectile) => { if (projectile.kind !== 'bolt' && projectile.weaponId === weapon.config.id) inFlight = true; });
      this.playerView.setWeaponVisible(slot, !inFlight);
    });
  }

  private floatAboveHero(text: string, color: string): void {
    const { player } = this.session;
    this.floating.spawn(simToWorld(player.x, player.y, 2.4, this.scratch), text, { color }, performance.now());
  }

  private floatAt(x: number, y: number, text: string, color: string): void {
    this.floating.spawn(simToWorld(x, y, 2.2, this.scratch), text, { color }, performance.now());
  }

  /** World point → CSS px over the canvas, matching the pixelated image (see ndcToCanvas). */
  private projectToScreen = (world: THREE.Vector3, out: { x: number; y: number }, allowOffscreen = false): boolean => {
    const ndc = this.projected.copy(world).project(this.cameraRig.camera);
    if (!allowOffscreen && (Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05)) return false;
    const canvas = ndcToCanvas(ndc.x, ndc.y, this.pipeline.layout, this.renderer.domElement.height, this.cameraRig.subTexelOffset);
    out.x = canvas.x / this.pixelRatio;
    out.y = canvas.y / this.pixelRatio;
    return true;
  };

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      if (this.duel.open) {
        this.duel.keydown(event);
        return;
      }
      if (this.skillTree.open) {
        this.skillTree.keydown(event);
        return;
      }
      if (this.inMenu) return;
      this.keys.add(event.code);
      // ESC stays blocked while a choice screen is open.
      // ESC first closes Sergio's counter or a conversation in the tavern.
      if (this.menu.visible) return;
      if (this.guardianIntro.filming) {
        if (['Escape', 'Enter', 'Space'].includes(event.code)) {
          event.preventDefault();
          this.guardianIntro.skip();
        }
        return;
      }
      if (this.powerBanner.open) {
        if (['Escape', 'Enter', 'NumpadEnter', 'Space'].includes(event.code)) {
          event.preventDefault();
          this.powerBanner.next();
        }
        return;
      }
      if (this.tipDialog.open) {
        if (['Escape', 'Enter', 'NumpadEnter'].includes(event.code)) {
          event.preventDefault();
          this.tipDialog.close();
        }
        return;
      }
      if (this.shop.open || this.tierPicker.open || this.recordBook.open) {
        if (event.code === 'Escape') {
          this.shop.hide();
          this.tierPicker.hide();
          this.recordBook.hide();
        }
        return;
      }
      if (event.code === 'KeyT' && this.session.over) this.enterHub();
      if (event.code === 'Escape' && this.session.dialogue !== null) this.session.closeDialogue();
      else if ((event.code === 'Escape' || event.code === 'KeyP') && !this.session.pendingChoice && !this.session.revealing) this.session.paused = !this.session.paused;
      if (event.code === 'KeyR' && this.session.over) this.restart();
      if (event.code === 'KeyE') this.session.interact();
      // Sergio's Loja Portátil.
      if (event.code === 'KeyQ' && this.mode === 'run' && this.session.characterId === 'sergio') {
        if (!this.session.openPortableShop()) this.floatAboveHero('A loja ainda não está pronta', '#c9b89a');
      }
      if (event.code === 'KeyM' && (this.session.over || this.session.paused)) this.showMenu();
      if (this.options.debug) this.debugKey(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
    // The game has no right-click action; the browser menu would swallow keyup and leave the hero walking.
    window.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.keys.clear();
    });
  }

  private debugKey(code: string): void {
    const { session } = this;
    if (code === 'KeyU') session.grantRandomUpgrade();
    if (code === 'KeyI') session.weapons.weapons.forEach((weapon) => { weapon.upgradeCount += 5; });
    if (code === 'KeyO') {
      const next = Object.values(WEAPONS).find((weapon) => !session.weapons.has(weapon.id));
      if (next && session.addWeapon(next.id)) session.grantAffinity(next.type === 'cone' ? 'melee' : next.type === 'aura' ? 'aura' : 'ranged');
    }
    if (code === 'KeyT') session.enemySeparation = !session.enemySeparation;
    if (code === 'KeyB') session.triggerBossWave();
    if (code === 'KeyV') {
      // One of each scheduled variant in a ring around the hero, for reviewing models/animations.
      const variants = ['skeleton', 'superSkeleton', 'necromancerWraith', 'apparitionWraith', 'frostSkeleton', 'frostSpirit', 'snowShaman', 'snowman', 'iceTroll', 'iceWolf'] as const;
      variants.forEach((variant, index) => {
        const angle = (index / variants.length) * Math.PI * 2;
        session.spawnEnemy(variant, session.player.x + Math.cos(angle) * 150, session.player.y + Math.sin(angle) * 150);
      });
    }
  }

  private readMoveInput(): void {
    if (this.inMenu || this.shop.open || this.tierPicker.open || this.recordBook.open || (this.mode === 'hub' && this.menu.visible)) {
      this.session.setMoveInput(0, 0);
      return;
    }
    let right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    let up = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    // The stick takes over while it's held.
    if (this.joystick.direction.x !== 0 || this.joystick.direction.y !== 0) ({ x: right, y: up } = this.joystick.direction);
    const ground = this.cameraRig.screenToGround(right, up);
    this.session.setMoveInput(ground.x, ground.y);
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = ratio;
    const width = Math.floor(this.container.clientWidth * ratio);
    const height = Math.floor(this.container.clientHeight * ratio);
    this.renderer.setSize(width, height, false);
    const layout = this.pipeline.resize(width, height);
    this.cameraRig.setViewSize(layout.internalWidth, layout.internalHeight);
  }

  private frame(now: number): void {
    const frameMs = Math.min(MAX_FRAME_MS, now - this.lastFrameAt);
    this.lastFrameAt = now;
    // A duel pauses the 3D world: only the 2D stage draws.
    if (this.duel.open) {
      this.duel.frame(now);
      return;
    }
    this.readMoveInput();
    this.audio.update(this.session, this.inMenu);
    this.menu.update(frameMs / 1000);
    // Menu backdrop: draw the arena and idle animation, without advancing gameplay, spawns, or boss timers.
    const running = !this.inMenu && !this.session.frozen && !this.session.over;
    if (running) {
      this.accumulator += frameMs;
      while (this.accumulator >= STEP_MS && !this.session.frozen) {
        this.session.step(STEP_MS);
        this.accumulator -= STEP_MS;
      }
    }
    this.journeyFade.style.opacity = String(this.session.frozen ? 0 : this.session.journeyOpacity);
    this.journeyFade.style.pointerEvents = this.session.journey && !this.session.frozen ? 'auto' : 'none';
    const alpha = running ? Math.min(1, this.accumulator / STEP_MS) : 1;
    const simNow = this.session.clock.now + (running ? this.accumulator : 0);
    const deltaSeconds = running || this.inMenu ? frameMs / 1000 : 0;

    // The hero keeps animating after death (the fall plays out) but freezes with pause / choice screens.
    this.playerView.update(this.session.player, alpha, simNow, this.session.frozen ? 0 : frameMs / 1000, this.session.journey?.kind === 'igloo' && this.session.journey.ms >= 1400 && !this.session.journey.arrived);
    const journey = this.session.journey;
    if (journey?.kind === 'igloo' && !journey.arrived) {
      const t = Math.min(1, journey.ms / 1400);
      this.playerView.root.position.y += Math.sin(t * Math.PI) * 0.45 - t * 0.25;
    }
    this.syncHeldWeapons();
    this.enemyView.update(this.session.enemies, alpha, simNow, journey ? 0 : deltaSeconds);
    this.enemyView.updateSwarms(this.session.neutrals.swarms, alpha, simNow);
    this.enemyView.updateFrostTrail(this.session.frostTrail.patches, simNow);
    this.snowfieldView.update(this.session, alpha, simNow);
    this.blizzardView?.update(this.cameraRig.focus, deltaSeconds);
    this.eskimoView?.update(this.session.frozen ? 0 : deltaSeconds);
    this.projectileView.update(this.session.projectiles, alpha, simNow, this.cameraRig.camera);
    this.pickupView.update(this.session.pickups, alpha, simNow);
    this.hazardView.update(this.session.souls, this.session.peels, alpha, simNow);
    this.particles.update(deltaSeconds);
    this.effects.update(deltaSeconds);
    this.sheetEffects.update(deltaSeconds);
    const inTavern = this.session.merchant.inside;
    this.cameraRig.setRoomZoom(inTavern ? 1.65 : 1);
    this.scene.background = inTavern ? this.tavernBackground : this.arenaBackground;
    const sceneFocus = this.guardianIntro.update(frameMs / 1000, this.playerView.worldPosition);
    if (sceneFocus) {
      this.cameraRig.cut();
      this.cameraRig.follow(sceneFocus, frameMs / 1000);
    } else {
      // Keep the framing inside the hall while still tracking the hero near tables and the doorway.
      let focus = this.playerView.worldPosition;
      if (inTavern) {
        simToWorld(this.session.merchant.room.x, this.session.merchant.room.y, 0, this.roomFocus);
        const dx = focus.x - this.roomFocus.x, dz = focus.z - this.roomFocus.z;
        // On narrow/tall screens, follow farther so the hero stays within the central 65% of the view.
        const across = Math.abs((dx - dz) / Math.SQRT2);
        const vertical = Math.abs((dx + dz) / 2);
        const tracking = Math.max(0.45,
          1 - this.cameraRig.camera.right * 0.65 / Math.max(across, 0.001),
          1 - this.cameraRig.camera.top * 0.65 / Math.max(vertical, 0.001));
        focus = this.roomFocus.lerp(focus, tracking);
      }
      this.cameraRig.follow(focus, frameMs / 1000);
    }
    this.arena.setSceneryVisible(!this.session.merchant.inside);
    // Out of the wind in the igloo (or the tavern): no storm, no torches.
    if (this.blizzardView) this.blizzardView.root.visible = this.blizzardView.glow.visible = !this.session.merchant.inside;
    this.arena.followFocus(this.cameraRig.focus);
    this.arena.update(deltaSeconds, this.cameraRig.focus, this.playerView.worldPosition, this.cameraRig.viewDirection);

    this.bossViews.update(this.session.bosses.bosses, this.session.player, alpha, simNow, this.session.frozen ? 0 : frameMs / 1000);
    this.bossEffects.update(this.session, alpha, this.session.frozen ? 0 : frameMs / 1000);
    this.miniBossViews.update(this.session.miniBosses.bosses, alpha, simNow, this.session.frozen && !this.guardianIntro.filming ? 0 : frameMs / 1000);
    this.heroKitViews.update(this.session, alpha, simNow);
    this.powerViews.update(this.session, alpha, simNow, this.session.frozen ? 0 : frameMs / 1000);
    this.companionViews.update(this.session.companions.companions, this.session.companions.skeletons, alpha, this.session.frozen ? 0 : frameMs / 1000);
    this.snowAttackEffects.update([...this.session.miniBosses.snow.hazards, ...this.session.bosses.snow.hazards], this.session.bosses.braziers);
    this.miniBossEffects.update(this.session.miniBosses, alpha, this.session.frozen ? 0 : frameMs / 1000);
    this.merchantRoom?.update(this.session.frozen ? 0 : frameMs / 1000);
    this.questBarrels.update(this.session.quests, this.session.frozen ? 0 : frameMs / 1000);
    this.floating.update(now, this.projectToScreen);
    this.renderer.info.reset();
    this.pipeline.render(this.scene, this.cameraRig.camera, this.cameraRig.subTexelOffset,
      [this.snowfieldView.root, ...(this.blizzardView ? [this.blizzardView.glow] : []), ...(this.eskimoView ? [this.eskimoView.glow] : []), this.enemyView.blobShadows, this.enemyView.rottenAuras, this.enemyView.lanes, this.particles.mesh, this.effects.root, this.sheetEffects.root, this.heroKitViews.glow, this.powerViews.glow, this.projectileView.boltMesh, ...this.arena.normalPassExclusions, ...(this.merchantRoom ? this.merchantRoom.ambience.glows : []), this.bossEffects.root, this.miniBossEffects.root, this.snowAttackEffects.root, this.playerView.effects],
      [this.playerView.root, this.snowfieldView.heroIce, this.bossViews.root, this.miniBossViews.root, this.companionViews.root, ...(this.merchantRoom ? [this.merchantRoom.characters, this.merchantRoom.questMarkers] : [])]);

    this.fps.frames += 1;
    if (now - this.fps.since >= 500) {
      this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.since));
      this.fps.frames = 0;
      this.fps.since = now;
    }
    this.screens.update(this.session, this.inMenu, this.result);
    // Station prompts hide behind the tavern's panels.
    if (this.mode !== 'menu') this.bossUi.setVisible(!(this.shop.open || this.tierPicker.open || this.recordBook.open || (this.mode === 'hub' && this.menu.visible)));
    this.bossUi.update(this.session, this.projectToScreen);
    this.companionBars.update(this.session, this.projectToScreen);
    this.hud.update(this.session, {
      fps: this.fps.value,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelScale: this.pipeline.layout.pixelScale,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures
    });
    this.choices.update(this.session);
    this.tavernDialog.update(this.session, this.progress);
    this.tavernHeader.update(this.mode === 'hub' && !this.menu.visible && !this.shop.open && !this.tierPicker.open && !this.recordBook.open, this.progress, heroName(this.run.characterId), AREAS.find((area) => area.id === this.arenaMap.layout.id), this.session.merchant.igloo);
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Frees an object tree's GPU resources (geometries, materials and their textures). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) value.dispose(); });
      material.dispose();
    });
  });
}
