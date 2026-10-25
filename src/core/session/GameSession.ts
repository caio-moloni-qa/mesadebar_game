import { ENEMY_CONFIG, ENEMY_VARIANTS, requiredExperience } from '../../config/balance';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WEAPONS } from '../../config/weapons';
import { WORLD_SIZE } from '../../config/world';
import { EventBus } from '../EventBus';
import { Pool } from '../Pool';
import { SimClock } from '../SimClock';
import { SpatialHash } from '../SpatialHash';
import { circlesOverlap } from '../collision';
import { Rng, createRng, randomPointAround } from '../math';
import { DifficultySystem } from '../systems/DifficultySystem';
import { EnemySpawnScheduler, EnemyVariantId } from '../systems/EnemySpawnScheduler';
import { ENEMY_DYING_MS, ENEMY_HIT_STUN_MS, EnemyState, GemState, PlayerState, ProjectileState, snapPrevious } from './entities';

/** Fixed simulation step. The renderer accumulates frame time and calls step() this many ms at a time. */
export const STEP_MS = 1000 / 60;

/** Gems fly to the player at this speed once inside pickupRange (CurrencyGem.attract). */
const GEM_ATTRACT_SPEED = 300;
const MAX_PROJECTILES = 400;
const MAX_GEMS = 600;
/** Broad-phase cell size: a bit bigger than the largest common body so most queries touch few cells. */
const SPATIAL_CELL_SIZE = 96;

export interface SessionEvents extends Record<string, unknown> {
  'enemy-hit': { enemy: EnemyState; amount: number };
  'enemy-defeated': { x: number; y: number; variantId: EnemyVariantId };
  'player-damaged': { amount: number };
  'projectile-fired': { x: number; y: number };
  'gem-collected': { value: number };
  'level-up': { level: number };
  'player-died': Record<string, never>;
}

export interface GameSessionOptions {
  characterId: CharacterId;
  seed: number;
  /** Sandbox/perf aid: keep the field topped up to this many skeletons around the player. */
  stressEnemyCount?: number;
}

/** Engine-agnostic run simulation — the start of the GameScene replacement described in THREEJS_3D_MIGRATION_TEMP.md
 *  (Etapa 2, vertical slice). Today it covers movement, the regular spawn schedule, enemy pursuit and contact damage,
 *  the Cajado auto-attack, currency gems and XP/levels; weapons/upgrades/boss/merchant land in later stages.
 *  Units are game units (= old 2D pixels); the renderer converts them. Nothing in here reads wall-clock time. */
export class GameSession {
  readonly clock = new SimClock();
  readonly events = new EventBus<SessionEvents>();
  readonly player: PlayerState;
  readonly enemies = new Pool(() => new EnemyState(), ENEMY_CONFIG.maxActive);
  readonly projectiles = new Pool(() => new ProjectileState(), MAX_PROJECTILES);
  readonly gems = new Pool(() => new GemState(), MAX_GEMS);
  readonly difficulty = new DifficultySystem();
  kills = 0;
  level = 1;
  experience = 0;
  experienceNeeded = requiredExperience(1);
  currency = 0;
  elapsedMs = 0;
  over = false;
  /** Sandbox toggles (same switches the F9 panel has in the Phaser build). */
  skeletonSpawnEnabled = true;
  variantSpawnEnabled = true;

  private readonly rng: Rng;
  private readonly scheduler: EnemySpawnScheduler;
  private readonly enemyHash = new SpatialHash<EnemyState>(SPATIAL_CELL_SIZE);
  private readonly weapon = WEAPONS.staff;
  private nextAttackAt = 0;
  private moveX = 0;
  private moveY = 0;
  private readonly scratch: EnemyState[] = [];

  constructor(private readonly options: GameSessionOptions) {
    this.rng = createRng(options.seed);
    this.player = new PlayerState(CHARACTERS[options.characterId]);
    this.player.x = WORLD_SIZE / 2;
    this.player.y = WORLD_SIZE / 2;
    snapPrevious(this.player);
    this.scheduler = new EnemySpawnScheduler({
      getPlayerPosition: () => this.player,
      isSkeletonSpawnEnabled: () => this.skeletonSpawnEnabled,
      isVariantSpawnEnabled: () => this.variantSpawnEnabled,
      hasActiveEncounter: () => false,
      difficultyStageFor: (elapsedMs) => this.difficulty.stageFor(elapsedMs),
      spawn: (request) => { this.spawnEnemy(request.variantId, request.x, request.y, request.maxHealth); }
    }, this.rng);
  }

