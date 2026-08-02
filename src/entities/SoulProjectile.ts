import Phaser from 'phaser';

export class SoulProjectile extends Phaser.Physics.Arcade.Sprite {
  public expiresAt = 0;
  public damage = 10;
  public slowPercent = 0.2;
  public slowDurationMs = 5000;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'soul-projectile');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(46, 46).setCircle(13, 19, 19).setDepth(5).disableBody(true, true);
  }

  fire(x: number, y: number, targetX: number, targetY: number, now: number): void {
    this.enableBody(true, x, y, true, true);
    this.expiresAt = now + 6500;
    this.setTexture('soul-projectile');
    this.setDisplaySize(46, 46);
    this.setAlpha(1);
    this.rotation = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.scene.physics.velocityFromRotation(this.rotation, 260, (this.body as Phaser.Physics.Arcade.Body).velocity);
  }

  deactivate(): void {
    this.disableBody(true, true);
  }
}
