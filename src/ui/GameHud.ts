import Phaser from 'phaser';

interface SafeArea {
  left: number;
  top: number;
  right: number;
  centerX: number;
}

export class GameHud {
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly expBar: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '20px', color: '#f7f1dc', stroke: '#14101c', strokeThickness: 4 };
    this.healthText = scene.add.text(0, 0, '', style).setScrollFactor(0).setDepth(20);
    this.levelText = scene.add.text(0, 0, '', style).setScrollFactor(0).setDepth(20);
    this.timerText = scene.add.text(0, 0, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
    this.killsText = scene.add.text(0, 0, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
    this.healthBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
    this.expBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
  }

  update(health: number, maxHealth: number, level: number, experience: number, needed: number, elapsedMs: number, kills: number): void {
    const safe = this.safeArea();
    const left = safe.left + 26;
    const top = safe.top + 22;

    this.healthText.setPosition(left, top);
    this.levelText.setPosition(left, top + 60);
    this.timerText.setPosition(safe.centerX, top);
    this.killsText.setPosition(safe.right - 26, top);

    this.healthText.setText(`Vida ${Math.ceil(health)} / ${maxHealth}`);
    this.levelText.setText(`Nível ${level}`);
    this.timerText.setText(`Sobreviva: ${this.formatTime(elapsedMs)}`);
    this.killsText.setText(`Eliminações: ${kills}`);
    this.drawBar(this.healthBar, left, top + 30, 250, health / maxHealth, 0xd94d59);
    this.drawBar(this.expBar, left, top + 90, 250, experience / needed, 0x58b8e8);
  }

  private drawBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, ratio: number, color: number): void {
    graphics.clear().fillStyle(0x0b0d14, 0.8).fillRoundedRect(x, y, width, 12, 4).fillStyle(color).fillRoundedRect(x, y, Math.max(0, width * ratio), 12, 4);
  }

  private safeArea(): SafeArea {
    const gameWidth = this.scene.scale.gameSize.width;
    const gameHeight = this.scene.scale.gameSize.height;
    const parentWidth = this.scene.scale.parentSize.width || gameWidth;
    const parentHeight = this.scene.scale.parentSize.height || gameHeight;
    const scale = Math.max(parentWidth / gameWidth, parentHeight / gameHeight);
    const visibleWidth = parentWidth / scale;
    const visibleHeight = parentHeight / scale;
    const left = Math.max(0, (gameWidth - visibleWidth) / 2);
    const top = Math.max(0, (gameHeight - visibleHeight) / 2);

    return {
      left,
      top,
      right: gameWidth - left,
      centerX: gameWidth / 2
    };
  }

  private formatTime(ms: number): string {
    const seconds = Math.max(0, Math.ceil((180000 - ms) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
