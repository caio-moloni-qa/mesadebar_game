import Phaser from 'phaser';
import { FONT_FAMILY, MANUSCRIPT_FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('preload'); }
  preload(): void {
    this.load.image('grass-ruins-ground', new URL('../assets/environments/background_greenfield.png', import.meta.url).href);
    this.load.image('mist', new URL('../assets/environments/mist.png', import.meta.url).href);
    // Menu title screen: side-view sky/ground backdrop (MenuScene.createTitleScene) — both already tile seamlessly
    // horizontally as generated, verified with a 2x1 self-tile check before wiring in.
    this.load.image('menu-sky', new URL('../assets/environments/sky_background.png', import.meta.url).href);
    this.load.image('menu-ground', new URL('../assets/environments/grass_ground.png', import.meta.url).href);
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
    // merchant-sheet.png (362x384 per frame, 4 frames) — only frame 0 is used (see MerchantSystem.buildMerchantShop):
    // it's the only one with a fully transparent backdrop, frames 1-3 have a baked-in vignette glow behind the
    // character that would show as a flashing box if animated, so this stays a static single-frame display.
    this.load.spritesheet('merchant-character', new URL('../assets/characters/npcs/merchant-sheet.png', import.meta.url).href, { frameWidth: 362, frameHeight: 384 });
    this.load.image('merchant-divine-blessing-icon', new URL('../assets/upgrades/merchant/merchant-divine-blessing-icon.png', import.meta.url).href);
    this.load.image('merchant-arcane-curse-icon', new URL('../assets/upgrades/merchant/merchant-arcane-curse-icon.png', import.meta.url).href);
    this.load.image('merchant-heal-potion-icon', new URL('../assets/upgrades/merchant/merchant-heal-potion-icon.png', import.meta.url).href);
    this.load.image('merchant-sharp-blade-icon', new URL('../assets/upgrades/merchant/merchant-sharp-blade-icon.png', import.meta.url).href);
    this.load.image('merchant-swift-boots-icon', new URL('../assets/upgrades/merchant/merchant-swift-boots-icon.png', import.meta.url).href);
    this.load.image('merchant-affinity-tome-icon', new URL('../assets/upgrades/merchant/merchant-affinity-tome-icon.png', import.meta.url).href);
    this.load.image('merchant-vitality-elixir-icon', new URL('../assets/upgrades/merchant/merchant-vitality-elixir-icon.png', import.meta.url).href);
    this.load.spritesheet('barbarian', new URL('../assets/characters/players/barbarian-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.image('barbarian-card-idle', new URL('../assets/characters/players/barbarian-card-idle.png', import.meta.url).href);
    this.load.image('barbarian-card-hover', new URL('../assets/characters/players/barbarian-card-hover.png', import.meta.url).href);
    this.load.spritesheet('mage', new URL('../assets/characters/players/mage-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.image('mage-card-idle', new URL('../assets/characters/players/mage-card-idle.png', import.meta.url).href);
    this.load.image('mage-card-hover', new URL('../assets/characters/players/mage-card-hover.png', import.meta.url).href);
    this.load.spritesheet('reliquia', new URL('../assets/characters/players/reliquia-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.image('reliquia-card-idle', new URL('../assets/characters/players/reliquia-card-idle.png', import.meta.url).href);
    this.load.image('reliquia-card-hover', new URL('../assets/characters/players/reliquia-card-hover.png', import.meta.url).href);
    this.load.spritesheet('fabri', new URL('../assets/characters/players/fabri-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.image('fabri-card-idle', new URL('../assets/characters/players/fabri-card-idle.png', import.meta.url).href);
    this.load.image('fabri-card-hover', new URL('../assets/characters/players/fabri-card-hover.png', import.meta.url).href);
    this.load.spritesheet('skeleton-sword', new URL('../assets/characters/enemies/skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('necromancer-wraith', new URL('../assets/characters/enemies/necromancer-wraith-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('apparition-wraith', new URL('../assets/characters/enemies/apparition-wraith-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('super-skeleton', new URL('../assets/characters/enemies/super-skeleton-walk-sheet.png', import.meta.url).href, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('final-boss', new URL('../assets/characters/enemies/final-boss-walk-sheet.png', import.meta.url).href, { frameWidth: 192, frameHeight: 192 });
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
    this.load.image('weapon-banana-icon', new URL('../assets/weapons/banana-boomerang-icon.png', import.meta.url).href);
    this.load.image('banana-peel', new URL('../assets/weapons/banana-peel-icon.png', import.meta.url).href);
    this.load.image('gem', new URL('../assets/pickups/exp-crystal.png', import.meta.url).href);
    this.load.image('xp-orb', new URL('../assets/pickups/xp-orb.png', import.meta.url).href);
    // Cropped from the raw generation (loot-chest-icon.png) to a tight alpha content bbox — the source already
    // has a clean, softly-feathered silhouette (glow + contact shadow baked in, not a big opaque halo), so no
    // fixed-window trick was needed here.
    this.load.image('loot-chest', new URL('../assets/pickups/loot-chest-icon-cropped.png', import.meta.url).href);
    this.load.image('upgrade-damage-icon', new URL('../assets/upgrades/core/damage-icon.png', import.meta.url).href);
    this.load.image('upgrade-cooldown-icon', new URL('../assets/upgrades/core/cooldown-icon.png', import.meta.url).href);
    this.load.image('upgrade-speed-icon', new URL('../assets/upgrades/core/speed-icon.png', import.meta.url).href);
    this.load.image('upgrade-life-steal-icon', new URL('../assets/upgrades/core/life-steal-icon.png', import.meta.url).href);
    this.load.image('upgrade-colossus-arms-icon', new URL('../assets/upgrades/core/colossus-arms-icon.png', import.meta.url).href);
    this.load.image('upgrade-chained-fury-icon', new URL('../assets/upgrades/core/chained-fury-icon.png', import.meta.url).href);
    this.load.image('upgrade-whirlwind-attack-icon', new URL('../assets/upgrades/core/whirlwind-attack-icon.png', import.meta.url).href);
    this.load.image('upgrade-arcane-blessing-icon', new URL('../assets/upgrades/core/arcane-blessing-icon.png', import.meta.url).href);
    this.load.image('upgrade-arcane-bounce-icon', new URL('../assets/upgrades/core/arcane-bounce-icon.png', import.meta.url).href);
    this.load.image('upgrade-wide-bolt-icon', new URL('../assets/upgrades/core/wide-bolt-icon.png', import.meta.url).href);
    this.load.image('upgrade-aura-radius-icon', new URL('../assets/upgrades/core/aura-radius-icon.png', import.meta.url).href);
    this.load.image('upgrade-aura-damage-icon', new URL('../assets/upgrades/core/aura-damage-icon.png', import.meta.url).href);
    this.load.image('upgrade-aura-tick-speed-icon', new URL('../assets/upgrades/core/aura-tick-speed-icon.png', import.meta.url).href);
    this.load.spritesheet('bolt', new URL('../assets/attacks/bolt-lightning-sphere-sheet.png', import.meta.url).href, { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('sword-air-slash', new URL('../assets/attacks/sword-air-slash-sheet.png', import.meta.url).href, { frameWidth: 128, frameHeight: 128 });
    this.load.image('soul-projectile', new URL('../assets/attacks/soul-skull-projectile.png', import.meta.url).href);
    this.load.image('hp-icon', new URL('../assets/ui/hud/hp-icon.png', import.meta.url).href);
    this.load.image('hp-bar-border', new URL('../assets/ui/hud/hp-bar-border.png', import.meta.url).href);
    this.load.image('exp-bar-border', new URL('../assets/ui/hud/exp-bar-border.png', import.meta.url).href);
    // Wood/brass HUD chrome (see config/theme.ts THEME_ASSETS for the 9-slice insets) — replaces the old flat
    // purple rectangles across every panel/button/badge in the game.
    this.load.image('ui-panel-wood', new URL('../assets/ui/theme/wood_plank_background.png', import.meta.url).href);
    this.load.image('ui-upgrade-card-panel', new URL('../assets/ui/theme/upgrade_card_panel_v2.png', import.meta.url).href);
    this.load.image('ui-button-wood', new URL('../assets/ui/theme/button_cta.png', import.meta.url).href);
    this.load.image('ui-badge-wood', new URL('../assets/ui/theme/circular_badge.png', import.meta.url).href);
    // Menu title-screen side panel only (see MenuScene.createSidePanel) — a self-contained scroll shape sized to
    // its own native aspect ratio, not stretched/9-sliced like the other wood chrome.
    this.load.image('ui-parchment-scroll', new URL('../assets/ui/menu/parchment_initial_screen_v2.png', import.meta.url).href);
    this.load.image('ui-game-title', new URL('../assets/ui/menu/venivium_game_title.png', import.meta.url).href);
    // Character-select full-screen backdrop (MenuScene.showCharacterSelector) — native 1672x941 is already
    // ~GAME_WIDTH/GAME_HEIGHT's own aspect ratio, so it displays at 1280x720 with no stretching.
    this.load.image('ui-character-select-parchment', new URL('../assets/ui/menu/parchment_character_selector_v2.png', import.meta.url).href);
    this.load.spritesheet('boss-shield-bolt', new URL('../assets/effects/boss-shield-bolt-sheet.png', import.meta.url).href, { frameWidth: 64, frameHeight: 64 });
    this.load.image('aura-bolt-3', new URL('../assets/effects/aura-bolt-3.png', import.meta.url).href);
  }

  async create(): Promise<void> {
    await this.waitForFonts();
    this.createCharacterAnimations('barbarian');
    this.createCharacterAnimations('mage');
    this.createCharacterAnimations('reliquia');
    this.createCharacterAnimations('fabri');
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
      document.fonts.load(`16px ${TITLE_FONT_FAMILY}`),
      document.fonts.load(`16px ${MANUSCRIPT_FONT_FAMILY}`)
    ]);
    await document.fonts.ready;
  }
}
