import Phaser from 'phaser';

export class ExperienceGem extends Phaser.Physics.Arcade.Sprite {
  public value = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'gem');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(20, 20).setCircle(8).setDepth(2).disableBody(true, true);
  }

  activate(x: number, y: number, value: number): void {
    this.enableBody(true, x, y, true, true);
    this.value = value;
  }

  attract(player: Phaser.GameObjects.Components.Transform, range: number): void {
    if (Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) <= range) {
      this.scene.physics.moveToObject(this, player, 300);
    } else (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  deactivate(): void { this.disableBody(true, true); }
}
