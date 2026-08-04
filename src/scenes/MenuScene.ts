import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';

type CharacterCard =
  | { locked: false; character: CharacterConfig }
  | { locked: true };

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

    const compactScreen = window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(max-height: 900px) and (pointer: coarse)').matches;
    const mobile = compactScreen && this.sys.game.device.input.touch && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
    const controlsHint = mobile ? 'Use o joystick no canto inferior esquerdo para mover' : 'WASD / setas: mover   •   Esc: pausar';
    this.add.text(GAME_WIDTH / 2, 535, controlsHint, { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#aeb5c9' }).setOrigin(0.5);
  }

  private showCharacterSelector(): void {
    const overlay: Phaser.GameObjects.GameObject[] = [];
    const addOverlay = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      overlay.push(object);
      return object;
    };

    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070910, 0.72).setDepth(10));
    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1080, 540, 0x21182f).setStrokeStyle(3, 0xa888d9).setDepth(11));
    addOverlay(this.add.text(GAME_WIDTH / 2, 116, 'ESCOLHA SEU PERSONAGEM', { fontFamily: TITLE_FONT_FAMILY, fontSize: '31px', color: '#ffe29a' }).setOrigin(0.5).setDepth(12));

    const cards: CharacterCard[] = [
      { locked: false, character: CHARACTERS.barbarian },
      { locked: false, character: CHARACTERS.mage },
      { locked: true }
    ];
    const startX = GAME_WIDTH / 2 - 330;
    cards.forEach((card, index) => this.renderCharacterCard(card, startX + index * 330, addOverlay));

    const close = addOverlay(this.add.text(GAME_WIDTH / 2, 608, 'CANCELAR', { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#c9cfe2' }).setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true }));
    close.on('pointerup', () => overlay.forEach((object) => object.destroy()));
  }

  private renderCharacterCard(cardData: CharacterCard, x: number, addOverlay: <T extends Phaser.GameObjects.GameObject>(object: T) => T): void {
    const card = addOverlay(this.add.rectangle(x, 380, 285, 390, cardData.locked ? 0x181421 : 0x49326e).setStrokeStyle(3, cardData.locked ? 0x5f596b : 0xa888d9).setDepth(12));
    addOverlay(this.add.circle(x, 232, 56, cardData.locked ? 0x101018 : 0x2d2145).setStrokeStyle(3, cardData.locked ? 0x504b59 : 0xd2b4ff).setDepth(13));

    if (cardData.locked) {
      addOverlay(this.add.image(x, 232, 'barbarian').setDisplaySize(92, 92).setTintFill(0x050506).setAlpha(0.78).setDepth(14));
      addOverlay(this.add.text(x, 314, '????', { fontFamily: TITLE_FONT_FAMILY, fontSize: '25px', color: '#d9d2e8' }).setOrigin(0.5).setDepth(14));
      addOverlay(this.add.text(x, 430, '????\n????\n????\n????', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#8f899d', align: 'center', lineSpacing: 15 }).setOrigin(0.5).setDepth(14));
      return;
    }

    const { character } = cardData;
    const portrait = addOverlay(this.add.image(x, 232, character.texture).setDisplaySize(98, 98).setDepth(14).setInteractive({ useHandCursor: true }));
    const name = addOverlay(this.add.text(x, 314, character.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '25px', color: '#ffffff' }).setOrigin(0.5).setDepth(14).setInteractive({ useHandCursor: true }));
    addOverlay(this.add.text(x, 354, character.description, { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#e6e0f3', align: 'center', wordWrap: { width: 222 } }).setOrigin(0.5).setDepth(14));

    const stats = `HP ${character.maxHealth}   Dano x${character.damageMultiplier.toFixed(1)}\nVel ${character.movementSpeed}`;
    addOverlay(this.add.text(x, 416, stats, { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#f7d991', align: 'center', lineSpacing: 5 }).setOrigin(0.5).setDepth(14));
    addOverlay(this.add.text(x, 505, character.advantages.join('\n'), { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#f3edff', align: 'center', lineSpacing: 9, wordWrap: { width: 218 } }).setOrigin(0.5).setDepth(14));

    const startGame = (): void => this.showWeaponSelector(character);
    [card, portrait, name].forEach((target) => {
      target.setInteractive({ useHandCursor: true });
      target.on('pointerup', startGame);
    });
    card.on('pointerover', () => card.setFillStyle(0x60428d));
    card.on('pointerout', () => card.setFillStyle(0x49326e));
  }

  private showWeaponSelector(character: CharacterConfig): void {
    this.scene.start('weapon-selection', { characterId: character.id });
  }
}
