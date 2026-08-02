import Phaser from 'phaser';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public health = 0;
  public experience = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'skeleton-sword');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(54, 54).setDepth(3);
    this.setCircle(16, this.width / 2 - 16, this.height / 2 - 16).disableBody(true, true);
  }

  activate(x: number, y: number, health: number, experience: number): void {
    this.enableBody(true, x, y, true, true);
    this.health = health;
    this.experience = experience;
  }

  pursue(target: Phaser.GameObjects.Components.Transform, speed: number): void {
    this.scene.physics.moveToObject(this, target, speed);
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.setTint(0xffffff);
    this.scene.time.delayedCall(40, () => this.clearTint());
    return this.health <= 0;
  }

  deactivate(): void { this.disableBody(true, true); }
}
