import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  preload(): void {
    this.load.image('grass-ruins-ground', new URL('../assets/backgrounds/grass-ruins-ground-tile.png', import.meta.url).href);
    this.load.spritesheet('barbarian', new URL('../assets/characters/barbarian-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('mage', new URL('../assets/characters/mage-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('skeleton-sword', new URL('../assets/characters/skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.image('weapon-staff-icon', new URL('../assets/weapons/staff-icon.png', import.meta.url).href);
    this.load.image('weapon-sword-icon', new URL('../assets/weapons/sword-icon.png', import.meta.url).href);
    this.load.spritesheet('bolt', new URL('../assets/attacks/bolt-lightning-sphere-sheet.png', import.meta.url).href, { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('sword-air-slash', new URL('../assets/attacks/sword-air-slash-sheet.png', import.meta.url).href, { frameWidth: 128, frameHeight: 128 });
  }

  create(): void {
    this.createCharacterAnimations('barbarian');
    this.createCharacterAnimations('mage');
    this.createCharacterAnimations('skeleton-sword');
    this.createAttackAnimations();
    this.makeTexture('gem', 18, 0x46d89c, 0xb4ffdf);
    this.scene.start('menu');
  }

  private createCharacterAnimations(texture: string): void {
    const directions = ['down', 'left', 'right', 'up'];
    directions.forEach((direction, row) => {
      const key = `${texture}-walk-${direction}`;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: row * 4, end: row * 4 + 3 }),
        frameRate: 8,
        repeat: -1
      });
    });
  }

  private createAttackAnimations(): void {
    if (!this.anims.exists('bolt-fly')) {
      this.anims.create({
        key: 'bolt-fly',
        frames: this.anims.generateFrameNumbers('bolt', { start: 0, end: 3 }),
        frameRate: 12,
        repeat: -1
      });
    }

    if (!this.anims.exists('sword-air-slash-swing')) {
      this.anims.create({
        key: 'sword-air-slash-swing',
        frames: this.anims.generateFrameNumbers('sword-air-slash', { start: 0, end: 3 }),
        frameRate: 18,
        repeat: 0
      });
    }
  }

  private makeTexture(key: string, size: number, fill: number, stroke: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(fill).fillCircle(size / 2, size / 2, size / 2 - 2).lineStyle(2, stroke).strokeCircle(size / 2, size / 2, size / 2 - 2);
    graphics.generateTexture(key, size, size); graphics.destroy();
  }
}
