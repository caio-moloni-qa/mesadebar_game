import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';
import { WEAPONS } from '../config/weapons';
import { SandboxIndicator } from '../systems/SandboxState';
import { THEME, THEME_ASSETS, THEME_TEXT } from '../config/theme';
import { createTextButton, createWoodBadge } from '../ui/uiFactory';

type CharacterCard =
  | { locked: false; character: CharacterConfig }
  | { locked: true };

/** Title-screen backdrop: a side-view sky/grass/dirt scene (menu-sky/menu-ground, both pre-verified as seamless
 *  horizontal tiles) with the roster walking in place on a treadmill-style infinitely-scrolling ground, in the
 *  spirit of a classic platformer title screen. */
/** Native height of the cropped menu-ground source art — cropped tight to where the grass/flower tips actually
 *  become visible (not to alpha.getbbox(), which caught near-zero compression noise far above the real content
 *  and made the grass read as tiny/gappy) down to the dirt's bottom edge. Used to compute the tileScale that fits
 *  it into GROUND_DISPLAY_HEIGHT without stretching/squashing. */
const GROUND_SOURCE_HEIGHT = 745;
const GROUND_DISPLAY_HEIGHT = 225;
const GROUND_TILE_SCALE = GROUND_DISPLAY_HEIGHT / GROUND_SOURCE_HEIGHT;
/** Top edge of the ground strip. The grass's top edge is a jagged blade/flower silhouette, not a flat line —
 *  anchoring walkers' feet exactly here would still read as floating above the grass, so createWalkers sinks them
 *  down past where the grass mass becomes visually solid (~20px) further into the dirt for a bit more visual
 *  grounding. */
const GROUND_TOP_Y = GAME_HEIGHT - GROUND_DISPLAY_HEIGHT;
const GROUND_SCROLL_PX_PER_MS = 0.05;
/** menu-sky has a strong top-to-bottom gradient (dark navy to pale blue), unlike the old flat cartoon sky — at too
 *  small a tileScale, that gradient visibly repeats/resets partway down the visible sky area (0 to GROUND_TOP_Y).
 *  0.65 keeps one vertical tile-repeat (887 native height x 0.65 ≈ 577px) taller than GROUND_TOP_Y (495px) so the
 *  gradient never wraps within view; only the horizontal tiling (already verified seamless) is ever visible. */
const SKY_TILE_SCALE = 0.65;
/** Center panel (createSidePanel) holding the logo/title/CTA, floating centered over the animated sky/ground
 *  backdrop. Sized to the parchment scroll art's own native aspect ratio (filling the full screen height) rather
 *  than an arbitrary width, since it's one self-contained scroll shape, not a stretchable tile/9-slice. */
const PANEL_WIDTH = Math.round(GAME_HEIGHT * THEME_ASSETS.parchmentAspect);
const PANEL_PADDING = 40;

export class MenuScene extends Phaser.Scene {
  private sandboxIndicator!: SandboxIndicator;
  private groundTile?: Phaser.GameObjects.TileSprite;
  constructor() { super('menu'); }

  create(): void {
    this.sandboxIndicator = new SandboxIndicator(this);
    this.createTitleScene();
    this.createSidePanel();
  }

  /** Title/CTA are printed directly onto an ancient-parchment scroll (not a stretched wood tile) — dark ink text
   *  on light parchment, the opposite contrast direction from every other panel in the game, which is dark wood
   *  with light text. */
  private createSidePanel(): void {
    const centerX = GAME_WIDTH / 2;
    const wrapWidth = PANEL_WIDTH - PANEL_PADDING * 2;
    this.add.image(centerX, GAME_HEIGHT / 2, THEME_ASSETS.parchmentTexture).setDisplaySize(PANEL_WIDTH, GAME_HEIGHT);

    const titleWidth = wrapWidth * 0.72;
    this.add.image(centerX, 170, THEME_ASSETS.gameTitleTexture).setDisplaySize(titleWidth, titleWidth / THEME_ASSETS.gameTitleAspect);

    const start = createTextButton(this, centerX, 420, 'JOGAR', { fontSize: '20px' });
    start.on('pointerup', () => this.showCharacterSelector());
  }

