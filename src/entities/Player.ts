import Phaser from 'phaser';
import { PLAYER_CONFIG, ROTTEN_AURA_CONFIG } from '../config/balance';
import { CharacterConfig } from '../config/characters';
import { TITLE_FONT_FAMILY } from '../config/fonts';

export class Player extends Phaser.Physics.Arcade.Sprite {
  public health = PLAYER_CONFIG.maxHealth;
  public maxHealth = PLAYER_CONFIG.maxHealth;
  public movementSpeed = PLAYER_CONFIG.movementSpeed;
  public pickupRange = PLAYER_CONFIG.pickupRange;
  public damageMultiplier = 1;
  public attackSpeedMultiplier = 1;
  public lifeStealPercent = 0;
  public meleeRangeBonus = 0;
  public meleeExtraAttackChance = 0;
  public meleeExtraAttackMax = 0;
  public whirlwindUnlocked = false;
  public projectileExtraCount = 0;
  public projectileRicochetChance = 0;
  public projectileRicochetMax = 0;
  public projectileSizeBonus = 0;
  public passiveHealAmount = 0;
  public passiveHealIntervalMs = 0;
  public lowHealthAttackSpeedBonus = 0;
  /** Sandbox-only testing toggle: when true, damage() is a no-op regardless of source. */
  public invincible = false;
  /** Bênção Divina (merchant item): flat HP/second, independent of the character's own passiveHealAmount/IntervalMs pairing so the two don't need a shared tick rate. */
  private bonusPassiveHealPerSecond = 0;
  private invulnerableUntil = 0;
  private readonly animationTexture: string;
  private lastWalkDirection: 'down' | 'left' | 'right' | 'up' = 'down';
  private slows: Array<{ expiresAt: number; percent: number }> = [];
  private passiveHealElapsed = 0;
  private bonusPassiveHealElapsed = 0;
  /** Rotten Aura status: refreshed by GameScene whenever the player is near a rotten-aura enemy; the debuff (heal cut + DoT) lingers until ROTTEN_AURA_CONFIG.durationMs after the last refresh. */
  private rottenExpiresAt = 0;
  private rottenTickElapsed = 0;

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
    if (typeof character !== 'string') {
      this.maxHealth = this.health = character.maxHealth;
      this.movementSpeed = character.movementSpeed;
      this.damageMultiplier = character.damageMultiplier;
      this.attackSpeedMultiplier = character.attackSpeedMultiplier;
      this.pickupRange = character.pickupRange;
      this.armor = character.armor;
      this.passiveHealAmount = character.passiveHealAmount ?? 0;
      this.passiveHealIntervalMs = character.passiveHealIntervalMs ?? 0;
      this.lowHealthAttackSpeedBonus = character.lowHealthAttackSpeedBonus ?? 0;
    }
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
    if (this.invincible || now < this.invulnerableUntil) return false;
    const dealt = Math.max(1, amount - this.armor);
    this.health = Math.max(0, this.health - dealt);
    this.invulnerableUntil = now + PLAYER_CONFIG.invulnerabilityMs;
    this.flashDamageTint();
    this.showDamageText(dealt);
    return true;
  }

  private flashDamageTint(): void {
    this.setTint(0xff8b8b);
    this.scene.time.delayedCall(130, () => this.clearTint());
  }

  private showDamageText(amount: number): void {
    const text = this.scene.add.text(this.x, this.y - this.displayHeight / 2 - 10, `- ${Math.round(amount)}`, {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '22px',
      color: '#ff5c5c',
      stroke: '#321b00',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(15);
    this.scene.tweens.add({ targets: text, y: text.y - 34, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => text.destroy() });
  }

  applySlow(percent: number, durationMs: number, now: number): void {
    this.slows.push({ expiresAt: now + durationMs, percent });
    this.setTint(0x8bbcff);
    this.scene.time.delayedCall(160, () => this.clearTint());
  }

  addLifeSteal(): void {
    this.lifeStealPercent += this.lifeStealPercent === 0 ? 0.005 : 0.0025;
  }

  addMeleeRangeBonus(amount: number): void {
    this.meleeRangeBonus += amount;
  }

  addMeleeExtraAttack(): void {
    this.meleeExtraAttackChance += 0.1;
    this.meleeExtraAttackMax += 1;
  }

  unlockWhirlwind(): void {
    this.whirlwindUnlocked = true;
  }

  addProjectileExtraCount(): void {
    this.projectileExtraCount += 1;
  }

  addProjectileRicochet(): void {
    this.projectileRicochetChance += 0.1;
    this.projectileRicochetMax += 1;
  }

  addProjectileSizeBonus(): void {
    this.projectileSizeBonus += this.projectileSizeBonus === 0 ? 0.35 : 0.15;
  }

  effectiveAttackSpeedMultiplier(): number {
    if (this.lowHealthAttackSpeedBonus <= 0) return this.attackSpeedMultiplier;
    const missingHealthPercent = 1 - this.health / this.maxHealth;
    return this.attackSpeedMultiplier + this.lowHealthAttackSpeedBonus * Phaser.Math.Clamp(missingHealthPercent, 0, 1);
  }

  updatePassiveEffects(delta: number): void {
    if (this.health <= 0) return;
    if (this.passiveHealAmount > 0 && this.passiveHealIntervalMs > 0) {
      this.passiveHealElapsed += delta;
      while (this.passiveHealElapsed >= this.passiveHealIntervalMs) {
        this.passiveHealElapsed -= this.passiveHealIntervalMs;
        this.heal(this.passiveHealAmount);
      }
    }
    if (this.bonusPassiveHealPerSecond > 0) {
      this.bonusPassiveHealElapsed += delta;
      while (this.bonusPassiveHealElapsed >= 1000) {
        this.bonusPassiveHealElapsed -= 1000;
        this.heal(this.bonusPassiveHealPerSecond);
      }
    }
  }

  heal(amount: number): void {
    const effective = this.isRotten() ? amount * (1 - ROTTEN_AURA_CONFIG.healReduction) : amount;
    this.health = Math.min(this.maxHealth, this.health + effective);
  }

  /** Bênção Divina (merchant item, 350 gemas): +5 HP/s passive healing. Stacks additively if bought again. */
  addDivineBlessing(): void {
    this.bonusPassiveHealPerSecond += 5;
  }

  /** Maldição Arcana (merchant item, 250 gemas): trades 50 max HP for +30% damage. Stacks additively; never drops max HP below 1. */
  addArcaneCurse(): void {
    this.maxHealth = Math.max(1, this.maxHealth - 50);
    this.health = Math.min(this.health, this.maxHealth);
    this.damageMultiplier += 0.3;
  }

  /** Called by GameScene every frame the player overlaps a rotten-aura enemy — refreshes (doesn't stack) the debuff window. */
  refreshRottenAura(now: number): void {
    this.rottenExpiresAt = now + ROTTEN_AURA_CONFIG.durationMs;
  }

  isRotten(): boolean {
    return this.scene.time.now < this.rottenExpiresAt;
  }

  /** Ticks the rotten damage-over-time independently of the normal hit-invulnerability window — a DoT shouldn't be blocked by an unrelated attack's i-frames. Bypasses armor and invincible still stops it. */
  updateRottenStatus(delta: number): void {
    if (!this.isRotten() || this.health <= 0) {
      this.rottenTickElapsed = 0;
      return;
    }
    this.rottenTickElapsed += delta;
    while (this.rottenTickElapsed >= ROTTEN_AURA_CONFIG.tickMs) {
      this.rottenTickElapsed -= ROTTEN_AURA_CONFIG.tickMs;
      this.applyRottenTick();
    }
  }

  private applyRottenTick(): void {
    if (this.invincible) return;
    this.health = Math.max(0, this.health - ROTTEN_AURA_CONFIG.dps);
    this.flashDamageTint();
    this.showDamageText(ROTTEN_AURA_CONFIG.dps);
  }

  private effectiveMovementSpeed(): number {
    const now = this.scene.time.now;
    this.slows = this.slows.filter((slow) => slow.expiresAt > now);
    const slowAmount = this.slows.reduce((total, slow) => total + slow.percent, 0);
    const slowMultiplier = Math.max(0.25, 1 - slowAmount);
    return this.movementSpeed * slowMultiplier;
  }
}
