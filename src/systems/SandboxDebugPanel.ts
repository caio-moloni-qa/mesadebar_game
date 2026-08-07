import Phaser from 'phaser';
import { DIFFICULTY_STAGES, ENEMY_CONFIG } from '../config/balance';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { EnemyVariantConfig } from '../entities/Enemy';

const SANDBOX_SPAWN_CAP_OPTIONS = [ENEMY_CONFIG.maxActive, 500, 1000, -1];

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
}

/** F9 debug UI: run-time toggles, spawn/kill shortcuts and difficulty overrides. Owns all sandbox-only state. */
export class SandboxDebugPanel {
  private indicator?: Phaser.GameObjects.Text;
  private panelObjects: Phaser.GameObjects.GameObject[] = [];
  private fogEnabled = true;
  private merchantEnabled = false;
  private skeletonSpawnEnabled = true;
  private variantSpawnEnabled = true;
  private invincible = false;
  private difficultyStage: number | null = null;
  private spawnCapIndex = 0;

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
    const panelX = GAME_WIDTH - 230;
    const panelTop = 110;
    const rowHeight = 38;
    const rows = 16;
    const panelHeight = 44 + rows * rowHeight;
    const background = scene.add.rectangle(panelX, panelTop, 220, panelHeight, 0x14101f, 0.88).setOrigin(0, 0).setStrokeStyle(2, 0x8a6ad8, 0.9).setScrollFactor(0).setDepth(59);
    const title = scene.add.text(panelX + 10, panelTop + 8, 'SANDBOX', { fontFamily: TITLE_FONT_FAMILY, fontSize: '15px', color: '#ffe29a' }).setScrollFactor(0).setDepth(60);
    this.panelObjects = [background, title];
    let row = 0;
    const nextY = () => panelTop + 36 + rowHeight * row++;
    this.addButton(panelX + 10, nextY(), '+100 moedas', () => this.host.addCurrency(100));
    this.addButton(panelX + 10, nextY(), 'Matar inimigos ativos', () => this.host.killAllActiveEnemies());
    this.addToggleButton(panelX + 10, nextY(), 'Mercador', () => this.merchantEnabled, (value) => { this.merchantEnabled = value; });
    this.addToggleButton(panelX + 10, nextY(), 'Névoa', () => this.fogEnabled, (value) => { this.fogEnabled = value; this.host.setMapFogVisible(value); });
    this.addToggleButton(panelX + 10, nextY(), 'Spawn esqueletos', () => this.skeletonSpawnEnabled, (value) => { this.skeletonSpawnEnabled = value; });
    this.addToggleButton(panelX + 10, nextY(), 'Spawn variantes', () => this.variantSpawnEnabled, (value) => { this.variantSpawnEnabled = value; });
    this.addToggleButton(panelX + 10, nextY(), 'Invencível', () => this.invincible, (value) => { this.invincible = value; this.host.setPlayerInvincible(value); });
    this.addCycleButton(panelX + 10, nextY(), () => this.difficultyLabel(), () => this.cycleDifficulty());
    this.addButton(panelX + 10, nextY(), 'Avançar 30s (run)', () => this.host.adjustElapsedMs(30000));
    this.addButton(panelX + 10, nextY(), 'Voltar 30s (run)', () => this.host.adjustElapsedMs(-30000));
    this.addButton(panelX + 10, nextY(), '+10 Esqueletos', () => this.host.spawnVariantNearPlayer('skeleton', 10));
    this.addButton(panelX + 10, nextY(), '+1 Necromante', () => this.host.spawnVariantNearPlayer('necromancerWraith', 1));
    this.addButton(panelX + 10, nextY(), '+5 Aparições', () => this.host.spawnVariantNearPlayer('apparitionWraith', 5));
    this.addButton(panelX + 10, nextY(), '+1 Super Esqueleto', () => this.host.spawnVariantNearPlayer('superSkeleton', 1));
    this.addButton(panelX + 10, nextY(), '+1 Boss Extra', () => this.host.spawnExtraBoss());
    this.addCycleButton(panelX + 10, nextY(), () => this.spawnCapLabel(), () => this.cycleSpawnCap());
  }
  private destroyPanel(): void {
    this.panelObjects.forEach((object) => object.destroy());
    this.panelObjects = [];
  }
  private addButton(x: number, y: number, label: string, action: () => void): void {
    const button = this.host.scene.add.text(x, y, label, { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#ffffff', backgroundColor: '#4d3d80', padding: { x: 8, y: 6 } }).setScrollFactor(0).setDepth(60).setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setStyle({ backgroundColor: '#6b559e' }));
    button.on('pointerout', () => button.setStyle({ backgroundColor: '#4d3d80' }));
    button.on('pointerup', action);
    this.panelObjects.push(button);
  }
  private addToggleButton(x: number, y: number, labelPrefix: string, getState: () => boolean, setState: (value: boolean) => void): void {
    const button = this.host.scene.add.text(x, y, '', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#ffffff', backgroundColor: '#4d3d80', padding: { x: 8, y: 6 } }).setScrollFactor(0).setDepth(60).setInteractive({ useHandCursor: true });
    const refresh = () => button.setText(`${labelPrefix}: ${getState() ? 'Ligado' : 'Desligado'}`);
    refresh();
    button.on('pointerover', () => button.setStyle({ backgroundColor: '#6b559e' }));
    button.on('pointerout', () => button.setStyle({ backgroundColor: '#4d3d80' }));
    button.on('pointerup', () => { setState(!getState()); refresh(); });
    this.panelObjects.push(button);
  }
  private addCycleButton(x: number, y: number, getLabel: () => string, cycle: () => void): void {
    const button = this.host.scene.add.text(x, y, getLabel(), { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#ffffff', backgroundColor: '#4d3d80', padding: { x: 8, y: 6 } }).setScrollFactor(0).setDepth(60).setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setStyle({ backgroundColor: '#6b559e' }));
    button.on('pointerout', () => button.setStyle({ backgroundColor: '#4d3d80' }));
    button.on('pointerup', () => { cycle(); button.setText(getLabel()); });
    this.panelObjects.push(button);
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
