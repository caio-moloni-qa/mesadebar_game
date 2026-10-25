import * as THREE from 'three';
import { ENEMY_CONFIG } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import { WEAPONS } from '../config/weapons';
import { GameSession, STEP_MS } from '../core/session/GameSession';
import { ArenaMap } from '../core/world/ArenaMap';
import { snapPrevious } from '../core/session/entities';
import { ZONES, ZoneKind } from '../config/arenaLayout';
import { CameraRig } from './CameraRig';
import { ChoiceOverlay } from './ChoiceOverlay';
import { Hud } from './Hud';
import { PALETTE } from './materials';
import { PixelPipeline, ndcToCanvas } from './PixelPipeline';
import { RunChoice, StartMenu } from './StartMenu';
import { simToWorld } from './space';
import { FloatingTexts } from './ui/FloatingTexts';
import { RunScreens } from './ui/RunScreens';
import { ChestRoll } from './ui/ChestRoll';
import { CombatEffects } from './vfx/CombatEffects';
import { EnemyHordeView } from './views/EnemyHordeView';
import { HazardView, ParticleView, PickupView, ProjectileView } from './views/PickupAndProjectileViews';
import { HeroView } from './views/HeroView';
import { Arena } from './world/Arena';
import { createCollisionOverlay } from './world/CollisionOverlay';

/** Frame time is capped so a long stall (tab switch, breakpoint) can't make the sim run hundreds of catch-up steps. */
const MAX_FRAME_MS = 250;

export interface Game3DOptions {
  /** Skip the start menu and go straight into this run (test URLs: ?hero=…&weapon=…). */
  initialRun?: RunChoice;
  /** Fixed seed for every run (reproducible tests); otherwise each run rolls a new one. */
  seed?: number;
  stressEnemyCount?: number;
  invincible?: boolean;
  /** Debug: start the hero in a zone instead of the spawn clearing (?at=ruins|lake|forest|graveyard|camp|meadow). */
  startZone?: ZoneKind;
  /** Debug: draw every collision shape (?debug=collision). */
  showCollision?: boolean;
  /** Debug close-up camera (1 = normal gameplay framing). */
  zoom?: number;
  /** Test keys: U random upgrade, I +5 upgrades on every weapon, O add another weapon, T toggle enemy separation,
   *  V spawn one of each enemy variant around the hero. */
  debug?: boolean;
}

/** Floating callout colours per player-status tone (Phaser: Player.spawnFloatingStatusText call sites). */
const STATUS_COLORS: Record<'heal-cut' | 'slow' | 'rot' | 'heal', string> = { 'heal-cut': '#ffb347', slow: '#8bbcff', rot: '#b98bff', heal: '#8effa0' };