  get paused(): boolean {
    return this.clock.paused;
  }

  set paused(value: boolean) {
    this.clock.paused = value;
  }

  /** Desired movement direction in game-plane coordinates; any length, normalised here. (0, 0) = stand still. */
  setMoveInput(x: number, y: number): void {
    const length = Math.hypot(x, y);
    this.moveX = length > 0 ? x / length : 0;
    this.moveY = length > 0 ? y / length : 0;
  }

  spawnEnemy(variantId: EnemyVariantId, x: number, y: number, maxHealth: number = ENEMY_VARIANTS[variantId].maxHealth): EnemyState | null {
    const enemy = this.enemies.acquire();
    if (!enemy) return null;
    enemy.activate(variantId, x, y, maxHealth);
    return enemy;
  }

  step(deltaMs: number = STEP_MS): void {
    if (this.over || this.paused) return;
    this.clock.advance(deltaMs);
    this.elapsedMs += deltaMs;
    this.snapshotPositions();
    this.movePlayer(deltaMs);
    this.scheduler.update(deltaMs, this.elapsedMs);
    this.topUpStressEnemies();
    this.rebuildEnemyHash();
    this.updateEnemies(deltaMs);
    this.updateWeapon();
    this.updateProjectiles(deltaMs);
    this.updateGems(deltaMs);
    if (!this.player.alive) {
      this.over = true;
      this.events.emit('player-died', {});
    }
  }

  private snapshotPositions(): void {
    snapPrevious(this.player);
    this.enemies.forEachActive(snapPrevious);
    this.projectiles.forEachActive(snapPrevious);
    this.gems.forEachActive(snapPrevious);
  }

  private movePlayer(deltaMs: number): void {
    const distance = (this.player.movementSpeed * deltaMs) / 1000;
    const { radius } = this.player;
    this.player.x = clamp(this.player.x + this.moveX * distance, radius, WORLD_SIZE - radius);
    this.player.y = clamp(this.player.y + this.moveY * distance, radius, WORLD_SIZE - radius);
    if (this.moveX !== 0 || this.moveY !== 0) {
      this.player.facingX = this.moveX;
      this.player.facingY = this.moveY;
    }
  }

  private topUpStressEnemies(): void {
    const target = this.options.stressEnemyCount ?? 0;
    while (this.enemies.activeCount < target) {
      const point = randomPointAround(this.rng, this.player, 300, 1000);
      if (!this.spawnEnemy('skeleton', point.x, point.y)) break;
    }
  }

  private rebuildEnemyHash(): void {
    this.enemyHash.clear();
    this.enemies.forEachActive((enemy) => {
      if (enemy.phase === 'active') this.enemyHash.insert(enemy, enemy.radius);
    });
  }

  private updateEnemies(deltaMs: number): void {
    const now = this.clock.now;
    const finished: EnemyState[] = [];
    this.enemies.forEachActive((enemy) => {
      if (enemy.phase === 'dying') {
        if (now >= enemy.phaseEndsAt) finished.push(enemy);
        return;
      }
      if (!enemy.isStatic && now >= enemy.hitStunUntil) this.pursuePlayer(enemy, deltaMs);
      if (enemy.contactDamage > 0 && circlesOverlap(enemy, this.player)) {
        const dealt = this.player.damage(enemy.contactDamage, now);
        if (dealt > 0) this.events.emit('player-damaged', { amount: dealt });
      }
    });
    finished.forEach((enemy) => this.enemies.release(enemy));
  }

  private pursuePlayer(enemy: EnemyState, deltaMs: number): void {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const step = Math.min(length, (enemy.movementSpeed * deltaMs) / 1000);
    enemy.facingX = dx / length;
    enemy.facingY = dy / length;
    enemy.x += enemy.facingX * step;
    enemy.y += enemy.facingY * step;
  }

