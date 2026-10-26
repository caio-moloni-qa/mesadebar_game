import { EventBus } from '../EventBus';
import { Vec2 } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';
import { CompanionKind } from './MiniBossSystem';

// Companions: allies earned from zone mini-bosses (one kind per zone), following the hero for the rest of the run.
// Taking a kind you already have levels it up instead. Engine-agnostic like the rest of the core.

export const MAX_COMPANIONS = 3;
export const MAX_COMPANION_LEVEL = 5;

export interface CompanionSpec {
  name: string;
  /** Card text on the choice screen. */
  description: string;
}

export const COMPANIONS: Record<CompanionKind, CompanionSpec> = {
  skeletonArcher: { name: 'Arqueiro Esqueleto', description: 'Segue você e dispara flechas no inimigo mais próximo.' },
  stoneGolem: { name: 'Golem de Pedra', description: 'Avança na horda com socos que atingem em área e atrai os inimigos próximos para si.' },
  waterFairy: { name: 'Fada da Água', description: 'Paira ao seu lado e cura você em pulsos, limpando lentidões. Também cura seus outros companheiros.' }
};

export const COMPANION_TUNING = {
  followDistance: 80,
  followSpeed: 240,
  /** Each level beyond the first: +this fraction of damage (and of the golem's health). */
  perLevel: 0.3,
  /** Companions also grow with the hero: +this fraction per hero level. */
  perHeroLevel: 0.04,
  archerRange: 480,
  archerCooldownMs: 1100,
  archerDamage: 14,
  arrowSpeed: 720,
  arrowLifeMs: 900,
  arrowRadius: 10,
  golemSeekRange: 260,
  golemSpeed: 150,
  golemCooldownMs: 1500,
  golemReach: 60,
  golemRadius: 80,
  golemDamage: 22,
  golemHealth: 320,
  /** Enemies this close to the golem pursue it instead of the hero. */
  golemTauntRadius: 170,
  /** Enemies touching the golem chip it every this often. */
  golemHurtTickMs: 700,
  golemRespawnMs: 15000,
  /** Water fairy: a healing pulse every this long (faster with level), only when someone needs it. */
  fairyCooldownMs: 6000,
  fairyHealRatio: 0.05,
  fairyHealPerLevel: 0.015,
  /** Heals the other companions (the golem) by this fraction of their max health. */
  fairyCompanionHeal: 0.2,
  fairyFollowDistance: 45,
  bodyRadius: 18
};

export interface CompanionState {
  kind: CompanionKind;
  level: number;
  /** Following slot around the hero (spreads several companions out). */
  slot: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facingX: number;
  facingY: number;
  health: number;
  maxHealth: number;
  /** Sim time it reforms after falling (golem); 0 while standing. */
  downUntil: number;
  cooldownMs: number;
  hurtTickMs: number;
  /** Sim time of its last attack (the renderer plays the shot / slam from it). */
  attackedAt: number;
}

export interface ArrowState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  lifeMs: number;
  damage: number;
}

export interface CompanionEvents extends Record<string, unknown> {
  'companion-joined': { kind: CompanionKind; level: number };
  'companion-attack': { kind: CompanionKind; x: number; y: number; radius: number };
  'companion-down': { kind: CompanionKind; x: number; y: number };
  'companion-heal': { x: number; y: number; amount: number };
}

export interface CompanionHost {
  readonly player: PlayerState;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<CompanionEvents>, 'emit'>;
  now(): number;
  heroLevel(): number;
  nearestEnemy(from: Vec2, range: number): EnemyState | null;
  enemiesNear(from: Vec2, radius: number): EnemyState[];
  damageEnemy(enemy: EnemyState, amount: number): void;
  /** Heals the hero (through the normal path: the Aura Podre still cuts it). */
  healPlayer(amount: number): void;
}

export class CompanionSystem {
  readonly companions: CompanionState[] = [];
  readonly arrows: ArrowState[] = [];

  constructor(private readonly host: CompanionHost) {}

  has(kind: CompanionKind): CompanionState | undefined {
    return this.companions.find((companion) => companion.kind === kind);
  }

