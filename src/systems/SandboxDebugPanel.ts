import Phaser from 'phaser';
import { DIFFICULTY_STAGES, ENEMY_CONFIG } from '../config/balance';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { EnemyVariantConfig } from '../entities/Enemy';
import { THEME, THEME_CSS } from '../config/theme';

const SANDBOX_SPAWN_CAP_OPTIONS = [ENEMY_CONFIG.maxActive, 500, 1000, -1];

/** Panel layout — kept small enough that the button list always needs the scroll wheel past a few rows,
 *  instead of growing the panel to fit every button and risking it running off the bottom of the screen. */
const PANEL_WIDTH = 190;
const ROW_HEIGHT = 26;
const VISIBLE_ROWS = 9;
const VIEWPORT_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const TITLE_HEIGHT = 28;

/** Everything SandboxDebugPanel needs from GameScene, exposed narrowly so the two stay decoupled. */
export interface SandboxDebugHost {
  scene: Phaser.Scene;
  addCurrency(amount: number): void;
  killAllActiveEnemies(): void;
  adjustElapsedMs(deltaMs: number): void;
  setForcedDifficultyStage(stage: number | null): void;
  setEnemySpawnCap(cap: number): void;
  setMapFogVisible(visible: boolean): void;
  spawnVariantNearPlayer(id: EnemyVariantConfig['id'], count: number): void;
  spawnExtraBoss(): void;
  setPlayerInvincible(invincible: boolean): void;
  addPlayerDamageBuffer(amount: number): void;
  grantRandomWeaponUpgrade(): void;
  grantRandomAttributeUpgrade(): void;
}

interface ScrollRow {
  object: Phaser.GameObjects.Text;
  row: number;
}

/** F9 debug UI: run-time toggles, spawn/kill shortcuts and difficulty overrides. Owns all sandbox-only state. */
export class SandboxDebugPanel {
  private indicator?: Phaser.GameObjects.Text;
  private panelObjects: Phaser.GameObjects.GameObject[] = [];
  private fogEnabled = true;
  private merchantEnabled = true;
  private skeletonSpawnEnabled = true;
  private variantSpawnEnabled = true;
  private invincible = false;
  private difficultyStage: number | null = null;
  private spawnCapIndex = 0;
  /** Button list content, scrolled by moving this container's y within [-scrollMaxOffset, 0] — see buildPanel. */
  private scrollContent?: Phaser.GameObjects.Container;
  private readonly scrollRows: ScrollRow[] = [];
  private scrollOffset = 0;
  private scrollMaxOffset = 0;
  private wheelHandler?: (pointer: Phaser.Input.Pointer, currentlyOver: unknown[], deltaX: number, deltaY: number) => void;

  constructor(private readonly host: SandboxDebugHost) {}

  isFogEnabled(): boolean { return this.fogEnabled; }
  isMerchantEnabled(): boolean { return this.merchantEnabled; }
  isSkeletonSpawnEnabled(): boolean { return this.skeletonSpawnEnabled; }
  isVariantSpawnEnabled(): boolean { return this.variantSpawnEnabled; }
  isInvincible(): boolean { return this.invincible; }
  initialSpawnCap(): number { return SANDBOX_SPAWN_CAP_OPTIONS[this.spawnCapIndex]; }

  /** Drops per-run UI object references; scene shutdown already destroyed the underlying GameObjects. */
  resetUiRefs(): void {
    this.indicator = undefined;
    this.panelObjects = [];
    this.scrollContent = undefined;
    this.wheelHandler = undefined;
  }

  setActive(active: boolean): void {
    if (active) { this.showIndicator(); this.buildPanel(); } else { this.hideIndicator(); this.destroyPanel(); }
  }

