import Phaser from 'phaser';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  public damage = 0;
  public remainingPierces = 0;
  public expiresAt = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'bolt');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(6).setDepth(5).disableBody(true, true);
  }

  fire(x: number, y: number, targetX: number, targetY: number, damage: number, speed: number, lifetime: number, pierces: number, now: number): void {
    this.enableBody(true, x, y, true, true);
    this.damage = damage;
    this.remainingPierces = pierces;
    this.expiresAt = now + lifetime;
    this.rotation = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.scene.physics.velocityFromRotation(this.rotation, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
  }

  deactivate(): void { this.disableBody(true, true); }
}