  /** Joins a new companion, or levels up one you already have. Returns false when there's no room. */
  add(kind: CompanionKind): boolean {
    const existing = this.has(kind);
    if (existing) {
      if (existing.level >= MAX_COMPANION_LEVEL) return false;
      existing.level += 1;
      existing.maxHealth = this.golemHealth(existing.level);
      existing.health = existing.maxHealth;
      this.host.events.emit('companion-joined', { kind, level: existing.level });
      return true;
    }
    if (this.companions.length >= MAX_COMPANIONS) return false;
    const { player } = this.host;
    const maxHealth = this.golemHealth(1);
    this.companions.push({
      kind, level: 1, slot: this.companions.length,
      x: player.x, y: player.y + 30, prevX: player.x, prevY: player.y + 30, facingX: 0, facingY: 1,
      health: maxHealth, maxHealth, downUntil: 0, cooldownMs: 0, hurtTickMs: 0, attackedAt: -Infinity
    });
    this.host.events.emit('companion-joined', { kind, level: 1 });
    return true;
  }

  /** The standing golem an enemy at `enemy` should chase instead of the hero, if it's close enough. */
  tauntTarget(enemy: Vec2): Vec2 | null {
    for (const companion of this.companions) {
      if (companion.kind !== 'stoneGolem' || companion.downUntil > 0) continue;
      if (Math.hypot(enemy.x - companion.x, enemy.y - companion.y) <= COMPANION_TUNING.golemTauntRadius) return companion;
    }
    return null;
  }

  update(delta: number): void {
    this.companions.forEach((companion) => {
      companion.prevX = companion.x;
      companion.prevY = companion.y;
      companion.cooldownMs += delta;
      if (companion.kind === 'skeletonArcher') this.updateArcher(companion, delta);
      else if (companion.kind === 'stoneGolem') this.updateGolem(companion, delta);
      else this.updateFairy(companion, delta);
    });
    this.updateArrows(delta);
  }

  /** Damage scaled by companion level and hero level. */
  private damage(companion: CompanionState, base: number): number {
    return base * (1 + COMPANION_TUNING.perLevel * (companion.level - 1)) * (1 + COMPANION_TUNING.perHeroLevel * (this.host.heroLevel() - 1));
  }

  private golemHealth(level: number): number {
    return COMPANION_TUNING.golemHealth * (1 + COMPANION_TUNING.perLevel * (level - 1));
  }

  /** Spot beside the hero for this companion's slot (spread around behind them). */
  private followSpot(companion: CompanionState): Vec2 {
    const { player } = this.host;
    const behind = Math.atan2(-player.facingY, -player.facingX);
    const angle = behind + (companion.slot - 1) * 0.9;
    return { x: player.x + Math.cos(angle) * COMPANION_TUNING.followDistance, y: player.y + Math.sin(angle) * COMPANION_TUNING.followDistance };
  }

