import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

const CHARACTERS = [
  { name: 'Barbarian', texture: 'barbarian' },
  { name: 'Mage', texture: 'mage' }
] as const;

export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x151b2b);
    this.add.text(GAME_WIDTH / 2, 190, 'MESA DE BAR SURVIVOR', { fontFamily: 'Arial Black', fontSize: '52px', color: '#f5cf79', stroke: '#3a2435', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 275, 'Sobreviva à horda de esqueletos por três minutos.', { fontFamily: 'Arial', fontSize: '23px', color: '#d8d9e4' }).setOrigin(0.5);
    const start = this.add.text(GAME_WIDTH / 2, 390, 'INICIAR PARTIDA', { fontFamily: 'Arial Black', fontSize: '30px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 28, y: 16 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on('pointerover', () => start.setStyle({ backgroundColor: '#896bd0' }));
    start.on('pointerout', () => start.setStyle({ backgroundColor: '#6b4db3' }));
    start.on('pointerup', () => this.showCharacterSelector());
    this.add.text(GAME_WIDTH / 2, 505, 'WASD / setas: mover   •   Esc: pausar', { fontFamily: 'Arial', fontSize: '18px', color: '#aeb5c9' }).setOrigin(0.5);
  }

  private showCharacterSelector(): void {
    const overlay: Phaser.GameObjects.GameObject[] = [];
    const addOverlay = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      overlay.push(object);
      return object;
    };

    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070910, 0.72).setDepth(10));
    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 600, 360, 0x21182f).setStrokeStyle(3, 0xa888d9).setDepth(11));
    addOverlay(this.add.text(GAME_WIDTH / 2, 230, 'ESCOLHA SEU PERSONAGEM', { fontFamily: 'Arial Black', fontSize: '28px', color: '#ffe29a' }).setOrigin(0.5).setDepth(12));

    CHARACTERS.forEach((character, index) => {
      const x = GAME_WIDTH / 2 - 140 + index * 280;
      const card = addOverlay(this.add.rectangle(x, 390, 190, 200, 0x49326e).setStrokeStyle(3, 0x6b4db3).setDepth(12).setInteractive({ useHandCursor: true }));
      const preview = addOverlay(this.add.image(x, 365, character.texture).setDisplaySize(112, 112).setDepth(13).setInteractive({ useHandCursor: true }));
      const name = addOverlay(this.add.text(x, 470, character.name, { fontFamily: 'Arial Black', fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setDepth(13).setInteractive({ useHandCursor: true }));
      const startGame = (): void => {
        this.scene.start('game', { playerTexture: character.texture });
      };

      card.on('pointerover', () => card.setFillStyle(0x60428d));
      card.on('pointerout', () => card.setFillStyle(0x49326e));
      card.on('pointerup', startGame);
      preview.on('pointerup', startGame);
      name.on('pointerup', startGame);
    });

    const close = addOverlay(this.add.text(GAME_WIDTH / 2, 540, 'CANCELAR', { fontFamily: 'Arial Black', fontSize: '18px', color: '#c9cfe2' }).setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true }));
    close.on('pointerup', () => overlay.forEach((object) => object.destroy()));
  }
}
