import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';
import { WEAPONS, WeaponConfig, WeaponFamily, weaponFamily } from '../config/weapons';
import { SandboxIndicator } from '../systems/SandboxState';

const FAMILY_LABELS: Record<WeaponFamily, string> = { melee: 'CORPO A CORPO', ranged: 'À DISTÂNCIA' };

export class WeaponSelectionScene extends Phaser.Scene {
  private character!: CharacterConfig;
  private sandboxIndicator!: SandboxIndicator;
  constructor() { super('weapon-selection'); }
  init(data: { characterId?: keyof typeof CHARACTERS }): void { if (!data.characterId || !CHARACTERS[data.characterId]) throw new Error('A seleção de personagem é obrigatória'); this.character = CHARACTERS[data.characterId]; }
  create(): void {
    this.sandboxIndicator = new SandboxIndicator(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x151b2b);
    this.add.text(GAME_WIDTH / 2, 80, `${this.character.name}: DEFINIR AFINIDADE`, { fontFamily: TITLE_FONT_FAMILY, fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5);

    const meleeWeapons = Object.values(WEAPONS).filter((weapon) => weaponFamily(weapon) === 'melee');
    const rangedWeapons = Object.values(WEAPONS).filter((weapon) => weaponFamily(weapon) === 'ranged');
    this.renderFamilyGroup('melee', 220, meleeWeapons);
    this.renderFamilyGroup('ranged', 840, rangedWeapons);

    const back = this.add.text(GAME_WIDTH / 2, 610, 'VOLTAR', { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#c9cfe2' }).setOrigin(0.5).setInteractive({ useHandCursor: true }); back.on('pointerup', () => this.scene.start('menu'));
  }
  update(): void {
    this.sandboxIndicator.update();
  }
  private renderFamilyGroup(family: WeaponFamily, groupCenterX: number, weaponsInFamily: WeaponConfig[]): void {
    this.add.text(groupCenterX, 148, FAMILY_LABELS[family], { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#a888d9' }).setOrigin(0.5);

    const cardSpacing = 380;
    const startX = groupCenterX - (cardSpacing * (weaponsInFamily.length - 1)) / 2;
    weaponsInFamily.forEach((weapon, index) => this.renderWeaponCard(weapon, startX + index * cardSpacing));
  }
  private renderWeaponCard(weapon: WeaponConfig, x: number): void {
    const startGame = (): void => {
      this.scene.start('game', { characterId: this.character.id, weaponId: weapon.id });
    };
    const card = this.add.rectangle(x, 370, 330, 300, 0x49326e).setStrokeStyle(3, 0xa888d9).setInteractive({ useHandCursor: true });
    const icon = this.add.image(x, 270, `weapon-${weapon.id}-icon`).setDisplaySize(78, 78).setInteractive({ useHandCursor: true });
    const name = this.add.text(x, 335, weapon.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '30px', color: '#fff0c2' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.add.text(x, 430, `${weapon.description}\n\nDano: ${weapon.baseDamage}\nRecarga: ${weapon.cooldown}ms\nAlcance: ${weapon.range}`, { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#fff', align: 'center', wordWrap: { width: 280 } }).setOrigin(0.5);

    const affinityCharacters = Object.values(CHARACTERS).filter((character) => character.preferredWeaponId === weapon.id);
    affinityCharacters.forEach((character, index) => {
      const badgeX = x + 130 - index * 42;
      const badgeY = 235;
      this.add.circle(badgeX, badgeY, 19, 0x2d2145).setStrokeStyle(2, 0xd2b4ff).setDepth(1);
      this.add.image(badgeX, badgeY, character.texture).setDisplaySize(28, 28).setDepth(2);
    });

    card.on('pointerover', () => card.setFillStyle(0x60428d));
    card.on('pointerout', () => card.setFillStyle(0x49326e));
    card.on('pointerup', startGame);
    icon.on('pointerup', startGame);
    name.on('pointerup', startGame);
  }
}
