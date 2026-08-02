import Phaser from 'phaser';
import { PLAYER_CONFIG } from '../config/balance';
import { CharacterConfig } from '../config/characters';

export class Player extends Phaser.Physics.Arcade.Sprite {
  public health = PLAYER_CONFIG.maxHealth;
  public maxHealth = PLAYER_CONFIG.maxHealth;
  public movementSpeed = PLAYER_CONFIG.movementSpeed;
  public pickupRange = PLAYER_CONFIG.pickupRange;
  public damageMultiplier = 1;
  public attackSpeedMultiplier = 1;
  private invulnerableUntil = 0;

  public armor = 0;
  public facing = new Phaser.Math.Vector2(1, 0);
  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterConfig | string) {
    super(scene, x, y, typeof character === 'string' ? character : character.texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(56, 56).setCollideWorldBounds(true).setDepth(4);
    this.setCircle(16, this.width / 2 - 16, this.height / 2 - 16);
    if (typeof character !== 'string') { this.maxHealth = this.health = character.maxHealth; this.movementSpeed = character.movementSpeed; this.damageMultiplier = character.damageMultiplier; this.attackSpeedMultiplier = character.attackSpeedMultiplier; this.pickupRange = character.pickupRange; this.armor = character.armor; }
  }

  move(direction: Phaser.Math.Vector2): void {
    direction.normalize().scale(this.movementSpeed);
    if (direction.lengthSq() > 0) this.facing.copy(direction).normalize();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(direction.x, direction.y);
  }

  damage(amount: number, now: number): boolean {
    if (now < this.invulnerableUntil) return false;
    this.health = Math.max(0, this.health - Math.max(1, amount - this.armor));
    this.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
    this.setTint(0xff8b8b);
    this.scene.time.delayedCall(130, () => this.clearTint());
    return true;
  }
}
