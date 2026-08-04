import Phaser from 'phaser';
import { ENEMY_CONFIG, ENEMY_VARIANTS, WEAPON_CONFIG, requiredExperience } from '../config/balance';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH, RUN_DURATION_MS, WORLD_SIZE } from '../config/gameConfig';
import { Enemy, EnemyVariantConfig } from '../entities/Enemy';
import { ExperienceGem } from '../entities/ExperienceGem';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SoulProjectile } from '../entities/SoulProjectile';
import { DifficultySystem } from '../systems/DifficultySystem';
import { Upgrade, UpgradeSystem } from '../systems/UpgradeSystem';
import { GameHud } from '../ui/GameHud';
import { CHARACTERS } from '../config/characters';
import { WEAPONS, WeaponConfig } from '../config/weapons';

type ArcadeColliderObject = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile;
interface GameSceneData { characterId?: keyof typeof CHARACTERS; weaponId?: keyof typeof WEAPONS; playerTexture?: string; }

const UPGRADE_ICON_KEYS: Record<string, string> = {
  damage: 'upgrade-damage-icon',
  cooldown: 'upgrade-cooldown-icon',
  speed: 'upgrade-speed-icon',
  'boomerang-count': 'weapon-boomerang-icon',
  'sword-life-steal': 'upgrade-life-steal-icon',
  'projectile-extra-count': 'upgrade-arcane-blessing-icon',
  'projectile-ricochet': 'upgrade-arcane-bounce-icon',
  'projectile-wide-bolt': 'upgrade-wide-bolt-icon',
  'melee-range': 'upgrade-colossus-arms-icon',
  'melee-extra-attack': 'upgrade-chained-fury-icon',
  'melee-whirlwind': 'upgrade-whirlwind-attack-icon'
};

const ENEMY_TEXTURE_KEYS: Record<EnemyVariantConfig['id'], string> = {
  skeleton: 'skeleton-sword',
  necromancerWraith: 'necromancer-wraith',
  apparitionWraith: 'apparition-wraith',
  superSkeleton: 'super-skeleton',
  finalBoss: 'final-boss'
};

const FINAL_BOSS_MESSAGE_MS = 2600;
const FINAL_BOSS_SUMMON_INTERVAL_MS = 10000;
const FINAL_BOSS_MELEE_COOLDOWN_MS = 7000;
const FINAL_BOSS_CHANNEL_INTERVAL_MS = 40000;
const FINAL_BOSS_CHANNEL_DURATION_MS = 15000;
const FINAL_BOSS_SHIELD_DEADLINE_MS = 20000;
const FINAL_BOSS_SHIELD_HEALTH = 500;
const FINAL_BOSS_MELEE_RADIUS = 250;
const FINAL_BOSS_EXPLOSION_RADIUS = 700;

export class GameScene extends Phaser.Scene {
  private player!: Player; private enemies!: Phaser.Physics.Arcade.Group; private projectiles!: Phaser.Physics.Arcade.Group; private soulProjectiles!: Phaser.Physics.Arcade.Group; private gems!: Phaser.Physics.Arcade.Group;
  private hud!: GameHud; private cursors!: Phaser.Types.Input.Keyboard.CursorKeys; private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private mobileMode = false; private mobileDirection = new Phaser.Math.Vector2(); private joystickKnob?: Phaser.GameObjects.Arc; private joystickZone?: Phaser.GameObjects.Zone; private joystickPointerId: number | null = null;
  private elapsedMs = 0; private spawnElapsed = 0; private necromancerSpawnElapsed = 0; private apparitionHordeElapsed = 0; private superSkeletonSpawnElapsed = 0; private apparitionHordeLevel = 0; private superSkeletonSpawnCount = 1; private lastAttackAt = 0; private kills = 0; private level = 1; private experience = 0; private experienceNeeded = requiredExperience(1);
  private paused = false; private ended = false; private levelPending = false; private lastWhirlwindAt = 0; private thrownSwordCooldownReadyAt = 0; private thrownSwordVolleyActive = false; private staffAttacksSinceExecute = 0; private staffExecuteToken = 0; private startingUpgradeChoicesRemaining = 0; private startingUpgradeChoicesTotal = 0; private readonly consumedStaffExecuteTokens = new Set<number>(); private readonly selectedUpgradeCounts = new Map<string, number>(); private readonly difficulty = new DifficultySystem(); private readonly upgrades = new UpgradeSystem();
  private levelOverlay: Phaser.GameObjects.GameObject[] = [];
  private pauseOverlay: Phaser.GameObjects.GameObject[] = [];
  private characterId: keyof typeof CHARACTERS = 'barbarian'; private weapon: WeaponConfig = WEAPONS.staff;
  private finalBoss?: Enemy; private finalBossPending = false; private finalBossActive = false; private finalBossMessage?: Phaser.GameObjects.Text; private finalBossArrow?: Phaser.GameObjects.Container; private finalBossCountdown?: Phaser.GameObjects.Text; private finalBossCleanupAt = 0;
  private bossSummonElapsed = 0; private bossChannelElapsed = 0; private bossMeleeLastAt = 0; private bossChannelActive = false; private bossShieldActive = false; private bossChannelStartedAt = 0; private bossShield = 0;
  private bossShieldAura?: Phaser.GameObjects.Arc; private bossShieldBolts: Phaser.GameObjects.Sprite[] = []; private nextBossShieldBoltAt = 0; private bossShieldBack?: Phaser.GameObjects.Rectangle; private bossShieldFill?: Phaser.GameObjects.Rectangle;
  private get selectedPlayerTexture(): string { return CHARACTERS[this.characterId].texture; }

  constructor() { super('game'); }

