import Phaser from 'phaser';
import { ENEMY_VARIANTS } from '../config/balance';

export type EnemyVariantId = keyof typeof ENEMY_VARIANTS;

export interface EnemyVariantConfig {
  id: EnemyVariantId;
  maxHealth: number;
  movementSpeed: number;
  contactDamage: number;
  experience: number;
  isStatic?: boolean;
  isMiniBoss?: boolean;
  soulCooldownMs?: number;
  displaySize?: number;
  collisionRadius?: number;
  healthBarWidth?: number;
  texture?: string;
  tint?: number;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public health = 0;
  public maxHealth = 0;
  public experience = 0;
  public contactDamage = 0;
  public variantId: EnemyVariantId = 'skeleton';
  public nextSoulAttackAt = 0;
  private movementSpeed = 0;
  private isStatic = false;
  private isMiniBoss = false;
  private animationTexture = 'skeleton-sword';
  private baseTint?: number;
  private healthBarWidth = 72;
  private healthBarBack?: Phaser.GameObjects.Rectangle;
  private healthBarFill?: Phaser.GameObjects.Rectangle;
  private lastWalkDirection: 'down' | 'left' | 'right' | 'up' = 'down';
  private flashTimer?: Phaser.Time.TimerEvent;
  private hitStunUntil = 0;
  private shakeTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'skeleton-sword');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(62, 62).setDepth(3);
    this.setCircle(18, this.width / 2 - 18, this.height / 2 - 18).disableBody(true, true);
  }

  activate(x: number, y: number, config: EnemyVariantConfig): void {
    this.enableBody(true, x, y, true, true);
    this.variantId = config.id;
    this.health = config.maxHealth;
    this.maxHealth = config.maxHealth;
    this.experience = config.experience;
    this.contactDamage = config.contactDamage;
    this.movementSpeed = config.movementSpeed;
    this.isStatic = Boolean(config.isStatic);
    this.isMiniBoss = Boolean(config.isMiniBoss);
    this.animationTexture = config.texture ?? 'skeleton-sword';
    this.baseTint = config.tint;
    this.healthBarWidth = config.healthBarWidth ?? 72;
    this.nextSoulAttackAt = this.scene.time.now + (config.soulCooldownMs ?? 0);
    this.hitStunUntil = 0;
    this.shakeTween?.stop();
    this.setPosition(x, y);
    this.setTexture(this.animationTexture);
    this.setDisplaySize(config.displaySize ?? 62, config.displaySize ?? 62);
    const collisionRadius = config.collisionRadius ?? 18;
    this.setCircle(collisionRadius, this.width / 2 - collisionRadius, this.height / 2 - collisionRadius);
    this.clearTint();
    if (this.baseTint) this.setTint(this.baseTint);
    this.setAlpha(config.id === 'apparitionWraith' ? 0.82 : 1);
    if (this.scene.anims.exists(`${this.animationTexture}-walk-down`)) this.play(`${this.animationTexture}-walk-down`, true);
    this.updateHealthBar();
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.updateHealthBar();
  }

  pursue(target: Phaser.GameObjects.Components.Transform): void {
    if (this.scene.time.now < this.hitStunUntil) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }
    if (this.isStatic) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }
    this.scene.physics.moveToObject(this, target, this.movementSpeed);
    const direction = new Phaser.Math.Vector2(target.x - this.x, target.y - this.y);
    if (direction.lengthSq() > 0) this.playWalkAnimation(direction.normalize());
  }

  pauseMovement(): void {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  canCastSoul(now: number): boolean {
    const cooldown = ENEMY_VARIANTS.necromancerWraith.soulCooldownMs;
    if (this.variantId !== 'necromancerWraith' || now < this.nextSoulAttackAt) return false;
    this.nextSoulAttackAt = now + cooldown;
    return true;
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.playHitReaction();
    this.updateHealthBar();
    return this.health <= 0;
  }

  deactivate(): void {
    this.flashTimer?.remove(false);
    this.flashTimer = undefined;
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.clearTint();
    this.hitStunUntil = 0;
    this.healthBarWidth = 72;
    this.healthBarBack?.destroy();
    this.healthBarBack = undefined;
    this.healthBarFill?.destroy();
    this.healthBarFill = undefined;
    if (this.anims.isPlaying) this.anims.stop();
    this.disableBody(true, true);
  }

  private playWalkAnimation(direction: Phaser.Math.Vector2): void {
    this.lastWalkDirection = Math.abs(direction.x) > Math.abs(direction.y)
      ? direction.x > 0 ? 'right' : 'left'
      : direction.y > 0 ? 'down' : 'up';
    const key = `${this.animationTexture}-walk-${this.lastWalkDirection}`;
    if (this.scene.anims.exists(key)) this.play(key, true);
  }

  private playHitReaction(): void {
    this.flashTimer?.remove(false);
    this.shakeTween?.stop();
    this.hitStunUntil = this.scene.time.now + 200;
    this.setTintFill(0xffffff);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.shakeTween = this.scene.tweens.add({
      targets: this,
      x: this.x + 3,
      duration: 35,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        this.shakeTween = undefined;
      }
    });
    this.flashTimer = this.scene.time.delayedCall(200, () => {
      this.clearTint();
      if (this.baseTint) this.setTint(this.baseTint);
      this.flashTimer = undefined;
    });
  }

  private updateHealthBar(): void {
    if (!this.active || !this.isMiniBoss) {
      this.healthBarBack?.setVisible(false);
      this.healthBarFill?.setVisible(false);
      return;
    }
    if (!this.healthBarBack) {
      this.healthBarBack = this.scene.add.rectangle(this.x, this.y - this.displayHeight / 2 - 14, this.healthBarWidth, 8, 0x12080a).setDepth(9);
      this.healthBarFill = this.scene.add.rectangle(this.x, this.y - this.displayHeight / 2 - 14, this.healthBarWidth - 4, 4, 0xd94848).setDepth(10);
    }
    const innerWidth = this.healthBarWidth - 4;
    const width = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) * innerWidth;
    const barY = this.y - this.displayHeight / 2 - 14;
    this.healthBarBack.setVisible(true).setPosition(this.x, barY);
    this.healthBarFill?.setVisible(true).setPosition(this.x - innerWidth / 2 + width / 2, barY).setSize(width, 4);
  }
}
