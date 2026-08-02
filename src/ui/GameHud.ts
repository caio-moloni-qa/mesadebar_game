import Phaser from 'phaser';
import { FONT_FAMILY } from '../config/fonts';

interface SafeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
}

export class GameHud {
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly healthIcon: Phaser.GameObjects.Image;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly healthBorder: Phaser.GameObjects.Image;
  private readonly expBar: Phaser.GameObjects.Graphics;
  private readonly expBorder: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#f7f1dc', stroke: '#14101c', strokeThickness: 4 };
    this.healthText = scene.add.text(0, 0, '', style).setScrollFactor(0).setDepth(23);
    this.levelText = scene.add.text(0, 0, '', style).setScrollFactor(0).setDepth(20);
    this.timerText = scene.add.text(0, 0, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
    this.killsText = scene.add.text(0, 0, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
    this.healthIcon = scene.add.image(0, 0, 'hp-icon').setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.healthBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
    this.healthBorder = scene.add.image(0, 0, 'hp-bar-border').setOrigin(0, 0).setScrollFactor(0).setDepth(21);
    this.expBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
    this.expBorder = scene.add.image(0, 0, 'exp-bar-border').setOrigin(0, 0).setScrollFactor(0).setDepth(21);
  }

  update(health: number, maxHealth: number, level: number, experience: number, needed: number, elapsedMs: number, kills: number): void {
    const safe = this.safeArea();
    const left = safe.left + 26;
    const top = safe.top + 22;
    const healthIconX = left;
    const healthBarX = healthIconX + 32;
    const healthBarY = top + 30;

    this.healthText.setPosition(healthBarX + 140, healthBarY + 16).setOrigin(0.5).setDepth(23);
    this.levelText.setPosition(left, top + 60);
    this.timerText.setPosition(safe.centerX, top);
    this.killsText.setPosition(safe.right - 26, top);

    this.healthText.setText(`${Math.ceil(health)} / ${maxHealth}`);
    this.levelText.setText(`Nível ${level}`);
    this.timerText.setText(`Sobreviva: ${this.formatTime(elapsedMs)}`);
    this.killsText.setText(`Eliminações: ${kills}`);
    this.healthIcon.setPosition(healthIconX, healthBarY).setDisplaySize(32, 32);
    this.drawBar(this.healthBar, healthBarX + 15, healthBarY + 10, 250, 12, health / maxHealth, 0xd94d59, 4);
    this.healthBorder.setPosition(healthBarX, healthBarY).setDisplaySize(280, 32);
    const expWidth = safe.right - safe.left;
    const expScale = expWidth / 1280;
    this.drawBar(this.expBar, safe.left + 76 * expScale, safe.bottom - 23, expWidth - 152 * expScale, 14, experience / needed, 0x58b8e8, 0);
    this.expBorder.setPosition(safe.left, safe.bottom - 32).setDisplaySize(expWidth, 32);
  }

  private drawBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, ratio: number, color: number, radius: number): void {
    const fillWidth = Math.max(0, width * Phaser.Math.Clamp(ratio, 0, 1));
    graphics.clear().fillStyle(0x0b0d14, 0.8);
    if (radius > 0) graphics.fillRoundedRect(x, y, width, height, radius).fillStyle(color).fillRoundedRect(x, y, fillWidth, height, radius);
    else graphics.fillRect(x, y, width, height).fillStyle(color).fillRect(x, y, fillWidth, height);
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
      bottom: gameHeight - top,
      centerX: gameWidth / 2
    };
  }

  private formatTime(ms: number): string {
    const seconds = Math.max(0, Math.ceil((180000 - ms) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
