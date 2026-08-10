import Phaser from 'phaser';

export class HealthPotion extends Phaser.Physics.Arcade.Sprite {
  private readonly aura: Phaser.GameObjects.Arc;
  private auraPulse?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'merchant-heal-potion-icon');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(28, 28).setCircle(this.width / 2).setDepth(2).disableBody(true, true);
    this.aura = scene.add.circle(0, 0, 20, 0x6dff8b, 0.22).setStrokeStyle(2, 0xa8ffc0, 0.85).setDepth(1).setVisible(false);
  }

  activate(x: number, y: number): void {
    this.enableBody(true, x, y, true, true);
    this.aura.setPosition(x, y).setScale(1).setAlpha(1).setVisible(true);
    this.auraPulse?.stop();
    this.auraPulse = this.scene.tweens.add({
      targets: this.aura,
      scale: 1.18,
      alpha: 0.55,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  attract(player: Phaser.GameObjects.Components.Transform, range: number): void {
    if (Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) <= range) {
      this.scene.physics.moveToObject(this, player, 300);
    } else (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.active) this.aura.setPosition(this.x, this.y);
  }

  deactivate(): void {
    this.disableBody(true, true);
    this.auraPulse?.stop();
    this.auraPulse = undefined;
    this.aura.setVisible(false);
  }
}
