import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  preload(): void {
    this.load.image('grass-ruins-ground', new URL('../assets/backgrounds/grass-ruins-ground-tile.png', import.meta.url).href);
    this.load.spritesheet('barbarian', new URL('../assets/characters/barbarian-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('mage', new URL('../assets/characters/mage-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('skeleton-sword', new URL('../assets/characters/skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('necromancer-wraith', new URL('../assets/characters/necromancer-wraith-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('apparition-wraith', new URL('../assets/characters/apparition-wraith-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('super-skeleton', new URL('../assets/characters/super-skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('final-boss', new URL('../assets/characters/final-boss-walk-sheet.png', import.meta.url).href, { frameWidth: 192, frameHeight: 192 });
    this.load.svg('game-icon', new URL('../assets/icons/game-icon.svg', import.meta.url).href, { width: 192, height: 192 });
    this.load.image('weapon-staff-icon', new URL('../assets/weapons/staff-icon.png', import.meta.url).href);
    this.load.image('weapon-sword-icon', new URL('../assets/weapons/sword-icon.png', import.meta.url).href);
    this.load.image('weapon-boomerang-icon', new URL('../assets/weapons/boomerang-icon.png', import.meta.url).href);
    this.load.image('gem', new URL('../assets/pickups/exp-crystal.png', import.meta.url).href);
    this.load.image('xp-orb', new URL('../assets/pickups/xp-orb.png', import.meta.url).href);
    this.load.image('upgrade-damage-icon', new URL('../assets/upgrades/damage-icon.png', import.meta.url).href);
    this.load.image('upgrade-cooldown-icon', new URL('../assets/upgrades/cooldown-icon.png', import.meta.url).href);
    this.load.image('upgrade-speed-icon', new URL('../assets/upgrades/speed-icon.png', import.meta.url).href);
    this.load.image('upgrade-life-steal-icon', new URL('../assets/upgrades/life-steal-icon.png', import.meta.url).href);
    this.load.image('upgrade-colossus-arms-icon', new URL('../assets/upgrades/colossus-arms-icon.png', import.meta.url).href);
    this.load.image('upgrade-chained-fury-icon', new URL('../assets/upgrades/chained-fury-icon.png', import.meta.url).href);
    this.load.image('upgrade-whirlwind-attack-icon', new URL('../assets/upgrades/whirlwind-attack-icon.png', import.meta.url).href);
    this.load.image('upgrade-arcane-blessing-icon', new URL('../assets/upgrades/arcane-blessing-icon.png', import.meta.url).href);
    this.load.image('upgrade-arcane-bounce-icon', new URL('../assets/upgrades/arcane-bounce-icon.png', import.meta.url).href);
    this.load.image('upgrade-wide-bolt-icon', new URL('../assets/upgrades/wide-bolt-icon.png', import.meta.url).href);
    this.load.spritesheet('bolt', new URL('../assets/attacks/bolt-lightning-sphere-sheet.png', import.meta.url).href, { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('sword-air-slash', new URL('../assets/attacks/sword-air-slash-sheet.png', import.meta.url).href, { frameWidth: 128, frameHeight: 128 });
    this.load.image('soul-projectile', new URL('../assets/attacks/soul-skull-projectile.png', import.meta.url).href);
    this.load.image('hp-icon', new URL('../assets/ui/hp-icon.png', import.meta.url).href);
    this.load.image('hp-bar-border', new URL('../assets/ui/hp-bar-border.png', import.meta.url).href);
    this.load.image('exp-bar-border', new URL('../assets/ui/exp-bar-border.png', import.meta.url).href);
    this.load.spritesheet('boss-shield-bolt', new URL('../assets/effects/boss-shield-bolt-sheet.png', import.meta.url).href, { frameWidth: 64, frameHeight: 64 });
  }

  async create(): Promise<void> {
    await this.waitForFonts();
    this.createCharacterAnimations('barbarian');
    this.createCharacterAnimations('mage');
    this.createCharacterAnimations('skeleton-sword');
    this.createCharacterAnimations('necromancer-wraith');
    this.createCharacterAnimations('apparition-wraith');
    this.createCharacterAnimations('super-skeleton');
    this.createCharacterAnimations('final-boss', 4);
    this.createAttackAnimations();
    this.createEffectAnimations();
    this.scene.start('menu');
  }

  private createCharacterAnimations(texture: string, frameRate = 8): void {
    const directions = ['down', 'left', 'right', 'up'];
    directions.forEach((direction, row) => {
      const key = `${texture}-walk-${direction}`;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: row * 4, end: row * 4 + 3 }),
        frameRate,
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

  private createEffectAnimations(): void {
    if (!this.anims.exists('boss-shield-bolt-flicker')) {
      this.anims.create({
        key: 'boss-shield-bolt-flicker',
        frames: this.anims.generateFrameNumbers('boss-shield-bolt', { start: 0, end: 3 }),
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
