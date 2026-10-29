import { EventBus } from '../EventBus';
import { Vec2 } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';
import { CompanionKind, SnowCompanionKind } from './MiniBossSystem';

// Companions: allies earned from zone mini-bosses (one kind per zone), following the hero for the rest of the run.
// Taking a kind you already have levels it up instead. Every companion has health: enemies touching it chip it, and
// at 0 it falls and reforms beside the hero a while later. The Coveiro also raises friendly skeletons that hunt the
// horde. Engine-agnostic like the rest of the core.

export const MAX_COMPANIONS = 3;
export const MAX_COMPANION_LEVEL = 5;

export interface CompanionSpec {
  name: string;
  /** Card text on the choice screen. */
  description: string;
}

export const COMPANIONS: Record<CompanionKind, CompanionSpec> = {
  frostKnight: { name: 'Cavaleiro Congelado Aliado', description: 'Segue você e corta os inimigos próximos com sua espada de gelo.' },
  iceSerpent: { name: 'Serpente do Gelo Aliada', description: 'Cospe gelo à distância, atingindo os inimigos ao redor do alvo.' },
  bellringer: { name: 'Sineiro Aliado', description: 'Segue você e solta badaladas que atingem os inimigos ao seu redor.' },
  ancientYeti: { name: 'Yeti Ancião Aliado', description: 'Avança na horda e esmaga os inimigos com pancadas em área.' },
  gravedigger: { name: 'Coveiro Aliado', description: 'Segue você com a pá e ergue esqueletos aliados que caçam a horda.' },
  stoneGolem: { name: 'Golem de Pedra', description: 'Avança na horda com socos que atingem em área e atrai os inimigos próximos para si.' },
  waterFairy: { name: 'Fada da Água', description: 'Paira ao seu lado e cura você em pulsos, limpando lentidões. Também cura seus outros companheiros.' }
};

/** Allied attacks are tuned separately from guardian encounters. */
export const SNOW_COMPANION_TUNING = {
  frostKnight: { health: 260, damage: 26, cooldownMs: 1100, reach: 70, radius: 55, speed: 195 },
  iceSerpent: { health: 170, damage: 19, cooldownMs: 1700, reach: 250, radius: 48, speed: 210 },
  bellringer: { health: 210, damage: 18, cooldownMs: 2200, reach: 135, radius: 135, speed: 180 },
  ancientYeti: { health: 340, damage: 32, cooldownMs: 1900, reach: 75, radius: 95, speed: 150 }
} satisfies Record<SnowCompanionKind, object>;

export function isSnowCompanion(kind: CompanionKind): kind is SnowCompanionKind {
  return kind in SNOW_COMPANION_TUNING;
}

export const COMPANION_TUNING = {
  followDistance: 80,
  followSpeed: 240,
  /** Each level beyond the first: +this fraction of damage (and of the golem's health). */
  perLevel: 0.3,
  /** Companions also grow with the hero: +this fraction per hero level. */
  perHeroLevel: 0.04,
  /** Coveiro Aliado: a shovel swipe at whatever is next to it, and every so often a batch of friendly skeletons. */
  gravediggerHealth: 220,
  shovelReach: 55,
  shovelCooldownMs: 1200,
  shovelDamage: 12,
  raiseCooldownMs: 7000,
  /** Skeletons per raise: this many at level 1, one more at levels 3 and 5. */
  raiseCount: 2,
  /** At most this many (+1 per level) standing at once. */
  maxSkeletons: 3,
  raiseRing: 60,
  skeletonHealth: 45,
  skeletonDamage: 10,
  skeletonSpeed: 165,
  skeletonReach: 34,
  skeletonCooldownMs: 800,
  skeletonLifeMs: 18000,
  /** Hunts enemies this close to it or to the hero. */
  skeletonSeekRange: 380,
  /** Enemies this close to a friendly skeleton fight it instead of chasing the hero. */
  skeletonTauntRadius: 70,
  skeletonRadius: 14,
  /** Enemies touching a companion (or skeleton) chip it every this often. */
  hurtTickMs: 700,
  respawnMs: 15000,
  golemSeekRange: 260,
  golemSpeed: 150,
  golemCooldownMs: 1500,
  golemReach: 60,
  golemRadius: 80,
  golemDamage: 22,
  golemHealth: 320,
  /** Enemies this close to the golem pursue it instead of the hero. */
  golemTauntRadius: 170,
  /** Water fairy: a healing pulse every this long (faster with level), only when someone needs it. */
  fairyCooldownMs: 6000,
  fairyHealRatio: 0.05,
  fairyHealPerLevel: 0.015,
  /** Heals the other companions (the golem) by this fraction of their max health. */
  fairyCompanionHeal: 0.2,
  fairyFollowDistance: 45,
  fairyHealth: 140,
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
  /** Sim time it reforms after falling; 0 while standing. */
  downUntil: number;
  cooldownMs: number;
  hurtTickMs: number;
  /** Sim time of its last attack (the renderer plays the swipe / raise / slam from it). */
  attackedAt: number;
  /** Coveiro Aliado: time since its last raise. */
  raiseMs: number;
}

