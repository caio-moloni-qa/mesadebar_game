import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  preload(): void {
    this.load.image('grass-ruins-ground', new URL('../assets/backgrounds/grass-ruins-ground-tile.png', import.meta.url).href);
    this.load.spritesheet('barbarian', new URL('../assets/characters/barbarian-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('mage', new URL('../assets/characters/mage-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('skeleton-sword', new URL('../assets/characters/skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.image('weapon-staff-icon', new URL('../assets/weapons/staff-icon.png', import.meta.url).href);
    this.load.image('weapon-sword-icon', new URL('../assets/weapons/sword-icon.png', import.meta.url).href);
    this.load.image('weapon-boomerang-icon', new URL('../assets/weapons/boomerang-icon.png', import.meta.url).href);
    this.load.image('gem', new URL('../assets/pickups/exp-crystal.png', import.meta.url).href);
    this.load.image('upgrade-damage-icon', new URL('../assets/upgrades/damage-icon.png', import.meta.url).href);
    this.load.image('upgrade-cooldown-icon', new URL('../assets/upgrades/cooldown-icon.png', import.meta.url).href);
    this.load.image('upgrade-speed-icon', new URL('../assets/upgrades/speed-icon.png', import.meta.url).href);
    this.load.spritesheet('bolt', new URL('../assets/attacks/bolt-lightning-sphere-sheet.png', import.meta.url).href, { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('sword-air-slash', new URL('../assets/attacks/sword-air-slash-sheet.png', import.meta.url).href, { frameWidth: 128, frameHeight: 128 });
    this.load.image('hp-icon', new URL('../assets/ui/hp-icon.png', import.meta.url).href);
    this.load.image('hp-bar-border', new URL('../assets/ui/hp-bar-border.png', import.meta.url).href);
    this.load.image('exp-bar-border', new URL('../assets/ui/exp-bar-border.png', import.meta.url).href);
  }

  async create(): Promise<void> {
    await this.waitForFonts();
    this.createCharacterAnimations('barbarian');
    this.createCharacterAnimations('mage');
    this.createCharacterAnimations('skeleton-sword');
    this.createAttackAnimations();
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

  private async waitForFonts(): Promise<void> {
    if (!document.fonts) return;
    await Promise.all([
      document.fonts.load(`16px ${FONT_FAMILY}`),
      document.fonts.load(`16px ${TITLE_FONT_FAMILY}`)
    ]);
    await document.fonts.ready;
  }
}
