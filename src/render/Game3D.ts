import * as THREE from 'three';
import { ENEMY_CONFIG } from '../config/balance';
import { CHARACTERS, CharacterId } from '../config/characters';
import { GameSession, STEP_MS } from '../core/session/GameSession';
import { CameraRig } from './CameraRig';
import { PALETTE } from './materials';
import { PixelPipeline } from './PixelPipeline';
import { simToWorld } from './space';
import { EnemyHordeView } from './views/EnemyHordeView';
import { GemView, ParticleView, ProjectileView } from './views/PickupAndProjectileViews';
import { PlayerView } from './views/PlayerView';
import { Arena } from './world/Arena';
import { Hud } from './Hud';

/** Frame time is capped so a long stall (tab switch, breakpoint) can't make the sim run hundreds of catch-up steps. */
const MAX_FRAME_MS = 250;

export interface Game3DOptions {
  characterId: CharacterId;
  seed: number;
  stressEnemyCount?: number;
  invincible?: boolean;
}

/** Etapa 2 vertical slice: owns the WebGL renderer, the fixed-step loop and the views over one GameSession. */
export class Game3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cameraRig = new CameraRig();
  private readonly pipeline: PixelPipeline;
  private readonly arena: Arena;
  private readonly hud: Hud;
  private session!: GameSession;
  private playerView!: PlayerView;
  private readonly enemyView = new EnemyHordeView(ENEMY_CONFIG.maxActive);
  private readonly projectileView = new ProjectileView(400);
  private readonly gemView = new GemView(600);
  private readonly particles = new ParticleView(600);
  private readonly keys = new Set<string>();
  private accumulator = 0;
  private lastFrameAt = 0;
  private readonly fps = { frames: 0, since: 0, value: 0 };
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly container: HTMLElement, private readonly options: Game3DOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.pipeline = new PixelPipeline(this.renderer);
    this.scene.background = new THREE.Color(PALETTE.background);
    this.arena = new Arena(options.seed);
    this.scene.add(this.arena.root, this.enemyView.root, this.projectileView.mesh, this.gemView.mesh, this.particles.mesh);
    this.hud = new Hud(container, () => this.restart());
    this.restart();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { this.accumulator = 0; this.lastFrameAt = performance.now(); });
    this.lastFrameAt = performance.now();
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private restart(): void {
    if (this.playerView) this.scene.remove(this.playerView.root);
    this.session = new GameSession({ characterId: this.options.characterId, seed: this.options.seed, stressEnemyCount: this.options.stressEnemyCount });
    this.session.player.invincible = Boolean(this.options.invincible);
    this.playerView = new PlayerView(CHARACTERS[this.options.characterId]);
    this.scene.add(this.playerView.root);
    this.accumulator = 0;
    this.session.events.on('enemy-defeated', ({ x, y, variantId }) => {
      simToWorld(x, y, 0, this.scratch);
      this.particles.burst(this.scratch.x, this.scratch.z, variantId === 'skeleton' ? PALETTE.bone : 0xb98cff, 10);
    });
    this.session.events.on('enemy-hit', ({ enemy }) => {
      simToWorld(enemy.x, enemy.y, 0, this.scratch);
      this.particles.burst(this.scratch.x, this.scratch.z, PALETTE.boltCore, 4, 1.1, 2);
    });
    this.session.events.on('gem-collected', () => {
      this.particles.burst(this.playerView.worldPosition.x, this.playerView.worldPosition.z, PALETTE.gem, 3, 0.6, 1.5);
    });
  }

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (event.code === 'Escape' || event.code === 'KeyP') this.session.paused = !this.session.paused;
      if (event.code === 'KeyR' && this.session.over) this.restart();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private readMoveInput(): void {
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const up = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const ground = this.cameraRig.screenToGround(right, up);
    this.session.setMoveInput(ground.x, ground.y);
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
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
    const running = !this.session.paused && !this.session.over;
    if (running) {
      this.accumulator += frameMs;
      while (this.accumulator >= STEP_MS) {
        this.session.step(STEP_MS);
        this.accumulator -= STEP_MS;
      }
    }
    const alpha = running ? this.accumulator / STEP_MS : 1;
    const simNow = this.session.clock.now + (running ? this.accumulator : 0);
    const deltaSeconds = running ? frameMs / 1000 : 0;

    this.playerView.update(this.session.player, alpha, simNow, frameMs / 1000);
    this.enemyView.update(this.session.enemies, alpha, simNow, deltaSeconds);
    this.projectileView.update(this.session.projectiles, alpha, simNow);
    this.gemView.update(this.session.gems, alpha, simNow);
    this.particles.update(deltaSeconds);
    this.cameraRig.follow(this.playerView.worldPosition, frameMs / 1000);
    this.arena.followFocus(this.cameraRig.focus);

    this.renderer.info.reset();
    this.pipeline.render(this.scene, this.cameraRig.camera, this.cameraRig.subTexelOffset, [this.enemyView.blobShadows, this.particles.mesh, this.projectileView.mesh]);

    this.fps.frames += 1;
    if (now - this.fps.since >= 500) {
      this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.since));
      this.fps.frames = 0;
      this.fps.since = now;
    }
    this.hud.update(this.session, {
      fps: this.fps.value,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelScale: this.pipeline.layout.pixelScale
    });
  }
}