  init(data: GameSceneData): void {
    if (!data.characterId || !data.weaponId) { this.scene.start('menu'); return; }
    this.characterId = data.characterId; this.weapon = WEAPONS[data.weaponId];
    this.elapsedMs = 0; this.spawnElapsed = 0; this.necromancerSpawnElapsed = 0; this.apparitionHordeElapsed = 0; this.superSkeletonSpawnElapsed = 0; this.apparitionHordeLevel = 0; this.superSkeletonSpawnCount = 1; this.lastAttackAt = 0; this.kills = 0; this.level = 1; this.experience = 0; this.experienceNeeded = requiredExperience(1);
    this.paused = false; this.ended = false; this.levelPending = false; this.lastWhirlwindAt = 0; this.thrownSwordCooldownReadyAt = 0; this.thrownSwordVolleyActive = false; this.staffAttacksSinceExecute = 0; this.staffExecuteToken = 0; this.startingUpgradeChoicesRemaining = 0; this.startingUpgradeChoicesTotal = 0; this.consumedStaffExecuteTokens.clear(); this.selectedUpgradeCounts.clear(); this.levelOverlay = []; this.pauseOverlay = [];
    this.finalBoss = undefined; this.finalBossPending = false; this.finalBossActive = false; this.finalBossMessage = undefined; this.finalBossArrow = undefined; this.finalBossCountdown = undefined; this.finalBossCleanupAt = 0; this.bossSummonElapsed = 0; this.bossChannelElapsed = 0; this.bossMeleeLastAt = 0; this.bossChannelActive = false; this.bossShieldActive = false; this.bossChannelStartedAt = 0; this.bossShield = 0; this.bossShieldAura = undefined; this.bossShieldBolts = []; this.nextBossShieldBoltAt = 0; this.bossShieldBack = undefined; this.bossShieldFill = undefined;
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.tileSprite(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 'grass-ruins-ground').setDepth(0);
    this.player = new Player(this, WORLD_SIZE / 2, WORLD_SIZE / 2, CHARACTERS[this.characterId]);
    this.enemies = this.physics.add.group({ classType: Enemy, maxSize: ENEMY_CONFIG.maxActive, runChildUpdate: false });
    this.projectiles = this.physics.add.group({ classType: Projectile, maxSize: 80, runChildUpdate: false });
    this.soulProjectiles = this.physics.add.group({ classType: SoulProjectile, maxSize: 80, runChildUpdate: false });
    this.gems = this.physics.add.group({ classType: ExperienceGem, maxSize: 120, runChildUpdate: false });
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE).startFollow(this.player, true, 0.12, 0.12);
    this.cursors = this.input.keyboard!.createCursorKeys(); this.keys = this.input.keyboard!.addKeys('W,A,S,D,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.mobileMode = this.isTouchDevice();
    if (this.mobileMode) this.createMobileControls();
    this.physics.add.overlap(this.projectiles, this.enemies, this.projectileHit, undefined, this);
    this.physics.add.overlap(this.player, this.soulProjectiles, this.soulProjectileHit, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.playerHit, undefined, this);
    this.physics.add.overlap(this.player, this.gems, this.collectGem, undefined, this);
    this.hud = new GameHud(this); this.updateBuildHud(); this.prepareStartingWeaponUpgrades(); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllKeys(true);
      this.input.off('pointermove', this.updateJoystick, this);
      this.input.off('pointerup', this.releaseJoystick, this);
      this.input.off('pointerupoutside', this.releaseJoystick, this);
    });
  }
  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC) && !this.ended && !this.levelPending) this.togglePause();
    if (this.paused || this.ended || this.levelPending) return;
    this.elapsedMs += delta; if (!this.finalBossPending && !this.finalBossActive && this.elapsedMs >= RUN_DURATION_MS) this.warnFinalBoss();
    this.movePlayer(); this.player.updatePassiveEffects(delta); this.spawnElapsed += delta; this.necromancerSpawnElapsed += delta; this.apparitionHordeElapsed += delta; this.superSkeletonSpawnElapsed += delta; this.spawnEnemies(); this.spawnEnemyVariants(); this.updateFinalBoss(delta); this.updateEnemies(); this.updateNecromancerAttacks(); this.autoAttack(); this.updateMeleeWhirlwind(); this.updateThrownSwordBuff(); this.updateProjectiles(); this.updateSoulProjectiles(); this.updateGems(); this.updateBossArrow();
    this.hud.update(this.player.health, this.player.maxHealth, this.level, this.experience, this.experienceNeeded, this.elapsedMs, this.kills);
  }
  private movePlayer(): void {
    const d = new Phaser.Math.Vector2(
      (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.keys.A.isDown ? 1 : 0),
      (this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.keys.W.isDown ? 1 : 0)
    );
    if (this.mobileDirection.lengthSq() > 0) d.copy(this.mobileDirection);
    this.player.move(d);
  }
  private isTouchDevice(): boolean {
    const compactScreen = window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(max-height: 900px) and (pointer: coarse)').matches;
    return compactScreen && this.sys.game.device.input.touch && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
  }
  private createMobileControls(): void {
    const x = 120;
    const y = GAME_HEIGHT - 120;
    this.add.circle(x, y, 88, 0x111827, 0.48).setStrokeStyle(4, 0xb7a3e5, 0.62).setScrollFactor(0).setDepth(20);
    this.joystickKnob = this.add.circle(x, y, 37, 0x8568c3, 0.82).setStrokeStyle(3, 0xf2eaff, 0.8).setScrollFactor(0).setDepth(21);
    this.joystickZone = this.add.zone(x, y, 220, 220).setScrollFactor(0).setDepth(22).setInteractive();
    this.joystickZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.paused || this.ended || this.levelPending || this.joystickPointerId !== null) return;
      this.joystickPointerId = pointer.id;
      this.updateJoystick(pointer);
    });
    this.input.on('pointermove', this.updateJoystick, this);
    this.input.on('pointerup', this.releaseJoystick, this);
    this.input.on('pointerupoutside', this.releaseJoystick, this);
    this.input.addPointer(2);
    this.add.text(x, y + 118, 'MOVER', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#e9e0ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(21).setAlpha(0.8);
  }
  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joystickPointerId || !this.joystickKnob) return;
    const centerX = 120;
    const centerY = GAME_HEIGHT - 120;
    const offset = new Phaser.Math.Vector2(pointer.x - centerX, pointer.y - centerY);
    const distance = offset.length();
    const radius = 70;
    if (distance > radius) offset.scale(radius / distance);
    this.joystickKnob.setPosition(centerX + offset.x, centerY + offset.y);
    this.mobileDirection.set(offset.x / radius, offset.y / radius);
    if (distance < 12) this.mobileDirection.set(0, 0);
  }
  private releaseJoystick(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joystickPointerId) return;
    this.joystickPointerId = null;
    this.mobileDirection.set(0, 0);
    this.joystickKnob?.setPosition(120, GAME_HEIGHT - 120);
  }
  private spawnEnemies(): void { if (this.finalBossPending || this.finalBossActive) return; const stage = this.difficulty.stageFor(this.elapsedMs); if (this.spawnElapsed < stage.spawnInterval) return; this.spawnElapsed = 0; for (let i = 0; i < stage.count; i += 1) this.spawnEnemy(stage.healthMultiplier); }
  private spawnEnemy(multiplier: number): void {
    let enemy = this.enemies.getFirstDead(false) as Enemy | null;

    // `Group.add` ignores additions after maxSize. Creating an Enemy before
    // checking the capacity left sprites with physics bodies outside the group:
    // they stayed on screen but were neither updated nor considered by overlaps.
    if (!enemy && this.enemies.isFull()) return;
    if (!enemy) {
      enemy = new Enemy(this);
      this.enemies.add(enemy);
    }

    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(700, 900);
    enemy.activate(this.player.x + Math.cos(angle) * distance, this.player.y + Math.sin(angle) * distance, this.enemyConfig('skeleton', { maxHealth: ENEMY_VARIANTS.skeleton.maxHealth * multiplier }));
  }
  private spawnEnemyVariants(): void {
    if (this.finalBossPending || this.finalBossActive) return;
    if (this.necromancerSpawnElapsed >= 15000) {
      this.necromancerSpawnElapsed = 0;
      const position = this.randomMapPosition();
      this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('necromancerWraith', { isStatic: true, displaySize: 68 }));
    }

    if (this.apparitionHordeElapsed >= 30000) {
      this.apparitionHordeElapsed = 0;
      const count = 10 + this.apparitionHordeLevel * 2;
      const health = ENEMY_VARIANTS.apparitionWraith.maxHealth + this.apparitionHordeLevel * 12;
      for (let index = 0; index < count; index += 1) {
        const position = this.randomBorderPosition();
        this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('apparitionWraith', { maxHealth: health, displaySize: 68 }));
      }
      this.apparitionHordeLevel += 1;
    }

    if (this.superSkeletonSpawnElapsed >= 40000) {
      this.superSkeletonSpawnElapsed = 0;
      for (let index = 0; index < this.superSkeletonSpawnCount; index += 1) {
        const position = this.randomBorderPosition();
        this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('superSkeleton', { isMiniBoss: true, displaySize: 92 }));
      }
      this.superSkeletonSpawnCount += 2;
    }
  }
  private spawnEnemyVariant(x: number, y: number, config: EnemyVariantConfig): Enemy | null {
    let enemy = this.enemies.getFirstDead(false) as Enemy | null;
    if (!enemy && this.enemies.isFull()) return null;
    if (!enemy) {
      enemy = new Enemy(this);
      this.enemies.add(enemy);
    }
    enemy.activate(x, y, config);
    return enemy;
  }
  private updateEnemies(): void { this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active) { if (enemy === this.finalBoss && this.bossChannelActive) enemy.pauseMovement(); else enemy.pursue(this.player); } return true; }); }
  private updateNecromancerAttacks(): void { this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active && enemy.canCastSoul(this.time.now)) this.launchSoulProjectile(enemy); return true; }); }
  private autoAttack(): void {
    if (this.time.now < this.lastAttackAt + this.weapon.cooldown / this.player.effectiveAttackSpeedMultiplier()) return;
    const enemy = this.nearestEnemy(this.attackRange());
    if (!enemy) return;
    if (this.weapon.type === 'cone') {
      this.lastAttackAt = this.time.now;
      const direction = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y).normalize();
      this.performMeleeAttack(direction);
      this.queueMeleeExtraAttacks(direction);
      return;
    }
    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
    const count = 1 + this.player.projectileExtraCount;
    const staffExecuteToken = this.staffExecuteTokenForAttack();
    let launched = false;
    this.projectileAngles(baseAngle, count).forEach((angle) => {
      launched = this.launchProjectile(angle, this.weapon.type === 'boomerang', staffExecuteToken) || launched;
    });
    if (launched) this.lastAttackAt = this.time.now;
  }
  private projectileAngles(baseAngle: number, count: number): number[] {
    const spread = Phaser.Math.DegToRad(30);
    const angles = [baseAngle];
    for (let step = 1; angles.length < count; step += 1) {
      angles.push(baseAngle - spread * step);
      if (angles.length < count) angles.push(baseAngle + spread * step);
    }
    return angles;
  }
  private staffExecuteTokenForAttack(): number {
    if (this.weapon.id !== 'staff' || !this.player.hasExclusiveWeaponBuff()) return 0;
    if (this.staffAttacksSinceExecute >= 3) {
      this.staffAttacksSinceExecute = 0;
      this.staffExecuteToken += 1;
      return this.staffExecuteToken;
    }
    this.staffAttacksSinceExecute += 1;
    return 0;
  }
  private performMeleeAttack(direction: Phaser.Math.Vector2): boolean {
    const attackDirection = direction.clone().normalize();
    const minDot = Math.cos(Phaser.Math.DegToRad((this.weapon.coneAngle ?? 90) / 2));
    let hit = false;
    this.enemies.children.each((child) => {
      const target = child as Enemy;
      if (!target.active) return true;
      const vector = new Phaser.Math.Vector2(target.x - this.player.x, target.y - this.player.y);
      if (vector.lengthSq() <= 0) return true;
      const range = this.attackRange() + this.enemyRangePadding(target);
      if (vector.lengthSq() <= range ** 2 && attackDirection.dot(vector.normalize()) >= minDot) {
        this.damageEnemy(target, this.weapon.baseDamage * this.player.damageMultiplier);
        hit = true;
      }
      return true;
    });
    this.playSwordSlash(attackDirection);
    return hit;
  }
  private queueMeleeExtraAttacks(direction: Phaser.Math.Vector2): void {
    if (this.player.meleeExtraAttackMax <= 0 || Math.random() >= this.player.meleeExtraAttackChance) return;
    const fallbackDirection = direction.clone().normalize();
    for (let index = 1; index <= this.player.meleeExtraAttackMax; index += 1) {
      this.time.delayedCall(index * 110, () => {
        if (this.ended || this.paused || this.levelPending || this.weapon.type !== 'cone') return;
        const enemy = this.nearestEnemy(this.attackRange());
        const attackDirection = enemy
          ? new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y).normalize()
          : fallbackDirection;
        this.performMeleeAttack(attackDirection);
      });
    }
  }
  private updateMeleeWhirlwind(): void {
    if (this.weapon.type !== 'cone' || !this.player.whirlwindUnlocked || this.time.now < this.lastWhirlwindAt + 5000) return;
    if (!this.nearestEnemy(this.attackRange())) return;
    this.lastWhirlwindAt = this.time.now;
    [
      new Phaser.Math.Vector2(1, 0),
      new Phaser.Math.Vector2(0, 1),
      new Phaser.Math.Vector2(-1, 0),
      new Phaser.Math.Vector2(0, -1)
    ].forEach((direction, index) => {
      this.time.delayedCall(index * 70, () => {
        if (this.ended || this.paused || this.levelPending || this.weapon.type !== 'cone') return;
        this.performMeleeAttack(direction);
      });
    });
  }
  private updateThrownSwordBuff(): void {
    if (this.weapon.id !== 'sword' || !this.player.hasExclusiveWeaponBuff() || this.thrownSwordVolleyActive || this.time.now < this.thrownSwordCooldownReadyAt) return;
    const enemy = this.nearestEnemy(WORLD_SIZE);
    if (!enemy) return;
    this.thrownSwordVolleyActive = true;
    [
      new Phaser.Math.Vector2(1, 0),
      new Phaser.Math.Vector2(0, 1),
      new Phaser.Math.Vector2(-1, 0),
      new Phaser.Math.Vector2(0, -1)
    ].forEach((direction) => this.launchThrownSword(direction));
  }
  private thrownSwordCooldownMs(): number {
    return Math.max(1000, 10000 - Math.max(0, this.player.weaponUpgradeCount - 5) * 1000);
  }
  private attackRange(): number {
    return this.weapon.range + (this.weapon.type === 'cone' ? this.player.meleeRangeBonus : 0);
  }
  private launchThrownSword(direction: Phaser.Math.Vector2): void {
    let projectile = this.projectiles.getFirstDead(false) as Projectile | null;
    if (!projectile && this.projectiles.isFull()) return;
    if (!projectile) { projectile = new Projectile(this); this.projectiles.add(projectile); }
    const start = new Phaser.Math.Vector2(this.player.x + direction.x * 42, this.player.y + direction.y * 42);
    const edge = this.worldEdgePoint(start, direction);
    const speed = 520;
    const distance = Phaser.Math.Distance.Between(start.x, start.y, edge.x, edge.y);
    const lifetime = Math.ceil((distance * 2) / speed * 1000) + 600;
    projectile.fire(start.x, start.y, edge.x, edge.y, this.weapon.baseDamage * this.player.damageMultiplier, speed, lifetime, Number.POSITIVE_INFINITY, 0, this.time.now, false, distance);
    projectile.configureThrownSword();
  }
  private worldEdgePoint(start: Phaser.Math.Vector2, direction: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const candidates: number[] = [];
    if (direction.x > 0) candidates.push((WORLD_SIZE - start.x) / direction.x);
    if (direction.x < 0) candidates.push((0 - start.x) / direction.x);
    if (direction.y > 0) candidates.push((WORLD_SIZE - start.y) / direction.y);
    if (direction.y < 0) candidates.push((0 - start.y) / direction.y);
    const distance = Math.max(0, Math.min(...candidates.filter((candidate) => candidate > 0)));
    return new Phaser.Math.Vector2(start.x + direction.x * distance, start.y + direction.y * distance);
  }
  private launchProjectile(angle: number, isBoomerang: boolean, staffExecuteToken = 0): boolean {
    let projectile = this.projectiles.getFirstDead(false) as Projectile | null;
    if (!projectile && this.projectiles.isFull()) return false;
    if (!projectile) { projectile = new Projectile(this); this.projectiles.add(projectile); }
    const range = this.weapon.range;
    projectile.fire(this.player.x, this.player.y, this.player.x + Math.cos(angle) * range, this.player.y + Math.sin(angle) * range, this.weapon.baseDamage * this.player.damageMultiplier, this.weapon.projectileSpeed ?? WEAPON_CONFIG.projectileSpeed, this.weapon.projectileLifetime ?? WEAPON_CONFIG.lifetimeMs, WEAPON_CONFIG.pierces, this.player.projectileRicochetMax, this.time.now, isBoomerang, range, 1 + this.player.projectileSizeBonus);
    projectile.executesCommonEnemy = staffExecuteToken > 0;
    projectile.explodesOnHit = staffExecuteToken > 0;
    projectile.executeToken = staffExecuteToken;
    projectile.criticalChance = isBoomerang && this.player.hasExclusiveWeaponBuff() ? this.boomerangCriticalChance() : 0;
    return true;
  }
  private launchSoulProjectile(enemy: Enemy): void {
    let projectile = this.soulProjectiles.getFirstDead(false) as SoulProjectile | null;
    if (!projectile && this.soulProjectiles.isFull()) return;
    if (!projectile) {
      projectile = new SoulProjectile(this);
      this.soulProjectiles.add(projectile);
    }
    projectile.fire(enemy.x, enemy.y, this.player.x, this.player.y, this.time.now);
  }
  private warnFinalBoss(): void {
    this.finalBossPending = true;
    this.finalBossMessage = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'O sobrevivente sente uma presença maligna no ar!', {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '34px',
      color: '#d8ffd0',
      align: 'center',
      stroke: '#101510',
      strokeThickness: 5,
      wordWrap: { width: 900 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(45);
    this.tweens.add({ targets: this.finalBossMessage, alpha: 0.45, yoyo: true, repeat: 2, duration: 420 });
    this.time.delayedCall(FINAL_BOSS_MESSAGE_MS, () => this.spawnFinalBoss());
  }
  private spawnFinalBoss(): void {
    this.finalBossMessage?.destroy();
    this.finalBossMessage = undefined;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = 980;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * distance, 260, WORLD_SIZE - 260);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * distance, 260, WORLD_SIZE - 260);
    this.finalBoss = this.spawnEnemyVariant(x, y, this.enemyConfig('finalBoss', { isMiniBoss: true, displaySize: 390, collisionRadius: 58, healthBarWidth: 220 })) ?? undefined;
    this.finalBossPending = false;
    this.finalBossActive = Boolean(this.finalBoss);
    this.finalBossCleanupAt = this.time.now + 30000;
    this.bossSummonElapsed = 0;
    this.bossChannelElapsed = 0;
    this.bossMeleeLastAt = this.time.now - FINAL_BOSS_MELEE_COOLDOWN_MS + 1600;
    this.ensureBossArrow();
    this.finalBossCountdown = this.add.text(GAME_WIDTH / 2, 84, '', { fontFamily: TITLE_FONT_FAMILY, fontSize: '24px', color: '#ffffff', stroke: '#101510', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(44);
  }
  private clearEnemyField(preserve?: Enemy): number {
    let clearedEnemies = 0;
    this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active && enemy !== preserve) { enemy.deactivate(); clearedEnemies += 1; } return true; });
    this.projectiles.children.each((child) => { const projectile = child as Projectile; if (projectile.active) projectile.deactivate(); return true; });
    this.soulProjectiles.children.each((child) => { const projectile = child as SoulProjectile; if (projectile.active) projectile.deactivate(); return true; });
    return clearedEnemies;
  }
  private updateFinalBoss(delta: number): void {
    if (!this.finalBossActive || !this.finalBoss?.active) return;
    if (this.finalBossCleanupAt > 0) {
      const remainingMs = Math.max(0, this.finalBossCleanupAt - this.time.now);
      this.finalBossCountdown?.setText(`A escuridão consome a arena em ${Math.ceil(remainingMs / 1000)}s`);
      if (remainingMs <= 0) {
        const clearedEnemies = this.clearEnemyField(this.finalBoss);
        this.finalBoss.maxHealth += clearedEnemies * 20;
        this.finalBoss.health += clearedEnemies * 20;
        this.finalBossCleanupAt = 0;
        this.finalBossCountdown?.destroy();
        this.finalBossCountdown = undefined;
      }
    }
    if (this.bossChannelActive) {
      this.finalBoss.pauseMovement();
      this.updateBossShieldVisual();
      if (this.time.now >= this.bossChannelStartedAt + FINAL_BOSS_CHANNEL_DURATION_MS) this.bossChannelActive = false;
      return;
    }
    if (this.bossShieldActive) {
      if (this.time.now >= this.bossChannelStartedAt + FINAL_BOSS_SHIELD_DEADLINE_MS) this.completeBossChannel();
      return;
    }
    this.bossSummonElapsed += delta;
    this.bossChannelElapsed += delta;
    if (this.bossSummonElapsed >= FINAL_BOSS_SUMMON_INTERVAL_MS) {
      this.bossSummonElapsed = 0;
      this.summonBossApparitions();
    }
    if (this.bossChannelElapsed >= FINAL_BOSS_CHANNEL_INTERVAL_MS) { this.startBossChannel(); return; }
    this.tryBossMeleeAttack();
  }
  private summonBossApparitions(): void {
    if (!this.finalBoss) return;
    for (let index = 0; index < 30; index += 1) {
      const angle = (Math.PI * 2 * index) / 30 + Phaser.Math.FloatBetween(-0.12, 0.12);
      const radius = Phaser.Math.Between(175, 255);
      this.spawnEnemyVariant(this.finalBoss.x + Math.cos(angle) * radius, this.finalBoss.y + Math.sin(angle) * radius, this.enemyConfig('apparitionWraith', { displaySize: 72 }));
    }
  }
  private tryBossMeleeAttack(): void {
    if (!this.finalBoss || this.time.now < this.bossMeleeLastAt + FINAL_BOSS_MELEE_COOLDOWN_MS) return;
    if (Phaser.Math.Distance.Between(this.finalBoss.x, this.finalBoss.y, this.player.x, this.player.y) > FINAL_BOSS_MELEE_RADIUS) return;
    this.bossMeleeLastAt = this.time.now;
    const direction = new Phaser.Math.Vector2(this.player.x - this.finalBoss.x, this.player.y - this.finalBoss.y).normalize();
    this.playBossMeleeSlash(direction);
    this.time.delayedCall(220, () => {
      if (this.ended || !this.finalBoss?.active) return;
      if (Phaser.Math.Distance.Between(this.finalBoss.x, this.finalBoss.y, this.player.x, this.player.y) <= FINAL_BOSS_MELEE_RADIUS && this.player.damage(40, this.time.now) && this.player.health <= 0) this.finish(false);
    });
  }
  private startBossChannel(): void {
    if (!this.finalBoss || this.bossChannelActive) return;
    this.bossChannelActive = true;
    this.bossShieldActive = true;
    this.bossChannelStartedAt = this.time.now;
    this.bossShield = FINAL_BOSS_SHIELD_HEALTH;
    this.bossChannelElapsed = 0;
    this.nextBossShieldBoltAt = 0;
    this.finalBoss.pauseMovement();
    this.updateBossShieldVisual();
  }
  private completeBossChannel(): void {
    if (!this.finalBoss || this.bossShield <= 0) { this.endBossChannel(); return; }
    const explosion = this.add.circle(this.finalBoss.x, this.finalBoss.y, FINAL_BOSS_EXPLOSION_RADIUS, 0x52ff45, 0.24).setStrokeStyle(7, 0xd8ffd0, 0.9).setDepth(12);
    this.tweens.add({ targets: explosion, alpha: 0, scale: 1.18, duration: 520, onComplete: () => explosion.destroy() });
    const playerCaught = Phaser.Math.Distance.Between(this.finalBoss.x, this.finalBoss.y, this.player.x, this.player.y) <= FINAL_BOSS_EXPLOSION_RADIUS;
    this.endBossChannel();
    if (playerCaught) {
      this.player.health = 0;
      this.hud.update(this.player.health, this.player.maxHealth, this.level, this.experience, this.experienceNeeded, this.elapsedMs, this.kills);
      this.time.delayedCall(260, () => this.finish(false));
    }
  }
  private endBossChannel(): void {
    this.bossChannelActive = false;
    this.bossShieldActive = false;
    this.bossShield = 0;
    this.bossShieldAura?.destroy();
    this.bossShieldBolts.forEach((bolt) => bolt.destroy());
    this.bossShieldBack?.destroy();
    this.bossShieldFill?.destroy();
    this.bossShieldAura = undefined;
    this.bossShieldBolts = [];
    this.bossShieldBack = undefined;
    this.bossShieldFill = undefined;
  }
  private updateBossShieldVisual(): void {
    if (!this.finalBoss?.active || !this.bossShieldActive) return;
    if (!this.bossShieldAura) {
      this.bossShieldAura = this.add.circle(this.finalBoss.x, this.finalBoss.y, 230, 0x48ff52, 0.16).setStrokeStyle(5, 0xb4ff9e, 0.88).setDepth(8);
      this.bossShieldBack = this.add.rectangle(this.finalBoss.x, this.finalBoss.y - this.finalBoss.displayHeight / 2 - 34, 188, 10, 0x061009).setDepth(12);
      this.bossShieldFill = this.add.rectangle(this.finalBoss.x, this.finalBoss.y - this.finalBoss.displayHeight / 2 - 34, 184, 5, 0x65ff5a).setDepth(13);
    }
    const width = Phaser.Math.Clamp(this.bossShield / FINAL_BOSS_SHIELD_HEALTH, 0, 1) * 184;
    const y = this.finalBoss.y - this.finalBoss.displayHeight / 2 - 34;
    this.bossShieldAura.setPosition(this.finalBoss.x, this.finalBoss.y);
    this.spawnBossShieldBolts();
    this.bossShieldBack?.setPosition(this.finalBoss.x, y);
    this.bossShieldFill?.setPosition(this.finalBoss.x - 92 + width / 2, y).setSize(width, 5);
  }
  private spawnBossShieldBolts(): void {
    if (!this.finalBoss || this.time.now < this.nextBossShieldBoltAt) return;
    this.nextBossShieldBoltAt = this.time.now + Phaser.Math.Between(90, 180);
    const count = Phaser.Math.Between(1, 3);
    for (let index = 0; index < count; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * 205;
      const bolt = this.add.sprite(
        this.finalBoss.x + Math.cos(angle) * radius,
        this.finalBoss.y + Math.sin(angle) * radius,
        'boss-shield-bolt'
      )
        .setDisplaySize(Phaser.Math.Between(42, 84), Phaser.Math.Between(42, 84))
        .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
        .setAlpha(Phaser.Math.FloatBetween(0.72, 1))
        .setDepth(11)
        .setBlendMode(Phaser.BlendModes.ADD)
        .play('boss-shield-bolt-flicker');
      this.bossShieldBolts.push(bolt);
      this.tweens.add({ targets: bolt, alpha: 0, duration: Phaser.Math.Between(180, 320), onComplete: () => this.destroyBossShieldBolt(bolt) });
    }
  }
  private destroyBossShieldBolt(bolt: Phaser.GameObjects.Sprite): void {
    Phaser.Utils.Array.Remove(this.bossShieldBolts, bolt);
    bolt.destroy();
  }
  private ensureBossArrow(): void {
    if (this.finalBossArrow) return;
    const arrow = this.add.graphics();
    arrow.fillStyle(0x111111, 0.9);
    arrow.fillTriangle(25, 0, -15, -22, -9, 0);
    arrow.fillTriangle(25, 0, -15, 22, -9, 0);
    arrow.fillRect(-30, -7, 22, 14);
    arrow.fillStyle(0xffffff, 1);
    arrow.fillTriangle(18, 0, -11, -15, -7, 0);
    arrow.fillTriangle(18, 0, -11, 15, -7, 0);
    arrow.fillRect(-25, -4, 19, 8);
    this.finalBossArrow = this.add.container(0, 0, [arrow]).setScrollFactor(0).setDepth(44).setVisible(false);
  }
  private updateBossArrow(): void {
    if (!this.finalBossArrow || !this.finalBossActive || !this.finalBoss?.active) { this.finalBossArrow?.setVisible(false); return; }
    const view = this.cameras.main.worldView;
    const screenX = this.finalBoss.x - view.x;
    const screenY = this.finalBoss.y - view.y;
    const visible = screenX >= 0 && screenX <= GAME_WIDTH && screenY >= 0 && screenY <= GAME_HEIGHT;
    if (visible) { this.finalBossArrow.setVisible(false); return; }
    const x = Phaser.Math.Clamp(screenX, 48, GAME_WIDTH - 48);
    const y = Phaser.Math.Clamp(screenY, 48, GAME_HEIGHT - 48);
    this.finalBossArrow.setVisible(true).setPosition(x, y).setRotation(Phaser.Math.Angle.Between(GAME_WIDTH / 2, GAME_HEIGHT / 2, screenX, screenY));
  }
  private enemyConfig(id: EnemyVariantConfig['id'], overrides: Partial<Omit<EnemyVariantConfig, 'id'>> = {}): EnemyVariantConfig {
    return { id, texture: ENEMY_TEXTURE_KEYS[id], ...ENEMY_VARIANTS[id], ...overrides };
  }
  private randomMapPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(Phaser.Math.Between(120, WORLD_SIZE - 120), Phaser.Math.Between(120, WORLD_SIZE - 120));
  }
  private randomBorderPosition(): Phaser.Math.Vector2 {
    const side = Phaser.Math.Between(0, 3);
    const edge = 40;
    if (side === 0) return new Phaser.Math.Vector2(Phaser.Math.Between(0, WORLD_SIZE), edge);
    if (side === 1) return new Phaser.Math.Vector2(Phaser.Math.Between(0, WORLD_SIZE), WORLD_SIZE - edge);
    if (side === 2) return new Phaser.Math.Vector2(edge, Phaser.Math.Between(0, WORLD_SIZE));
    return new Phaser.Math.Vector2(WORLD_SIZE - edge, Phaser.Math.Between(0, WORLD_SIZE));
  }
  private playSwordSlash(direction: Phaser.Math.Vector2): void {
    // Start the effect on the attacker. Its previous 62px offset placed the
    // 128px-wide slash over a nearby enemy, making it look like their attack.
    const slash = this.add.sprite(this.player.x, this.player.y, 'sword-air-slash')
      .setDisplaySize(112, 112)
      .setDepth(6);

    // The slash artwork faces left at rotation 0, whereas Phaser angles point
    // right at 0. Rotate it 180° so its impact edge faces the target.
    slash.rotation = Phaser.Math.Angle.Between(0, 0, direction.x, direction.y) + Math.PI;
    slash.play('sword-air-slash-swing');
    this.tweens.add({
      targets: slash,
      x: this.player.x + direction.x * 62,
      y: this.player.y + direction.y * 62,
      duration: 220,
      ease: 'Quad.Out'
    });
    slash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => slash.destroy());
  }
  private playBossMeleeSlash(direction: Phaser.Math.Vector2): void {
    if (!this.finalBoss) return;
    const slash = this.add.sprite(this.finalBoss.x + direction.x * 118, this.finalBoss.y + direction.y * 118, 'sword-air-slash')
      .setDisplaySize(300, 300)
      .setTint(0x52ff45)
      .setAlpha(0.88)
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD);

    slash.rotation = Phaser.Math.Angle.Between(0, 0, direction.x, direction.y) + Math.PI;
    slash.play('sword-air-slash-swing');
    this.tweens.add({
      targets: slash,
      x: this.finalBoss.x + direction.x * 168,
      y: this.finalBoss.y + direction.y * 168,
      alpha: 0.12,
      duration: 320,
      ease: 'Quad.Out'
    });
    slash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => slash.destroy());
  }
  private nearestEnemy(range: number): Enemy | null { let nearest: Enemy | null = null; let best = Number.POSITIVE_INFINITY; this.enemies.children.each((child) => { const enemy = child as Enemy; if (!enemy.active) return true; const effectiveRange = range + this.enemyRangePadding(enemy); const distance = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y); if (distance <= effectiveRange ** 2 && distance < best) { best = distance; nearest = enemy; } return true; }); return nearest; }
  private enemyRangePadding(enemy: Enemy): number { return enemy.variantId === 'finalBoss' ? enemy.displayWidth * 0.35 : 0; }
  private updateProjectiles(): void {
    let activeThrownSwords = 0;
    this.projectiles.children.each((child) => {
      const projectile = child as Projectile;
      if (!projectile.active) return true;
      if (projectile.isBoomerang) projectile.updateBoomerang(this.player.x, this.player.y, this.weapon.projectileSpeed ?? WEAPON_CONFIG.projectileSpeed);
      if (projectile.isThrownSword) projectile.updateThrownSword(this.player.x, this.player.y, 520);
      if (this.time.now >= projectile.expiresAt) projectile.deactivate();
      if (projectile.active && projectile.isThrownSword) activeThrownSwords += 1;
      return true;
    });
    if (this.thrownSwordVolleyActive && activeThrownSwords === 0) {
      this.thrownSwordVolleyActive = false;
      this.thrownSwordCooldownReadyAt = this.time.now + this.thrownSwordCooldownMs();
    }
  }
  private updateSoulProjectiles(): void { this.soulProjectiles.children.each((child) => { const projectile = child as SoulProjectile; if (projectile.active && this.time.now >= projectile.expiresAt) projectile.deactivate(); return true; }); }
  private updateGems(): void { this.gems.children.each((child) => { const gem = child as ExperienceGem; if (gem.active) gem.attract(this.player, this.player.pickupRange); return true; }); }
  private projectileHit(projectileObject: ArcadeColliderObject, enemyObject: ArcadeColliderObject): void { const projectile = projectileObject as unknown as Projectile; const enemy = enemyObject as unknown as Enemy; if (!projectile.active || !enemy.active || !projectile.canDamage(enemy)) return; this.damageEnemy(enemy, this.projectileDamage(projectile, enemy)); this.triggerStaffExplosion(projectile, enemy); if (this.tryProjectileRicochet(projectile, enemy)) return; if (!projectile.isBoomerang) { if (projectile.remainingPierces <= 0) projectile.deactivate(); else projectile.remainingPierces -= 1; } }
  private projectileDamage(projectile: Projectile, enemy: Enemy): number {
    if (this.shouldExecuteWithStaff(projectile, enemy)) return enemy.health;
    if (projectile.criticalChance > 0 && Math.random() < projectile.criticalChance) {
      this.showCriticalText(enemy);
      return projectile.damage * 2;
    }
    return projectile.damage;
  }
  private shouldExecuteWithStaff(projectile: Projectile, enemy: Enemy): boolean {
    if (!projectile.executesCommonEnemy || projectile.executeToken <= 0 || !this.isCommonEnemy(enemy) || this.consumedStaffExecuteTokens.has(projectile.executeToken)) return false;
    this.consumedStaffExecuteTokens.add(projectile.executeToken);
    return true;
  }
  private triggerStaffExplosion(projectile: Projectile, hitEnemy: Enemy): void {
    if (!projectile.explodesOnHit || projectile.executeToken <= 0) return;
    const radius = 50;
    for (let index = 0; index < this.staffExplosionCount(); index += 1) {
      const explosion = this.add.circle(hitEnemy.x, hitEnemy.y, radius, 0x6ee7ff, 0.18).setStrokeStyle(3, 0xc7f9ff, 0.85).setDepth(7);
      this.tweens.add({ targets: explosion, alpha: 0, scale: 1.18 + index * 0.1, duration: 220 + index * 45, onComplete: () => explosion.destroy() });
      this.enemies.children.each((child) => {
        const enemy = child as Enemy;
        if (!enemy.active || enemy === hitEnemy) return true;
        if (Phaser.Math.Distance.Between(hitEnemy.x, hitEnemy.y, enemy.x, enemy.y) <= radius) this.damageEnemy(enemy, projectile.damage);
        return true;
      });
    }
  }
  private staffExplosionCount(): number {
    return 1 + Math.max(0, this.player.weaponUpgradeCount - 5);
  }
  private isCommonEnemy(enemy: Enemy): boolean {
    return enemy.variantId !== 'superSkeleton' && enemy.variantId !== 'finalBoss';
  }
  private boomerangCriticalChance(): number {
    return 0.15 + this.player.weaponUpgradeCount * 0.025;
  }
  private showCriticalText(enemy: Enemy): void {
    const text = this.add.text(enemy.x, enemy.y - enemy.displayHeight / 2 - 10, 'CRIT!', {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '22px',
      color: '#ffe45c',
      stroke: '#321b00',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: text, y: text.y - 34, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => text.destroy() });
  }
  private tryProjectileRicochet(projectile: Projectile, hitEnemy: Enemy): boolean {
    if (projectile.isBoomerang && projectile.returning) return false;
    if (projectile.remainingRicochets <= 0 || Math.random() >= this.player.projectileRicochetChance) return false;
    const target = this.nearestRicochetTarget(projectile, hitEnemy);
    if (!target) return false;
    projectile.ricochetTo(target.x, target.y, this.weapon.projectileSpeed ?? WEAPON_CONFIG.projectileSpeed, this.time.now, projectile.isBoomerang);
    return true;
  }
  private nearestRicochetTarget(projectile: Projectile, hitEnemy: Enemy): Enemy | null {
    let nearest: Enemy | null = null;
    let best = this.weapon.range ** 2;
    this.enemies.children.each((child) => {
      const enemy = child as Enemy;
      if (!enemy.active || enemy === hitEnemy || projectile.hasDamaged(enemy)) return true;
      const distance = Phaser.Math.Distance.Squared(projectile.x, projectile.y, enemy.x, enemy.y);
      if (distance < best) {
        best = distance;
        nearest = enemy;
      }
      return true;
    });
    return nearest;
  }
  private damageEnemy(enemy: Enemy, amount: number): void {
    if (enemy === this.finalBoss && this.bossShieldActive && this.bossShield > 0) {
      const overflowDamage = Math.max(0, amount - this.bossShield);
      this.bossShield = Math.max(0, this.bossShield - amount);
      enemy.takeDamage(0);
      this.updateBossShieldVisual();
      if (this.bossShield <= 0) {
        this.endBossChannel();
        if (overflowDamage > 0) this.damageEnemy(enemy, overflowDamage);
      }
      return;
    }
    const damageDealt = Math.min(amount, enemy.health);
    if (this.weapon.id === 'sword' && this.player.lifeStealPercent > 0) this.player.heal(damageDealt * this.player.lifeStealPercent);
    if (enemy.takeDamage(amount)) this.defeatEnemy(enemy);
  }
  private soulProjectileHit(_playerObject: ArcadeColliderObject, projectileObject: ArcadeColliderObject): void { const projectile = projectileObject as unknown as SoulProjectile; if (!projectile.active) return; this.player.applySlow(projectile.slowPercent, projectile.slowDurationMs, this.time.now); const damaged = this.player.damage(projectile.damage, this.time.now); projectile.deactivate(); if (damaged && this.player.health <= 0) this.finish(false); }
  private defeatEnemy(enemy: Enemy): void {
    this.kills += 1;
    if (enemy === this.finalBoss) {
      this.finalBossActive = false;
      this.finalBossArrow?.setVisible(false);
      this.endBossChannel();
      enemy.deactivate();
      this.finish(true);
      return;
    }
    for (let index = 0; index < enemy.experienceDrops; index += 1) {
      const gem = this.availableGem();
      if (!gem) break;
      const offset = new Phaser.Math.Vector2().setToPolar(Math.random() * Math.PI * 2, index === 0 ? 0 : Phaser.Math.Between(12, 28));
      gem.activate(enemy.x + offset.x, enemy.y + offset.y, enemy.experience);
    }
    enemy.deactivate();
  }
  private availableGem(): ExperienceGem | null { let gem = this.gems.getFirstDead(false) as ExperienceGem | null; if (!gem && !this.gems.isFull()) { gem = new ExperienceGem(this); this.gems.add(gem); } return gem; }
  private playerHit(_playerObject: ArcadeColliderObject, enemyObject: ArcadeColliderObject): void { const enemy = enemyObject as unknown as Enemy; if (!enemy.active || enemy.contactDamage <= 0 || !this.player.damage(enemy.contactDamage, this.time.now)) return; if (this.player.health <= 0) this.finish(false); }
  private collectGem(_playerObject: ArcadeColliderObject, gemObject: ArcadeColliderObject): void { const gem = gemObject as unknown as ExperienceGem; if (!gem.active) return; this.experience += gem.value; gem.deactivate(); this.processExperience(); }
  private processExperience(): void { if (this.experience < this.experienceNeeded || this.levelPending) return; this.experience -= this.experienceNeeded; this.level += 1; this.experienceNeeded = requiredExperience(this.level); this.levelPending = true; this.showUpgrades(); }
  private prepareStartingWeaponUpgrades(): void {
    const character = CHARACTERS[this.characterId];
    if (character.preferredWeaponId !== this.weapon.id || !character.startingWeaponUpgradeChoices) return;
    this.startingUpgradeChoicesRemaining = character.startingWeaponUpgradeChoices;
    this.startingUpgradeChoicesTotal = character.startingWeaponUpgradeChoices;
    this.levelPending = true;
    this.time.delayedCall(120, () => this.showStartingWeaponUpgrade());
  }
  private showStartingWeaponUpgrade(): void {
    if (this.startingUpgradeChoicesRemaining <= 0) {
      this.levelPending = false;
      this.physics.resume();
      return;
    }
    const character = CHARACTERS[this.characterId];
    const currentChoice = this.startingUpgradeChoicesTotal - this.startingUpgradeChoicesRemaining + 1;
    this.showUpgradeSelection(
      `${character.name}: escolha uma melhoria inicial (${currentChoice}/${this.startingUpgradeChoicesTotal})`,
      () => {
        this.startingUpgradeChoicesRemaining -= 1;
        if (this.startingUpgradeChoicesRemaining > 0) this.time.delayedCall(90, () => this.showStartingWeaponUpgrade());
        else {
          this.levelPending = false;
          this.physics.resume();
          this.processExperience();
        }
      },
      true
    );
  }
  private showUpgradeSelection(titleText: string, onSelect: () => void, weaponOnly = false): void {
    this.physics.pause();
    const veil = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090b12, 0.84).setScrollFactor(0).setDepth(30);
    const title = this.add.text(GAME_WIDTH / 2, 190, titleText, { fontFamily: TITLE_FONT_FAMILY, fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this.levelOverlay = [veil, title];
    const spacing = 230;
    const startX = GAME_WIDTH / 2 - spacing;
    this.upgrades.choices(this.weapon, this.player, weaponOnly).forEach((upgrade, index) => this.upgradeCard(upgrade, startX + index * spacing, onSelect));
  }
  private showUpgrades(): void { this.showUpgradeSelection(`NÍVEL ${this.level}! Escolha uma melhoria`, () => { this.levelPending = false; this.physics.resume(); this.processExperience(); }); }
  private upgradeCard(upgrade: Upgrade, x: number, onSelect?: () => void): void { const card = this.add.rectangle(x, 410, 200, 220, 0x49326e).setStrokeStyle(3, 0xa888d9).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true }); const iconKey = UPGRADE_ICON_KEYS[upgrade.id]; const icon = this.add.image(x, 350, iconKey).setDisplaySize(64, 64).setScrollFactor(0).setDepth(32); const name = this.add.text(x, 407, upgrade.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#fff0c2', align: 'center', wordWrap: { width: 170 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32); const description = this.add.text(x, 468, upgrade.description, { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#eee8ff', align: 'center', wordWrap: { width: 165 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32); this.levelOverlay.push(card, icon, name, description); card.on('pointerup', () => { upgrade.apply(this.player); this.player.addWeaponUpgrade(); this.selectedUpgradeCounts.set(upgrade.id, (this.selectedUpgradeCounts.get(upgrade.id) ?? 0) + 1); this.updateBuildHud(); this.levelOverlay.forEach((object) => object.destroy()); this.levelOverlay = []; if (onSelect) onSelect(); else { this.levelPending = false; this.physics.resume(); this.processExperience(); } }); }
  private updateBuildHud(): void {
    const weaponIcon = `weapon-${this.weapon.id}-icon`;
    const upgrades = [...this.selectedUpgradeCounts.entries()].map(([id, count]) => ({ textureKey: UPGRADE_ICON_KEYS[id] ?? 'upgrade-damage-icon', count }));
    this.hud.setBuild([{ textureKey: weaponIcon, count: 1 }, ...upgrades]);
  }
  private togglePause(): void { this.paused = !this.paused; if (this.paused) this.showPauseScreen(); else this.resumeFromPause(); }
  private showPauseScreen(): void { this.physics.pause(); this.destroyPauseOverlay(); const addOverlay = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.pauseOverlay.push(object); return object; }; addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x080a10, 0.72).setScrollFactor(0).setDepth(25)); addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 420, 300, 0x21182f, 0.96).setStrokeStyle(3, 0xa888d9).setScrollFactor(0).setDepth(26)); addOverlay(this.add.text(GAME_WIDTH / 2, 280, 'PAUSADO', { fontFamily: TITLE_FONT_FAMILY, fontSize: '44px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(27)); this.pauseButton('CONTINUAR', 370, () => this.togglePause(), addOverlay); this.pauseButton('VOLTAR AO MENU', 445, () => { this.paused = false; this.destroyPauseOverlay(); this.scene.start('menu'); }, addOverlay); }
  private pauseButton(label: string, y: number, action: () => void, addOverlay: <T extends Phaser.GameObjects.GameObject>(object: T) => T): void { const button = addOverlay(this.add.text(GAME_WIDTH / 2, y, label, { fontFamily: TITLE_FONT_FAMILY, fontSize: '22px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 24, y: 12 } }).setOrigin(0.5).setScrollFactor(0).setDepth(27).setInteractive({ useHandCursor: true })); button.on('pointerover', () => button.setStyle({ backgroundColor: '#896bd0' })); button.on('pointerout', () => button.setStyle({ backgroundColor: '#6b4db3' })); button.on('pointerup', action); }
  private resumeFromPause(): void { this.physics.resume(); this.destroyPauseOverlay(); }
  private destroyPauseOverlay(): void { this.pauseOverlay.forEach((object) => object.destroy()); this.pauseOverlay = []; }
  private finish(victory: boolean): void { this.ended = true; this.physics.pause(); const title = victory ? 'VITÓRIA!' : 'DERROTA'; this.add.rectangle(640, 360, 1280, 720, 0x070910, 0.88).setScrollFactor(0).setDepth(40); this.add.text(640, 215, title, { fontFamily: TITLE_FONT_FAMILY, fontSize: '52px', color: victory ? '#ffe07a' : '#ef7780' }).setOrigin(0.5).setScrollFactor(0).setDepth(41); this.add.text(640, 320, `Tempo sobrevivido: ${Math.floor(this.elapsedMs / 1000)}s\nNível alcançado: ${this.level}\nEliminações: ${this.kills}`, { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#f1f1f4', align: 'center', lineSpacing: 12 }).setOrigin(0.5).setScrollFactor(0).setDepth(41); this.resultButton('REINICIAR', 555, () => this.scene.restart({ playerTexture: this.selectedPlayerTexture })); this.resultButton('VOLTAR AO MENU', 620, () => this.scene.start('menu')); }
  private resultButton(label: string, y: number, action: () => void): void { const button = this.add.text(640, y, label, { fontFamily: TITLE_FONT_FAMILY, fontSize: '21px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true }); button.on('pointerup', action); }
}
