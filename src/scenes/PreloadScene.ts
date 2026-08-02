import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  preload(): void {
    this.load.image('grass-ruins-ground', new URL('../assets/backgrounds/grass-ruins-ground-tile.png', import.meta.url).href);
    this.load.image('barbarian', new URL('../assets/characters/barbarian-topdown-preview.png', import.meta.url).href);
    this.load.image('mage', new URL('../assets/characters/mage-topdown-preview.png', import.meta.url).href);
    this.load.image('skeleton-sword', new URL('../assets/characters/skeleton-sword-topdown-preview.png', import.meta.url).href);
  }

  create(): void {
    this.makeTexture('bolt', 14, 0x9876ff, 0xffffff);
    this.makeTexture('gem', 18, 0x46d89c, 0xb4ffdf);
    this.scene.start('menu');
  }
  private makeTexture(key: string, size: number, fill: number, stroke: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(fill).fillCircle(size / 2, size / 2, size / 2 - 2).lineStyle(2, stroke).strokeCircle(size / 2, size / 2, size / 2 - 2);
    graphics.generateTexture(key, size, size); graphics.destroy();
  }
}
