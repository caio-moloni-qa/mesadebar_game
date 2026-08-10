import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  preload(): void {
    this.load.image('grass-ruins-ground', new URL('../assets/backgrounds/background_greenfield.png', import.meta.url).href);
    this.load.image('mist', new URL('../assets/environments/mist.png', import.meta.url).href);
    this.load.image('merchant-store-floor', new URL('../assets/environments/merchant_store_floor.png', import.meta.url).href);
    // merchant_table.png has a lot of transparent padding around the actual table art (1024x1536 canvas, content
    // only ~324x1292) — merchant_table_cropped.png is a tightly-cropped derivative so setDisplaySize scales the
    // visible table itself, not mostly-empty canvas (which was rendering it much smaller/shorter than intended).
    this.load.image('merchant-table', new URL('../assets/environments/merchant_table_cropped.png', import.meta.url).href);
    this.load.image('merchant-wall', new URL('../assets/environments/merchant_store_wall_cropped.png', import.meta.url).href);
    // portal_sheet_cropped.png: raw generation (portal_sheet.png) came back with the gold ring pixel-aligned to
    // within 1px across all 8 grid cells (far tighter than the door ever was) — cropped with a shared fixed
    // window (same rect every frame) purely to trim the ring's empty margin, not to fix any drift.
    this.load.spritesheet('portal', new URL('../assets/environments/portal_sheet_cropped.png', import.meta.url).href, { frameWidth: 384, frameHeight: 427 });
    // Boss-wave end/continue portals (GameScene.onBossWaveCleared): same spin animation as the merchant portal but
    // without its ornate gold ring border, tinted per-purpose (blue = end run, green = continue) via setTint().
    this.load.spritesheet('portal-borderless', new URL('../assets/environments/portal_borderless_sheet.png', import.meta.url).href, { frameWidth: 384, frameHeight: 427 });
    // merchant_sheet.png is cropped from the raw generation (merchant.png) to a shared per-column window — the
    // 4 frames' vertical alignment came out essentially perfect on its own, so no per-frame content-bbox cropping
    // was needed here (unlike the door), just a common crop window to trim the surrounding soft glow.
    this.load.spritesheet('merchant-character', new URL('../assets/characters/merchant_sheet.png', import.meta.url).href, { frameWidth: 384, frameHeight: 362 });
    this.load.image('merchant-divine-blessing-icon', new URL('../assets/upgrades/merchant-divine-blessing-icon.png', import.meta.url).href);
    this.load.image('merchant-arcane-curse-icon', new URL('../assets/upgrades/merchant-arcane-curse-icon.png', import.meta.url).href);
    this.load.image('merchant-heal-potion-icon', new URL('../assets/upgrades/merchant-heal-potion-icon.png', import.meta.url).href);
    this.load.image('merchant-sharp-blade-icon', new URL('../assets/upgrades/merchant-sharp-blade-icon.png', import.meta.url).href);
    this.load.image('merchant-swift-boots-icon', new URL('../assets/upgrades/merchant-swift-boots-icon.png', import.meta.url).href);
    this.load.image('merchant-affinity-tome-icon', new URL('../assets/upgrades/merchant-affinity-tome-icon.png', import.meta.url).href);
    this.load.image('merchant-vitality-elixir-icon', new URL('../assets/upgrades/merchant-vitality-elixir-icon.png', import.meta.url).href);
    this.load.spritesheet('barbarian', new URL('../assets/characters/barbarian-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('mage', new URL('../assets/characters/mage-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('reliquia', new URL('../assets/characters/reliquia-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('skeleton-sword', new URL('../assets/characters/skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('necromancer-wraith', new URL('../assets/characters/necromancer-wraith-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('apparition-wraith', new URL('../assets/characters/apparition-wraith-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('super-skeleton', new URL('../assets/characters/super-skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('final-boss', new URL('../assets/characters/final-boss-walk-sheet.png', import.meta.url).href, { frameWidth: 192, frameHeight: 192 });
    this.load.svg('game-icon', new URL('../assets/icons/game-icon.svg', import.meta.url).href, { width: 192, height: 192 });
    this.load.image('weapon-staff-icon', new URL('../assets/weapons/staff-icon.png', import.meta.url).href);
    this.load.image('weapon-sword-icon', new URL('../assets/weapons/sword-icon.png', import.meta.url).href);
    // Derived from the source 3x3 grid (boss-sword-summon.png, kept in the repo as reference art but not loaded —
    // its 9 cells aren't evenly spaced, so slicing it as a uniform Phaser spritesheet cropped every sword in half).
    // boss-sword-summon-sheet.png re-crops the cleanest growth take (bottom row: spike -> forming -> complete
    // sword) into 3 tightly-bounded, bottom-anchored 260x480 frames so the animation grows from a fixed ground point.
    this.load.spritesheet('boss-sword-summon', new URL('../assets/weapons/boss-sword-summon-sheet.png', import.meta.url).href, { frameWidth: 260, frameHeight: 480 });
    this.load.image('weapon-boomerang-icon', new URL('../assets/weapons/boomerang-icon.png', import.meta.url).href);
    this.load.image('weapon-amulet-icon', new URL('../assets/weapons/aura-amulet-icon.png', import.meta.url).href);
    this.load.image('weapon-whip-icon', new URL('../assets/weapons/whip-icon.png', import.meta.url).href);
    this.load.image('gem', new URL('../assets/pickups/exp-crystal.png', import.meta.url).href);
    this.load.image('xp-orb', new URL('../assets/pickups/xp-orb.png', import.meta.url).href);
    // Cropped from the raw generation (loot-chest-icon.png) to a tight alpha content bbox — the source already
    // has a clean, softly-feathered silhouette (glow + contact shadow baked in, not a big opaque halo), so no
    // fixed-window trick was needed here.
    this.load.image('loot-chest', new URL('../assets/pickups/loot-chest-icon-cropped.png', import.meta.url).href);
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
    this.load.image('upgrade-aura-radius-icon', new URL('../assets/upgrades/aura-radius-icon.png', import.meta.url).href);
    this.load.image('upgrade-aura-damage-icon', new URL('../assets/upgrades/aura-damage-icon.png', import.meta.url).href);
    this.load.image('upgrade-aura-tick-speed-icon', new URL('../assets/upgrades/aura-tick-speed-icon.png', import.meta.url).href);
    this.load.spritesheet('bolt', new URL('../assets/attacks/bolt-lightning-sphere-sheet.png', import.meta.url).href, { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('sword-air-slash', new URL('../assets/attacks/sword-air-slash-sheet.png', import.meta.url).href, { frameWidth: 128, frameHeight: 128 });
    this.load.image('soul-projectile', new URL('../assets/attacks/soul-skull-projectile.png', import.meta.url).href);
    this.load.image('hp-icon', new URL('../assets/ui/hp-icon.png', import.meta.url).href);
    this.load.image('hp-bar-border', new URL('../assets/ui/hp-bar-border.png', import.meta.url).href);
    this.load.image('exp-bar-border', new URL('../assets/ui/exp-bar-border.png', import.meta.url).href);
    this.load.spritesheet('boss-shield-bolt', new URL('../assets/effects/boss-shield-bolt-sheet.png', import.meta.url).href, { frameWidth: 64, frameHeight: 64 });
    this.load.image('aura-bolt-3', new URL('../assets/effects/aura-bolt-3.png', import.meta.url).href);
  }

  async create(): Promise<void> {
    await this.waitForFonts();
    this.createCharacterAnimations('barbarian');
    this.createCharacterAnimations('mage');
    this.createCharacterAnimations('reliquia');
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

    if (!this.anims.exists('boss-sword-summon-grow')) {
      this.anims.create({
        key: 'boss-sword-summon-grow',
        frames: this.anims.generateFrameNumbers('boss-sword-summon', { frames: [0, 1, 2] }),
        frameRate: 5,
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
    if (!this.anims.exists('portal-spin')) {
      this.anims.create({
        key: 'portal-spin',
        frames: this.anims.generateFrameNumbers('portal', { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1
      });
    }
    if (!this.anims.exists('portal-borderless-spin')) {
      this.anims.create({
        key: 'portal-borderless-spin',
        frames: this.anims.generateFrameNumbers('portal-borderless', { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1
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