/** The Three.js run: owns the WebGL renderer, the fixed-step loop and the views over one GameSession. */
export class Game3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cameraRig: CameraRig;
  private readonly pipeline: PixelPipeline;
  private readonly arena: Arena;
  /** One map per page load: the authored layout with this load's detail seed, shared by every run (fixed zones). */
  private readonly arenaMap: ArenaMap;
  private readonly hud: Hud;
  private readonly screens: RunScreens;
  private readonly chestRoll: ChestRoll;
  private readonly choices: ChoiceOverlay;
  private readonly menu: StartMenu;
  private run: RunChoice = { characterId: 'mage', weaponId: 'staff' };
  private inMenu = false;
  private session!: GameSession;
  private playerView!: HeroView;
  private readonly enemyView = new EnemyHordeView(ENEMY_CONFIG.maxActive);
  private readonly projectileView = new ProjectileView(400);
  private readonly pickupView = new PickupView(600);
  private readonly hazardView = new HazardView(80);
  private readonly particles = new ParticleView(800);
  private readonly effects = new CombatEffects();
  private readonly keys = new Set<string>();
  private accumulator = 0;
  private lastFrameAt = 0;
  private readonly fps = { frames: 0, since: 0, value: 0 };
  private readonly scratch = new THREE.Vector3();
  private readonly floating: FloatingTexts;
  private readonly projected = new THREE.Vector3();
  /** Device pixels per CSS pixel the canvas is drawn at (see resize). */
  private pixelRatio = 1;

  constructor(private readonly container: HTMLElement, private readonly options: Game3DOptions) {
    this.cameraRig = new CameraRig(options.zoom);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.pipeline = new PixelPipeline(this.renderer);
    this.scene.background = new THREE.Color(PALETTE.background);
    const arenaSeed = options.seed ?? randomSeed();
    this.arenaMap = ArenaMap.generate(arenaSeed);
    this.arena = new Arena(this.arenaMap, arenaSeed);
    if (options.showCollision) this.scene.add(createCollisionOverlay(this.arenaMap));
    this.scene.add(this.arena.root, this.enemyView.root, this.projectileView.root, this.pickupView.root, this.hazardView.root, this.particles.mesh, this.effects.root);
    this.floating = new FloatingTexts(container);
    this.hud = new Hud(container, Boolean(options.debug));
    this.screens = new RunScreens(container, { resume: () => { this.session.paused = false; }, restart: () => this.restart(), menu: () => this.showMenu() });
    this.choices = new ChoiceOverlay(container);
    this.chestRoll = new ChestRoll(container);
    this.menu = new StartMenu(container, (choice) => this.startRun(choice));
    if (options.initialRun) this.startRun(options.initialRun);
    else this.showMenu();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { this.accumulator = 0; this.lastFrameAt = performance.now(); });
    this.lastFrameAt = performance.now();
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  startRun(choice: RunChoice): void {
    this.run = choice;
    this.inMenu = false;
    this.menu.hide();
    this.hud.setVisible(true);
    this.restart();
  }

  /** Back to character select. Behind the menu the arena stays on screen with the last hero standing idle in an
   *  empty, spawn-free session. */
  showMenu(): void {
    this.inMenu = true;
    this.hud.setVisible(false);
    this.createSession({ skipStartingUpgrades: true, attract: true });
    this.menu.show();
  }

  private restart(): void {
    this.createSession({ skipStartingUpgrades: false, attract: false });
  }

  private createSession({ skipStartingUpgrades, attract }: { skipStartingUpgrades: boolean; attract: boolean }): void {
    this.playerView?.dispose();
    this.floating.clear();
    this.chestRoll.stop();
    const { characterId, weaponId } = this.run;
    this.session = new GameSession({
      characterId,
      startingWeaponId: weaponId,
      seed: this.options.seed ?? randomSeed(),
      stressEnemyCount: attract ? undefined : this.options.stressEnemyCount,
      skipStartingUpgrades,
      arena: this.arenaMap
    });
    if (attract) {
      this.session.skeletonSpawnEnabled = false;
      this.session.variantSpawnEnabled = false;
    }
    this.session.player.invincible = Boolean(this.options.invincible);
    const zone = ZONES.find((spec) => spec.kind === this.options.startZone);
    if (zone && !attract) {
      // The lake's blob centre is deep water; aim at its south shore instead.
      const target = zone.kind === 'lake' ? { x: zone.blobs[0].x, y: zone.blobs[0].y + 560 } : zone.blobs[0];
      const spot = this.arenaMap.nearestWalkable(target.x, target.y, this.session.player.radius);
      Object.assign(this.session.player, spot);
      snapPrevious(this.session.player);
    }
    this.playerView = new HeroView(characterId, weaponId);
    this.scene.add(this.playerView.root);
    this.accumulator = 0;
    this.bindSessionEffects();
  }

  /** Session events → particles and ground effects. Fresh listeners per session (the old bus is dropped with it). */
  private bindSessionEffects(): void {
    const { events } = this.session;
    const at = (x: number, y: number) => simToWorld(x, y, 0, this.scratch);
    events.on('enemy-defeated', ({ x, y, variantId, divineRelic }) => {
      const point = at(x, y);
      this.particles.burst(point.x, point.z, variantId === 'skeleton' || variantId === 'superSkeleton' ? PALETTE.bone : 0xb98cff, 10);
      if (divineRelic) {
        this.particles.burst(point.x, point.z, 0x4dff7a, 4, 1.6, 0.6);
        this.floating.spawn(simToWorld(x, y, 1.6, this.scratch), '▲', { color: '#4dff7a', size: 26, rise: 46, durationMs: 620 }, performance.now());
      }
    });
    events.on('enemy-hit', ({ enemy, amount, critical }) => {
      const point = at(enemy.x, enemy.y);
      this.particles.burst(point.x, point.z, critical ? 0xffe45c : PALETTE.boltCore, critical ? 8 : 3, 1.1, 2);
      // Same callouts as the Phaser build: CRIT! then the number 150 ms later; Relíquia Divina adds "DANO +" on the hero.
      const head = simToWorld(enemy.x, enemy.y, 2.1 * (enemy.displaySize / 62), this.scratch);
      const now = performance.now();
      if (critical) this.floating.spawn(head, 'CRIT!', { color: '#ffe45c' }, now);
      this.floating.spawn(head, `- ${Math.round(amount)}`, { color: '#ff5c5c', delayMs: critical ? 150 : 0 }, now);
      if (this.session.weapons.has('amulet')) this.floatAboveHero('DANO +', '#8effa0');
    });
    events.on('pickup-collected', ({ kind }) => {
      const color = kind === 'gem' ? PALETTE.gem : kind === 'potion' ? 0xff6b6b : 0xffd868;
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, color, kind === 'gem' ? 3 : 14, 0.8, 1.8);
    });
    events.on('melee-swing', ({ x, y, dirX, dirY, range, coneAngle, weaponId }) => {
      this.effects.swing(x, y, dirX, dirY, range, coneAngle, weaponId);
      // Whip chain links also emit swings, centred on the enemy they jump to — only the hero's own swing animates.
      if (x === this.session.player.x && y === this.session.player.y) this.playerView.play('swing');
    });
    events.on('projectile-fired', ({ kind }) => this.playerView.play(kind === 'bolt' ? 'cast' : 'throw'));
    events.on('player-damaged', ({ amount }) => {
      this.playerView.play('hit');
      // With the Relíquia Divina equipped the hero's own damage reads green ("DANO -N"), like the Phaser build.
      if (this.session.weapons.has('amulet')) this.floatAboveHero(`DANO -${Math.round(amount)}`, '#8effa0');
      else this.floatAboveHero(`- ${Math.round(amount)}`, '#ff5c5c');
    });
    events.on('player-status', ({ text, tone }) => this.floatAboveHero(text, STATUS_COLORS[tone]));
    events.on('player-died', () => this.playerView.die());
    events.on('aura-pulse', ({ radius, multiStrike, buffUnlocked }) => {
      const { player } = this.session;
      this.effects.pulse(player.x, player.y, radius, multiStrike ? 0xfff2a0 : buffUnlocked ? 0xffc94d : 0xe8b04a, 0.35, multiStrike ? 0.8 : 0.5);
      this.playerView.play('pulse');
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
    events.on('chest-opened', ({ upgrade, rolled }) => {
      this.effects.pulse(this.session.player.x, this.session.player.y, 60, 0xffd868, 0.5, 0.7);
      this.chestRoll.play(this.session, upgrade, rolled, () => this.floatAboveHero(`Baú: ${upgrade.name}!`, '#ffe29a'));
    });
  }

  private floatAboveHero(text: string, color: string): void {
    const { player } = this.session;
    this.floating.spawn(simToWorld(player.x, player.y, 2.4, this.scratch), text, { color }, performance.now());
  }

  /** World point → CSS px over the canvas, matching the pixelated image (see ndcToCanvas). */
  private projectToScreen = (world: THREE.Vector3, out: { x: number; y: number }): boolean => {
    const ndc = this.projected.copy(world).project(this.cameraRig.camera);
    if (Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) return false;
    const canvas = ndcToCanvas(ndc.x, ndc.y, this.pipeline.layout, this.renderer.domElement.height, this.cameraRig.subTexelOffset);
    out.x = canvas.x / this.pixelRatio;
    out.y = canvas.y / this.pixelRatio;
    return true;
  };

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      if (this.inMenu) return;
      this.keys.add(event.code);
      // ESC stays blocked while a choice screen is open, like the Phaser build.
      if ((event.code === 'Escape' || event.code === 'KeyP') && !this.session.pendingChoice && !this.session.revealing) this.session.paused = !this.session.paused;
      if (event.code === 'KeyR' && this.session.over) this.restart();
      if (event.code === 'KeyM' && (this.session.over || this.session.paused)) this.showMenu();
      if (this.options.debug) this.debugKey(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
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
    if (code === 'KeyV') {
      // One of each scheduled variant in a ring around the hero, for reviewing models/animations.
      const variants = ['skeleton', 'superSkeleton', 'necromancerWraith', 'apparitionWraith'] as const;
      variants.forEach((variant, index) => {
        const angle = (index / variants.length) * Math.PI * 2;
        session.spawnEnemy(variant, session.player.x + Math.cos(angle) * 150, session.player.y + Math.sin(angle) * 150);
      });
    }
  }

  private readMoveInput(): void {
    if (this.inMenu) {
      this.session.setMoveInput(0, 0);
      return;
    }
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const up = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
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
    this.readMoveInput();
    const running = !this.session.frozen && !this.session.over;
    if (running) {
      this.accumulator += frameMs;
      while (this.accumulator >= STEP_MS && !this.session.frozen) {
        this.session.step(STEP_MS);
        this.accumulator -= STEP_MS;
      }
    }
    const alpha = running ? Math.min(1, this.accumulator / STEP_MS) : 1;
    const simNow = this.session.clock.now + (running ? this.accumulator : 0);
    const deltaSeconds = running ? frameMs / 1000 : 0;

    // The hero keeps animating after death (the fall plays out) but freezes with pause / choice screens.
    this.playerView.update(this.session.player, alpha, simNow, this.session.frozen ? 0 : frameMs / 1000);
    this.enemyView.update(this.session.enemies, alpha, simNow, deltaSeconds);
    this.projectileView.update(this.session.projectiles, alpha, simNow);
    this.pickupView.update(this.session.pickups, alpha, simNow);
    this.hazardView.update(this.session.souls, this.session.peels, alpha, simNow);
    this.particles.update(deltaSeconds);
    this.effects.update(deltaSeconds);
    this.cameraRig.follow(this.playerView.worldPosition, frameMs / 1000);
    this.arena.followFocus(this.cameraRig.focus);
    this.arena.update(deltaSeconds, this.cameraRig.focus, this.playerView.worldPosition, this.cameraRig.viewDirection);

    this.floating.update(now, this.projectToScreen);
    this.renderer.info.reset();
    this.pipeline.render(this.scene, this.cameraRig.camera, this.cameraRig.subTexelOffset, [this.enemyView.blobShadows, this.enemyView.rottenAuras, this.particles.mesh, this.effects.root, ...this.arena.normalPassExclusions], [this.playerView.root]);

    this.fps.frames += 1;
    if (now - this.fps.since >= 500) {
      this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.since));
      this.fps.frames = 0;
      this.fps.since = now;
    }
    this.screens.update(this.session, this.inMenu);
    this.hud.update(this.session, {
      fps: this.fps.value,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelScale: this.pipeline.layout.pixelScale,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures
    });
    this.choices.update(this.session);
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