/** A skeleton the Coveiro Aliado raised: hunts the nearest enemy, crumbles at 0 health or when its time runs out. */
export interface AllySkeletonState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facingX: number;
  facingY: number;
  radius: number;
  health: number;
  maxHealth: number;
  damage: number;
  lifeMs: number;
  cooldownMs: number;
  hurtTickMs: number;
  /** Sim time it rose (the renderer plays it climbing out) and of its last swing. */
  raisedAt: number;
  attackedAt: number;
}

export interface CompanionEvents extends Record<string, unknown> {
  'companion-joined': { kind: CompanionKind; level: number };
  'companion-attack': { kind: CompanionKind; x: number; y: number; radius: number };
  'companion-down': { kind: CompanionKind; x: number; y: number };
  'companion-heal': { x: number; y: number; amount: number };
  'ally-raised': { x: number; y: number };
  'ally-down': { x: number; y: number };
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
  readonly skeletons: AllySkeletonState[] = [];

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
      existing.maxHealth = this.maxHealth(kind, existing.level);
      existing.health = existing.maxHealth;
      this.host.events.emit('companion-joined', { kind, level: existing.level });
      return true;
    }
    if (this.companions.length >= MAX_COMPANIONS) return false;
    const { player } = this.host;
    const maxHealth = this.maxHealth(kind, 1);
    this.companions.push({
      kind, level: 1, slot: this.companions.length,
      x: player.x, y: player.y + 30, prevX: player.x, prevY: player.y + 30, facingX: 0, facingY: 1,
      health: maxHealth, maxHealth, downUntil: 0, cooldownMs: 0, hurtTickMs: 0, attackedAt: -Infinity, raiseMs: 0
    });
    this.host.events.emit('companion-joined', { kind, level: 1 });
    return true;
  }

  /** What an enemy at `enemy` should chase instead of the hero, if anything: a standing golem, or a friendly
   *  skeleton right next to it. */
  tauntTarget(enemy: Vec2): Vec2 | null {
    for (const companion of this.companions) {
      if (companion.kind !== 'stoneGolem' || companion.downUntil > 0) continue;
      if (Math.hypot(enemy.x - companion.x, enemy.y - companion.y) <= COMPANION_TUNING.golemTauntRadius) return companion;
    }
    for (const skeleton of this.skeletons) {
      if (Math.hypot(enemy.x - skeleton.x, enemy.y - skeleton.y) <= COMPANION_TUNING.skeletonTauntRadius) return skeleton;
    }
    return null;
  }

  update(delta: number): void {
    this.companions.forEach((companion) => {
      companion.prevX = companion.x;
      companion.prevY = companion.y;
      if (!this.standing(companion)) return;
      companion.cooldownMs += delta;
      if (isSnowCompanion(companion.kind)) this.updateSnowCompanion(companion, companion.kind, delta);
      else if (companion.kind === 'gravedigger') this.updateGravedigger(companion, delta);
      else if (companion.kind === 'stoneGolem') this.updateGolem(companion, delta);
      else this.updateFairy(companion, delta);
      this.takeContactDamage(companion, delta);
    });
    this.updateSkeletons(delta);
  }

  /** Reforms a fallen companion beside the hero once its time is up; false while it's still down. */
  private standing(companion: CompanionState): boolean {
    if (companion.downUntil === 0) return true;
    if (this.host.now() < companion.downUntil) return false;
    const spot = this.host.arena.nearestWalkable(this.host.player.x - 50, this.host.player.y + 30, COMPANION_TUNING.bodyRadius);
    companion.x = companion.prevX = spot.x;
    companion.y = companion.prevY = spot.y;
    companion.downUntil = 0;
    companion.health = companion.maxHealth;
    companion.hurtTickMs = 0;
    return true;
  }

  /** Enemies touching it chip it with their contact damage; at 0 it falls for COMPANION_TUNING.respawnMs. */
  private takeContactDamage(companion: CompanionState, delta: number): void {
    const T = COMPANION_TUNING;
    companion.hurtTickMs += delta;
    if (companion.hurtTickMs < T.hurtTickMs) return;
    companion.hurtTickMs = 0;
    const damage = this.host.enemiesNear(companion, T.bodyRadius + 14).reduce((sum, enemy) => sum + enemy.contactDamage, 0);
    if (damage <= 0) return;
    companion.health -= damage;
    if (companion.health > 0) return;
    companion.health = 0;
    companion.downUntil = this.host.now() + T.respawnMs;
    this.host.events.emit('companion-down', { kind: companion.kind, x: companion.x, y: companion.y });
  }

  /** Damage scaled by companion level and hero level. */
  private damage(companion: CompanionState, base: number): number {
    return base * (1 + COMPANION_TUNING.perLevel * (companion.level - 1)) * (1 + COMPANION_TUNING.perHeroLevel * (this.host.heroLevel() - 1));
  }

  private maxHealth(kind: CompanionKind, level: number): number {
    const T = COMPANION_TUNING;
    const base = isSnowCompanion(kind) ? SNOW_COMPANION_TUNING[kind].health : kind === 'stoneGolem' ? T.golemHealth : kind === 'gravedigger' ? T.gravediggerHealth : T.fairyHealth;
    return base * (1 + T.perLevel * (level - 1));
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

  /** Follows the hero; swipes with the shovel at whatever is next to it, and raises friendly skeletons around itself
   *  whenever there's a fight nearby and room for more. */
  private updateGravedigger(companion: CompanionState, delta: number): void {
    const T = COMPANION_TUNING;
    const now = this.host.now();
    this.move(companion, this.followSpot(companion), T.followSpeed, delta);
    const adjacent = this.host.nearestEnemy(companion, T.shovelReach);
    if (adjacent && companion.cooldownMs >= T.shovelCooldownMs) {
      companion.cooldownMs = 0;
      companion.attackedAt = now;
      this.face(companion, adjacent);
      this.host.damageEnemy(adjacent, this.damage(companion, T.shovelDamage));
      this.host.events.emit('companion-attack', { kind: companion.kind, x: companion.x, y: companion.y, radius: T.shovelReach });
    }
    companion.raiseMs += delta;
    const raiseCooldown = T.raiseCooldownMs / (1 + 0.08 * (companion.level - 1));
    const room = T.maxSkeletons + companion.level - this.skeletons.length;
    if (companion.raiseMs < raiseCooldown || room <= 0 || !this.host.nearestEnemy(this.host.player, T.skeletonSeekRange)) return;
    companion.raiseMs = 0;
    companion.attackedAt = now;
    const count = Math.min(room, T.raiseCount + Math.floor((companion.level - 1) / 2));
    const levelScale = 1 + T.perLevel * (companion.level - 1);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + now / 1000;
      const spot = this.host.arena.nearestWalkable(companion.x + Math.cos(angle) * T.raiseRing, companion.y + Math.sin(angle) * T.raiseRing, T.skeletonRadius);
      this.skeletons.push({
        x: spot.x, y: spot.y, prevX: spot.x, prevY: spot.y, facingX: 0, facingY: 1, radius: T.skeletonRadius,
        health: T.skeletonHealth * levelScale, maxHealth: T.skeletonHealth * levelScale,
        damage: this.damage(companion, T.skeletonDamage), lifeMs: T.skeletonLifeMs,
        cooldownMs: 0, hurtTickMs: 0, raisedAt: now, attackedAt: -Infinity
      });
      this.host.events.emit('ally-raised', spot);
    }
  }

  private face(body: { x: number; y: number; facingX: number; facingY: number }, target: Vec2): void {
    const dx = target.x - body.x;
    const dy = target.y - body.y;
    const distance = Math.hypot(dx, dy) || 1;
    body.facingX = dx / distance;
    body.facingY = dy / distance;
  }

  /** Each skeleton hunts the nearest enemy (around itself, else around the hero), strikes it in melee, and is chipped
   *  by whatever touches it. It crumbles at 0 health or when its time is up. */
  private updateSkeletons(delta: number): void {
    const T = COMPANION_TUNING;
    const now = this.host.now();
    for (let index = this.skeletons.length - 1; index >= 0; index -= 1) {
      const skeleton = this.skeletons[index];
      skeleton.prevX = skeleton.x;
      skeleton.prevY = skeleton.y;
      skeleton.lifeMs -= delta;
      skeleton.cooldownMs += delta;
      // Still climbing out of the ground.
      const rising = now - skeleton.raisedAt < 600;
      const target = rising ? null : this.host.nearestEnemy(skeleton, T.skeletonSeekRange) ?? this.host.nearestEnemy(this.host.player, T.skeletonSeekRange);
      if (target) {
        const distance = Math.hypot(target.x - skeleton.x, target.y - skeleton.y);
        const reach = T.skeletonReach + target.radius;
        this.face(skeleton, target);
        if (distance > reach * 0.8) {
          const step = Math.min(distance - reach * 0.8, (T.skeletonSpeed * delta) / 1000);
          skeleton.x += skeleton.facingX * step;
          skeleton.y += skeleton.facingY * step;
          const body = { x: skeleton.x, y: skeleton.y, radius: T.skeletonRadius };
          this.host.arena.resolve(body);
          skeleton.x = body.x;
          skeleton.y = body.y;
        }
        if (distance <= reach && skeleton.cooldownMs >= T.skeletonCooldownMs) {
          skeleton.cooldownMs = 0;
          skeleton.attackedAt = now;
          this.host.damageEnemy(target, skeleton.damage);
        }
      }
      skeleton.hurtTickMs += delta;
      if (skeleton.hurtTickMs >= T.hurtTickMs) {
        skeleton.hurtTickMs = 0;
        skeleton.health -= this.host.enemiesNear(skeleton, T.skeletonRadius + 14).reduce((sum, enemy) => sum + enemy.contactDamage, 0);
      }
      if (skeleton.health > 0 && skeleton.lifeMs > 0) continue;
      this.skeletons.splice(index, 1);
      this.host.events.emit('ally-down', { x: skeleton.x, y: skeleton.y });
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
  }

  private updateSnowCompanion(companion: CompanionState, kind: SnowCompanionKind, delta: number): void {
    const tuning = SNOW_COMPANION_TUNING[kind];
    const target = this.host.nearestEnemy(this.host.player, COMPANION_TUNING.golemSeekRange);
    const follows = kind === 'bellringer' || kind === 'iceSerpent';
    this.move(companion, target && !follows ? target : this.followSpot(companion), target && !follows ? tuning.speed : COMPANION_TUNING.followSpeed, delta, target && !follows ? tuning.reach * 0.6 : 6);
    if (!target || companion.cooldownMs < tuning.cooldownMs || Math.hypot(target.x - companion.x, target.y - companion.y) > tuning.reach + target.radius) return;
    companion.cooldownMs = 0;
    companion.attackedAt = this.host.now();
    this.face(companion, target);
    const center = kind === 'iceSerpent' ? target : companion;
    this.host.enemiesNear(center, tuning.radius).forEach(enemy => this.host.damageEnemy(enemy, this.damage(companion, tuning.damage)));
    this.host.events.emit('companion-attack', { kind, x: center.x, y: center.y, radius: tuning.radius });
  }
}
