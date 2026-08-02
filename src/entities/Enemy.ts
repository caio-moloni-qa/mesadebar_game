import Phaser from 'phaser';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public health = 0;
  public experience = 0;
  private lastWalkDirection: 'down' | 'left' | 'right' | 'up' = 'down';

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'skeleton-sword');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(62, 62).setDepth(3);
    this.setCircle(18, this.width / 2 - 18, this.height / 2 - 18).disableBody(true, true);
  }

  activate(x: number, y: number, health: number, experience: number): void {
    this.enableBody(true, x, y, true, true);
    this.health = health;
    this.experience = experience;
  }

  pursue(target: Phaser.GameObjects.Components.Transform, speed: number): void {
    this.scene.physics.moveToObject(this, target, speed);
    const direction = new Phaser.Math.Vector2(target.x - this.x, target.y - this.y);
    if (direction.lengthSq() > 0) this.playWalkAnimation(direction.normalize());
  }

  private playWalkAnimation(direction: Phaser.Math.Vector2): void {
    this.lastWalkDirection = Math.abs(direction.x) > Math.abs(direction.y)
      ? direction.x > 0 ? 'right' : 'left'
      : direction.y > 0 ? 'down' : 'up';
    const key = `skeleton-sword-walk-${this.lastWalkDirection}`;
    if (this.scene.anims.exists(key)) this.play(key, true);
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.setTint(0xffffff);
    this.scene.time.delayedCall(40, () => this.clearTint());
    return this.health <= 0;
  }

  deactivate(): void {
    if (this.anims.isPlaying) this.anims.stop();
    this.disableBody(true, true);
  }
}