  update(_time: number, delta: number): void {
    this.sandboxIndicator.update();
    if (this.groundTile) this.groundTile.tilePositionX += delta * GROUND_SCROLL_PX_PER_MS;
  }

  private createTitleScene(): void {
    // Static backdrop — deliberately not scrolled, so the only thing that visibly moves is the ground,
    // keeping the "forward treadmill" motion read clearly instead of competing with parallax.
    this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'menu-sky').setTileScale(SKY_TILE_SCALE, SKY_TILE_SCALE);
    this.groundTile = this.add.tileSprite(GAME_WIDTH / 2, GROUND_TOP_Y, GAME_WIDTH, GROUND_DISPLAY_HEIGHT, 'menu-ground').setOrigin(0.5, 0).setTileScale(GROUND_TILE_SCALE, GROUND_TILE_SCALE);
  }

  /** The whole screen (parchment backdrop + title + roster) lives in one Container that starts off-screen at
   *  x=GAME_WIDTH and tweens to x=0 — "pulling" the scroll on screen from right to left in one motion, per the
   *  reference. No dedicated info panel: each roster badge owns its own details, revealed by renderCharacterCard
   *  sliding a small wood card down from beneath the badge on click, and selecting a character slides it to the
   *  front with a VOLTAR button to undo (see selectCard). */
  private showCharacterSelector(): void {
    const container = this.add.container(GAME_WIDTH, 0).setDepth(10);
    const addToScroll = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      container.add(object);
      return object;
    };

    addToScroll(this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, THEME_ASSETS.characterSelectTexture).setDisplaySize(GAME_WIDTH, GAME_HEIGHT));

    const centerX = GAME_WIDTH / 2;

    const cards: CharacterCard[] = [
      { locked: false, character: CHARACTERS.barbarian },
      { locked: false, character: CHARACTERS.mage },
      { locked: false, character: CHARACTERS.reliquia },
      { locked: false, character: CHARACTERS.fabri }
    ];
    const spacing = 260;
    const startX = centerX - ((cards.length - 1) * spacing) / 2;
    // Only one card's detail slide-down stays open at a time — each card calls detailsState.close (set by
    // whichever card opened last) before opening its own, so picking a new character collapses the previous one.
    const detailsState: { close?: () => void } = {};

    // Toggling `.input.enabled` (rather than disableInteractive/setInteractive) hides a card from clicks while
    // preserving its original hit-area/cursor config exactly, so re-enabling it later needs no reconfiguration.
    const setCardInteractive = (card: Phaser.GameObjects.Container, enabled: boolean): void => {
      card.list.forEach((child) => {
        const interactive = (child as Phaser.GameObjects.GameObject).input;
        if (interactive) interactive.enabled = enabled;
      });
    };

    // Picking a character clears the rest of the roster out and slides the chosen card into the first slot,
    // freeing up the row for whatever comes next (weapon picker rework) — see renderCharacterCard's onSelect.
    // VOLTAR reverses all of it: restores the hidden cards, slides the chosen one back to its own slot, and
    // un-sticks its hover visuals (see deselect, passed down to renderCharacterCard as onSelect's 2nd argument).
    const cardContainers: Phaser.GameObjects.Container[] = [];
    let activeSelection: { card: Phaser.GameObjects.Container; slotX: number; deselect: () => void } | undefined;

    const backButton = addToScroll(createTextButton(this, centerX, 105, '◀ VOLTAR', { fontSize: '30px' })).setVisible(false);
    backButton.on('pointerup', () => {
      if (!activeSelection) return;
      const { card: selected, slotX, deselect } = activeSelection;
      deselect();
      if (detailsState.close) { detailsState.close(); detailsState.close = undefined; }
      this.tweens.add({ targets: selected, x: slotX, duration: 350, ease: 'Cubic.Out' });
      cardContainers.forEach((card) => {
        if (card === selected) return;
        card.setVisible(true);
        setCardInteractive(card, true);
        this.tweens.add({ targets: card, alpha: 1, duration: 200, ease: 'Sine.Out' });
      });
      activeSelection = undefined;
      backButton.setVisible(false);
    });

    const selectCard = (selected: Phaser.GameObjects.Container, slotX: number, deselect: () => void): void => {
      activeSelection = { card: selected, slotX, deselect };
      cardContainers.forEach((card) => {
        if (card === selected) return;
        setCardInteractive(card, false);
        this.tweens.add({ targets: card, alpha: 0, duration: 200, ease: 'Sine.In', onComplete: () => card.setVisible(false) });
      });
      this.tweens.add({ targets: selected, x: startX, duration: 350, ease: 'Cubic.Out' });
      backButton.setVisible(true);
    };

    cards.forEach((card, index) => {
      const slotX = startX + index * spacing;
      const cardContainer = this.renderCharacterCard(card, slotX, addToScroll, detailsState, selectCard);
      if (cardContainer) cardContainers.push(cardContainer);
    });

    this.tweens.add({ targets: container, x: 0, duration: 550, ease: 'Cubic.Out' });
  }

  /** Roster badge — either a plain wood roundel/turning-sprite portrait, or (see CharacterConfig.cardArt) a
   *  unique full-bleed illustrated card that texture-swaps to an action pose on hover. Either way, the character's
   *  description/stats/advantages/ESCOLHER button live in a wood card that slides down from beneath the name on
   *  click (see detailsState in showCharacterSelector), instead of a separate always-present side panel.
   *
   *  Everything for one card (border, art/badge, name, detail panel) lives in a single Container positioned at
   *  (x, 0) with children at local x=0, so selecting the card is just "tween this container's x" — see onSelect
   *  and showCharacterSelector.selectCard. Returns that container (for the unlocked-card selection flow), or
   *  undefined for the locked/mystery slot, which isn't selectable. */
  private renderCharacterCard(cardData: CharacterCard, x: number, addToScroll: <T extends Phaser.GameObjects.GameObject>(object: T) => T, detailsState: { close?: () => void }, onSelect: (card: Phaser.GameObjects.Container, slotX: number, deselect: () => void) => void): Phaser.GameObjects.Container | undefined {
    const badgeY = 260;
    // Shared card footprint (same border size/position on every card, art or badge alike) so they're directly
    // comparable while sizing is still being dialed in — see CARD_WIDTH/CARD_HEIGHT usage below.
    const CARD_WIDTH = 220;
    const CARD_HEIGHT = 484;
    const cardCenterY = badgeY + 130;
    const cardTop = cardCenterY - CARD_HEIGHT / 2;

    const cardContainer = this.add.container(x, 0);
    addToScroll(cardContainer);
    const addToCard = <T extends Phaser.GameObjects.GameObject>(object: T): T => { cardContainer.add(object); return object; };

    addToCard(this.add.rectangle(0, cardCenterY, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0).setStrokeStyle(3, THEME.buttonBg));

    if (cardData.locked) {
      const roundel = addToCard(createWoodBadge(this, 0, badgeY, 130));
      roundel.setTint(0x4a3a2a).setAlpha(0.75);
      addToCard(this.add.image(0, badgeY, 'barbarian').setDisplaySize(100, 100).setTintFill(0x050506).setAlpha(0.78));
      addToCard(this.add.text(0, badgeY + 100, '????', { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: THEME_TEXT.locked }).setOrigin(0.5));
      return undefined;
    }

    const { character } = cardData;
    const portraitTargets: Phaser.GameObjects.GameObject[] = [];
    // Shared by the art/portrait hover visuals AND the name lift below, so selecting the card (which slides it
    // out from under the cursor) locks every piece of hover feedback together instead of just some of it
    // reverting the instant Phaser notices the pointer no longer overlaps the moving card.
    let isSelected = false;
    let applyCardHover: () => void;
    let revertCardHover: () => void;

    if (character.cardArt) {
      // Full-bleed illustrated card — generated at a fixed 1156x1360 (0.85) native aspect ratio, but stretched to
      // CARD_WIDTH x CARD_HEIGHT here to fill the shared card footprint above; revisit once the final card size
      // is locked in (either regenerate art at that aspect, or switch this to a cropped/cover fit).
      const artCenterY = cardCenterY;
      const art = addToCard(this.add.image(0, artCenterY, character.cardArt.idle).setDisplaySize(CARD_WIDTH, CARD_HEIGHT).setInteractive({ useHandCursor: true }));

      // Idle reads as a muted "silhouette" (desaturated) until hovered, then pops into full color with a gold
      // glow + a slight scale-up as the hover feedback — preFX requires WebGL, so every call is optional-chained
      // and just no-ops under the Canvas fallback (texture swap/scale tween still work either way). Once the card
      // is selected (isSelected), pointerout stops reverting it — the hover look sticks until deselectHover runs.
      const baseScaleX = art.scaleX;
      const baseScaleY = art.scaleY;
      const grayscale = art.preFX?.addColorMatrix();
      grayscale?.grayscale(1);
      let glow: Phaser.FX.Glow | undefined;

      applyCardHover = () => {
        art.setTexture(character.cardArt!.hover);
        grayscale?.reset();
        glow = art.preFX?.addGlow(0xf5cf79, 0, 2, false, 0.1, 20);
        this.tweens.add({ targets: art, scaleX: baseScaleX * 1.08, scaleY: baseScaleY * 1.08, duration: 180, ease: 'Sine.Out' });
      };
      revertCardHover = () => {
        art.setTexture(character.cardArt!.idle);
        grayscale?.grayscale(1);
        if (glow) { art.preFX?.remove(glow); glow = undefined; }
        this.tweens.add({ targets: art, scaleX: baseScaleX, scaleY: baseScaleY, duration: 180, ease: 'Sine.Out' });
      };
      art.on('pointerover', applyCardHover);
      art.on('pointerout', () => { if (!isSelected) revertCardHover(); });
      portraitTargets.push(art);
    } else {
      addToCard(createWoodBadge(this, 0, badgeY, 130));
      const portrait = addToCard(this.add.sprite(0, badgeY, character.texture).setDisplaySize(108, 108).setInteractive({ useHandCursor: true }));

      // "Turns" the portrait in place on hover by stepping through the sheet's own down/left/up/right idle frames
      // (frame 0/4/8/12 — same rows PreloadScene.createCharacterAnimations uses for the walk cycles), not a
      // literal image rotation. Order matters: down->left->up->right->down reads as one continuous turn;
      // down->left->right would jump-cut past the back-facing pose instead of turning through it. Same
      // isSelected guard as the art path, so a selected badge card keeps turning instead of snapping back.
      const turnKey = `${character.texture}-turn`;
      if (!this.anims.exists(turnKey)) {
        this.anims.create({ key: turnKey, frames: this.anims.generateFrameNumbers(character.texture, { frames: [0, 4, 12, 8] }), frameRate: 6, repeat: -1 });
      }
      applyCardHover = () => portrait.play(turnKey);
      revertCardHover = () => { portrait.stop(); portrait.setFrame(0); };
      portrait.on('pointerover', applyCardHover);
      portrait.on('pointerout', () => { if (!isSelected) revertCardHover(); });
      portraitTargets.push(portrait);
    }

    // Name sits above the card (not below, per the shared CARD_WIDTH/CARD_HEIGHT border) in black bold text — the
    // full-screen backdrop here is light parchment, same contrast issue the "Escolha seu herói" title had before
    // it moved to ink, so this skips straight to black instead of a light theme color.
    const nameY = cardTop - 18;
    const name = addToCard(this.add.text(0, nameY, character.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '28px', color: '#000000', fontStyle: 'bold' }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
    name.on('pointerover', () => name.setColor('#4a2f14'));
    name.on('pointerout', () => name.setColor('#000000'));

    // Name lifts slightly whenever the card is hovered — via the art/portrait OR the name label itself — as
    // extra "this one's hovered" feedback alongside the art's own color/glow/scale hover treatment.
    const liftName = (): void => { this.tweens.add({ targets: name, y: nameY - 16, duration: 150, ease: 'Sine.Out' }); };
    const restoreName = (): void => { this.tweens.add({ targets: name, y: nameY, duration: 150, ease: 'Sine.Out' }); };
    [...portraitTargets, name].forEach((target) => {
      target.on('pointerover', liftName);
      target.on('pointerout', () => { if (!isSelected) restoreName(); });
    });

    // Details now live in a narrow column to the RIGHT of the card (in the room freed up once the other 3 cards
    // hide and this one slides to the front slot) instead of a small box sliding down below it. Panel height
    // matches the card's own CARD_HEIGHT/cardTop exactly, so the two read as one aligned unit — HP/DMG/VEL bars
    // and the affinity/exclusive/bonus rows stack from the top per their actual (variable) height, while
    // ESCOLHER stays pinned near the bottom of the fixed panel regardless of how much space that leaves above it.
    const detailPanelWidth = 406;
    // Left edge of the panel is pinned a fixed gap past the card's right edge, and the panel grows outward from
    // there — so widening detailPanelWidth only ever extends further right, never back over the card itself
    // (the previous fixed detailLocalX grew the panel from its own center, which could eat back into the card).
    const detailGap = 15;
    const detailLocalX = CARD_WIDTH / 2 + detailGap + detailPanelWidth / 2;
    const panelTop = cardTop;
    const panelHeight = CARD_HEIGHT;

    // Plain flat fill of this character's own accentColor (no gradient shading, no wood-plank texture) instead
    // of the shared wood-plank texture — makes each character's info column read as visually "theirs" without
    // looking textured. Pushed in first so everything else draws on top of it.
    const background = this.add.graphics();
    background.fillStyle(character.accentColor, 0.7);
    background.fillRoundedRect(-detailPanelWidth / 2, panelTop, detailPanelWidth, panelHeight, 10);

    const detailObjects: Phaser.GameObjects.GameObject[] = [background];
    const rowWidth = detailPanelWidth - 20;
    const rowLeft = -rowWidth / 2;
    const iconSize = 39;
    const barHeight = 26;
    const barX = rowLeft + iconSize + 8;
    const barWidth = rowWidth - iconSize - 8;

    // HP/DMG/VEL as filled bars (same dark-track + colored-fill language as the in-game HUD's health bar, see
    // GameHud.drawBar) instead of a plain stats line — each normalized against a generous cross-roster max so
    // the fill reads as "how this stacks up," not an absolute 0-100% scale.
    const addStatBar = (y: number, iconKey: string, ratio: number, color: number, valueLabel: string): void => {
      const icon = this.add.image(rowLeft + iconSize / 2, y + barHeight / 2, iconKey).setDisplaySize(iconSize, iconSize);
      const fillWidth = Math.max(0, barWidth * Phaser.Math.Clamp(ratio, 0, 1));
      const bar = this.add.graphics();
      bar.fillStyle(0x0b0d14, 0.85).fillRoundedRect(barX, y, barWidth, barHeight, 4);
      bar.fillStyle(color, 1).fillRoundedRect(barX, y, fillWidth, barHeight, 4);
      bar.lineStyle(1, 0x000000, 0.4).strokeRoundedRect(barX, y, barWidth, barHeight, 4);
      const value = this.add.text(barX + barWidth / 2, y + barHeight / 2, valueLabel, { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#000000' }).setOrigin(0.5);
      detailObjects.push(icon, bar, value);
    };

    // Icon + label row for the weapon-affinity/exclusive-effect/base-bonus lines below the bars — icon is
    // optional (the "Efeito exclusivo" row has none per spec) and text fills the freed-up width when absent.
    const addIconTextRow = (y: number, iconKey: string | null, text: string): number => {
      const textX = iconKey ? barX : rowLeft;
      const textWidth = iconKey ? barWidth : rowWidth;
      const label = this.add.text(textX, y, text, { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000000', align: 'left', lineSpacing: 7, wordWrap: { width: textWidth } }).setOrigin(0, 0);
      detailObjects.push(label);
      if (iconKey) detailObjects.push(this.add.image(rowLeft + iconSize / 2, y + iconSize / 2, iconKey).setDisplaySize(iconSize, iconSize));
      return label.height;
    };

    const inferBonusIcon = (text: string): string | null => {
      const lower = text.toLowerCase();
      if (lower.includes('velocidade')) return 'upgrade-speed-icon';
      if (lower.includes('dano')) return 'weapon-sword-icon';
      if (lower.includes('cura')) return 'hp-icon';
      return null;
    };

    const WEAPON_ICON: Partial<Record<string, string>> = {
      staff: 'weapon-staff-icon',
      sword: 'weapon-sword-icon',
      boomerang: 'weapon-boomerang-icon',
      amulet: 'weapon-amulet-icon',
      whip: 'weapon-whip-icon'
    };

    let cursorY = panelTop + 31;
    addStatBar(cursorY, 'hp-icon', character.maxHealth / 300, 0xd94d59, `${character.maxHealth}`);
    cursorY += barHeight + 18;
    addStatBar(cursorY, 'weapon-sword-icon', character.damageMultiplier / 1.5, 0xe0763a, `x${character.damageMultiplier.toFixed(1)}`);
    cursorY += barHeight + 18;
    addStatBar(cursorY, 'upgrade-speed-icon', character.movementSpeed / 250, 0x7ed957, `${character.movementSpeed}`);
    cursorY += barHeight + 39;

    const weaponId = character.preferredWeaponId;
    const weaponName = weaponId ? WEAPONS[weaponId].name : '';
    const weaponIcon = weaponId ? WEAPON_ICON[weaponId] ?? null : null;
    cursorY += addIconTextRow(cursorY, weaponIcon, `AFINIDADE: ${weaponName}`) + 29;
    cursorY += addIconTextRow(cursorY, null, `Efeito exclusivo: ${character.advantages[1]}`) + 29;
    cursorY += addIconTextRow(cursorY, inferBonusIcon(character.advantages[2]), `Efeito base melhorado: ${character.advantages[2]}`) + 29;

    // No ESCOLHER button anymore — selecting a character shows the detail column AND the weapon panel (same
    // look, listing every weapon) together, instantly, side by side (see buildWeaponPanel). Picking a weapon
    // there is what actually starts the run.
    const { open: openWeaponPanel, close: closeWeaponPanel } = this.buildWeaponPanel(character, addToCard, detailLocalX + detailPanelWidth / 2, panelTop, panelHeight);

    const detail = this.add.container(detailLocalX, 0).setVisible(false);
    addToCard(detail);
    detail.add(detailObjects);

    const openDetails = (): void => {
      if (detailsState.close) detailsState.close();
      detail.setVisible(true);
      detailsState.close = () => { detail.setVisible(false); closeWeaponPanel(); };
    };

    const selectThisCard = (): void => {
      openDetails();
      openWeaponPanel();
      isSelected = true;
      applyCardHover();
      liftName();
      onSelect(cardContainer, x, () => {
        isSelected = false;
        revertCardHover();
        restoreName();
        closeWeaponPanel();
      });
    };
    [...portraitTargets, name].forEach((target) => target.on('pointerup', selectThisCard));

    return cardContainer;
  }

  /** Weapon-picker panel — same visual language as the character detail column (flat accentColor fill, same
   *  top/height) but listing every weapon in WEAPONS as a clickable row, with the character's own preferredWeaponId
   *  highlighted. Picking a row starts the run directly (this.scene.start('game', ...)) — there's no separate
   *  weapon-selection scene anymore. Lives in its own container (parented via addToCard, same as `detail`) so it
   *  slides/hides together with the card that owns it. */
  private buildWeaponPanel(character: CharacterConfig, addToCard: <T extends Phaser.GameObjects.GameObject>(object: T) => T, leftEdgeLocalX: number, panelTop: number, panelHeight: number): { panel: Phaser.GameObjects.Container; open: () => void; close: () => void } {
    const panelWidth = 380;
    const gap = 0;
    const localX = leftEdgeLocalX + gap + panelWidth / 2;
    const rowLeft = -(panelWidth - 24) / 2;
    const rowWidth = panelWidth - 24;

    const objects: Phaser.GameObjects.GameObject[] = [];
    const background = this.add.graphics();
    background.fillStyle(character.accentColor, 0.7);
    background.fillRoundedRect(-panelWidth / 2, panelTop, panelWidth, panelHeight, 10);
    objects.push(background);

    objects.push(this.add.text(0, panelTop + 20, 'ARMA INICIAL', { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#000000', fontStyle: 'bold' }).setOrigin(0.5, 0));

    const weaponList = Object.values(WEAPONS);
    const rowGap = 12;
    const rowTop = panelTop + 64;
    const rowHeight = (panelHeight - 64 - 20 - (weaponList.length - 1) * rowGap) / weaponList.length;

    weaponList.forEach((weapon, index) => {
      const rowY = rowTop + index * (rowHeight + rowGap);
      const isPreferred = weapon.id === character.preferredWeaponId;
      const rowBg = this.add.rectangle(0, rowY + rowHeight / 2, rowWidth, rowHeight, 0x000000, isPreferred ? 0.22 : 0.08).setStrokeStyle(isPreferred ? 2 : 0, 0xffe08a, 0.9);
      const icon = this.add.image(rowLeft + 30, rowY + rowHeight / 2, `weapon-${weapon.id}-icon`).setDisplaySize(44, 44);
      const nameText = this.add.text(rowLeft + 64, rowY + 10, weapon.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '16px', color: '#000000' }).setOrigin(0, 0);
      const statsText = this.add.text(rowLeft + 64, rowY + 34, `Dano ${weapon.baseDamage}  Recarga ${weapon.cooldown}ms`, { fontFamily: FONT_FAMILY, fontSize: '11px', color: '#000000' }).setOrigin(0, 0);
      objects.push(rowBg, icon, nameText, statsText);

      // Affinity weapon's row gets the character's own portrait badge on the right, same "this is yours" cue
      // the old weapon-selection screen used per-weapon affinity badges for.
      if (isPreferred) {
        const badgeX = rowLeft + rowWidth - 30;
        const badgeY = rowY + rowHeight / 2;
        objects.push(createWoodBadge(this, badgeX, badgeY, 40));
        objects.push(this.add.image(badgeX, badgeY, character.texture).setDisplaySize(30, 30));
      }

      const hitArea = this.add.rectangle(0, rowY + rowHeight / 2, rowWidth, rowHeight, 0x000000, 0).setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => rowBg.setFillStyle(0x000000, 0.32));
      hitArea.on('pointerout', () => rowBg.setFillStyle(0x000000, isPreferred ? 0.22 : 0.08));
      hitArea.on('pointerup', () => this.scene.start('game', { characterId: character.id, weaponId: weapon.id }));
      objects.push(hitArea);
    });

    const panel = this.add.container(localX, 0).setVisible(false);
    addToCard(panel);
    panel.add(objects);

    const open = (): void => { panel.setVisible(true); };
    const close = (): void => { panel.setVisible(false); };

    return { panel, open, close };
  }
}
