import Phaser from 'phaser';

export class LootChest extends Phaser.Physics.Arcade.Sprite {
  private readonly aura: Phaser.GameObjects.Arc;
  private auraPulse?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'loot-chest');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(46, 46).setCircle(15).setDepth(2).disableBody(true, true);
    // Sits behind the chest sprite (lower depth) so it reads as a glow surrounding it, not covering the art.
    this.aura = scene.add.circle(0, 0, 34, 0xffd75e, 0.22).setStrokeStyle(2, 0xffe9a8, 0.85).setDepth(1).setVisible(false);
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
