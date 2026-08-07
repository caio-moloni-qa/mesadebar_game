import Phaser from 'phaser';
import { ENEMY_VARIANTS, ENEMY_VARIANT_SCHEDULE, EnemyVariantScheduleEntry, LOOT_CHEST_DROP_CHANCE, WEAPON_CONFIG, requiredExperience } from '../config/balance';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH, RUN_DURATION_MS, WORLD_SIZE } from '../config/gameConfig';
import { Enemy, EnemyVariantConfig } from '../entities/Enemy';
import { CurrencyGem } from '../entities/CurrencyGem';
import { LootChest } from '../entities/LootChest';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SoulProjectile } from '../entities/SoulProjectile';
import { BossHost, BossSystem } from '../systems/BossSystem';
import { DifficultySystem } from '../systems/DifficultySystem';
import { MerchantHost, MerchantSystem } from '../systems/MerchantSystem';
import { SandboxDebugHost, SandboxDebugPanel } from '../systems/SandboxDebugPanel';
import { sandboxState } from '../systems/SandboxState';
import { Upgrade, UpgradeSystem } from '../systems/UpgradeSystem';
import { GameHud } from '../ui/GameHud';
import { CHARACTERS } from '../config/characters';
import { MAX_ACTIVE_WEAPONS, WEAPONS, WeaponConfig, WeaponFamily, weaponFamily } from '../config/weapons';

type ArcadeColliderObject = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile;
interface GameSceneData { characterId?: keyof typeof CHARACTERS; weaponId?: keyof typeof WEAPONS; playerTexture?: string; }
interface ActiveWeapon {
  config: WeaponConfig;
  upgradeCount: number;
  lastAttackAt: number;
  lastWhirlwindAt: number;
  thrownSwordCooldownReadyAt: number;
  thrownSwordVolleyActive: boolean;
  staffAttacksSinceExecute: number;
  staffExecuteToken: number;
}

interface StartingUpgradeSnapshot {
  player: Pick<Player, 'damageMultiplier' | 'attackSpeedMultiplier' | 'movementSpeed' | 'lifeStealPercent' | 'meleeRangeBonus' | 'meleeExtraAttackChance' | 'meleeExtraAttackMax' | 'whirlwindUnlocked' | 'projectileExtraCount' | 'projectileRicochetChance' | 'projectileRicochetMax' | 'projectileSizeBonus'>;
  weaponUpgradeCounts: number[];
  selectedUpgradeCounts: Map<string, number>;
}
/** The single center-screen card used by the chest "slot machine" roll — see playChestRollAnimation. */
interface ChestRollCard {
  title: Phaser.GameObjects.Text;
  card: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  description: Phaser.GameObjects.Text;
}

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

export class GameScene extends Phaser.Scene {
  private player!: Player; private enemies!: Phaser.Physics.Arcade.Group; private projectiles!: Phaser.Physics.Arcade.Group; private soulProjectiles!: Phaser.Physics.Arcade.Group; private gems!: Phaser.Physics.Arcade.Group; private chests!: Phaser.Physics.Arcade.Group;
  private hud!: GameHud; private cursors!: Phaser.Types.Input.Keyboard.CursorKeys; private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private mobileMode = false; private mobileDirection = new Phaser.Math.Vector2(); private joystickKnob?: Phaser.GameObjects.Arc; private joystickZone?: Phaser.GameObjects.Zone; private joystickPointerId: number | null = null;
  private elapsedMs = 0; private spawnElapsed = 0; private readonly variantSpawnElapsed = new Map<string, number>(ENEMY_VARIANT_SCHEDULE.map((entry) => [entry.variantId, 0])); private apparitionHordeLevel = 0; private superSkeletonSpawnCount = 1; private kills = 0; private level = 1; private experience = 0; private experienceNeeded = requiredExperience(1); private currency = 0;
  private paused = false; private ended = false; private levelPending = false; private chestRollActive = false; private startingUpgradeChoicesRemaining = 0; private startingUpgradeChoicesTotal = 0; private startingUpgradeSnapshot?: StartingUpgradeSnapshot; private startingUpgradePool?: Upgrade[]; private readonly consumedStaffExecuteTokens = new Set<number>(); private readonly selectedUpgradeCounts = new Map<string, number>(); private readonly difficulty = new DifficultySystem(); private readonly upgrades = new UpgradeSystem();
  private mapFogGraphics: Phaser.GameObjects.Graphics[] = [];
  private levelOverlay: Phaser.GameObjects.GameObject[] = [];
  private pauseOverlay: Phaser.GameObjects.GameObject[] = [];
  private characterId: keyof typeof CHARACTERS = 'barbarian'; private weapons: ActiveWeapon[] = [];
  private get primaryWeapon(): WeaponConfig { return this.weapons[0].config; }
  private affinityFamilies: Set<WeaponFamily> = new Set();
  private get selectedPlayerTexture(): string { return CHARACTERS[this.characterId].texture; }
  private readonly merchant: MerchantSystem = new MerchantSystem(this.buildMerchantHost());
  private readonly sandbox: SandboxDebugPanel = new SandboxDebugPanel(this.buildSandboxHost());
  private readonly bossSystem: BossSystem = new BossSystem(this.buildBossHost());

  constructor() { super('game'); }

  private buildMerchantHost(): MerchantHost {
    return {
      scene: this,
      getPlayer: () => this.player,
      getKeys: () => this.keys,
      getEnemies: () => this.enemies,
      getProjectiles: () => this.projectiles,
      getSoulProjectiles: () => this.soulProjectiles,
      getGems: () => this.gems,
      getCurrency: () => this.currency,
      spendCurrency: (amount) => { this.currency -= amount; },
      getAffinityFamilies: () => this.affinityFamilies,
      addAffinityFamily: (family) => { this.affinityFamilies.add(family); },
      isMerchantEnabled: () => this.sandbox.isMerchantEnabled(),
      isBossEncounterActive: () => this.bossSystem.hasActiveEncounter(),
      setLevelPending: (value) => { this.levelPending = value; }
    };
  }
  private buildSandboxHost(): SandboxDebugHost {
    return {
      scene: this,
      addCurrency: (amount) => { this.currency += amount; },
      killAllActiveEnemies: () => this.sandboxKillAllEnemies(),
      adjustElapsedMs: (deltaMs) => { this.elapsedMs = Math.max(0, this.elapsedMs + deltaMs); },
      setForcedDifficultyStage: (stage) => this.difficulty.setForcedStage(stage),
      setEnemySpawnCap: (cap) => { this.enemies.maxSize = cap; },
      setMapFogVisible: (visible) => this.mapFogGraphics.forEach((graphics) => graphics.setVisible(visible)),
      spawnVariantNearPlayer: (id, count) => this.sandboxSpawnVariant(id, count),
      spawnExtraBoss: () => this.bossSystem.spawnExtraBoss(),
      setPlayerInvincible: (invincible) => { this.player.invincible = invincible; }
    };
  }
  private buildBossHost(): BossHost {
    return {
      scene: this,
      getPlayer: () => this.player,
      isEnded: () => this.ended,
      spawnEnemyVariant: (x, y, config) => this.spawnEnemyVariant(x, y, config),
      enemyConfig: (id, overrides) => this.enemyConfig(id, overrides),
      clearEnemyField: (preserve) => this.clearEnemyField(preserve),
      finish: (victory) => this.finish(victory),
      refreshHud: () => this.updateHud()
    };
  }
  private updateHud(): void {
    this.hud.update(this.player.health, this.player.maxHealth, this.level, this.experience, this.experienceNeeded, this.elapsedMs, this.kills, this.currency, this.player.isRotten());
  }

