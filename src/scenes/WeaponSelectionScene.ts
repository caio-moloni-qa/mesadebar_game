import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';
import { WEAPONS } from '../config/weapons';

export class WeaponSelectionScene extends Phaser.Scene {
  private character!: CharacterConfig;
  constructor() { super('weapon-selection'); }
  init(data: { characterId?: keyof typeof CHARACTERS }): void { if (!data.characterId || !CHARACTERS[data.characterId]) throw new Error('Character selection is required'); this.character = CHARACTERS[data.characterId]; }
  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x151b2b);
    this.add.text(GAME_WIDTH / 2, 120, `${this.character.name}: CHOOSE A WEAPON`, { fontFamily: 'Arial Black', fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5);
    Object.values(WEAPONS).forEach((weapon, index) => {
      const x = 430 + index * 420;
      const startGame = (): void => {
        this.scene.start('game', { characterId: this.character.id, weaponId: weapon.id });
      };
      const card = this.add.rectangle(x, 370, 340, 300, 0x49326e).setStrokeStyle(3, 0xa888d9).setInteractive({ useHandCursor: true });
      const icon = this.add.image(x, 270, `weapon-${weapon.id}-icon`).setDisplaySize(78, 78).setInteractive({ useHandCursor: true });
      const name = this.add.text(x, 335, weapon.name, { fontFamily: 'Arial Black', fontSize: '30px', color: '#fff0c2' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.add.text(x, 430, `${weapon.description}\n\nDamage: ${weapon.baseDamage}\nCooldown: ${weapon.cooldown}ms\nRange: ${weapon.range}`, { fontFamily: 'Arial', fontSize: '17px', color: '#fff', align: 'center', wordWrap: { width: 280 } }).setOrigin(0.5);

      card.on('pointerover', () => card.setFillStyle(0x60428d));
      card.on('pointerout', () => card.setFillStyle(0x49326e));
      card.on('pointerup', startGame);
      icon.on('pointerup', startGame);
      name.on('pointerup', startGame);
    });
    const back = this.add.text(GAME_WIDTH / 2, 610, 'BACK', { fontFamily: 'Arial Black', fontSize: '20px', color: '#c9cfe2' }).setOrigin(0.5).setInteractive({ useHandCursor: true }); back.on('pointerup', () => this.scene.start('menu'));
  }
}
