import Phaser from 'phaser';

export class BananaPeel extends Phaser.Physics.Arcade.Sprite {
  public expiresAt = 0;
  /** Pulsing gold ring under the peel so it reads clearly against the grass instead of getting lost — same
   *  aura-pulse pattern as HealthPotion, tuned to a warm yellow so it doesn't read as a heal pickup. */
  private readonly glow: Phaser.GameObjects.Arc;
  private glowPulse?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'banana-peel');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(38, 38).setCircle(this.width / 2).setDepth(2).disableBody(true, true);
    this.glow = scene.add.circle(0, 0, 26, 0xffe066, 0.3).setStrokeStyle(2, 0xfff3b0, 0.9).setDepth(1).setVisible(false);
  }

  activate(x: number, y: number, now: number, lifetimeMs: number): void {
    this.enableBody(true, x, y, true, true);
    this.expiresAt = now + lifetimeMs;
    this.glow.setPosition(x, y).setScale(1).setAlpha(1).setVisible(true);
    this.glowPulse?.stop();
    this.glowPulse = this.scene.tweens.add({
      targets: this.glow,
      scale: 1.3,
      alpha: 0.5,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.active) this.glow.setPosition(this.x, this.y);
  }

  deactivate(): void {
    this.disableBody(true, true);
    this.glowPulse?.stop();
    this.glowPulse = undefined;
    this.glow.setVisible(false);
  }
}
