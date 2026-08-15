import Phaser from 'phaser';
import { TITLE_FONT_FAMILY } from '../config/fonts';
import { THEME_ASSETS, THEME_CSS, THEME_TEXT } from '../config/theme';

/** Wood panel background for any rectangular card/modal — a seamlessly-tiling plain wood texture (no border baked
 *  in, so no 9-slice/inset math needed) at a fixed grain scale regardless of the panel's own width/height. Drop-in
 *  replacement for the old `scene.add.rectangle(...).setStrokeStyle(...)` panels; same width/height/position
 *  semantics. Pass `tileScale` to override THEME_ASSETS.panelTileScale if a particular panel wants coarser/finer
 *  grain. */
export function createWoodPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, tileScale: number = THEME_ASSETS.panelTileScale): Phaser.GameObjects.TileSprite {
  return scene.add.tileSprite(x, y, width, height, THEME_ASSETS.panelTexture).setTileScale(tileScale, tileScale);
}

/** Bordered gold-frame wood panel for upgrade/level-up/chest-roll cards — 9-sliced (see
 *  THEME_ASSETS.upgradeCardInset) so the corner rivets don't stretch. Distinct from createWoodPanel (which is a
 *  plain borderless tiling texture used everywhere else); these specific cards want the ornate frame back.
 *  Currently unused in favor of createUpgradeCardPanel below — kept in case a future asset is built as a true
 *  tileable 9-slice (this one wasn't: its corner ornamentation is too large to inset at 200-220px card sizes
 *  without cropping, the same failure mode as the panel_rectangular attempt before it). */
export function createBorderedWoodPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, inset: number = THEME_ASSETS.upgradeCardInset): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, THEME_ASSETS.upgradeCardTexture, undefined, width, height, inset, inset, inset, inset);
}

/** Ornate gold-framed wood panel for upgrade/level-up/chest-roll cards — a plain stretched Image (not 9-sliced;
 *  see createBorderedWoodPanel for why) at the card's own aspect ratio (~0.91), which is close enough to every
 *  card size that use it (200x220, 240x280, etc.) that the mild non-uniform stretch is unnoticeable, with none of
 *  the corner-cropping risk a small inset would carry. */
export function createUpgradeCardPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, THEME_ASSETS.upgradeCardTexture).setDisplaySize(width, height);
}

/** Wood medallion for portrait roundels / counter badges — a plain scaled image (circles don't 9-slice). Drop-in
 *  replacement for the old `scene.add.circle(...).setStrokeStyle(...)`; `size` is the full diameter. */
export function createWoodBadge(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, THEME_ASSETS.badgeTexture).setDisplaySize(size, size);
}

/** House button style for every CTA in the game — plain text on a light-brown pill (THEME_CSS.buttonBg,
 *  brightening to buttonHover on hover), no button-image background. Single Text object carries both the
 *  interactive zone and the label, since Phaser's own backgroundColor/padding text style draws the pill. */
export function createTextButton(scene: Phaser.Scene, x: number, y: number, label: string, options: { fontSize?: string; textColor?: string; paddingX?: number; paddingY?: number } = {}): Phaser.GameObjects.Text {
  const fontSize = options.fontSize ?? '22px';
  const button = scene.add.text(x, y, label, {
    fontFamily: TITLE_FONT_FAMILY,
    fontSize,
    color: options.textColor ?? THEME_TEXT.cream,
    backgroundColor: THEME_CSS.buttonBg,
    padding: { x: options.paddingX ?? 24, y: options.paddingY ?? 12 }
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  button.on('pointerover', () => button.setBackgroundColor(THEME_CSS.buttonHover));
  button.on('pointerout', () => button.setBackgroundColor(THEME_CSS.buttonBg));
  return button;
}
