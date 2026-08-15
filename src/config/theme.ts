/** Shared UI chrome palette — aged parchment/dark-wood tavern theme (panels read as dark oak with brass/bronze
 *  trim, matching the loot-chest art's "aged wood + gold metal" language) used across every HUD/menu surface in
 *  place of the old purple palette. Phaser needs numeric 0xRRGGBB for shape fills/strokes and '#rrggbb' strings
 *  for text styles, so each color is exported in both forms — always the same underlying hex value. */

export const THEME = {
  /** Base panel background (side panel, pause screen, character-select panel, sandbox debug panel). */
  panelBg: 0x2b1c10,
  /** Card/button resting fill — one step lighter than panelBg (upgrade cards, weapon cards, merchant cards). */
  panelBgAlt: 0x3f2a17,
  /** Card/button hover fill. */
  panelBgHover: 0x5a3d22,
  /** Locked/disabled card fill (mystery character card). */
  panelBgLocked: 0x1a120a,
  /** Primary border/stroke — aged brass. */
  border: 0xc9963f,
  /** Dim border for locked/disabled elements — dull bronze. */
  borderDim: 0x6b5a3e,
  /** Portrait roundel background (character card headshot circle). */
  roundelBg: 0x241708,
  /** Portrait roundel border — brighter gold than the standard border, for emphasis. */
  roundelBorder: 0xe0b45c,
  /** Full-screen dim overlay behind modal panels (character select, pause, level-up, chest roll, merchant). */
  overlayDim: 0x0d0704,
  /** CTA button resting fill — warm leather brown. */
  buttonBg: 0x7a4a20,
  /** CTA button hover fill. */
  buttonHover: 0x9c6530,
  /** Mobile joystick base/knob. */
  joystickBase: 0x3a2a1a,
  joystickKnob: 0x5a3d22
} as const;

/** CSS-string forms of the THEME numeric colors — Phaser text styles (backgroundColor/stroke) need '#rrggbb'
 *  strings, not numbers, unlike shape fills/strokes. Same underlying hex as THEME, just re-expressed. */
export const THEME_CSS = {
  panelBg: '#2b1c10',
  border: '#c9963f',
  buttonBg: '#7a4a20',
  buttonHover: '#9c6530'
} as const;

/** Pixel-art wood/brass HUD art (see PreloadScene.preload). Button/badge keep their ornate brass border baked into
 *  the art and are 9-sliced (buttonInset) so the border never stretches/distorts. The panel texture is plain
 *  wood with no border at all (see wood_plank_background.png) — no inset math needed there, it's just a
 *  seamlessly-tiling TileSprite at panelTileScale so the grain reads at a consistent pixel density regardless of
 *  the panel's own width/height. */
export const THEME_ASSETS = {
  panelTexture: 'ui-panel-wood',
  buttonTexture: 'ui-button-wood',
  badgeTexture: 'ui-badge-wood',
  panelTileScale: 0.3,
  /** button_cta.png cropped content is 1328x468 — corner rivet block runs to ~70px. */
  buttonInset: 70,
  /** Bordered gold-frame panel (panel_rectangular-raw.png, cropped + flipped vertically) reserved for the
   *  upgrade/level-up/chest-roll cards specifically — everywhere else uses the plain wood panel. Those cards are
   *  only ~200-240px wide, much narrower than the ~90px corner needs to render the rivet uncropped, so this uses a
   *  smaller inset than the source art's true corner size as a deliberate legibility trade-off (see
   *  createBorderedWoodPanel). */
  upgradeCardTexture: 'ui-upgrade-card-panel',
  upgradeCardInset: 50,
  /** Menu title-screen side panel scroll — see MenuScene.createSidePanel. Native content is 1122x1402, displayed
   *  at its own aspect ratio rather than stretched to an arbitrary width/height. */
  parchmentTexture: 'ui-parchment-scroll',
  parchmentAspect: 1122 / 1402,
  /** "VENIVIUM" wordmark, replacing the plain-text title on the menu side panel. Native content is 1440x737. */
  gameTitleTexture: 'ui-game-title',
  gameTitleAspect: 1440 / 737,
  /** Character-select full-screen scroll backdrop — see MenuScene.showCharacterSelector. */
  characterSelectTexture: 'ui-character-select-parchment'
} as const;

export const THEME_TEXT = {
  /** Headline gold — unchanged from the old palette, already warm/on-theme. */
  gold: '#f5cf79',
  /** Standard body text on dark wood panels (card descriptions, stats). */
  cream: '#f3ead2',
  /** Secondary/muted text (close buttons, hints). */
  muted: '#c9b89a',
  /** Locked/mystery card placeholder text. */
  locked: '#8f8368',
  /** Family/group labels, small accent text. */
  accent: '#c9963f',
  /** Dark ink for text printed directly on light parchment (menu side panel) — the light gold/cream tones used
   *  everywhere else have poor contrast against a cream background. */
  ink: '#3a2510'
} as const;
