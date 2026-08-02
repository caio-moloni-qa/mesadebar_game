import Phaser from 'phaser';
import { PLAYER_CONFIG } from '../config/balance';

export class Player extends Phaser.Physics.Arcade.Sprite {
  public health = PLAYER_CONFIG.maxHealth;
  public maxHealth = PLAYER_CONFIG.maxHealth;
  public movementSpeed = PLAYER_CONFIG.movementSpeed;
  public pickupRange = PLAYER_CONFIG.pickupRange;
  public damageMultiplier = 1;
  public attackSpeedMultiplier = 1;
  private invulnerableUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(56, 56).setCollideWorldBounds(true).setDepth(4);
    this.setCircle(16, this.width / 2 - 16, this.height / 2 - 16);
  }

  move(direction: Phaser.Math.Vector2): void {
    direction.normalize().scale(this.movementSpeed);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(direction.x, direction.y);
  }

  damage(amount: number, now: number): boolean {
    if (now < this.invulnerableUntil) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
    this.setTint(0xff8b8b);
    this.scene.time.delayedCall(130, () => this.clearTint());
    return true;
  }
}
