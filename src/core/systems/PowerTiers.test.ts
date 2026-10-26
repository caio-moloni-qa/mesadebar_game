import { describe, expect, it } from 'vitest';
import { CharacterId } from '../../config/characters';
import { POWER_TIER_LEVELS } from '../../config/powerTiers';
import { WORLD_SIZE } from '../../config/world';
import { ProjectileKind } from '../session/entities';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { POWER_TUNING } from './PowerTierSystem';

const CENTER = WORLD_SIZE / 2;
const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

/** A quiet open arena, the hero at `tier` (their level set to its threshold). */
function session(characterId: CharacterId, tier: number, seed = 5): GameSession {
  const run = new GameSession({ characterId, seed, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.invincible = true;
  run.level = tier > 0 ? POWER_TIER_LEVELS[tier - 1] : 1;
  return run;
}
function dummy(run: GameSession, x: number, y: number, health = 1_000_000) {
  const enemy = run.spawnEnemy('skeleton', x, y, health)!;
  enemy.movementSpeed = 0;
  enemy.contactDamage = 0;
  return enemy;
}
function kindsFired(run: GameSession): ProjectileKind[] {
  const kinds: ProjectileKind[] = [];
  run.events.on('projectile-fired', ({ kind }) => kinds.push(kind));
  return kinds;
}

describe('power tiers', () => {
  it('switch on at their levels, one announcement each', () => {
    const run = session('mage', 0);
    const unlocked: number[] = [];
    run.events.on('power-unlocked', ({ tier }) => unlocked.push(tier));
    advance(run, 50);
    expect(run.powers.tier).toBe(0);
    run.level = POWER_TIER_LEVELS[1];
    advance(run, 50);
    expect(unlocked).toEqual([1, 2]);
    run.level = POWER_TIER_LEVELS[2];
    advance(run, 50);
    expect(unlocked).toEqual([1, 2, 3]);
  });

  it('ride on the hero weapon: started with another one, none of them work', () => {
    const run = new GameSession({ characterId: 'lyra', seed: 1, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE), startingWeaponId: 'staff' });
    run.level = 20;
    advance(run, 50);
    expect(run.powers.has(1)).toBe(false);
  });

  it('Mago: the staff bolt sparks to two more; the storm stuns the strongest; the hurricane lifts', () => {
    const run = session('mage', 3);
    const arcs: number[] = [];
    run.events.on('power-arc', ({ points }) => arcs.push(points.length));
    const first = dummy(run, CENTER + 120, CENTER);
    const others = [dummy(run, CENTER + 200, CENTER), dummy(run, CENTER + 260, CENTER + 40)];
    advance(run, 800);
    expect(arcs.some((length) => length >= 2)).toBe(true);
    others.forEach((enemy) => expect(enemy.health).toBeLessThan(enemy.maxHealth));
    expect(first.health).toBeLessThan(first.maxHealth);
    advance(run, POWER_TUNING.stormIntervalMs);
    advance(run, POWER_TUNING.hurricaneIntervalMs - POWER_TUNING.stormIntervalMs);
    expect(run.powers.hurricanes.length).toBe(1);
    advance(run, 1200);
    expect([first, ...others].some((enemy) => enemy.liftedUntil > run.clock.now)).toBe(true);
  });

  it('Bárbaro: the cut bleeds; the war cry scatters; the fury saves once per stage', () => {
    const run = session('barbarian', 3);
    const enemy = dummy(run, CENTER + 60, CENTER);
    advance(run, 100);
    expect(enemy.bleedUntil).toBeGreaterThan(run.clock.now);
    const after = enemy.health;
    run.weapons.primary.lastAttackAt = run.clock.now + 60_000;
    advance(run, 1200);
    expect(enemy.health).toBeLessThan(after);

    const crowd = dummy(run, CENTER - 80, CENTER);
    run.player.health = run.player.maxHealth * 0.3;
    advance(run, 50);
    expect(crowd.fleeUntil).toBeGreaterThan(run.clock.now);
    expect(Math.hypot(crowd.x - CENTER, crowd.y - CENTER)).toBeGreaterThan(150);

    run.player.invincible = false;
    run.player.health = 0;
    advance(run, 20);
    expect(run.over).toBe(false);
    expect(run.powers.furious).toBe(true);
    advance(run, POWER_TUNING.furyMs + 100);
    run.player.health = 0;
    advance(run, 20);
    expect(run.over).toBe(true);
  });

  it('Relíquia: the shield reflects touches; every fifth pulse rings out; a broken full shield leaves a sanctuary', () => {
    const run = session('reliquia', 3);
    const toucher = run.spawnEnemy('skeleton', CENTER, CENTER, 1_000_000)!;
    toucher.movementSpeed = 0;
    run.player.invincible = false;
    run.player.damageBuffer = run.player.maxHealth;
    run.weapons.primary.lastAttackAt = run.clock.now + 60_000;
    advance(run, 20);
    expect(toucher.health).toBeLessThan(toucher.maxHealth);
    toucher.health = 0;
    run.killAllEnemies();

    const blasts: string[] = [];
    run.events.on('power-blast', ({ kind }) => blasts.push(kind));
    run.player.damageBuffer = 0;
    advance(run, 100);
    expect(blasts).toContain('sanctuary');
    expect(run.powers.zones.some((zone) => zone.kind === 'sanctuary')).toBe(true);

    run.weapons.primary.lastAttackAt = -Infinity;
    dummy(run, CENTER + 40, CENTER);
    advance(run, 6000);
    expect(blasts).toContain('holy');
  });

  it('Fabri: every throw sends a second boomerang back the other way; the monkey makes them circle', () => {
    const run = session('fabri', 3);
    const kinds = kindsFired(run);
    dummy(run, CENTER + 150, CENTER);
    advance(run, 50);
    expect(kinds.length).toBe(2);
    advance(run, POWER_TUNING.monkeyIntervalMs);
    let circling = 0;
    run.projectiles.forEachActive((projectile) => { if (projectile.orbitUntil > 0) circling += 1; });
    expect(circling).toBe(POWER_TUNING.monkeyBoomerangs);
  });

  it('Brom: the shockwave cracks the ground (slow); every third is the anvil; the meteor falls on him', () => {
    const run = session('brom', 3);
    const blasts: string[] = [];
    run.events.on('power-blast', ({ kind }) => blasts.push(kind));
    const enemy = dummy(run, CENTER + 80, CENTER);
    advance(run, 100);
    expect(enemy.slowUntil).toBeGreaterThan(run.clock.now);
    advance(run, 1400 * 3);
    expect(blasts).toContain('anvil');
    advance(run, POWER_TUNING.meteorIntervalMs);
    expect(blasts).toContain('meteor');
    expect(run.powers.zones.some((zone) => zone.kind === 'embers')).toBe(true);
  });

  it('Lyra: three arrows a shot, each piercing deeper; the hawk dives on the strongest', () => {
    const run = session('lyra', 3);
    const kinds = kindsFired(run);
    dummy(run, CENTER + 200, CENTER);
    advance(run, 50);
    expect(kinds.filter((kind) => kind === 'arrow').length).toBe(3);
    const blasts: string[] = [];
    run.events.on('power-blast', ({ kind }) => blasts.push(kind));
    advance(run, POWER_TUNING.hawkIntervalMs + 1000);
    expect(blasts).toContain('hawk');
    run.events.emit('arrow-rain', { x: CENTER + 200, y: CENTER, radius: 100 });
    expect(blasts).toContain('roots');
  });

  it('Grimbo: every fifth coin is golden; the gold rain falls on the crowd', () => {
    const run = session('grimbo', 3);
    const blasts: string[] = [];
    run.events.on('power-blast', ({ kind }) => blasts.push(kind));
    for (let index = 0; index < 4; index += 1) dummy(run, CENTER + 120 + index * 30, CENTER + 10);
    advance(run, 5000);
    expect(blasts).toContain('gold');
    advance(run, POWER_TUNING.goldRainIntervalMs);
    expect(blasts).toContain('gold-rain');
  });

  it('Zora: the foresight eats a hit and comes back; the eclipse pulls the horde in', () => {
    const run = session('zora', 3);
    run.player.invincible = false;
    advance(run, 20);
    expect(run.powers.foresightReady).toBe(true);
    const biter = run.spawnEnemy('skeleton', CENTER, CENTER, 1_000_000)!;
    biter.movementSpeed = 0;
    const health = run.player.health;
    advance(run, 20);
    expect(run.player.health).toBe(health);
    expect(run.powers.foresightReady).toBe(false);
    biter.contactDamage = 0;
    advance(run, POWER_TUNING.foresightRechargeMs + 100);
    expect(run.powers.foresightReady).toBe(true);

    const far = dummy(run, CENTER + 250, CENTER);
    dummy(run, CENTER + 200, CENTER);
    far.movementSpeed = 60;
    advance(run, POWER_TUNING.eclipseIntervalMs - POWER_TUNING.foresightRechargeMs);
    expect(run.powers.eclipse).not.toBeNull();
  });

  it('Sergio: pan, bottle and potion, one after another; the crate leaves loot', () => {
    const run = session('sergio', 2);
    const kinds = kindsFired(run);
    dummy(run, CENTER + 150, CENTER);
    advance(run, 400);
    expect(kinds.slice(0, 3)).toEqual(['pan', 'bottle', 'potion']);
    let before = 0;
    run.pickups.forEachActive(() => { before += 1; });
    advance(run, POWER_TUNING.crateIntervalMs + POWER_TUNING.crateFlightMs);
    let after = 0;
    run.pickups.forEachActive(() => { after += 1; });
    expect(after).toBeGreaterThan(before + POWER_TUNING.crateCoins - 1);
  });
});
