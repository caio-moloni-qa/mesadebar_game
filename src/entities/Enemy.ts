import Phaser from 'phaser';
import { ENEMY_VARIANTS } from '../config/balance';
import { FONT_FAMILY } from '../config/fonts';

export type EnemyVariantId = keyof typeof ENEMY_VARIANTS;

export interface EnemyVariantConfig {
  id: EnemyVariantId;
  maxHealth: number;
  movementSpeed: number;
  contactDamage: number;
  reward: number;
  currencyDrops?: number;
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
  public reward = 0;
  public currencyDrops = 1;
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
  private healthBarText?: Phaser.GameObjects.Text;
  private lastWalkDirection: 'down' | 'left' | 'right' | 'up' = 'down';
  private flashTimer?: Phaser.Time.TimerEvent;
  private hitStunUntil = 0;
  private shakeTween?: Phaser.Tweens.Tween;
  /** Set by external systems (e.g. BossSystem's shield-dash) while they're already tweening x/y directly, so the hit-reaction shake doesn't fight them over the same property. */
  public suppressHitShake = false;
  /** Super Esqueleto and the final boss carry a constant Rotten Aura — see GameScene.updateRottenAuras() for the proximity check that applies it to the player. */
  public hasRottenAura = false;
  /** Set by BossSystem while the boss is channeling its shield — the aura (visual and effect) is suppressed for that window. */
  public rottenAuraSuppressed = false;
  private rottenAuraVisual?: Phaser.GameObjects.Arc;
  private nextRottenSmokeAt = 0;

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
    this.reward = config.reward;
    this.currencyDrops = config.currencyDrops ?? 1;
    this.contactDamage = config.contactDamage;
    this.movementSpeed = config.movementSpeed;
    this.isStatic = Boolean(config.isStatic);
    this.isMiniBoss = Boolean(config.isMiniBoss);
    this.hasRottenAura = config.id === 'superSkeleton' || config.id === 'finalBoss';
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
    this.updateRottenAuraVisual();
  }

  /** Rotten Aura's radius: roughly half the sprite's display height, so it scales with the enemy (Super Esqueleto vs. the much larger final boss). */
  rottenAuraRadius(): number {
    return this.displayHeight / 2;
  }

  private updateRottenAuraVisual(): void {
    if (!this.active || !this.hasRottenAura || this.rottenAuraSuppressed) {
      this.rottenAuraVisual?.setVisible(false);
      return;
    }
    const radius = this.rottenAuraRadius();
    if (!this.rottenAuraVisual) {
      this.rottenAuraVisual = this.scene.add.circle(this.x, this.y, radius, 0x2b2b2b, 0.35).setStrokeStyle(2, 0x1a1a1a, 0.6).setDepth(2);
    }
    this.rottenAuraVisual.setVisible(true).setPosition(this.x, this.y);
    this.spawnRottenSmoke(radius);
  }

  /** Tiny black "smoke" dots popping up at random points across the whole aura circle (uniform area distribution),
   *  each rising and fading independently — same manually-timed-sprite pattern as BossSystem's shield bolts
   *  (spawnShieldBolts), not a Phaser particle emitter. The emitter+emitZone+startFollow combo this used before was
   *  hard to keep visible in practice; spawning plain rectangles straight off the enemy's current x/y every tick
   *  is simpler and matches the shield bolts' proven "sparks across the whole circle" look. */
  private spawnRottenSmoke(radius: number): void {
    if (this.scene.time.now < this.nextRottenSmokeAt) return;
    this.nextRottenSmokeAt = this.scene.time.now + Phaser.Math.Between(50, 90);
    const count = Phaser.Math.Between(1, 2);
    for (let index = 0; index < count; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Math.sqrt(Math.random()) * radius * 0.92;
      const dot = this.scene.add.rectangle(this.x + Math.cos(angle) * distance, this.y + Math.sin(angle) * distance, 4, 4, 0x0d0d0d, 0.85).setDepth(4);
      this.scene.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(24, 40),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1100),
        ease: 'Quad.Out',
        onComplete: () => dot.destroy()
      });
    }
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

  /** Cancels any in-flight hit-reaction shake so an external x/y tween (e.g. a shield-dash) can take over the position cleanly. */
  stopHitShake(): void {
    this.shakeTween?.stop();
    this.shakeTween = undefined;
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
    this.suppressHitShake = false;
    this.hasRottenAura = false;
    this.rottenAuraSuppressed = false;
    this.rottenAuraVisual?.destroy();
    this.rottenAuraVisual = undefined;
    this.clearTint();
    this.hitStunUntil = 0;
    this.healthBarWidth = 72;
    this.healthBarBack?.destroy();
    this.healthBarBack = undefined;
    this.healthBarFill?.destroy();
    this.healthBarFill = undefined;
    this.healthBarText?.destroy();
    this.healthBarText = undefined;
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
    // Skipped while something else (e.g. the boss's shield-dash) is already animating x/y directly —
    // otherwise this tween fights that one over the same property and both jitter.
    if (!this.suppressHitShake) {
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
    }
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
      this.healthBarText?.setVisible(false);
      return;
    }
    if (!this.healthBarBack) {
      this.healthBarBack = this.scene.add.rectangle(this.x, this.y - this.displayHeight / 2 - 14, this.healthBarWidth, 8, 0x12080a).setDepth(9);
      this.healthBarFill = this.scene.add.rectangle(this.x, this.y - this.displayHeight / 2 - 14, this.healthBarWidth - 4, 4, 0xd94848).setDepth(10);
      this.healthBarText = this.scene.add.text(this.x, this.y - this.displayHeight / 2 - 28, '', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#f7f1dc', stroke: '#14101c', strokeThickness: 3 }).setOrigin(0.5).setDepth(10);
    }
    const innerWidth = this.healthBarWidth - 4;
    const width = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) * innerWidth;
    const barY = this.y - this.displayHeight / 2 - 14;
    this.healthBarBack.setVisible(true).setPosition(this.x, barY);
    this.healthBarFill?.setVisible(true).setPosition(this.x - innerWidth / 2 + width / 2, barY).setSize(width, 4);
    this.healthBarText?.setVisible(true).setPosition(this.x, barY - 14).setText(`${Math.ceil(Math.max(0, this.health))} / ${this.maxHealth}`);
  }
}
