import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';
import { FAMILY_LABELS, WEAPONS, WeaponConfig, WeaponFamily, weaponFamily } from '../config/weapons';
import { SandboxIndicator } from '../systems/SandboxState';

/** Left-to-right display order for family columns. Any family with no weapons yet is simply skipped, so adding a
 *  new family only requires listing it here (and in config/weapons.ts) — no layout math to hand-tune. */
const FAMILY_DISPLAY_ORDER: WeaponFamily[] = ['melee', 'ranged', 'aura'];
// Shrunk again (was 260/300) now that melee has 2 cards (sword+whip) alongside ranged's 2 — 5 total cards across
// 3 families no longer fit at the previous size within GAME_WIDTH. Getting genuinely tight; a wrapping/scrolling
// layout is probably overdue if another weapon gets added to any family after this one.
const CARD_WIDTH = 196;
const CARD_SPACING = 236;
const GROUP_GAP = 70;

export class WeaponSelectionScene extends Phaser.Scene {
  private character!: CharacterConfig;
  private sandboxIndicator!: SandboxIndicator;
  constructor() { super('weapon-selection'); }
  init(data: { characterId?: keyof typeof CHARACTERS }): void { if (!data.characterId || !CHARACTERS[data.characterId]) throw new Error('A seleção de personagem é obrigatória'); this.character = CHARACTERS[data.characterId]; }
  create(): void {
    this.sandboxIndicator = new SandboxIndicator(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x151b2b);
    this.add.text(GAME_WIDTH / 2, 80, `${this.character.name}: DEFINIR AFINIDADE`, { fontFamily: TITLE_FONT_FAMILY, fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5);

    this.renderFamilyGroups();

    const back = this.add.text(GAME_WIDTH / 2, 610, 'VOLTAR', { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#c9cfe2' }).setOrigin(0.5).setInteractive({ useHandCursor: true }); back.on('pointerup', () => this.scene.start('menu'));
  }
  update(): void {
    this.sandboxIndicator.update();
  }
  private renderFamilyGroups(): void {
    const groups = FAMILY_DISPLAY_ORDER
      .map((family) => ({ family, weapons: Object.values(WEAPONS).filter((weapon) => weaponFamily(weapon) === family) }))
      .filter((group) => group.weapons.length > 0);
    const groupWidth = (weaponCount: number): number => (weaponCount - 1) * CARD_SPACING + CARD_WIDTH;
    const totalWidth = groups.reduce((sum, group) => sum + groupWidth(group.weapons.length), 0) + GROUP_GAP * (groups.length - 1);

    let cursorX = GAME_WIDTH / 2 - totalWidth / 2;
    groups.forEach((group) => {
      const width = groupWidth(group.weapons.length);
      this.renderFamilyGroup(group.family, cursorX + width / 2, group.weapons);
      cursorX += width + GROUP_GAP;
    });
  }
  private renderFamilyGroup(family: WeaponFamily, groupCenterX: number, weaponsInFamily: WeaponConfig[]): void {
    this.add.text(groupCenterX, 148, FAMILY_LABELS[family], { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#a888d9' }).setOrigin(0.5);

    const startX = groupCenterX - (CARD_SPACING * (weaponsInFamily.length - 1)) / 2;
    weaponsInFamily.forEach((weapon, index) => this.renderWeaponCard(weapon, startX + index * CARD_SPACING));
  }
  private renderWeaponCard(weapon: WeaponConfig, x: number): void {
    const startGame = (): void => {
      this.scene.start('game', { characterId: this.character.id, weaponId: weapon.id });
    };
    const card = this.add.rectangle(x, 370, CARD_WIDTH, 300, 0x49326e).setStrokeStyle(3, 0xa888d9).setInteractive({ useHandCursor: true });
    const icon = this.add.image(x, 270, `weapon-${weapon.id}-icon`).setDisplaySize(54, 54).setInteractive({ useHandCursor: true });
    const name = this.add.text(x, 335, weapon.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#fff0c2' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.add.text(x, 430, `${weapon.description}\n\nDano: ${weapon.baseDamage}\nRecarga: ${weapon.cooldown}ms\nAlcance: ${weapon.range}`, { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#fff', align: 'center', wordWrap: { width: CARD_WIDTH - 50 } }).setOrigin(0.5);

    const affinityCharacters = Object.values(CHARACTERS).filter((character) => character.preferredWeaponId === weapon.id);
    affinityCharacters.forEach((character, index) => {
      const badgeX = x + (CARD_WIDTH / 2 - 30) - index * 28;
      const badgeY = 235;
      this.add.circle(badgeX, badgeY, 13, 0x2d2145).setStrokeStyle(2, 0xd2b4ff).setDepth(1);
      this.add.image(badgeX, badgeY, character.texture).setDisplaySize(20, 20).setDepth(2);
    });

    card.on('pointerover', () => card.setFillStyle(0x60428d));
    card.on('pointerout', () => card.setFillStyle(0x49326e));
    card.on('pointerup', startGame);
    icon.on('pointerup', startGame);
    name.on('pointerup', startGame);
  }
}