  /** Cajado: fire at the nearest living enemy in range once the (attack-speed-scaled) cooldown is up. */
  private updateWeapon(): void {
    const now = this.clock.now;
    if (now < this.nextAttackAt) return;
    const target = this.enemyHash.nearest(this.player, this.weapon.range, (enemy) => enemy.phase === 'active');
    if (!target) return;
    const projectile = this.projectiles.acquire();
    if (!projectile) return;
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const length = Math.hypot(dx, dy) || 1;
    const speed = this.weapon.projectileSpeed ?? 500;
    projectile.x = this.player.x;
    projectile.y = this.player.y;
    snapPrevious(projectile);
    projectile.velocityX = (dx / length) * speed;
    projectile.velocityY = (dy / length) * speed;
    projectile.damage = this.weapon.baseDamage * this.player.damageMultiplier;
    projectile.expiresAt = now + (this.weapon.projectileLifetime ?? 2000);
    this.nextAttackAt = now + this.weapon.cooldown / this.player.attackSpeedMultiplier;
    this.events.emit('projectile-fired', { x: projectile.x, y: projectile.y });
  }

  private updateProjectiles(deltaMs: number): void {
    const now = this.clock.now;
    const spent: ProjectileState[] = [];
    this.projectiles.forEachActive((projectile) => {
      projectile.x += (projectile.velocityX * deltaMs) / 1000;
      projectile.y += (projectile.velocityY * deltaMs) / 1000;
      if (now >= projectile.expiresAt) { spent.push(projectile); return; }
      this.scratch.length = 0;
      const hit = this.enemyHash.queryRadius(projectile, projectile.radius, this.scratch).find((enemy) => enemy.phase === 'active' && circlesOverlap(projectile, enemy));
      if (!hit) return;
      this.damageEnemy(hit, projectile.damage);
      spent.push(projectile);
    });
    spent.forEach((projectile) => this.projectiles.release(projectile));
  }

  private damageEnemy(enemy: EnemyState, amount: number): void {
    const now = this.clock.now;
    enemy.health -= amount;
    enemy.hitStunUntil = now + ENEMY_HIT_STUN_MS;
    enemy.lastHitAt = now;
    this.events.emit('enemy-hit', { enemy, amount });
    if (enemy.health <= 0) this.defeatEnemy(enemy);
  }

  private defeatEnemy(enemy: EnemyState): void {
    enemy.phase = 'dying';
    enemy.phaseEndsAt = this.clock.now + ENEMY_DYING_MS;
    this.kills += 1;
    this.experience += enemy.reward;
    for (let index = 0; index < enemy.currencyDrops; index += 1) {
      const gem = this.gems.acquire();
      if (!gem) break;
      const point = index === 0 ? enemy : randomPointAround(this.rng, enemy, 12, 28);
      gem.x = point.x;
      gem.y = point.y;
      snapPrevious(gem);
      gem.value = enemy.reward;
    }
    while (this.experience >= this.experienceNeeded) {
      this.experience -= this.experienceNeeded;
      this.level += 1;
      this.experienceNeeded = requiredExperience(this.level);
      this.events.emit('level-up', { level: this.level });
    }
    this.events.emit('enemy-defeated', { x: enemy.x, y: enemy.y, variantId: enemy.variantId });
  }

  private updateGems(deltaMs: number): void {
    const collected: GemState[] = [];
    const rangeSq = this.player.pickupRange * this.player.pickupRange;
    this.gems.forEachActive((gem) => {
      const dx = this.player.x - gem.x;
      const dy = this.player.y - gem.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= rangeSq && distSq > 0) {
        const length = Math.sqrt(distSq);
        const step = Math.min(length, (GEM_ATTRACT_SPEED * deltaMs) / 1000);
        gem.x += (dx / length) * step;
        gem.y += (dy / length) * step;
      }
      if (circlesOverlap(gem, this.player)) collected.push(gem);
    });
    collected.forEach((gem) => {
      this.currency += gem.value;
      this.gems.release(gem);
      this.events.emit('gem-collected', { value: gem.value });
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
