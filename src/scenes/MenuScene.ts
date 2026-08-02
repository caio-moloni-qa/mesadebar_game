import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x151b2b);
    this.add.text(GAME_WIDTH / 2, 190, 'MESA DE BAR SURVIVOR', { fontFamily: 'Arial Black', fontSize: '52px', color: '#f5cf79', stroke: '#3a2435', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 275, 'Sobreviva à horda de esqueletos por três minutos.', { fontFamily: 'Arial', fontSize: '23px', color: '#d8d9e4' }).setOrigin(0.5);
    const start = this.add.text(GAME_WIDTH / 2, 390, 'INICIAR PARTIDA', { fontFamily: 'Arial Black', fontSize: '30px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 28, y: 16 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on('pointerover', () => start.setStyle({ backgroundColor: '#896bd0' }));
    start.on('pointerout', () => start.setStyle({ backgroundColor: '#6b4db3' }));
    start.on('pointerup', () => this.scene.start('game'));
    this.add.text(GAME_WIDTH / 2, 505, 'WASD / setas: mover   •   Esc: pausar', { fontFamily: 'Arial', fontSize: '18px', color: '#aeb5c9' }).setOrigin(0.5);
  }
}