  private showIndicator(): void {
    if (this.indicator) { this.indicator.setVisible(true); return; }
    this.indicator = this.host.scene.add.text(GAME_WIDTH - 16, GAME_HEIGHT - 16, 'SANDBOX ATIVO (F9)', { fontFamily: TITLE_FONT_FAMILY, fontSize: '16px', color: '#8bff8b', stroke: '#0a1a0a', strokeThickness: 4 }).setOrigin(1, 1).setScrollFactor(0).setDepth(60);
  }
  private hideIndicator(): void {
    this.indicator?.setVisible(false);
  }
  private buildPanel(): void {
    this.destroyPanel();
    const scene = this.host.scene;
    const panelX = GAME_WIDTH - PANEL_WIDTH - 10;
    const panelTop = 110;
    const viewportY = panelTop + TITLE_HEIGHT;
    const panelHeight = TITLE_HEIGHT + VIEWPORT_HEIGHT + 8;
    const background = scene.add.rectangle(panelX, panelTop, PANEL_WIDTH, panelHeight, THEME.panelBg, 0.88).setOrigin(0, 0).setStrokeStyle(2, THEME.border, 0.9).setScrollFactor(0).setDepth(59);
    const title = scene.add.text(panelX + 8, panelTop + 6, 'SANDBOX (scroll ↕)', { fontFamily: TITLE_FONT_FAMILY, fontSize: '12px', color: '#ffe29a' }).setScrollFactor(0).setDepth(60);
    // Clips the button list to the viewport strip below the title — content past VISIBLE_ROWS is reached by
    // scrolling (see registerScroll) instead of growing the panel to fit every button.
    const maskShape = scene.add.graphics().setScrollFactor(0).fillStyle(0xffffff).fillRect(panelX, viewportY, PANEL_WIDTH, VIEWPORT_HEIGHT).setVisible(false);
    const content = scene.add.container(panelX, viewportY).setScrollFactor(0).setDepth(60);
    content.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));
    this.panelObjects = [background, title, maskShape, content];
    this.scrollContent = content;
    this.scrollRows.length = 0;
    this.scrollOffset = 0;
    let row = 0;
    const nextRow = () => row++;
    this.addButton(content, nextRow(), '+100 moedas', () => this.host.addCurrency(100));
    this.addButton(content, nextRow(), 'Matar inimigos ativos', () => this.host.killAllActiveEnemies());
    this.addToggleButton(content, nextRow(), 'Mercador', () => this.merchantEnabled, (value) => { this.merchantEnabled = value; });
    this.addToggleButton(content, nextRow(), 'Névoa', () => this.fogEnabled, (value) => { this.fogEnabled = value; this.host.setMapFogVisible(value); });
    this.addToggleButton(content, nextRow(), 'Spawn esqueletos', () => this.skeletonSpawnEnabled, (value) => { this.skeletonSpawnEnabled = value; });
    this.addToggleButton(content, nextRow(), 'Spawn variantes', () => this.variantSpawnEnabled, (value) => { this.variantSpawnEnabled = value; });
    this.addToggleButton(content, nextRow(), 'Invencível', () => this.invincible, (value) => { this.invincible = value; this.host.setPlayerInvincible(value); });
    this.addButton(content, nextRow(), '+500 Buffer de Dano', () => this.host.addPlayerDamageBuffer(500));
    this.addCycleButton(content, nextRow(), () => this.difficultyLabel(), () => this.cycleDifficulty());
    this.addButton(content, nextRow(), 'Avançar 30s (run)', () => this.host.adjustElapsedMs(30000));
    this.addButton(content, nextRow(), 'Voltar 30s (run)', () => this.host.adjustElapsedMs(-30000));
    this.addButton(content, nextRow(), '+10 Esqueletos', () => this.host.spawnVariantNearPlayer('skeleton', 10));
    this.addButton(content, nextRow(), '+1 Necromante', () => this.host.spawnVariantNearPlayer('necromancerWraith', 1));
    this.addButton(content, nextRow(), '+5 Aparições', () => this.host.spawnVariantNearPlayer('apparitionWraith', 5));
    this.addButton(content, nextRow(), '+1 Super Esqueleto', () => this.host.spawnVariantNearPlayer('superSkeleton', 1));
    this.addButton(content, nextRow(), '+1 Boss Extra', () => this.host.spawnExtraBoss());
    this.addCycleButton(content, nextRow(), () => this.spawnCapLabel(), () => this.cycleSpawnCap());
    this.addButton(content, nextRow(), 'Upgrade de arma aleatório', () => this.host.grantRandomWeaponUpgrade());
    this.addButton(content, nextRow(), 'Atributo aleatório', () => this.host.grantRandomAttributeUpgrade());
    this.scrollMaxOffset = Math.max(0, row * ROW_HEIGHT - VIEWPORT_HEIGHT);
    this.updateRowVisibility();
    this.registerScroll(panelX, panelTop, panelHeight);
  }
  private destroyPanel(): void {
    if (this.wheelHandler) { this.host.scene.input.off('wheel', this.wheelHandler); this.wheelHandler = undefined; }
    this.panelObjects.forEach((object) => object.destroy());
    this.panelObjects = [];
    this.scrollContent = undefined;
    this.scrollRows.length = 0;
  }
  /** Mouse-wheel scroll over the panel area — clamped so the content never scrolls past its first/last row. */
  private registerScroll(panelX: number, panelTop: number, panelHeight: number): void {
    this.wheelHandler = (pointer, _currentlyOver, _deltaX, deltaY) => {
      if (!this.scrollContent || this.scrollMaxOffset <= 0) return;
      if (pointer.x < panelX || pointer.x > panelX + PANEL_WIDTH || pointer.y < panelTop || pointer.y > panelTop + panelHeight) return;
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + deltaY * 0.5, 0, this.scrollMaxOffset);
      this.scrollContent.y = (panelTop + TITLE_HEIGHT) - this.scrollOffset;
      this.updateRowVisibility();
    };
    this.host.scene.input.on('wheel', this.wheelHandler);
  }
  /** Masking already clips rendering, but input hit-testing ignores masks — buttons scrolled out of the viewport
   *  must also be explicitly disabled or they'd still catch clicks from wherever they scrolled off to. */
  private updateRowVisibility(): void {
    this.scrollRows.forEach(({ object, row }) => {
      const top = row * ROW_HEIGHT;
      const visible = top + ROW_HEIGHT > this.scrollOffset && top < this.scrollOffset + VIEWPORT_HEIGHT;
      object.setVisible(visible);
      if (visible) object.setInteractive({ useHandCursor: true }); else object.disableInteractive();
    });
  }
  private styledRowText(container: Phaser.GameObjects.Container, row: number, label: string): Phaser.GameObjects.Text {
    // Container.setScrollFactor(0) only multiplies each child's scrollFactor during that child's own render call,
    // then restores it right after — it never actually changes the child's own scrollFactor property. Input
    // hit-testing reads that real property directly (InputManager.hitTest), so without setting it here too, every
    // row still hit-tests as a normal scrollFactor-1 world object: clicks land in the wrong spot the moment the
    // camera scrolls away from the world origin (i.e. as soon as the player moves), even though it renders fine.
    const button = this.host.scene.add.text(8, row * ROW_HEIGHT, label, { fontFamily: FONT_FAMILY, fontSize: '11px', color: '#ffffff', backgroundColor: THEME_CSS.buttonBg, padding: { x: 6, y: 4 } }).setScrollFactor(0).setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setStyle({ backgroundColor: THEME_CSS.buttonHover }));
    button.on('pointerout', () => button.setStyle({ backgroundColor: THEME_CSS.buttonBg }));
    container.add(button);
    this.scrollRows.push({ object: button, row });
    return button;
  }
  private addButton(container: Phaser.GameObjects.Container, row: number, label: string, action: () => void): void {
    this.styledRowText(container, row, label).on('pointerup', action);
  }
  private addToggleButton(container: Phaser.GameObjects.Container, row: number, labelPrefix: string, getState: () => boolean, setState: (value: boolean) => void): void {
    const button = this.styledRowText(container, row, '');
    const refresh = () => button.setText(`${labelPrefix}: ${getState() ? 'Ligado' : 'Desligado'}`);
    refresh();
    button.on('pointerup', () => { setState(!getState()); refresh(); });
  }
  private addCycleButton(container: Phaser.GameObjects.Container, row: number, getLabel: () => string, cycle: () => void): void {
    const button = this.styledRowText(container, row, getLabel());
    button.on('pointerup', () => { cycle(); button.setText(getLabel()); });
  }
  private difficultyLabel(): string {
    return this.difficultyStage === null ? 'Dificuldade: Auto' : `Dificuldade: Estágio ${this.difficultyStage + 1}`;
  }
  private cycleDifficulty(): void {
    if (this.difficultyStage === null) this.difficultyStage = 0;
    else if (this.difficultyStage < DIFFICULTY_STAGES.length - 1) this.difficultyStage += 1;
    else this.difficultyStage = null;
    this.host.setForcedDifficultyStage(this.difficultyStage);
  }
  private spawnCapLabel(): string {
    const cap = SANDBOX_SPAWN_CAP_OPTIONS[this.spawnCapIndex];
    return `Limite spawn: ${cap === -1 ? 'Sem limite' : cap}`;
  }
  private cycleSpawnCap(): void {
    this.spawnCapIndex = (this.spawnCapIndex + 1) % SANDBOX_SPAWN_CAP_OPTIONS.length;
    this.host.setEnemySpawnCap(SANDBOX_SPAWN_CAP_OPTIONS[this.spawnCapIndex]);
  }
}
