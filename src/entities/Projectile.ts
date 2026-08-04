import Phaser from 'phaser';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  public damage = 0;
  public remainingPierces = 0;
  public remainingRicochets = 0;
  public expiresAt = 0;
  public isBoomerang = false;
  public isThrownSword = false;
  public returning = false;
  public executesCommonEnemy = false;
  public explodesOnHit = false;
  public executeToken = 0;
  public criticalChance = 0;
  private origin = new Phaser.Math.Vector2();
  private maxOutboundDistance = 0;
  private readonly outboundHits = new Set<Phaser.GameObjects.GameObject>();
  private readonly returnHits = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'bolt');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(24, 24).setCircle(6, 6, 6).setDepth(5).disableBody(true, true);
  }

  fire(x: number, y: number, targetX: number, targetY: number, damage: number, speed: number, lifetime: number, pierces: number, ricochets: number, now: number, isBoomerang = false, outboundDistance = 0, sizeMultiplier = 1): void {
    this.enableBody(true, x, y, true, true);
    this.damage = damage;
    this.remainingPierces = pierces;
    this.remainingRicochets = ricochets;
    this.expiresAt = now + lifetime;
    this.isBoomerang = isBoomerang;
    this.isThrownSword = false;
    this.returning = false;
    this.executesCommonEnemy = false;
    this.explodesOnHit = false;
    this.executeToken = 0;
    this.criticalChance = 0;
    this.origin.set(x, y);
    this.maxOutboundDistance = outboundDistance;
    this.outboundHits.clear();
    this.returnHits.clear();
    this.rotation = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.setTexture(isBoomerang ? 'weapon-boomerang-icon' : 'bolt');
    const displaySize = (isBoomerang ? 42 : 24) * sizeMultiplier;
    this.setDisplaySize(displaySize, displaySize);
    this.updateHitCircle((isBoomerang ? 17 : 7) * sizeMultiplier);
    if (isBoomerang) this.anims.stop(); else this.play('bolt-fly', true);
    this.scene.physics.velocityFromRotation(this.rotation, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
  }

  configureThrownSword(): void {
    if (this.anims.isPlaying) this.anims.stop();
    this.setTexture('weapon-sword-icon');
    this.setDisplaySize(64, 64);
    this.updateHitCircle(20);
    this.isThrownSword = true;
    this.remainingPierces = Number.POSITIVE_INFINITY;
  }

  updateBoomerang(playerX: number, playerY: number, speed: number): void {
    if (!this.isBoomerang) return;
    if (!this.returning && Phaser.Math.Distance.Between(this.origin.x, this.origin.y, this.x, this.y) >= this.maxOutboundDistance) this.returning = true;
    if (this.returning) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
      this.scene.physics.velocityFromRotation(angle, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
      if (Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY) < 26) this.deactivate();
    }
    this.rotation += this.returning ? -0.34 : 0.34;
  }

  updateThrownSword(playerX: number, playerY: number, speed: number): void {
    if (!this.isThrownSword) return;
    if (!this.returning && Phaser.Math.Distance.Between(this.origin.x, this.origin.y, this.x, this.y) >= this.maxOutboundDistance) this.returning = true;
    if (this.returning) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
      this.scene.physics.velocityFromRotation(angle, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
      if (Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY) < 30) this.deactivate();
    }
    this.rotation += this.returning ? -0.28 : 0.28;
  }

  canDamage(target: Phaser.GameObjects.GameObject): boolean {
    const hitSet = this.returning ? this.returnHits : this.outboundHits;
    if (hitSet.has(target)) return false;
    hitSet.add(target);
    return true;
  }

  hasDamaged(target: Phaser.GameObjects.GameObject): boolean {
    return this.outboundHits.has(target) || this.returnHits.has(target);
  }

  ricochetTo(targetX: number, targetY: number, speed: number, now: number, preserveOrigin = false): void {
    if (this.remainingRicochets <= 0) return;
    this.remainingRicochets -= 1;
    this.returning = false;
    if (!preserveOrigin) this.origin.set(this.x, this.y);
    this.expiresAt = Math.max(this.expiresAt, now + 650);
    this.rotation = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.scene.physics.velocityFromRotation(this.rotation, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
  }

  deactivate(): void {
    if (this.anims.isPlaying) this.anims.stop();
    this.disableBody(true, true);
    this.isBoomerang = false;
    this.isThrownSword = false;
    this.remainingRicochets = 0;
    this.executesCommonEnemy = false;
    this.explodesOnHit = false;
    this.executeToken = 0;
    this.criticalChance = 0;
  }

  private updateHitCircle(displayRadius: number): void {
    const scale = Math.max(Math.abs(this.scaleX), 0.001);
    const radius = displayRadius / scale;
    this.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
  }
}
