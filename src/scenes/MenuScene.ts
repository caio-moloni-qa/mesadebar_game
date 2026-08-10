import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHARACTERS, CharacterConfig } from '../config/characters';
import { SandboxIndicator } from '../systems/SandboxState';

type CharacterCard =
  | { locked: false; character: CharacterConfig }
  | { locked: true };

export class MenuScene extends Phaser.Scene {
  private sandboxIndicator!: SandboxIndicator;
  constructor() { super('menu'); }

  create(): void {
    this.sandboxIndicator = new SandboxIndicator(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2a1d12);
    const x = GAME_WIDTH / 2;
    const y = 125;
    const size = 150;
    this.add.graphics()
      .lineStyle(16, 0xd2b26e, 1)
      .strokeEllipse(x, y, size + 16, size + 16);
    this.add.image(x, y, 'game-icon').setDisplaySize(size, size);
    this.add.text(GAME_WIDTH / 2, 245, 'MESA DE BAR: SOBREVIVÊNCIA', { fontFamily: TITLE_FONT_FAMILY, fontSize: '52px', color: '#f5cf79', stroke: '#3a2435', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 325, 'Sobreviva à horda de esqueletos por três minutos.', { fontFamily: FONT_FAMILY, fontSize: '23px', color: '#d8d9e4' }).setOrigin(0.5);

    const start = this.createMenuButton('INICIAR PARTIDA', GAME_WIDTH / 2, 430, () => this.showCharacterSelector());

    const compactScreen = window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(max-height: 900px) and (pointer: coarse)').matches;
    const mobile = compactScreen && this.sys.game.device.input.touch && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
    const controlsHint = mobile ? 'Use o joystick no canto inferior esquerdo para mover' : 'WASD / setas: mover   •   Esc: pausar';
    this.add.text(GAME_WIDTH / 2, 535, controlsHint, { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#aeb5c9' }).setOrigin(0.5);
  }
  

  update(): void {
    this.sandboxIndicator.update();
  }

  private createMenuButton(text: string, x: number, y: number, action: () => void, depth = 20): Phaser.GameObjects.Container {
    const background = this.add.rectangle(0, 0, 340, 64, 0x3f2f20)
      .setStrokeStyle(4, 0xd2b26e)
      .setDepth(depth);
    const inner = this.add.rectangle(0, 0, 320, 50, 0x2a1d12).setDepth(depth + 1);
    const label = this.add.text(0, 0, text, {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '28px',
      color: '#f8e6b6',
      stroke: '#3a2435',
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(depth + 2);

    const button = this.add.container(x, y, [background, inner, label])
      .setSize(340, 64)
      .setDepth(depth);

    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => inner.setFillStyle(0x5d4429));
    background.on('pointerout', () => inner.setFillStyle(0x2a1d12));
    background.on('pointerup', action);

    return button;
  }

  private showCharacterSelector(): void {
    const overlay: Phaser.GameObjects.GameObject[] = [];
    const addOverlay = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      overlay.push(object);
      return object;
    };

    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x3f2f20, 0.72).setDepth(30).setInteractive());
    addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1080, 570, 0x2a1d12).setStrokeStyle(3, 0x5d4429).setDepth(41));
    addOverlay(this.add.text(GAME_WIDTH / 2, 116, 'ESCOLHA SEU PERSONAGEM', { fontFamily: TITLE_FONT_FAMILY, fontSize: '31px', color: '#ffe29a' }).setOrigin(0.5).setDepth(42));

    const cards: CharacterCard[] = [
      { locked: false, character: CHARACTERS.barbarian },
      { locked: false, character: CHARACTERS.mage },
      { locked: true }
    ];
    const startX = GAME_WIDTH / 2 - 330;
    cards.forEach((card, index) => this.renderCharacterCard(card, startX + index * 330, addOverlay));

    const closeButton = addOverlay(this.createMenuButton('CANCELAR', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 250, () => overlay.forEach((object) => object.destroy()), 46));
    closeButton.setDepth(46);
    closeButton.setScale(0.85);
  }

  private renderCharacterCard(cardData: CharacterCard, x: number, addOverlay: <T extends Phaser.GameObjects.GameObject>(object: T) => T): void {
    const card = addOverlay(this.add.rectangle(x, 380, 285, 390, cardData.locked ? 0x2a1d12 : 0x3f2f20).setStrokeStyle(3, cardData.locked ? 0xd2b26e : 0xd2b26e).setDepth(43));
    addOverlay(this.add.circle(x, 232, 56, cardData.locked ? 0x2a1d12 : 0x3f2f20).setStrokeStyle(3, cardData.locked ? 0xd2b26e : 0xd2b26e).setDepth(44));

    if (cardData.locked) {
      addOverlay(this.add.image(x, 232, 'barbarian').setDisplaySize(92, 92).setTintFill(0x050506).setAlpha(0.78).setDepth(45));
      addOverlay(this.add.text(x, 314, '????', { fontFamily: TITLE_FONT_FAMILY, fontSize: '25px', color: '#d9d2e8' }).setOrigin(0.5).setDepth(45));
      addOverlay(this.add.text(x, 430, '????\n????\n????\n????', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#8f899d', align: 'center', lineSpacing: 15 }).setOrigin(0.5).setDepth(45));
      return;
    }

    const { character } = cardData;
    const portrait = addOverlay(this.add.image(x, 232, character.texture).setDisplaySize(98, 98).setDepth(45).setInteractive({ useHandCursor: true }));
    const name = addOverlay(this.add.text(x, 314, character.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '25px', color: '#ffffff' }).setOrigin(0.5).setDepth(45).setInteractive({ useHandCursor: true }));
    addOverlay(this.add.text(x, 354, character.description, { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#e6e0f3', align: 'center', wordWrap: { width: 222 } }).setOrigin(0.5).setDepth(45));

    const stats = `HP ${character.maxHealth}   Dano x${character.damageMultiplier.toFixed(1)}\nVel ${character.movementSpeed}`;
    addOverlay(this.add.text(x, 416, stats, { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#f7d991', align: 'center', lineSpacing: 5 }).setOrigin(0.5).setDepth(45));
    addOverlay(this.add.text(x, 505, character.advantages.join('\n'), { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#f3edff', align: 'center', lineSpacing: 9, wordWrap: { width: 218 } }).setOrigin(0.5).setDepth(45));

    const startGame = (): void => this.showWeaponSelector(character);
    [card, portrait, name].forEach((target) => {
      target.setInteractive({ useHandCursor: true });
      target.on('pointerup', startGame);
    });
    card.on('pointerover', () => card.setFillStyle(0x5d4429));
    card.on('pointerout', () => card.setFillStyle(0x3f2f20));
  }

  private showWeaponSelector(character: CharacterConfig): void {
    this.scene.start('weapon-selection', { characterId: character.id });
  }
}
