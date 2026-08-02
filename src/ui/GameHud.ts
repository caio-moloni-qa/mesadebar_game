import Phaser from 'phaser';

export class GameHud {
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly expBar: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '20px', color: '#f7f1dc', stroke: '#14101c', strokeThickness: 4 };
    this.healthText = scene.add.text(26, 22, '', style).setScrollFactor(0).setDepth(20);
    this.levelText = scene.add.text(26, 82, '', style).setScrollFactor(0).setDepth(20);
    this.timerText = scene.add.text(640, 22, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
    this.killsText = scene.add.text(1254, 22, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
    this.healthBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
    this.expBar = scene.add.graphics().setScrollFactor(0).setDepth(20);
  }

  update(health: number, maxHealth: number, level: number, experience: number, needed: number, elapsedMs: number, kills: number): void {
    this.healthText.setText(`Vida ${Math.ceil(health)} / ${maxHealth}`);
    this.levelText.setText(`Nível ${level}`);
    this.timerText.setText(`Sobreviva: ${this.formatTime(elapsedMs)}`);
    this.killsText.setText(`Eliminações: ${kills}`);
    this.drawBar(this.healthBar, 26, 52, 250, health / maxHealth, 0xd94d59);
    this.drawBar(this.expBar, 26, 112, 250, experience / needed, 0x58b8e8);
  }

  private drawBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, ratio: number, color: number): void {
    graphics.clear().fillStyle(0x0b0d14, 0.8).fillRoundedRect(x, y, width, 12, 4).fillStyle(color).fillRoundedRect(x, y, Math.max(0, width * ratio), 12, 4);
  }
  private formatTime(ms: number): string { const seconds = Math.max(0, Math.ceil((180000 - ms) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
}
