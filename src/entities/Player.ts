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
  public lifeStealPercent = 0;
  private invulnerableUntil = 0;
  private readonly animationTexture: string;
  private lastWalkDirection: 'down' | 'left' | 'right' | 'up' = 'down';
  private slows: Array<{ expiresAt: number; percent: number }> = [];

  public armor = 0;
  public facing = new Phaser.Math.Vector2(1, 0);
  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterConfig | string) {
    const texture = typeof character === 'string' ? character : character.texture;
    super(scene, x, y, texture);
    this.animationTexture = texture;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(64, 64).setCollideWorldBounds(true).setDepth(4);
    this.setCircle(18, this.width / 2 - 18, this.height / 2 - 18);
    if (typeof character !== 'string') { this.maxHealth = this.health = character.maxHealth; this.movementSpeed = character.movementSpeed; this.damageMultiplier = character.damageMultiplier; this.attackSpeedMultiplier = character.attackSpeedMultiplier; this.pickupRange = character.pickupRange; this.armor = character.armor; }
  }

  move(direction: Phaser.Math.Vector2): void {
    const isMoving = direction.lengthSq() > 0;
    if (isMoving) {
      direction.normalize();
      this.facing.copy(direction);
      this.playWalkAnimation(direction);
      direction.scale(this.effectiveMovementSpeed());
    } else {
      this.stopWalkAnimation();
    }
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(direction.x, direction.y);
  }

  private playWalkAnimation(direction: Phaser.Math.Vector2): void {
    this.lastWalkDirection = Math.abs(direction.x) > Math.abs(direction.y)
      ? direction.x > 0 ? 'right' : 'left'
      : direction.y > 0 ? 'down' : 'up';
    const key = `${this.animationTexture}-walk-${this.lastWalkDirection}`;
    if (this.scene.anims.exists(key)) this.play(key, true);
  }

  private stopWalkAnimation(): void {
    if (this.anims.isPlaying) this.anims.stop();
    this.setFrame(this.idleFrameForLastDirection());
  }

  private idleFrameForLastDirection(): number {
    switch (this.lastWalkDirection) {
      case 'left': return 4;
      case 'right': return 8;
      case 'up': return 12;
      default: return 0;
    }
  }

  damage(amount: number, now: number): boolean {
    if (now < this.invulnerableUntil) return false;
    this.health = Math.max(0, this.health - Math.max(1, amount - this.armor));
    this.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
    this.setTint(0xff8b8b);
    this.scene.time.delayedCall(130, () => this.clearTint());
    return true;
  }

  applySlow(percent: number, durationMs: number, now: number): void {
    this.slows.push({ expiresAt: now + durationMs, percent });
    this.setTint(0x8bbcff);
    this.scene.time.delayedCall(160, () => this.clearTint());
  }

  addLifeSteal(): void {
    this.lifeStealPercent += this.lifeStealPercent === 0 ? 0.005 : 0.0025;
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  private effectiveMovementSpeed(): number {
    const now = this.scene.time.now;
    this.slows = this.slows.filter((slow) => slow.expiresAt > now);
    const slowAmount = this.slows.reduce((total, slow) => total + slow.percent, 0);
    const slowMultiplier = Math.max(0.25, 1 - slowAmount);
    return this.movementSpeed * slowMultiplier;
  }
}
