import { CHARACTERS, CharacterId } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { EventBus } from '../EventBus';
import { SimClock } from '../SimClock';
import { Rng, Vec2 } from '../math';
import { EnemyState, PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';

// The tavern regulars' kits, on top of their weapons: Brom's mead and rolling barrels, Lyra's rain of arrows, Zora's
// sealed fates and Sergio's clearance sale run on timers here. (Lyra's Olho de Falcão lives in the weapon damage;
// Grimbo's luck, Zora's extra option and Sergio's portable shop hook into the session's own flow.) An exclusive
// switches on at the character's `kit.exclusiveThreshold` upgrades with affinity — the same gate as Fabri's banana.

export const HERO_ABILITY_TUNING = {
  meadIntervalMs: 20_000,
  meadHeal: 0.12,
  barrelIntervalMs: 6000,
  barrelSpeed: 260,
  barrelLifeMs: 2200,
  barrelRadius: 26,
  barrelDamage: 30,
  barrelFoamRadius: 90,
  barrelFoamDamage: 20,
  barrelFoamStunMs: 1000,
  rainIntervalMs: 8000,
  rainRange: 600,
  rainRadius: 110,
  rainWaves: 3,
  rainWaveGapMs: 350,
  rainDamage: 14,
  fateIntervalMs: 10_000,
  fateRange: 450,
  fateTargets: 3,
  fateMarkMs: 8000,
  fateBurstRadius: 80,
  fateBurstDamage: 40,
  saleIntervalMs: 120_000,
  /** Grimbo: extra coins per pickup, and Sergio's prices. */
  grimboCoins: 1.5,
  grimboPrices: 0.8,
  /** Grimbo's Tudo ou Nada: a six on the die. */
  jackpotChance: 1 / 6,
  /** Sergio's Loja Portátil: how often the pocket portal can open, and its markup. */
  portableShopCooldownMs: 45_000,
  portableShopMarkup: 1.5,
  /** Zora's Previsão: a guardian shows on the map this long before it's announced. */
  prophecyLeadMs: 30_000
};

/** A barrel Brom set rolling: hits each enemy once on its way, bursts into foam at the end. */
export interface BarrelState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  dirX: number;
  dirY: number;
  lifeMs: number;
  spin: number;
  hit: Set<EnemyState>;
}

export interface HeroAbilityEvents extends Record<string, unknown> {
  /** A passive or exclusive went off (floating text, sound). */
  'hero-ability': { kind: 'mead' | 'jackpot' | 'sale' | 'fate' | 'rain'; x: number; y: number };
  'barrel-burst': { x: number; y: number; radius: number };
  'arrow-rain': { x: number; y: number; radius: number };
  'fate-burst': { x: number; y: number; radius: number };
}

export interface HeroAbilityHost {
  readonly player: PlayerState;
  readonly clock: SimClock;
  readonly rng: Rng;
  readonly characterId: CharacterId;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<HeroAbilityEvents>, 'emit'>;
  /** The character's own weapon (their exclusive grows with its upgrades). */
  primaryWeapon(): { config: WeaponConfig; upgradeCount: number };
  hasAffinity(weapon: WeaponConfig): boolean;
  enemiesWithin(from: Vec2, radius: number): EnemyState[];
  nearestEnemy(from: Vec2, range: number): EnemyState | null;
  damageEnemy(enemy: EnemyState, amount: number, weaponId: WeaponConfig['id']): void;
  stunEnemy(enemy: EnemyState, ms: number): void;
  healPlayer(amount: number): void;
  /** Sergio's Liquidação: one item on his next visit is free. */
  addFreeItem(): void;
}

export class HeroAbilitySystem {
  readonly barrels: BarrelState[] = [];
  private readonly timers = { mead: 0, barrel: 0, rain: 0, fate: 0, sale: 0 };

  constructor(private readonly host: HeroAbilityHost) {}

  get character(): CharacterId {
    return this.host.characterId;
  }

  /** The character's exclusive is on: enough upgrades on their weapon, with its affinity. */
  get exclusiveActive(): boolean {
    const kit = CHARACTERS[this.host.characterId].kit;
    const weapon = this.host.primaryWeapon();
    return !!kit && weapon.upgradeCount >= kit.exclusiveThreshold && this.host.hasAffinity(weapon.config);
  }

  /** Grimbo's Tudo ou Nada: a level-up roll; true on a six. */
  rollJackpot(): boolean {
    if (this.host.characterId !== 'grimbo' || !this.exclusiveActive || this.host.rng() >= HERO_ABILITY_TUNING.jackpotChance) return false;
    this.host.events.emit('hero-ability', { kind: 'jackpot', x: this.host.player.x, y: this.host.player.y });
    return true;
  }

  update(delta: number): void {
    const T = HERO_ABILITY_TUNING;
    const { player } = this.host;
    const id = this.host.characterId;
    const exclusive = this.exclusiveActive;
    if (id === 'brom') {
      if (this.tick('mead', delta, T.meadIntervalMs) && player.health < player.maxHealth) {
        this.host.healPlayer(player.maxHealth * T.meadHeal);
        this.host.events.emit('hero-ability', { kind: 'mead', x: player.x, y: player.y });
      }
      if (exclusive && this.tick('barrel', delta, T.barrelIntervalMs)) this.rollBarrel();
    }
    if (id === 'lyra' && exclusive && this.tick('rain', delta, T.rainIntervalMs)) this.rainArrows();
    if (id === 'zora' && exclusive && this.tick('fate', delta, T.fateIntervalMs)) this.sealFates();
    if (id === 'sergio' && exclusive && this.tick('sale', delta, T.saleIntervalMs)) {
      this.host.addFreeItem();
      this.host.events.emit('hero-ability', { kind: 'sale', x: player.x, y: player.y });
    }
    this.updateBarrels(delta);
  }

