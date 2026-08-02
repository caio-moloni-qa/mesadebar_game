import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  create(): void {
    this.makeTexture('warrior', 32, 0x5bb7e8, 0xdff9ff);
    this.makeTexture('skeleton', 30, 0xdad6c8, 0x6d5b55);
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