  private move(companion: CompanionState, target: Vec2, speed: number, delta: number, stopAt = 6): void {
    const dx = target.x - companion.x;
    const dy = target.y - companion.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= stopAt) return;
    // Catch up faster when far behind (the hero outruns them).
    const boost = distance > 300 ? 2.2 : 1;
    const step = Math.min(distance - stopAt, (speed * boost * delta) / 1000);
    companion.x += (dx / distance) * step;
    companion.y += (dy / distance) * step;
    companion.facingX = dx / distance;
    companion.facingY = dy / distance;
    const body = { x: companion.x, y: companion.y, radius: COMPANION_TUNING.bodyRadius };
    this.host.arena.resolve(body);
    companion.x = body.x;
    companion.y = body.y;
    // Hopelessly stuck behind walls: just appear beside the hero.
    if (Math.hypot(this.host.player.x - companion.x, this.host.player.y - companion.y) > 900) {
      const spot = this.host.arena.nearestWalkable(this.host.player.x, this.host.player.y + 40, COMPANION_TUNING.bodyRadius);
      companion.x = companion.prevX = spot.x;
      companion.y = companion.prevY = spot.y;
    }
  }

  private updateArcher(companion: CompanionState, delta: number): void {
    const T = COMPANION_TUNING;
    this.move(companion, this.followSpot(companion), T.followSpeed, delta);
    const target = this.host.nearestEnemy(companion, T.archerRange);
    if (!target) return;
    const dx = target.x - companion.x;
    const dy = target.y - companion.y;
    const distance = Math.hypot(dx, dy) || 1;
    companion.facingX = dx / distance;
    companion.facingY = dy / distance;
    const cooldown = T.archerCooldownMs / (1 + 0.1 * (companion.level - 1));
    if (companion.cooldownMs < cooldown) return;
    companion.cooldownMs = 0;
    companion.attackedAt = this.host.now();
    this.arrows.push({
      x: companion.x, y: companion.y, prevX: companion.x, prevY: companion.y,
      vx: (dx / distance) * T.arrowSpeed, vy: (dy / distance) * T.arrowSpeed,
      lifeMs: T.arrowLifeMs, damage: this.damage(companion, T.archerDamage)
    });
    this.host.events.emit('companion-attack', { kind: companion.kind, x: companion.x, y: companion.y, radius: 0 });
  }

  private updateArrows(delta: number): void {
    for (let index = this.arrows.length - 1; index >= 0; index -= 1) {
      const arrow = this.arrows[index];
      arrow.prevX = arrow.x;
      arrow.prevY = arrow.y;
      arrow.x += (arrow.vx * delta) / 1000;
      arrow.y += (arrow.vy * delta) / 1000;
      arrow.lifeMs -= delta;
      const hit = this.host.enemiesNear(arrow, COMPANION_TUNING.arrowRadius)[0];
      if (hit) this.host.damageEnemy(hit, arrow.damage);
      if (hit || arrow.lifeMs <= 0 || this.host.arena.blocksProjectile(arrow.x, arrow.y, 4)) this.arrows.splice(index, 1);
    }
  }

  /** Hovers at the hero's shoulder; when the hero (or a companion) is hurt, a healing pulse that also washes slows off. */
  private updateFairy(companion: CompanionState, delta: number): void {
    const T = COMPANION_TUNING;
    const { player } = this.host;
    const angle = Math.atan2(-player.facingY, -player.facingX) + 0.8;
    this.move(companion, { x: player.x + Math.cos(angle) * T.fairyFollowDistance, y: player.y + Math.sin(angle) * T.fairyFollowDistance }, T.followSpeed * 1.3, delta, 3);
    const cooldown = T.fairyCooldownMs / (1 + 0.12 * (companion.level - 1));
    if (companion.cooldownMs < cooldown) return;
    const hurtCompanions = this.companions.filter((other) => other !== companion && other.downUntil === 0 && other.health < other.maxHealth);
    if (player.health >= player.maxHealth && hurtCompanions.length === 0) return;
    companion.cooldownMs = 0;
    companion.attackedAt = this.host.now();
    const amount = player.maxHealth * (T.fairyHealRatio + T.fairyHealPerLevel * (companion.level - 1));
    if (player.health < player.maxHealth) this.host.healPlayer(amount);
    player.clearSlows();
    hurtCompanions.forEach((other) => { other.health = Math.min(other.maxHealth, other.health + other.maxHealth * T.fairyCompanionHeal); });
    this.host.events.emit('companion-heal', { x: player.x, y: player.y, amount: Math.round(amount) });
  }

  private updateGolem(companion: CompanionState, delta: number): void {
    const T = COMPANION_TUNING;
    const now = this.host.now();
    if (companion.downUntil > 0) {
      if (now < companion.downUntil) return;
      // Reforms beside the hero.
      const spot = this.host.arena.nearestWalkable(this.host.player.x - 50, this.host.player.y + 30, T.bodyRadius);
      companion.x = companion.prevX = spot.x;
      companion.y = companion.prevY = spot.y;
      companion.downUntil = 0;
      companion.health = companion.maxHealth;
    }
    // Wades into whatever is near the hero; otherwise follows.
    const target = this.host.nearestEnemy(this.host.player, T.golemSeekRange);
    if (target) this.move(companion, target, T.golemSpeed, delta, T.golemReach * 0.6);
    else this.move(companion, this.followSpot(companion), T.followSpeed, delta);
    if (target && companion.cooldownMs >= T.golemCooldownMs && Math.hypot(target.x - companion.x, target.y - companion.y) <= T.golemReach + target.radius) {
      companion.cooldownMs = 0;
      companion.attackedAt = now;
      const damage = this.damage(companion, T.golemDamage);
      this.host.enemiesNear(companion, T.golemRadius).forEach((enemy) => this.host.damageEnemy(enemy, damage));
      this.host.events.emit('companion-attack', { kind: companion.kind, x: companion.x, y: companion.y, radius: T.golemRadius });
    }
    // The horde it taunts chips at it.
    companion.hurtTickMs += delta;
    if (companion.hurtTickMs < T.golemHurtTickMs) return;
    companion.hurtTickMs = 0;
    const damage = this.host.enemiesNear(companion, T.bodyRadius + 14).reduce((sum, enemy) => sum + enemy.contactDamage, 0);
    if (damage <= 0) return;
    companion.health -= damage;
    if (companion.health > 0) return;
    companion.health = 0;
    companion.downUntil = now + T.golemRespawnMs;
    this.host.events.emit('companion-down', { kind: companion.kind, x: companion.x, y: companion.y });
  }
}
