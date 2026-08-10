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
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2a1d12);
    this.add.text(GAME_WIDTH / 2, 80, `${this.character.name}: DEFINIR AFINIDADE`, { fontFamily: TITLE_FONT_FAMILY, fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5);

    const meleeWeapons = Object.values(WEAPONS).filter((weapon) => weaponFamily(weapon) === 'melee');
    const rangedWeapons = Object.values(WEAPONS).filter((weapon) => weaponFamily(weapon) === 'ranged');
    this.renderFamilyGroup('melee', 220, meleeWeapons);
    this.renderFamilyGroup('ranged', 840, rangedWeapons);

    this.createMenuButton('VOLTAR', GAME_WIDTH / 2, 610, () => this.scene.start('menu'));
  }
  update(): void {
    this.sandboxIndicator.update();
  }
  private renderFamilyGroup(family: WeaponFamily, groupCenterX: number, weaponsInFamily: WeaponConfig[]): void {
    this.add.text(groupCenterX, 148, FAMILY_LABELS[family], { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#f8ffea' }).setOrigin(0.5);

    const cardSpacing = 380;
    const startX = groupCenterX - (cardSpacing * (weaponsInFamily.length - 1)) / 2;
    weaponsInFamily.forEach((weapon, index) => this.renderWeaponCard(weapon, startX + index * cardSpacing));
  }
  private renderWeaponCard(weapon: WeaponConfig, x: number): void {
    const startGame = (): void => {
      this.scene.start('game', { characterId: this.character.id, weaponId: weapon.id });
    };

    const card = this.add.rectangle(x, 370, 330, 300, 0x2a1d12).setStrokeStyle(3, 0xd2b26e).setDepth(1).setInteractive({ useHandCursor: true });
    const icon = this.add.image(x, 270, `weapon-${weapon.id}-icon`).setDisplaySize(78, 78).setDepth(2).setInteractive({ useHandCursor: true });
    const name = this.add.text(x, 335, weapon.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '30px', color: '#fff0c2' }).setOrigin(0.5).setDepth(2).setInteractive({ useHandCursor: true });
    this.add.text(x, 430, `${weapon.description}\n\nDano: ${weapon.baseDamage}\nRecarga: ${weapon.cooldown}ms\nAlcance: ${weapon.range}`, { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#fff', align: 'center', wordWrap: { width: 280 } }).setOrigin(0.5).setDepth(2);

    const affinityCharacters = Object.values(CHARACTERS).filter((character) => character.preferredWeaponId === weapon.id);
    affinityCharacters.forEach((character, index) => {
      const badgeX = x + 130 - index * 42;
      const badgeY = 235;
      this.add.circle(badgeX, badgeY, 19, 0x3f2f20).setStrokeStyle(2, 0xd2b26e).setDepth(1);
      this.add.image(badgeX, badgeY, character.texture).setDisplaySize(28, 28).setDepth(2);
    });

    card.on('pointerover', () => card.setFillStyle(0x5d4429));
    card.on('pointerout', () => card.setFillStyle(0x2a1d12));
    card.on('pointerup', startGame);
    icon.on('pointerup', startGame);
    name.on('pointerup', startGame);
  }

  private createMenuButton(text: string, x: number, y: number, action: () => void): Phaser.GameObjects.Container {
    const background = this.add.rectangle(0, 0, 340, 64, 0x3f2f20)
      .setStrokeStyle(4, 0xd2b26e)
      .setDepth(20);
    const inner = this.add.rectangle(0, 0, 320, 50, 0x2a1d12).setDepth(21);
    const label = this.add.text(0, 0, text, {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '28px',
      color: '#f8e6b6',
      stroke: '#3a2435',
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(22);

    const button = this.add.container(x, y, [background, inner, label])
      .setSize(340, 64)
      .setDepth(20);

    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => inner.setFillStyle(0x5d4429));
    background.on('pointerout', () => inner.setFillStyle(0x2a1d12));
    background.on('pointerup', action);

    return button;
  }
}
