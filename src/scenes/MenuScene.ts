import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';
import { WEAPONS } from '../config/weapons';

export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x151b2b);
    this.add.image(GAME_WIDTH / 2, 125, 'game-icon').setDisplaySize(150, 150);
    this.add.text(GAME_WIDTH / 2, 245, 'MESA DE BAR: SOBREVIVÊNCIA', { fontFamily: TITLE_FONT_FAMILY, fontSize: '52px', color: '#f5cf79', stroke: '#3a2435', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 325, 'Sobreviva à horda de esqueletos por três minutos.', { fontFamily: FONT_FAMILY, fontSize: '23px', color: '#d8d9e4' }).setOrigin(0.5);
    const start = this.add.text(GAME_WIDTH / 2, 430, 'INICIAR PARTIDA', { fontFamily: TITLE_FONT_FAMILY, fontSize: '30px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 28, y: 16 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on('pointerover', () => start.setStyle({ backgroundColor: '#896bd0' }));
    start.on('pointerout', () => start.setStyle({ backgroundColor: '#6b4db3' }));
    start.on('pointerup', () => this.showCharacterSelector());
    this.add.text(GAME_WIDTH / 2, 535, 'WASD / setas: mover   •   Esc: pausar', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#aeb5c9' }).setOrigin(0.5);
  }

  private showCharacterSelector(): void {
    const overlay: Phaser.GameObjects.GameObject[] = [];
    const addOverlay = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      overlay.push(object);
      return object;
    };

    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070910, 0.72).setDepth(10));
    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 600, 360, 0x21182f).setStrokeStyle(3, 0xa888d9).setDepth(11));
    addOverlay(this.add.text(GAME_WIDTH / 2, 230, 'ESCOLHA SEU PERSONAGEM', { fontFamily: TITLE_FONT_FAMILY, fontSize: '28px', color: '#ffe29a' }).setOrigin(0.5).setDepth(12));

    Object.values(CHARACTERS).forEach((character, index) => {
      const x = GAME_WIDTH / 2 - 140 + index * 280;
      const card = addOverlay(this.add.rectangle(x, 390, 190, 200, 0x49326e).setStrokeStyle(3, 0x6b4db3).setDepth(12).setInteractive({ useHandCursor: true }));
      const preview = addOverlay(this.add.image(x, 365, character.texture).setDisplaySize(112, 112).setDepth(13).setInteractive({ useHandCursor: true }));
      const name = addOverlay(this.add.text(x, 470, character.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setDepth(13).setInteractive({ useHandCursor: true }));
      const startGame = (): void => this.showWeaponSelector(character);

      card.on('pointerover', () => card.setFillStyle(0x60428d));
      card.on('pointerout', () => card.setFillStyle(0x49326e));
      card.on('pointerup', startGame);
      preview.on('pointerup', startGame);
      name.on('pointerup', startGame);
    });

    const close = addOverlay(this.add.text(GAME_WIDTH / 2, 515, 'CANCELAR', { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#c9cfe2' }).setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true }));
    close.on('pointerup', () => overlay.forEach((object) => object.destroy()));
  }

  private showWeaponSelector(character: CharacterConfig): void {
    this.scene.start('weapon-selection', { characterId: character.id });
  }
}
