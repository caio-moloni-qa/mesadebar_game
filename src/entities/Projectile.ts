import Phaser from 'phaser';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  public damage = 0;
  public remainingPierces = 0;
  public expiresAt = 0;
  public isBoomerang = false;
  public returning = false;
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

  fire(x: number, y: number, targetX: number, targetY: number, damage: number, speed: number, lifetime: number, pierces: number, now: number, isBoomerang = false, outboundDistance = 0): void {
    this.enableBody(true, x, y, true, true);
    this.damage = damage;
    this.remainingPierces = pierces;
    this.expiresAt = now + lifetime;
    this.isBoomerang = isBoomerang;
    this.returning = false;
    this.origin.set(x, y);
    this.maxOutboundDistance = outboundDistance;
    this.outboundHits.clear();
    this.returnHits.clear();
    this.rotation = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.setTexture(isBoomerang ? 'weapon-boomerang-icon' : 'bolt');
    this.setDisplaySize(isBoomerang ? 42 : 24, isBoomerang ? 42 : 24);
    if (isBoomerang) this.anims.stop(); else this.play('bolt-fly', true);
    this.scene.physics.velocityFromRotation(this.rotation, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
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

  canDamage(target: Phaser.GameObjects.GameObject): boolean {
    const hitSet = this.returning ? this.returnHits : this.outboundHits;
    if (hitSet.has(target)) return false;
    hitSet.add(target);
    return true;
  }

  deactivate(): void {
    if (this.anims.isPlaying) this.anims.stop();
    this.disableBody(true, true);
    this.isBoomerang = false;
  }
}
