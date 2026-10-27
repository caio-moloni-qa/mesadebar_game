import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GREENFIELD, SNOWFIELD, TEMPLE, useArenaLayout } from '../../config/arenaLayout';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap } from '../world/ArenaMap';
import { MINI_BOSSES, MINI_BOSS_TUNING, MiniBossState, guardianRotation, icePillarSpots } from './MiniBossSystem';

const advance = (run: GameSession, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) run.step(STEP_MS); };

let arena: ArenaMap;
beforeAll(() => {
  useArenaLayout(SNOWFIELD);
  arena = ArenaMap.generate(5);
});
afterAll(() => useArenaLayout(GREENFIELD));

/** The Cavaleiro risen in the castle courtyard, the hero `distance` south of him. */
function knight(distance = 260): { run: GameSession; boss: MiniBossState } {
  const run = new GameSession({ characterId: 'barbarian', seed: 4, skipStartingUpgrades: true, arena });
  run.skeletonSpawnEnabled = false;
  run.variantSpawnEnabled = false;
  run.player.invincible = true;
  const spot = arena.nearestWalkable(MINI_BOSSES.frostKnight.anchor.x, MINI_BOSSES.frostKnight.anchor.y + distance, 20);
  run.player.x = run.player.prevX = spot.x;
  run.player.y = run.player.prevY = spot.y;
  run.spawnMiniBoss('frostKnight');
  advance(run, MINI_BOSS_TUNING.warningMs + 50);
  return { run, boss: run.miniBosses.bosses[0] };
}

describe('O Cavaleiro Congelado (Campo Nevado)', () => {
  it('is the castle guardian of Campo Nevado, and rises in the courtyard', () => {
    expect(guardianRotation()[0]).toBe('frostKnight');
    const { run, boss } = knight(300);
    const start = Math.hypot(boss.enemy.x - run.player.x, boss.enemy.y - run.player.y);
    expect(boss.kind).toBe('frostKnight');
    // In the courtyard, and free to walk: a few seconds later he has come for the hero.
    const anchor = MINI_BOSSES.frostKnight.anchor;
    expect(Math.hypot(boss.enemy.x - anchor.x, boss.enemy.y - anchor.y)).toBeLessThan(80);
    expect(Math.abs(boss.enemy.y - TEMPLE.center.y)).toBeGreaterThan(SNOWFIELD.temple.sanctum.halfHeight + boss.enemy.radius);
    boss.cooldowns.charge = boss.cooldowns.iceWall = -60000;
    advance(run, 2000);
    expect(Math.hypot(boss.enemy.x - run.player.x, boss.enemy.y - run.player.y)).toBeLessThan(start - 60);
  });

  it('his shield blunts blows from the front; at half health the armour breaks for good', () => {
    const { run, boss } = knight(200);
    // Face the hero, then hit him head-on.
    boss.facing = Math.atan2(run.player.y - boss.enemy.y, run.player.x - boss.enemy.x);
    expect(run.miniBosses.damageTakenMultiplier(boss.enemy)).toBe(MINI_BOSS_TUNING.shieldDamageMultiplier);
    const speed = boss.enemy.movementSpeed;
    const events: string[] = [];
    run.events.on('miniboss-enraged', () => events.push('enraged'));
    boss.enemy.health = boss.enemy.maxHealth * 0.45;
    advance(run, 50);
    expect(boss.enraged).toBe(true);
    expect(events).toEqual(['enraged']);
    expect(boss.enemy.movementSpeed).toBeCloseTo(speed * MINI_BOSS_TUNING.enragedSpeedMultiplier);
    expect(run.miniBosses.damageTakenMultiplier(boss.enemy)).toBe(MINI_BOSS_TUNING.enragedDamageTaken);
  });

  it('the icy sweep hurts and slows the hero', () => {
    const { run, boss } = knight(110);
    run.player.invincible = false;
    run.player.health = run.player.maxHealth;
    boss.cooldowns.iceSlash = MINI_BOSS_TUNING.iceSlashCooldownMs;
    boss.cooldowns.iceWall = 0;
    boss.cooldowns.charge = 0;
    advance(run, MINI_BOSS_TUNING.iceSlashTelegraphMs + 100);
    expect(run.player.health).toBeLessThan(run.player.maxHealth);
    expect(run.player.isSlowed(run.clock.now)).toBe(true);
  });

  it('the ice wall rings the hero in, its one gap facing the knight, then melts', () => {
    const spots = icePillarSpots(1000, 1000, 1, 0); // the knight stands to the west, looking east
    expect(spots.length).toBe(MINI_BOSS_TUNING.iceWallPillars - MINI_BOSS_TUNING.iceWallGap);
    // No pillar on the west side (the way out is straight at him).
    expect(spots.every((spot) => spot.x > 1000 - MINI_BOSS_TUNING.iceWallRing * 0.9)).toBe(true);

    const { run, boss } = knight(380);
    boss.cooldowns.iceWall = MINI_BOSS_TUNING.iceWallCooldownMs;
    boss.cooldowns.iceSlash = 0;
    boss.cooldowns.charge = 0;
    advance(run, MINI_BOSS_TUNING.iceWallTelegraphMs + 100);
    expect(run.miniBosses.icePillars.length).toBe(spots.length);
    // A pillar is solid: standing in one pushes the hero out.
    const pillar = run.miniBosses.icePillars[0];
    run.player.x = run.player.prevX = pillar.x;
    run.player.y = run.player.prevY = pillar.y;
    advance(run, 20);
    expect(Math.hypot(run.player.x - pillar.x, run.player.y - pillar.y)).toBeGreaterThanOrEqual(pillar.radius + run.player.radius - 1);
    advance(run, MINI_BOSS_TUNING.iceWallMs);
    expect(run.miniBosses.icePillars.length).toBe(0);
  });
});
