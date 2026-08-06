import Phaser from 'phaser';
import { TITLE_FONT_FAMILY } from '../config/fonts';

export const sandboxState = { enabled: false };

export class SandboxIndicator {
  private readonly text: Phaser.GameObjects.Text;
  private readonly key: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(scene.scale.width - 16, scene.scale.height - 16, 'SANDBOX ATIVO (F9)', {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '16px',
      color: '#8bff8b',
      stroke: '#0a1a0a',
      strokeThickness: 4
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(60);
    this.key = scene.input.keyboard!.addKey('F9');
    this.text.setVisible(sandboxState.enabled);
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.key)) {
      sandboxState.enabled = !sandboxState.enabled;
      this.text.setVisible(sandboxState.enabled);
    }
  }
}