  /** Zora's mark: a sealed enemy takes double damage... */
  isMarked(enemy: EnemyState): boolean {
    return enemy.markedUntil > this.host.clock.now;
  }

  /** ...and bursts when it dies, hurting what's around it. */
  onDefeated(enemy: EnemyState): void {
    if (!this.isMarked(enemy)) return;
    const T = HERO_ABILITY_TUNING;
    const damage = T.fateBurstDamage * this.host.player.damageMultiplier;
    enemy.markedUntil = 0;
    this.host.enemiesWithin(enemy, T.fateBurstRadius).filter((other) => other !== enemy).forEach((other) => this.host.damageEnemy(other, damage, this.host.primaryWeapon().config.id));
    this.host.events.emit('fate-burst', { x: enemy.x, y: enemy.y, radius: T.fateBurstRadius });
  }

  private tick(timer: keyof HeroAbilitySystem['timers'], delta: number, interval: number): boolean {
    this.timers[timer] += delta;
    if (this.timers[timer] < interval) return false;
    this.timers[timer] = 0;
    return true;
  }

  private rollBarrel(): void {
    const { player } = this.host;
    const target = this.host.nearestEnemy(player, 500);
    const dx = target ? target.x - player.x : player.facingX;
    const dy = target ? target.y - player.y : player.facingY;
    const length = Math.hypot(dx, dy) || 1;
    this.barrels.push({ x: player.x, y: player.y, prevX: player.x, prevY: player.y, dirX: dx / length, dirY: dy / length, lifeMs: HERO_ABILITY_TUNING.barrelLifeMs, spin: 0, hit: new Set() });
  }

  private updateBarrels(delta: number): void {
    const T = HERO_ABILITY_TUNING;
    const scale = 1 + 0.03 * this.host.primaryWeapon().upgradeCount;
    for (let index = this.barrels.length - 1; index >= 0; index -= 1) {
      const barrel = this.barrels[index];
      barrel.prevX = barrel.x;
      barrel.prevY = barrel.y;
      barrel.x += (barrel.dirX * T.barrelSpeed * delta) / 1000;
      barrel.y += (barrel.dirY * T.barrelSpeed * delta) / 1000;
      barrel.spin += (T.barrelSpeed * delta) / 1000 / 0.4;
      barrel.lifeMs -= delta;
      this.host.enemiesWithin(barrel, T.barrelRadius).forEach((enemy) => {
        if (barrel.hit.has(enemy)) return;
        barrel.hit.add(enemy);
        this.host.damageEnemy(enemy, T.barrelDamage * this.host.player.damageMultiplier * scale, this.host.primaryWeapon().config.id);
      });
      if (barrel.lifeMs > 0 && !this.host.arena.blocksProjectile(barrel.x, barrel.y, T.barrelRadius * 0.5)) continue;
      // Foam: hurts and knocks down what's around.
      this.host.enemiesWithin(barrel, T.barrelFoamRadius).forEach((enemy) => {
        this.host.damageEnemy(enemy, T.barrelFoamDamage * this.host.player.damageMultiplier * scale, this.host.primaryWeapon().config.id);
        this.host.stunEnemy(enemy, T.barrelFoamStunMs);
      });
      this.host.events.emit('barrel-burst', { x: barrel.x, y: barrel.y, radius: T.barrelFoamRadius });
      this.barrels.splice(index, 1);
    }
  }

  /** Lyra's Chuva de Flechas: three waves on the thickest knot of enemies nearby. */
  private rainArrows(): void {
    const T = HERO_ABILITY_TUNING;
    const { player, clock } = this.host;
    const candidates = this.host.enemiesWithin(player, T.rainRange).slice(0, 40);
    if (candidates.length === 0) return;
    let center: Vec2 = candidates[0];
    let best = -1;
    candidates.forEach((enemy) => {
      const crowd = candidates.filter((other) => Math.hypot(other.x - enemy.x, other.y - enemy.y) <= T.rainRadius).length;
      if (crowd > best) { best = crowd; center = enemy; }
    });
    const spot = { x: center.x, y: center.y };
    this.host.events.emit('hero-ability', { kind: 'rain', x: spot.x, y: spot.y });
    for (let wave = 0; wave < T.rainWaves; wave += 1) {
      clock.delayedCall(wave * T.rainWaveGapMs, () => {
        const damage = T.rainDamage * this.host.player.damageMultiplier * (1 + 0.03 * this.host.primaryWeapon().upgradeCount);
        this.host.enemiesWithin(spot, T.rainRadius).forEach((enemy) => this.host.damageEnemy(enemy, damage, this.host.primaryWeapon().config.id));
        this.host.events.emit('arrow-rain', { x: spot.x, y: spot.y, radius: T.rainRadius });
      });
    }
  }

  /** Zora's Destino Selado: the three strongest enemies nearby are marked. */
  private sealFates(): void {
    const T = HERO_ABILITY_TUNING;
    const { player, clock } = this.host;
    const marked = this.host.enemiesWithin(player, T.fateRange)
      .filter((enemy) => enemy.alive)
      .sort((a, b) => b.health - a.health)
      .slice(0, T.fateTargets);
    if (marked.length === 0) return;
    marked.forEach((enemy) => { enemy.markedUntil = clock.now + T.fateMarkMs; });
    this.host.events.emit('hero-ability', { kind: 'fate', x: player.x, y: player.y });
  }
}