  init(data: GameSceneData): void {
    if (!data.characterId || !data.weaponId) { this.scene.start('menu'); return; }
    this.characterId = data.characterId; this.weapons = [this.createActiveWeapon(WEAPONS[data.weaponId])];
    this.affinityFamilies = new Set([weaponFamily(WEAPONS[data.weaponId])]);
    this.elapsedMs = 0; this.spawnElapsed = 0; ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.variantId, 0)); this.apparitionHordeLevel = 0; this.superSkeletonSpawnCount = 1; this.kills = 0; this.level = 1; this.experience = 0; this.experienceNeeded = requiredExperience(1); this.currency = 0;
    this.paused = false; this.ended = false; this.levelPending = false; this.chestRollActive = false; this.startingUpgradeChoicesRemaining = 0; this.startingUpgradeChoicesTotal = 0; this.startingUpgradeSnapshot = undefined; this.startingUpgradePool = undefined; this.consumedStaffExecuteTokens.clear(); this.selectedUpgradeCounts.clear(); this.levelOverlay = []; this.pauseOverlay = [];
    this.bossSystem.reset();
    this.merchant.reset();
    this.sandbox.resetUiRefs();
    this.mapFogGraphics = [];
  }
  private createActiveWeapon(config: WeaponConfig): ActiveWeapon {
    return { config, upgradeCount: 0, lastAttackAt: 0, lastWhirlwindAt: 0, thrownSwordCooldownReadyAt: 0, thrownSwordVolleyActive: false, staffAttacksSinceExecute: 0, staffExecuteToken: 0 };
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.tileSprite(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 'grass-ruins-ground').setDepth(0);
    this.createMapFog();
    this.player = new Player(this, WORLD_SIZE / 2, WORLD_SIZE / 2, CHARACTERS[this.characterId]);
    this.player.invincible = this.sandbox.isInvincible();
    this.enemies = this.physics.add.group({ classType: Enemy, maxSize: this.sandbox.initialSpawnCap(), runChildUpdate: false });
    this.projectiles = this.physics.add.group({ classType: Projectile, maxSize: 80, runChildUpdate: false });
    this.soulProjectiles = this.physics.add.group({ classType: SoulProjectile, maxSize: 80, runChildUpdate: false });
    this.gems = this.physics.add.group({ classType: CurrencyGem, maxSize: 120, runChildUpdate: false });
    this.chests = this.physics.add.group({ classType: LootChest, maxSize: 10, runChildUpdate: false });
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE).startFollow(this.player, true, 0.12, 0.12);
    this.cursors = this.input.keyboard!.createCursorKeys(); this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,ESC,F9') as Record<string, Phaser.Input.Keyboard.Key>;
    this.mobileMode = this.isTouchDevice();
    if (this.mobileMode) this.createMobileControls();
    this.physics.add.overlap(this.projectiles, this.enemies, this.projectileHit, undefined, this);
    this.physics.add.overlap(this.player, this.soulProjectiles, this.soulProjectileHit, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.playerHit, undefined, this);
    this.physics.add.overlap(this.player, this.gems, this.collectGem, undefined, this);
    this.physics.add.overlap(this.player, this.chests, this.collectChest, undefined, this);
    this.hud = new GameHud(this); this.updateBuildHud();
    this.updateHud();
    this.hud.setVisible(false);
    this.prepareStartingWeaponUpgrades(); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllKeys(true);
      this.input.off('pointermove', this.updateJoystick, this);
      this.input.off('pointerup', this.releaseJoystick, this);
      this.input.off('pointerupoutside', this.releaseJoystick, this);
    });
    if (sandboxState.enabled) this.sandbox.setActive(true);
  }
  private toggleSandboxMode(): void {
    sandboxState.enabled = !sandboxState.enabled;
    this.sandbox.setActive(sandboxState.enabled);
  }
  private sandboxKillAllEnemies(): void {
    const activeEnemies: Enemy[] = [];
    this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active) activeEnemies.push(enemy); return true; });
    activeEnemies.forEach((enemy) => this.defeatEnemy(enemy));
  }
  private sandboxSpawnVariant(id: EnemyVariantConfig['id'], count: number): void {
    const overrides: Partial<Omit<EnemyVariantConfig, 'id'>> =
      id === 'necromancerWraith' ? { isStatic: true, displaySize: 68 } :
      id === 'apparitionWraith' ? { displaySize: 68 } :
      id === 'superSkeleton' ? { isMiniBoss: true, displaySize: 92 } : {};
    for (let index = 0; index < count; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(160, 260);
      this.spawnEnemyVariant(this.player.x + Math.cos(angle) * distance, this.player.y + Math.sin(angle) * distance, this.enemyConfig(id, overrides));
    }
  }
  private createMapFog(): void {
    const fogWidth = 320;
    const color = 0xdfe9f0;
    const edgeAlpha = 0.55;
    const top = this.add.graphics().setDepth(8);
    top.fillGradientStyle(color, color, color, color, edgeAlpha, edgeAlpha, 0, 0);
    top.fillRect(0, 0, WORLD_SIZE, fogWidth);
    const bottom = this.add.graphics().setDepth(8);
    bottom.fillGradientStyle(color, color, color, color, 0, 0, edgeAlpha, edgeAlpha);
    bottom.fillRect(0, WORLD_SIZE - fogWidth, WORLD_SIZE, fogWidth);
    const left = this.add.graphics().setDepth(8);
    left.fillGradientStyle(color, color, color, color, edgeAlpha, 0, edgeAlpha, 0);
    left.fillRect(0, 0, fogWidth, WORLD_SIZE);
    const right = this.add.graphics().setDepth(8);
    right.fillGradientStyle(color, color, color, color, 0, edgeAlpha, 0, edgeAlpha);
    right.fillRect(WORLD_SIZE - fogWidth, 0, fogWidth, WORLD_SIZE);
    this.mapFogGraphics = [top, bottom, left, right];
    this.mapFogGraphics.forEach((graphics) => graphics.setVisible(this.sandbox.isFogEnabled()));
  }
  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.F9)) this.toggleSandboxMode();
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC) && !this.ended && !this.levelPending) this.togglePause();
    if (this.paused || this.ended || this.levelPending) return;
    this.movePlayer();
    if (this.merchant.isInMerchant()) {
      this.merchant.updateInteraction();
      this.updateHud();
      return;
    }
    this.elapsedMs += delta; if (!this.bossSystem.hasTriggeredMainBoss() && this.elapsedMs >= RUN_DURATION_MS) this.bossSystem.warn();
    this.player.updatePassiveEffects(delta); this.spawnElapsed += delta; ENEMY_VARIANT_SCHEDULE.forEach((entry) => this.variantSpawnElapsed.set(entry.variantId, (this.variantSpawnElapsed.get(entry.variantId) ?? 0) + delta)); this.spawnEnemies(); this.spawnEnemyVariants(); this.bossSystem.update(delta); this.updateEnemies(); this.updateRottenAuras(); this.updateNecromancerAttacks(); this.autoAttack(); this.updateMeleeWhirlwind(); this.updateThrownSwordBuff(); this.updateProjectiles(); this.updateSoulProjectiles(); this.updateGems(); this.updateChests(); this.bossSystem.updateArrows(); this.merchant.update(delta);
    this.player.updateRottenStatus(delta);
    if (this.player.health <= 0) this.finish(false);
    this.updateHud();
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
  private spawnEnemies(): void { if (!this.sandbox.isSkeletonSpawnEnabled() || this.bossSystem.hasActiveEncounter()) return; const stage = this.difficulty.stageFor(this.elapsedMs); if (this.spawnElapsed < stage.spawnInterval) return; this.spawnElapsed = 0; for (let i = 0; i < stage.count; i += 1) this.spawnEnemy(stage.healthMultiplier); }
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
    if (!this.sandbox.isVariantSpawnEnabled() || this.bossSystem.hasActiveEncounter()) return;
    ENEMY_VARIANT_SCHEDULE.forEach((entry) => {
      const elapsed = this.variantSpawnElapsed.get(entry.variantId) ?? 0;
      if (elapsed < entry.intervalMs) return;
      this.variantSpawnElapsed.set(entry.variantId, 0);
      this.spawnScheduledVariant(entry.variantId);
    });
  }
  private spawnScheduledVariant(variantId: EnemyVariantScheduleEntry['variantId']): void {
    if (variantId === 'necromancerWraith') {
      const position = this.randomMapPosition();
      this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('necromancerWraith', { isStatic: true, displaySize: 68 }));
      return;
    }
    if (variantId === 'apparitionWraith') {
      const count = 10 + this.apparitionHordeLevel * 2;
      const health = ENEMY_VARIANTS.apparitionWraith.maxHealth + this.apparitionHordeLevel * 12;
      for (let index = 0; index < count; index += 1) {
        const position = this.randomBorderPosition();
        this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('apparitionWraith', { maxHealth: health, displaySize: 68 }));
      }
      this.apparitionHordeLevel += 1;
      return;
    }
    for (let index = 0; index < this.superSkeletonSpawnCount; index += 1) {
      const position = this.randomBorderPosition();
      this.spawnEnemyVariant(position.x, position.y, this.enemyConfig('superSkeleton', { isMiniBoss: true, displaySize: 92 }));
    }
    this.superSkeletonSpawnCount += 2;
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
  private updateEnemies(): void { this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active) { if (this.bossSystem.isChanneling(enemy)) enemy.pauseMovement(); else enemy.pursue(this.player); } return true; }); }
  /** Rotten Aura: refreshes the player's rotten-status timer whenever they're within range of any active rotten-aura enemy (Super Esqueleto, the final boss). The actual DoT/heal-cut lives on Player, ticked separately in update(). */
  private updateRottenAuras(): void {
    let inAura = false;
    this.enemies.children.each((child) => {
      const enemy = child as Enemy;
      if (!enemy.active || !enemy.hasRottenAura || enemy.rottenAuraSuppressed) return true;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) <= enemy.rottenAuraRadius()) inAura = true;
      return true;
    });
    if (inAura) this.player.refreshRottenAura(this.time.now);
  }
  private updateNecromancerAttacks(): void { this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active && enemy.canCastSoul(this.time.now)) this.launchSoulProjectile(enemy); return true; }); }
  private autoAttack(): void {
    this.weapons.forEach((weapon) => this.attackWithWeapon(weapon));
  }
  private attackWithWeapon(weapon: ActiveWeapon): void {
    if (this.time.now < weapon.lastAttackAt + weapon.config.cooldown / this.player.effectiveAttackSpeedMultiplier()) return;
    const enemy = this.nearestEnemy(this.attackRange(weapon));
    if (!enemy) return;
    if (weapon.config.type === 'cone') {
      weapon.lastAttackAt = this.time.now;
      const direction = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y).normalize();
      this.performMeleeAttack(weapon, direction);
      this.queueMeleeExtraAttacks(weapon, direction);
      return;
    }
    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
    const count = 1 + this.player.projectileExtraCount;
    const staffExecuteToken = this.staffExecuteTokenForAttack(weapon);
    let launched = false;
    this.projectileAngles(baseAngle, count).forEach((angle) => {
      launched = this.launchProjectile(weapon, angle, weapon.config.type === 'boomerang', staffExecuteToken) || launched;
    });
    if (launched) weapon.lastAttackAt = this.time.now;
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
  private staffExecuteTokenForAttack(weapon: ActiveWeapon): number {
    // Owning the staff isn't enough — this passive only kicks in with affinity for its family (matches the guardrail
    // that upgradeCount alone must not silently unlock a weapon's exclusive bonuses without real affinity).
    if (weapon.config.id !== 'staff' || weapon.upgradeCount < 5 || !this.affinityFamilies.has(weaponFamily(weapon.config))) return 0;
    if (weapon.staffAttacksSinceExecute >= 3) {
      weapon.staffAttacksSinceExecute = 0;
      weapon.staffExecuteToken += 1;
      return weapon.staffExecuteToken;
    }
    weapon.staffAttacksSinceExecute += 1;
    return 0;
  }
  private performMeleeAttack(weapon: ActiveWeapon, direction: Phaser.Math.Vector2): boolean {
    const attackDirection = direction.clone().normalize();
    const minDot = Math.cos(Phaser.Math.DegToRad((weapon.config.coneAngle ?? 90) / 2));
    let hit = false;
    this.enemies.children.each((child) => {
      const target = child as Enemy;
      if (!target.active) return true;
      const vector = new Phaser.Math.Vector2(target.x - this.player.x, target.y - this.player.y);
      if (vector.lengthSq() <= 0) return true;
      const range = this.attackRange(weapon) + this.enemyRangePadding(target);
      if (vector.lengthSq() <= range ** 2 && attackDirection.dot(vector.normalize()) >= minDot) {
        this.damageEnemy(target, weapon.config.baseDamage * this.player.damageMultiplier, weapon.config.id);
        hit = true;
      }
      return true;
    });
    this.playSwordSlash(attackDirection);
    return hit;
  }
  private queueMeleeExtraAttacks(weapon: ActiveWeapon, direction: Phaser.Math.Vector2): void {
    if (this.player.meleeExtraAttackMax <= 0 || Math.random() >= this.player.meleeExtraAttackChance) return;
    const fallbackDirection = direction.clone().normalize();
    for (let index = 1; index <= this.player.meleeExtraAttackMax; index += 1) {
      this.time.delayedCall(index * 110, () => {
        if (this.ended || this.paused || this.levelPending || weapon.config.type !== 'cone') return;
        const enemy = this.nearestEnemy(this.attackRange(weapon));
        const attackDirection = enemy
          ? new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y).normalize()
          : fallbackDirection;
        this.performMeleeAttack(weapon, attackDirection);
      });
    }
  }
  private updateMeleeWhirlwind(): void {
    this.weapons.filter((weapon) => weapon.config.type === 'cone').forEach((weapon) => this.updateMeleeWhirlwindFor(weapon));
  }
  private updateMeleeWhirlwindFor(weapon: ActiveWeapon): void {
    if (!this.player.whirlwindUnlocked || this.time.now < weapon.lastWhirlwindAt + 5000) return;
    if (!this.nearestEnemy(this.attackRange(weapon))) return;
    weapon.lastWhirlwindAt = this.time.now;
    [
      new Phaser.Math.Vector2(1, 0),
      new Phaser.Math.Vector2(0, 1),
      new Phaser.Math.Vector2(-1, 0),
      new Phaser.Math.Vector2(0, -1)
    ].forEach((direction, index) => {
      this.time.delayedCall(index * 70, () => {
        if (this.ended || this.paused || this.levelPending) return;
        this.performMeleeAttack(weapon, direction);
      });
    });
  }
  private updateThrownSwordBuff(): void {
    const swordWeapon = this.weapons.find((weapon) => weapon.config.id === 'sword');
    // Same guardrail as staffExecuteTokenForAttack: owning a sword picked up without affinity must not grant its
    // exclusive volley just because upgradeCount (shared across all owned weapons) happens to have climbed to 5.
    if (!swordWeapon || swordWeapon.upgradeCount < 5 || !this.affinityFamilies.has(weaponFamily(swordWeapon.config)) || swordWeapon.thrownSwordVolleyActive || this.time.now < swordWeapon.thrownSwordCooldownReadyAt) return;
    const enemy = this.nearestEnemy(WORLD_SIZE);
    if (!enemy) return;
    swordWeapon.thrownSwordVolleyActive = true;
    [
      new Phaser.Math.Vector2(1, 0),
      new Phaser.Math.Vector2(0, 1),
      new Phaser.Math.Vector2(-1, 0),
      new Phaser.Math.Vector2(0, -1)
    ].forEach((direction) => this.launchThrownSword(swordWeapon, direction));
  }
  private thrownSwordCooldownMs(weapon: ActiveWeapon): number {
    return Math.max(1000, 10000 - Math.max(0, weapon.upgradeCount - 5) * 1000);
  }
  private attackRange(weapon: ActiveWeapon): number {
    return weapon.config.range + (weapon.config.type === 'cone' ? this.player.meleeRangeBonus : 0);
  }
  private launchThrownSword(weapon: ActiveWeapon, direction: Phaser.Math.Vector2): void {
    let projectile = this.projectiles.getFirstDead(false) as Projectile | null;
    if (!projectile && this.projectiles.isFull()) return;
    if (!projectile) { projectile = new Projectile(this); this.projectiles.add(projectile); }
    const start = new Phaser.Math.Vector2(this.player.x + direction.x * 42, this.player.y + direction.y * 42);
    const edge = this.worldEdgePoint(start, direction);
    const speed = 520;
    const distance = Phaser.Math.Distance.Between(start.x, start.y, edge.x, edge.y);
    const lifetime = Math.ceil((distance * 2) / speed * 1000) + 600;
    projectile.fire(start.x, start.y, edge.x, edge.y, weapon.config.baseDamage * this.player.damageMultiplier, speed, lifetime, Number.POSITIVE_INFINITY, 0, this.time.now, false, distance);
    projectile.speed = speed;
    projectile.range = distance;
    projectile.weaponId = weapon.config.id;
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
  private launchProjectile(weapon: ActiveWeapon, angle: number, isBoomerang: boolean, staffExecuteToken = 0): boolean {
    let projectile = this.projectiles.getFirstDead(false) as Projectile | null;
    if (!projectile && this.projectiles.isFull()) return false;
    if (!projectile) { projectile = new Projectile(this); this.projectiles.add(projectile); }
    const range = weapon.config.range;
    const speed = weapon.config.projectileSpeed ?? WEAPON_CONFIG.projectileSpeed;
    projectile.fire(this.player.x, this.player.y, this.player.x + Math.cos(angle) * range, this.player.y + Math.sin(angle) * range, weapon.config.baseDamage * this.player.damageMultiplier, speed, weapon.config.projectileLifetime ?? WEAPON_CONFIG.lifetimeMs, WEAPON_CONFIG.pierces, this.player.projectileRicochetMax, this.time.now, isBoomerang, range, 1 + this.player.projectileSizeBonus);
    projectile.speed = speed;
    projectile.range = range;
    projectile.weaponId = weapon.config.id;
    projectile.executesCommonEnemy = staffExecuteToken > 0;
    projectile.explodesOnHit = staffExecuteToken > 0;
    projectile.executeToken = staffExecuteToken;
    projectile.criticalChance = isBoomerang && weapon.upgradeCount >= 5 && this.affinityFamilies.has(weaponFamily(weapon.config)) ? this.boomerangCriticalChance(weapon.upgradeCount) : 0;
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
  private clearEnemyField(preserve?: Enemy): number {
    let clearedEnemies = 0;
    this.enemies.children.each((child) => { const enemy = child as Enemy; if (enemy.active && enemy !== preserve) { enemy.deactivate(); clearedEnemies += 1; } return true; });
    this.projectiles.children.each((child) => { const projectile = child as Projectile; if (projectile.active) projectile.deactivate(); return true; });
    this.soulProjectiles.children.each((child) => { const projectile = child as SoulProjectile; if (projectile.active) projectile.deactivate(); return true; });
    return clearedEnemies;
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
  private nearestEnemy(range: number): Enemy | null { let nearest: Enemy | null = null; let best = Number.POSITIVE_INFINITY; this.enemies.children.each((child) => { const enemy = child as Enemy; if (!enemy.active) return true; const effectiveRange = range + this.enemyRangePadding(enemy); const distance = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y); if (distance <= effectiveRange ** 2 && distance < best) { best = distance; nearest = enemy; } return true; }); return nearest; }
  private enemyRangePadding(enemy: Enemy): number { return enemy.variantId === 'finalBoss' ? enemy.displayWidth * 0.35 : 0; }
  private updateProjectiles(): void {
    let activeThrownSwords = 0;
    this.projectiles.children.each((child) => {
      const projectile = child as Projectile;
      if (!projectile.active) return true;
      if (projectile.isBoomerang) projectile.updateBoomerang(this.player.x, this.player.y);
      if (projectile.isThrownSword) projectile.updateThrownSword(this.player.x, this.player.y);
      if (this.time.now >= projectile.expiresAt) projectile.deactivate();
      if (projectile.active && projectile.isThrownSword) activeThrownSwords += 1;
      return true;
    });
    const swordWeapon = this.weapons.find((weapon) => weapon.config.id === 'sword');
    if (swordWeapon?.thrownSwordVolleyActive && activeThrownSwords === 0) {
      swordWeapon.thrownSwordVolleyActive = false;
      swordWeapon.thrownSwordCooldownReadyAt = this.time.now + this.thrownSwordCooldownMs(swordWeapon);
    }
  }
  private updateSoulProjectiles(): void { this.soulProjectiles.children.each((child) => { const projectile = child as SoulProjectile; if (projectile.active && this.time.now >= projectile.expiresAt) projectile.deactivate(); return true; }); }
  private updateGems(): void { this.gems.children.each((child) => { const gem = child as CurrencyGem; if (gem.active) gem.attract(this.player, this.player.pickupRange); return true; }); }
  private updateChests(): void { this.chests.children.each((child) => { const chest = child as LootChest; if (chest.active) chest.attract(this.player, this.player.pickupRange); return true; }); }
  private projectileHit(projectileObject: ArcadeColliderObject, enemyObject: ArcadeColliderObject): void { const projectile = projectileObject as unknown as Projectile; const enemy = enemyObject as unknown as Enemy; if (!projectile.active || !enemy.active || !projectile.canDamage(enemy)) return; const { amount, critical } = this.projectileDamage(projectile, enemy); this.damageEnemy(enemy, amount, projectile.weaponId, critical); this.triggerStaffExplosion(projectile, enemy); if (this.tryProjectileRicochet(projectile, enemy)) return; if (!projectile.isBoomerang) { if (projectile.remainingPierces <= 0) projectile.deactivate(); else projectile.remainingPierces -= 1; } }
  private projectileDamage(projectile: Projectile, enemy: Enemy): { amount: number; critical: boolean } {
    if (this.shouldExecuteWithStaff(projectile, enemy)) return { amount: enemy.health, critical: false };
    if (projectile.criticalChance > 0 && Math.random() < projectile.criticalChance) return { amount: projectile.damage * 2, critical: true };
    return { amount: projectile.damage, critical: false };
  }
  private shouldExecuteWithStaff(projectile: Projectile, enemy: Enemy): boolean {
    if (!projectile.executesCommonEnemy || projectile.executeToken <= 0 || !this.isCommonEnemy(enemy) || this.consumedStaffExecuteTokens.has(projectile.executeToken)) return false;
    this.consumedStaffExecuteTokens.add(projectile.executeToken);
    return true;
  }
  private triggerStaffExplosion(projectile: Projectile, hitEnemy: Enemy): void {
    if (!projectile.explodesOnHit || projectile.executeToken <= 0) return;
    const radius = 50;
    const upgradeCount = this.weapons.find((weapon) => weapon.config.id === projectile.weaponId)?.upgradeCount ?? 0;
    for (let index = 0; index < this.staffExplosionCount(upgradeCount); index += 1) {
      const explosion = this.add.circle(hitEnemy.x, hitEnemy.y, radius, 0x6ee7ff, 0.18).setStrokeStyle(3, 0xc7f9ff, 0.85).setDepth(7);
      this.tweens.add({ targets: explosion, alpha: 0, scale: 1.18 + index * 0.1, duration: 220 + index * 45, onComplete: () => explosion.destroy() });
      this.enemies.children.each((child) => {
        const enemy = child as Enemy;
        if (!enemy.active || enemy === hitEnemy) return true;
        if (Phaser.Math.Distance.Between(hitEnemy.x, hitEnemy.y, enemy.x, enemy.y) <= radius) this.damageEnemy(enemy, projectile.damage, projectile.weaponId);
        return true;
      });
    }
  }
  private staffExplosionCount(upgradeCount: number): number {
    return 1 + Math.max(0, upgradeCount - 5);
  }
  private isCommonEnemy(enemy: Enemy): boolean {
    return enemy.variantId !== 'superSkeleton' && enemy.variantId !== 'finalBoss';
  }
  private boomerangCriticalChance(upgradeCount: number): number {
    return 0.15 + upgradeCount * 0.025;
  }
  /** Shared by the "CRIT!" callout and enemy damage numbers so both rise/fade identically; `delayMs` staggers the damage number behind a crit on the same hit. */
  private spawnFloatingCombatText(x: number, y: number, message: string, color: string, delayMs: number): void {
    this.time.delayedCall(delayMs, () => {
      const text = this.add.text(x, y, message, {
        fontFamily: TITLE_FONT_FAMILY,
        fontSize: '22px',
        color,
        stroke: '#321b00',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(15);
      this.tweens.add({ targets: text, y: text.y - 34, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => text.destroy() });
    });
  }
  private tryProjectileRicochet(projectile: Projectile, hitEnemy: Enemy): boolean {
    if (projectile.isBoomerang && projectile.returning) return false;
    if (projectile.remainingRicochets <= 0 || Math.random() >= this.player.projectileRicochetChance) return false;
    const target = this.nearestRicochetTarget(projectile, hitEnemy);
    if (!target) return false;
    projectile.ricochetTo(target.x, target.y, projectile.speed, this.time.now, projectile.isBoomerang);
    return true;
  }
  private nearestRicochetTarget(projectile: Projectile, hitEnemy: Enemy): Enemy | null {
    let nearest: Enemy | null = null;
    let best = projectile.range ** 2;
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
  private damageEnemy(enemy: Enemy, amount: number, sourceWeaponId?: string, isCritical = false): void {
    const overflow = this.bossSystem.tryAbsorbShieldDamage(enemy, amount);
    if (overflow !== null) {
      if (overflow <= 0) return;
      amount = overflow;
    }
    const damageDealt = Math.min(amount, enemy.health);
    if (sourceWeaponId === 'sword' && this.player.lifeStealPercent > 0) this.player.heal(damageDealt * this.player.lifeStealPercent);
    const textX = enemy.x;
    const textY = enemy.y - enemy.displayHeight / 2 - 10;
    if (isCritical) this.spawnFloatingCombatText(textX, textY, 'CRIT!', '#ffe45c', 0);
    this.spawnFloatingCombatText(textX, textY, `- ${Math.round(amount)}`, '#ff5c5c', isCritical ? 150 : 0);
    if (enemy.takeDamage(amount)) this.defeatEnemy(enemy);
  }
  private soulProjectileHit(_playerObject: ArcadeColliderObject, projectileObject: ArcadeColliderObject): void { const projectile = projectileObject as unknown as SoulProjectile; if (!projectile.active) return; this.player.applySlow(projectile.slowPercent, projectile.slowDurationMs, this.time.now); const damaged = this.player.damage(projectile.damage, this.time.now); projectile.deactivate(); if (damaged && this.player.health <= 0) this.finish(false); }
  private defeatEnemy(enemy: Enemy): void {
    this.kills += 1;
    if (this.bossSystem.isBoss(enemy)) {
      const wasMainBoss = this.bossSystem.defeatBoss(enemy);
      enemy.deactivate();
      if (wasMainBoss) this.finish(true);
      return;
    }
    this.experience += enemy.reward;
    this.processExperience();
    this.spawnXpOrbEffect(enemy.x, enemy.y);
    for (let index = 0; index < enemy.currencyDrops; index += 1) {
      const gem = this.availableGem();
      if (!gem) break;
      const offset = new Phaser.Math.Vector2().setToPolar(Math.random() * Math.PI * 2, index === 0 ? 0 : Phaser.Math.Between(12, 28));
      gem.activate(enemy.x + offset.x, enemy.y + offset.y, enemy.reward);
    }
    if ((enemy.variantId === 'superSkeleton' || enemy.variantId === 'necromancerWraith') && Math.random() < LOOT_CHEST_DROP_CHANCE) {
      const chest = this.availableChest();
      chest?.activate(enemy.x, enemy.y);
    }
    enemy.deactivate();
  }
  private spawnXpOrbEffect(x: number, y: number): void {
    const orb = this.add.image(x, y, 'xp-orb').setDisplaySize(18, 18).setDepth(6);
    this.tweens.add({ targets: orb, y: y - 30, alpha: 0, duration: 450, ease: 'Quad.Out', onComplete: () => orb.destroy() });
  }
  private availableGem(): CurrencyGem | null { let gem = this.gems.getFirstDead(false) as CurrencyGem | null; if (!gem && !this.gems.isFull()) { gem = new CurrencyGem(this); this.gems.add(gem); } return gem; }
  private availableChest(): LootChest | null { let chest = this.chests.getFirstDead(false) as LootChest | null; if (!chest && !this.chests.isFull()) { chest = new LootChest(this); this.chests.add(chest); } return chest; }
  private playerHit(_playerObject: ArcadeColliderObject, enemyObject: ArcadeColliderObject): void { const enemy = enemyObject as unknown as Enemy; if (!enemy.active || enemy.contactDamage <= 0 || !this.player.damage(enemy.contactDamage, this.time.now)) return; if (this.player.health <= 0) this.finish(false); }
  private collectGem(_playerObject: ArcadeColliderObject, gemObject: ArcadeColliderObject): void { const gem = gemObject as unknown as CurrencyGem; if (!gem.active) return; this.currency += gem.value; gem.deactivate(); }
  /** Baú: sorteia 1 melhoria aleatória do mesmo pool de 5 opções da tela de nível ≥5. Se nenhum sorteio já estiver
   *  em tela (raro: dois baús coletados quase juntos), aplica direto sem animação pra não travar em uma segunda tela. */
  private collectChest(_playerObject: ArcadeColliderObject, chestObject: ArcadeColliderObject): void {
    const chest = chestObject as unknown as LootChest;
    if (!chest.active) return;
    const chestX = chest.x;
    const chestY = chest.y;
    chest.deactivate();
    const secondaryWeapon = this.weapons[1];
    const secondaryWithAffinity = secondaryWeapon && this.affinityFamilies.has(weaponFamily(secondaryWeapon.config)) ? secondaryWeapon.config : undefined;
    const choices = this.upgrades.choices(this.primaryWeapon, this.player, 5, secondaryWithAffinity);
    const upgrade = choices[Math.floor(Math.random() * choices.length)];
    if (this.chestRollActive) {
      this.grantChestUpgrade(upgrade, chestX, chestY);
      return;
    }
    this.chestRollActive = true;
    this.physics.pause();
    this.playChestRollAnimation(choices, upgrade, chestX, chestY);
  }
  private grantChestUpgrade(upgrade: Upgrade, chestX: number, chestY: number): void {
    upgrade.apply(this.player);
    this.weapons.forEach((activeWeapon) => { activeWeapon.upgradeCount += 1; });
    this.selectedUpgradeCounts.set(upgrade.id, (this.selectedUpgradeCounts.get(upgrade.id) ?? 0) + 1);
    this.updateBuildHud();
    this.spawnFloatingCombatText(chestX, chestY - 10, `Baú: ${upgrade.name}!`, '#ffe29a', 0);
  }
  /** "Slot machine" reveal: cycles the center card through random picks from `choices`, slowing down each step,
   *  landing on `finalUpgrade` on the last step (already rolled beforehand, so the sequence is built to land on it). */
  private playChestRollAnimation(choices: Upgrade[], finalUpgrade: Upgrade, chestX: number, chestY: number): void {
    const stepDelaysMs = [70, 70, 80, 90, 100, 120, 140, 170, 210, 260, 320, 400, 500];
    const sequence: Upgrade[] = [];
    for (let index = 0; index < stepDelaysMs.length; index += 1) sequence.push(choices[Math.floor(Math.random() * choices.length)]);
    sequence.push(finalUpgrade);
    const card = this.buildChestRollCard();
    this.runChestRollStep(card, sequence, stepDelaysMs, 0, chestX, chestY);
  }
  private buildChestRollCard(): ChestRollCard {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT / 2;
    const title = this.add.text(x, y - 168, 'Baú Encontrado!', { fontFamily: TITLE_FONT_FAMILY, fontSize: '26px', color: '#ffe29a' }).setOrigin(0.5).setScrollFactor(0).setDepth(35);
    const card = this.add.rectangle(x, y, 240, 280, 0x49326e, 0.96).setStrokeStyle(4, 0xa888d9).setScrollFactor(0).setDepth(35);
    const icon = this.add.image(x, y - 68, 'upgrade-damage-icon').setDisplaySize(76, 76).setScrollFactor(0).setDepth(36);
    const name = this.add.text(x, y + 8, '', { fontFamily: TITLE_FONT_FAMILY, fontSize: '19px', color: '#fff0c2', align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5).setScrollFactor(0).setDepth(36);
    const description = this.add.text(x, y + 76, '', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#eee8ff', align: 'center', wordWrap: { width: 195 } }).setOrigin(0.5).setScrollFactor(0).setDepth(36);
    return { title, card, icon, name, description };
  }
  private setChestRollCardContent(card: ChestRollCard, upgrade: Upgrade): void {
    card.icon.setTexture(UPGRADE_ICON_KEYS[upgrade.id] ?? 'upgrade-damage-icon');
    card.name.setText(upgrade.name);
    card.description.setText(upgrade.description);
  }
  private runChestRollStep(card: ChestRollCard, sequence: Upgrade[], stepDelaysMs: number[], index: number, chestX: number, chestY: number): void {
    const upgrade = sequence[index];
    this.setChestRollCardContent(card, upgrade);
    // Quick shimmer on the icon each step so the swap reads as active shuffling, not a static list.
    card.icon.setAlpha(0.35);
    this.tweens.add({ targets: card.icon, alpha: 1, duration: Math.min(140, (stepDelaysMs[index] ?? 500) * 0.8) });
    if (index >= stepDelaysMs.length) { this.finishChestRoll(card, upgrade, chestX, chestY); return; }
    this.time.delayedCall(stepDelaysMs[index], () => this.runChestRollStep(card, sequence, stepDelaysMs, index + 1, chestX, chestY));
  }
  private finishChestRoll(card: ChestRollCard, upgrade: Upgrade, chestX: number, chestY: number): void {
    card.card.setStrokeStyle(5, 0xfff3b0);
    const baseIconSize = 76;
    this.tweens.add({ targets: card.icon, displayWidth: baseIconSize * 1.25, displayHeight: baseIconSize * 1.25, duration: 180, yoyo: true, ease: 'Back.Out' });
    this.tweens.add({ targets: card.card, scaleX: 1.05, scaleY: 1.05, duration: 180, yoyo: true, ease: 'Back.Out' });
    this.time.delayedCall(700, () => {
      this.grantChestUpgrade(upgrade, chestX, chestY);
      this.destroyChestRollCard(card);
      this.chestRollActive = false;
      this.physics.resume();
    });
  }
  private destroyChestRollCard(card: ChestRollCard): void {
    const targets = [card.title, card.card, card.icon, card.name, card.description];
    this.tweens.add({ targets, alpha: 0, duration: 240, ease: 'Quad.Out', onComplete: () => targets.forEach((target) => target.destroy()) });
  }
  private processExperience(): void { if (this.experience < this.experienceNeeded || this.levelPending) return; this.experience -= this.experienceNeeded; this.level += 1; this.experienceNeeded = requiredExperience(this.level); this.levelPending = true; this.showUpgrades(); }
  private prepareStartingWeaponUpgrades(): void {
    const character = CHARACTERS[this.characterId];
    if (character.preferredWeaponId !== this.primaryWeapon.id || !character.startingWeaponUpgradeChoices) { this.hud.setVisible(true); return; }
    this.startingUpgradeChoicesRemaining = character.startingWeaponUpgradeChoices;
    this.startingUpgradeChoicesTotal = character.startingWeaponUpgradeChoices;
    this.startingUpgradeSnapshot = this.captureStartingUpgradeSnapshot();
    this.levelPending = true;
    this.time.delayedCall(120, () => this.showStartingWeaponUpgradesScreen());
  }
  private showStartingWeaponUpgradesScreen(): void {
    this.physics.pause();
    const character = CHARACTERS[this.characterId];
    this.startingUpgradePool ??= this.upgrades
      .weaponUpgradePool(this.primaryWeapon, this.player)
      .sort(() => Math.random() - 0.5)
      .slice(0, this.startingUpgradeChoicesTotal);
    const pool = this.startingUpgradePool;
    const veil = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090b12, 0.84).setScrollFactor(0).setDepth(30);
    const title = this.add.text(GAME_WIDTH / 2, 160, this.startingWeaponUpgradesTitle(character.name), { fontFamily: TITLE_FONT_FAMILY, fontSize: '30px', color: '#ffe29a' }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this.levelOverlay = [veil, title];
    const spacing = 230;
    const startX = GAME_WIDTH / 2 - (spacing * (pool.length - 1)) / 2;
    const picks = new Map<string, number>();
    pool.forEach((upgrade, index) => this.startingUpgradeCard(upgrade, startX + index * spacing, picks, title));
    this.startingUpgradeResetButton(picks);
  }
  private captureStartingUpgradeSnapshot(): StartingUpgradeSnapshot {
    const { damageMultiplier, attackSpeedMultiplier, movementSpeed, lifeStealPercent, meleeRangeBonus, meleeExtraAttackChance, meleeExtraAttackMax, whirlwindUnlocked, projectileExtraCount, projectileRicochetChance, projectileRicochetMax, projectileSizeBonus } = this.player;
    return {
      player: { damageMultiplier, attackSpeedMultiplier, movementSpeed, lifeStealPercent, meleeRangeBonus, meleeExtraAttackChance, meleeExtraAttackMax, whirlwindUnlocked, projectileExtraCount, projectileRicochetChance, projectileRicochetMax, projectileSizeBonus },
      weaponUpgradeCounts: this.weapons.map((weapon) => weapon.upgradeCount),
      selectedUpgradeCounts: new Map(this.selectedUpgradeCounts)
    };
  }
  private startingUpgradeResetButton(picks: Map<string, number>): void {
    const button = this.add.text(GAME_WIDTH / 2, 610, 'LIMPAR SELEÇÃO', { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#ffffff', backgroundColor: '#8b3745', padding: { x: 18, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setDepth(33).setInteractive({ useHandCursor: true });
    this.levelOverlay.push(button);
    button.on('pointerover', () => button.setStyle({ backgroundColor: '#ad4a5a' }));
    button.on('pointerout', () => button.setStyle({ backgroundColor: '#8b3745' }));
    button.on('pointerup', () => {
      if (picks.size === 0) return;
      this.restoreStartingUpgradeSnapshot();
      this.levelOverlay.forEach((object) => object.destroy());
      this.levelOverlay = [];
      this.showStartingWeaponUpgradesScreen();
    });
  }
  private restoreStartingUpgradeSnapshot(): void {
    const snapshot = this.startingUpgradeSnapshot;
    if (!snapshot) return;
    Object.assign(this.player, snapshot.player);
    this.weapons.forEach((weapon, index) => { weapon.upgradeCount = snapshot.weaponUpgradeCounts[index] ?? 0; });
    this.selectedUpgradeCounts.clear();
    snapshot.selectedUpgradeCounts.forEach((count, id) => this.selectedUpgradeCounts.set(id, count));
    this.startingUpgradeChoicesRemaining = this.startingUpgradeChoicesTotal;
    this.updateBuildHud();
  }
  private startingWeaponUpgradesTitle(characterName: string): string {
    return `${characterName}: escolha ${this.startingUpgradeChoicesTotal} melhorias iniciais (restam ${this.startingUpgradeChoicesRemaining})`;
  }
  private startingUpgradeCard(upgrade: Upgrade, x: number, picks: Map<string, number>, title: Phaser.GameObjects.Text): void {
    const card = this.add.rectangle(x, 410, 200, 220, 0x49326e).setStrokeStyle(3, 0xa888d9).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true });
    const iconKey = UPGRADE_ICON_KEYS[upgrade.id];
    const icon = this.add.image(x, 350, iconKey).setDisplaySize(64, 64).setScrollFactor(0).setDepth(32);
    const name = this.add.text(x, 407, upgrade.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#fff0c2', align: 'center', wordWrap: { width: 170 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    const description = this.add.text(x, 468, upgrade.description, { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#eee8ff', align: 'center', wordWrap: { width: 165 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    const badge = this.add.text(x + 84, 306, '', { fontFamily: TITLE_FONT_FAMILY, fontSize: '15px', color: '#ffffff', backgroundColor: '#8a5cf6', padding: { x: 6, y: 2 } }).setOrigin(0.5).setScrollFactor(0).setDepth(33).setVisible(false);
    this.levelOverlay.push(card, icon, name, description, badge);
    card.on('pointerup', () => {
      if (this.startingUpgradeChoicesRemaining <= 0) return;
      upgrade.apply(this.player);
      this.weapons.forEach((activeWeapon) => { activeWeapon.upgradeCount += 1; });
      this.selectedUpgradeCounts.set(upgrade.id, (this.selectedUpgradeCounts.get(upgrade.id) ?? 0) + 1);
      this.updateBuildHud();
      picks.set(upgrade.id, (picks.get(upgrade.id) ?? 0) + 1);
      badge.setText(`×${picks.get(upgrade.id)}`).setVisible(true);
      this.startingUpgradeChoicesRemaining -= 1;
      if (this.startingUpgradeChoicesRemaining <= 0) {
        this.levelOverlay.forEach((object) => object.destroy());
        this.levelOverlay = [];
        this.startingUpgradeSnapshot = undefined;
        this.startingUpgradePool = undefined;
        this.levelPending = false;
        this.physics.resume();
        this.hud.setVisible(true);
        this.processExperience();
        return;
      }
      title.setText(this.startingWeaponUpgradesTitle(CHARACTERS[this.characterId].name));
    });
  }
  private showUpgradeSelection(titleText: string, onSelect: () => void, amount = 3, extraWeaponOffer: WeaponConfig | null = null): void {
    this.physics.pause();
    const veil = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090b12, 0.84).setScrollFactor(0).setDepth(30);
    const title = this.add.text(GAME_WIDTH / 2, 190, titleText, { fontFamily: TITLE_FONT_FAMILY, fontSize: '32px', color: '#ffe29a' }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this.levelOverlay = [veil, title];
    const secondaryWeapon = this.weapons[1];
    const secondaryWithAffinity = secondaryWeapon && this.affinityFamilies.has(weaponFamily(secondaryWeapon.config)) ? secondaryWeapon.config : undefined;
    const choices = this.upgrades.choices(this.primaryWeapon, this.player, amount, secondaryWithAffinity);
    const cardCount = choices.length + (extraWeaponOffer ? 1 : 0);
    const spacing = 230;
    const startX = GAME_WIDTH / 2 - (spacing * (cardCount - 1)) / 2;
    choices.forEach((upgrade, index) => this.upgradeCard(upgrade, startX + index * spacing, onSelect));
    if (extraWeaponOffer) this.extraWeaponCard(extraWeaponOffer, startX + choices.length * spacing, onSelect);
  }
  private showUpgrades(): void {
    const amount = this.level >= 5 ? 5 : 3;
    const extraWeaponOffer = this.rollExtraWeaponOffer();
    const upgradeAmount = extraWeaponOffer ? amount - 1 : amount;
    this.showUpgradeSelection(`NÍVEL ${this.level}! Escolha uma melhoria`, () => { this.levelPending = false; this.physics.resume(); this.processExperience(); }, upgradeAmount, extraWeaponOffer);
  }
  private rollExtraWeaponOffer(): WeaponConfig | null {
    if (this.level % 5 !== 0 || this.weapons.length >= MAX_ACTIVE_WEAPONS) return null;
    const ownedIds = new Set(this.weapons.map((weapon) => weapon.config.id));
    const candidates = Object.values(WEAPONS).filter((weapon) => !ownedIds.has(weapon.id));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  private upgradeCard(upgrade: Upgrade, x: number, onSelect?: () => void): void { const card = this.add.rectangle(x, 410, 200, 220, 0x49326e).setStrokeStyle(3, 0xa888d9).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true }); const iconKey = UPGRADE_ICON_KEYS[upgrade.id]; const icon = this.add.image(x, 350, iconKey).setDisplaySize(64, 64).setScrollFactor(0).setDepth(32); const name = this.add.text(x, 407, upgrade.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#fff0c2', align: 'center', wordWrap: { width: 170 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32); const description = this.add.text(x, 468, upgrade.description, { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#eee8ff', align: 'center', wordWrap: { width: 165 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32); this.levelOverlay.push(card, icon, name, description); card.on('pointerup', () => { upgrade.apply(this.player); this.weapons.forEach((activeWeapon) => { activeWeapon.upgradeCount += 1; }); this.selectedUpgradeCounts.set(upgrade.id, (this.selectedUpgradeCounts.get(upgrade.id) ?? 0) + 1); this.updateBuildHud(); this.levelOverlay.forEach((object) => object.destroy()); this.levelOverlay = []; if (onSelect) onSelect(); else { this.levelPending = false; this.physics.resume(); this.processExperience(); } }); }
  private extraWeaponCard(weapon: WeaponConfig, x: number, onSelect?: () => void): void {
    const card = this.add.rectangle(x, 410, 200, 220, 0x6b4d10).setStrokeStyle(3, 0xffd868).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true });
    const banner = this.add.text(x, 314, 'ARMA EXTRA!', { fontFamily: TITLE_FONT_FAMILY, fontSize: '14px', color: '#3a2400', backgroundColor: '#ffd868', padding: { x: 8, y: 3 } }).setOrigin(0.5).setScrollFactor(0).setDepth(33);
    const icon = this.add.image(x, 358, `weapon-${weapon.id}-icon`).setDisplaySize(64, 64).setScrollFactor(0).setDepth(32);
    const name = this.add.text(x, 407, weapon.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#fff3d2', align: 'center', wordWrap: { width: 170 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    const description = this.add.text(x, 468, weapon.description, { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#fff0d2', align: 'center', wordWrap: { width: 165 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    this.levelOverlay.push(card, banner, icon, name, description);
    card.on('pointerover', () => card.setFillStyle(0x86611a));
    card.on('pointerout', () => card.setFillStyle(0x6b4d10));
    card.on('pointerup', () => {
      this.weapons.push(this.createActiveWeapon(weapon));
      this.updateBuildHud();
      this.levelOverlay.forEach((object) => object.destroy());
      this.levelOverlay = [];
      if (onSelect) onSelect(); else { this.levelPending = false; this.physics.resume(); this.processExperience(); }
    });
  }
  private updateBuildHud(): void {
    const weaponEntries = this.weapons.map((weapon) => ({ textureKey: `weapon-${weapon.config.id}-icon`, count: 1 }));
    const upgrades = [...this.selectedUpgradeCounts.entries()].map(([id, count]) => ({ textureKey: UPGRADE_ICON_KEYS[id] ?? 'upgrade-damage-icon', count }));
    this.hud.setBuild([...weaponEntries, ...upgrades]);
  }
  private togglePause(): void { this.paused = !this.paused; if (this.paused) this.showPauseScreen(); else this.resumeFromPause(); }
  private showPauseScreen(): void { this.physics.pause(); this.destroyPauseOverlay(); const addOverlay = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.pauseOverlay.push(object); return object; }; addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x080a10, 0.72).setScrollFactor(0).setDepth(25)); addOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 420, 300, 0x21182f, 0.96).setStrokeStyle(3, 0xa888d9).setScrollFactor(0).setDepth(26)); addOverlay(this.add.text(GAME_WIDTH / 2, 280, 'PAUSADO', { fontFamily: TITLE_FONT_FAMILY, fontSize: '44px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(27)); this.pauseButton('CONTINUAR', 370, () => this.togglePause(), addOverlay); this.pauseButton('VOLTAR AO MENU', 445, () => { this.paused = false; this.destroyPauseOverlay(); this.scene.start('menu'); }, addOverlay); }
  private pauseButton(label: string, y: number, action: () => void, addOverlay: <T extends Phaser.GameObjects.GameObject>(object: T) => T): void { const button = addOverlay(this.add.text(GAME_WIDTH / 2, y, label, { fontFamily: TITLE_FONT_FAMILY, fontSize: '22px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 24, y: 12 } }).setOrigin(0.5).setScrollFactor(0).setDepth(27).setInteractive({ useHandCursor: true })); button.on('pointerover', () => button.setStyle({ backgroundColor: '#896bd0' })); button.on('pointerout', () => button.setStyle({ backgroundColor: '#6b4db3' })); button.on('pointerup', action); }
  private resumeFromPause(): void { this.physics.resume(); this.destroyPauseOverlay(); }
  private destroyPauseOverlay(): void { this.pauseOverlay.forEach((object) => object.destroy()); this.pauseOverlay = []; }
  private finish(victory: boolean): void { this.ended = true; this.physics.pause(); const title = victory ? 'VITÓRIA!' : 'DERROTA'; this.add.rectangle(640, 360, 1280, 720, 0x070910, 0.88).setScrollFactor(0).setDepth(40); this.add.text(640, 215, title, { fontFamily: TITLE_FONT_FAMILY, fontSize: '52px', color: victory ? '#ffe07a' : '#ef7780' }).setOrigin(0.5).setScrollFactor(0).setDepth(41); this.add.text(640, 320, `Tempo sobrevivido: ${Math.floor(this.elapsedMs / 1000)}s\nNível alcançado: ${this.level}\nEliminações: ${this.kills}`, { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#f1f1f4', align: 'center', lineSpacing: 12 }).setOrigin(0.5).setScrollFactor(0).setDepth(41); this.resultButton('REINICIAR', 555, () => this.scene.restart({ playerTexture: this.selectedPlayerTexture })); this.resultButton('VOLTAR AO MENU', 620, () => this.scene.start('menu')); }
  private resultButton(label: string, y: number, action: () => void): void { const button = this.add.text(640, y, label, { fontFamily: TITLE_FONT_FAMILY, fontSize: '21px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true }); button.on('pointerup', action); }
}
