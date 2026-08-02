import Phaser from 'phaser';
import { ENEMY_CONFIG, WEAPON_CONFIG, requiredExperience } from '../config/balance';
import { RUN_DURATION_MS, WORLD_SIZE } from '../config/gameConfig';
import { Enemy } from '../entities/Enemy';
import { ExperienceGem } from '../entities/ExperienceGem';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { DifficultySystem } from '../systems/DifficultySystem';
import { Upgrade, UpgradeSystem } from '../systems/UpgradeSystem';
import { GameHud } from '../ui/GameHud';

type ArcadeColliderObject = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile;

export class GameScene extends Phaser.Scene {
  private player!: Player; private enemies!: Phaser.Physics.Arcade.Group; private projectiles!: Phaser.Physics.Arcade.Group; private gems!: Phaser.Physics.Arcade.Group;
  private hud!: GameHud; private cursors!: Phaser.Types.Input.Keyboard.CursorKeys; private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private elapsedMs = 0; private spawnElapsed = 0; private lastAttackAt = 0; private kills = 0; private level = 1; private experience = 0; private experienceNeeded = requiredExperience(1);
  private paused = false; private ended = false; private levelPending = false; private readonly difficulty = new DifficultySystem(); private readonly upgrades = new UpgradeSystem();
  private levelOverlay: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('game'); }
  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.rectangle(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0x25342a);
    for (let x = 80; x < WORLD_SIZE; x += 160) for (let y = 80; y < WORLD_SIZE; y += 160) this.add.circle(x, y, 3, 0x5b7052, 0.5);
    this.player = new Player(this, WORLD_SIZE / 2, WORLD_SIZE / 2);
    this.enemies = this.physics.add.group({ classType: Enemy, maxSize: ENEMY_CONFIG.maxActive, runChildUpdate: false });
    this.projectiles = this.physics.add.group({ classType: Projectile, maxSize: 80, runChildUpdate: false });
    this.gems = this.physics.add.group({ classType: ExperienceGem, maxSize: 120, runChildUpdate: false });
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE).startFollow(this.player, true, 0.12, 0.12);
    this.cursors = this.input.keyboard!.createCursorKeys(); this.keys = this.input.keyboard!.addKeys('W,A,S,D,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.physics.add.overlap(this.projectiles, this.enemies, this.projectileHit, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.playerHit, undefined, this);
    this.physics.add.overlap(this.player, this.gems, this.collectGem, undefined, this);
    this.hud = new GameHud(this); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllKeys(true));
  }
  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC) && !this.ended && !this.levelPending) this.togglePause();
    if (this.paused || this.ended || this.levelPending) return;
    this.elapsedMs += delta; if (this.elapsedMs >= RUN_DURATION_MS) { this.finish(true); return; }
    this.movePlayer(); this.spawnElapsed += delta; this.spawnEnemies(); this.updateEnemies(); this.autoAttack(); this.updateProjectiles(); this.updateGems();
    this.hud.update(this.player.health, this.player.maxHealth, this.level, this.experience, this.experienceNeeded, this.elapsedMs, this.kills);
  }
  private movePlayer(): void { const d = new Phaser.Math.Vector2((this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.keys.A.isDown ? 1 : 0), (this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.keys.W.isDown ? 1 : 0)); this.player.move(d); }
  private spawnEnemies(): void { const stage = this.difficulty.stageFor(this.elapsedMs); if (this.spawnElapsed < stage.spawnInterval) return; this.spawnElapsed = 0; for (let i = 0; i < stage.count; i += 1) this.spawnEnemy(stage.healthMultiplier); }
  private spawnEnemy(multiplier: number): void { let enemy = this.enemies.getFirstDead(false) as Enemy | null; if (!enemy) { enemy = new Enemy(this); this.enemies.add(enemy); } const angle = Phaser.Math.FloatBetween(0, Math.PI * 2); const distance = Phaser.Math.Between(700, 900); enemy.activate(this.player.x + Math.cos(angle) * distance, this.player.y + Math.sin(angle) * distance, ENEMY_CONFIG.maxHealth * multiplier, ENEMY_CONFIG.experience); }
  private updateEnemies(): void { this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active) enemy.pursue(this.player, ENEMY_CONFIG.movementSpeed); return true; }); }
  private autoAttack(): void { if (this.time.now < this.lastAttackAt + WEAPON_CONFIG.cooldownMs / this.player.attackSpeedMultiplier) return; const enemy = this.nearestEnemy(); if (!enemy) return; this.lastAttackAt = this.time.now; let projectile = this.projectiles.getFirstDead(false) as Projectile | null; if (!projectile) { projectile = new Projectile(this); this.projectiles.add(projectile); } projectile.fire(this.player.x, this.player.y, enemy.x, enemy.y, WEAPON_CONFIG.damage * this.player.damageMultiplier, WEAPON_CONFIG.projectileSpeed, WEAPON_CONFIG.lifetimeMs, WEAPON_CONFIG.pierces, this.time.now); }
  private nearestEnemy(): Enemy | null { let nearest: Enemy | null = null; let best = WEAPON_CONFIG.range ** 2; this.enemies.children.each((child) => { const enemy = child as Enemy; if (!enemy.active) return true; const distance = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y); if (distance < best) { best = distance; nearest = enemy; } return true; }); return nearest; }
  private updateProjectiles(): void { this.projectiles.children.each((child) => { const projectile = child as Projectile; if (projectile.active && this.time.now >= projectile.expiresAt) projectile.deactivate(); return true; }); }
  private updateGems(): void { this.gems.children.each((child) => { const gem = child as ExperienceGem; if (gem.active) gem.attract(this.player, this.player.pickupRange); return true; }); }
  private projectileHit(projectileObject: ArcadeColliderObject, enemyObject: ArcadeColliderObject): void { const projectile = projectileObject as unknown as Projectile; const enemy = enemyObject as unknown as Enemy; if (!projectile.active || !enemy.active) return; if (enemy.takeDamage(projectile.damage)) { this.kills += 1; let gem = this.gems.getFirstDead(false) as ExperienceGem | null; if (!gem) { gem = new ExperienceGem(this); this.gems.add(gem); } gem.activate(enemy.x, enemy.y, enemy.experience); enemy.deactivate(); } if (projectile.remainingPierces <= 0) projectile.deactivate(); else projectile.remainingPierces -= 1; }
  private playerHit(_playerObject: ArcadeColliderObject, enemyObject: ArcadeColliderObject): void { const enemy = enemyObject as unknown as Enemy; if (!enemy.active || !this.player.damage(ENEMY_CONFIG.contactDamage, this.time.now)) return; if (this.player.health <= 0) this.finish(false); }
  private collectGem(_playerObject: ArcadeColliderObject, gemObject: ArcadeColliderObject): void { const gem = gemObject as unknown as ExperienceGem; if (!gem.active) return; this.experience += gem.value; gem.deactivate(); this.processExperience(); }
  private processExperience(): void { if (this.experience < this.experienceNeeded || this.levelPending) return; this.experience -= this.experienceNeeded; this.level += 1; this.experienceNeeded = requiredExperience(this.level); this.levelPending = true; this.showUpgrades(); }
  private showUpgrades(): void { this.physics.pause(); const veil = this.add.rectangle(640, 360, 1280, 720, 0x090b12, 0.84).setScrollFactor(0).setDepth(30); const title = this.add.text(640, 190, `NÍVEL ${this.level}! Escolha uma melhoria`, { fontFamily: 'Arial Black', fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5).setScrollFactor(0).setDepth(31); this.levelOverlay = [veil, title]; this.upgrades.choices().forEach((upgrade, index) => this.upgradeCard(upgrade, 310 + index * 220)); }
  private upgradeCard(upgrade: Upgrade, x: number): void { const card = this.add.rectangle(x, 400, 190, 180, 0x49326e).setStrokeStyle(3, 0xa888d9).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true }); const name = this.add.text(x, 365, upgrade.name, { fontFamily: 'Arial Black', fontSize: '18px', color: '#fff0c2', align: 'center', wordWrap: { width: 165 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32); const description = this.add.text(x, 440, upgrade.description, { fontFamily: 'Arial', fontSize: '15px', color: '#eee8ff', align: 'center', wordWrap: { width: 160 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32); this.levelOverlay.push(card, name, description); card.on('pointerup', () => { upgrade.apply(this.player); this.levelOverlay.forEach((object) => object.destroy()); this.levelOverlay = []; this.levelPending = false; this.physics.resume(); this.processExperience(); }); }
  private togglePause(): void { this.paused = !this.paused; if (this.paused) { this.physics.pause(); this.add.rectangle(640, 360, 1280, 720, 0x080a10, 0.7).setScrollFactor(0).setDepth(25).setName('pause'); this.add.text(640, 340, 'PAUSADO', { fontFamily: 'Arial Black', fontSize: '46px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(26).setName('pause'); this.add.text(640, 405, 'Pressione Esc para continuar', { fontFamily: 'Arial', fontSize: '22px', color: '#c9cfe2' }).setOrigin(0.5).setScrollFactor(0).setDepth(26).setName('pause'); } else { this.physics.resume(); this.children.getAll('name', 'pause').forEach((object) => object.destroy()); } }
  private finish(victory: boolean): void { this.ended = true; this.physics.pause(); const title = victory ? 'VITÓRIA!' : 'DERROTA'; this.add.rectangle(640, 360, 1280, 720, 0x070910, 0.88).setScrollFactor(0).setDepth(40); this.add.text(640, 215, title, { fontFamily: 'Arial Black', fontSize: '52px', color: victory ? '#ffe07a' : '#ef7780' }).setOrigin(0.5).setScrollFactor(0).setDepth(41); this.add.text(640, 320, `Tempo sobrevivido: ${Math.floor(this.elapsedMs / 1000)}s\nNível alcançado: ${this.level}\nEliminações: ${this.kills}`, { fontFamily: 'Arial', fontSize: '24px', color: '#f1f1f4', align: 'center', lineSpacing: 12 }).setOrigin(0.5).setScrollFactor(0).setDepth(41); this.resultButton('REINICIAR', 555, () => this.scene.restart()); this.resultButton('VOLTAR AO MENU', 620, () => this.scene.start('menu')); }
  private resultButton(label: string, y: number, action: () => void): void { const button = this.add.text(640, y, label, { fontFamily: 'Arial Black', fontSize: '21px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true }); button.on('pointerup', action); }
}
