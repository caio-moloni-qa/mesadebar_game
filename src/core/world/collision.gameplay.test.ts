import { describe, expect, it } from 'vitest';
import { LAKE } from '../../config/arenaLayout';
import { GameSession, STEP_MS } from '../session/GameSession';
import { ArenaMap, Obstacle, lakeShoreDistance } from './ArenaMap';
import { FlowField } from './FlowField';

const SIZE = 1600;
const CENTER = SIZE / 2;

/** A tall wall: a rotated-box obstacle (rotation 0 → `halfWidth` along x, `halfHeight` along y). */
function wall(x: number, y: number, halfWidth: number, halfHeight: number): Extract<Obstacle, { shape: 'box' }> {
  return { kind: 'wall', shape: 'box', x, y, halfWidth, halfHeight, rotation: 0, tall: true, variant: 0, bound: Math.hypot(halfWidth, halfHeight) };
}

function run(session: GameSession, ms: number, each?: () => void): void {
  const steps = Math.round(ms / STEP_MS);
  for (let index = 0; index < steps; index += 1) {
    session.step(STEP_MS);
    each?.();
  }
}

function quiet(arena: ArenaMap, characterId: 'mage' | 'barbarian' | 'fabri' = 'mage'): GameSession {
  const session = new GameSession({ characterId, seed: 5, skipStartingUpgrades: true, arena });
  session.skeletonSpawnEnabled = false;
  session.variantSpawnEnabled = false;
  session.player.invincible = true;
  return session;
}

// A vertical wall just east of the hero, 600 units tall: anything east of it has to walk around an end.
const blockingWall = wall(CENTER + 120, CENTER, 16, 300);

describe('FlowField', () => {
  it('routes around a wall instead of straight through it', () => {
    const field = new FlowField(ArenaMap.withObstacles(SIZE, [blockingWall]));
    field.update({ x: CENTER, y: CENTER });
    const behind = field.cellOf(CENTER + 300, CENTER);
    const straightLine = 300 / 32;
    expect(field.distanceAt(behind)).toBeGreaterThan(straightLine * 2);
    // From directly behind the wall the way out is up or down along it, never into it (west).
    const direction = field.direction(CENTER + 160, CENTER)!;
    expect(Math.abs(direction.y)).toBeGreaterThan(Math.abs(direction.x));
  });

  it('marks obstacle cells impassable and reaches everything else on an open field', () => {
    const field = new FlowField(ArenaMap.withObstacles(SIZE, [blockingWall]));
    field.update({ x: CENTER, y: CENTER });
    expect(field.isPassable(field.cellOf(blockingWall.x, blockingWall.y))).toBe(false);
    expect(Number.isFinite(field.distanceAt(field.cellOf(SIZE - 50, SIZE - 50)))).toBe(true);
  });
});

describe('collision in play', () => {
  it('an enemy behind a wall walks around it and reaches the hero, never passing through', () => {
    const arena = ArenaMap.withObstacles(SIZE, [blockingWall]);
    const session = quiet(arena, 'barbarian');
    const enemy = session.spawnEnemy('skeleton', CENTER + 320, CENTER, 1_000_000)!;
    enemy.contactDamage = 0;
    let insideWall = false;
    run(session, 30_000, () => {
      if (!arena.isWalkable(enemy.x, enemy.y, enemy.radius - 1)) insideWall = true;
    });
    expect(insideWall).toBe(false);
    expect(Math.hypot(enemy.x - session.player.x, enemy.y - session.player.y)).toBeLessThan(80);
  });

  it('pushes an enemy shoved into a wall (separation, crowding) straight back out on the next step', () => {
    const arena = ArenaMap.withObstacles(SIZE, [blockingWall]);
    const session = quiet(arena);
    const enemy = session.spawnEnemy('apparitionWraith', CENTER + 300, CENTER, 1_000_000)!;
    enemy.movementSpeed = 0;
    enemy.x = blockingWall.x + blockingWall.halfWidth + 4; // overlapping the wall's east face
    session.step(STEP_MS);
    expect(arena.isWalkable(enemy.x, enemy.y, enemy.radius - 0.5)).toBe(true);
  });

  it('floating enemies (apparitions) are blocked by walls too', () => {
    const arena = ArenaMap.withObstacles(SIZE, [blockingWall]);
    const session = quiet(arena);
    const wraith = session.spawnEnemy('apparitionWraith', CENTER + 320, CENTER, 1_000_000)!;
    wraith.contactDamage = 0;
    let crossedWall = false;
    run(session, 4000, () => {
      if (Math.abs(wraith.x - blockingWall.x) < blockingWall.halfWidth && Math.abs(wraith.y - blockingWall.y) < blockingWall.halfHeight) crossedWall = true;
    });
    expect(crossedWall).toBe(false);
  });

  it('the hero slides along walls and cannot walk through them', () => {
    const arena = ArenaMap.withObstacles(SIZE, [blockingWall]);
    const session = quiet(arena);
    session.setMoveInput(1, 0);
    run(session, 3000);
    expect(session.player.x).toBeLessThanOrEqual(blockingWall.x - blockingWall.halfWidth - session.player.radius + 0.5);
    session.setMoveInput(1, 1); // pushing diagonally into the wall still slides south along it
    const before = session.player.y;
    run(session, 1000);
    expect(session.player.y).toBeGreaterThan(before + 100);
  });

  it('the hero cannot walk into the lake', () => {
    const session = quiet(ArenaMap.generate(3));
    session.player.x = LAKE.center.x;
    session.player.y = LAKE.center.y + 700;
    session.setMoveInput(0, -1);
    run(session, 8000);
    expect(lakeShoreDistance(session.player.x, session.player.y)).toBeGreaterThanOrEqual(session.player.radius - 0.5);
  });

  it('the Cajado holds fire at an enemy hidden behind a wall, and shoots once the line is clear', () => {
    const fired = (arena: ArenaMap) => {
      const session = quiet(arena);
      const target = session.spawnEnemy('skeleton', CENTER + 320, CENTER, 1_000_000)!;
      target.movementSpeed = 0;
      let shots = 0;
      session.events.on('projectile-fired', () => { shots += 1; });
      run(session, 2000);
      return shots;
    };
    expect(fired(ArenaMap.withObstacles(SIZE, [blockingWall]))).toBe(0);
    expect(fired(ArenaMap.open(SIZE))).toBeGreaterThan(0);
  });

  it("walls are cover against the necromancer's skulls", () => {
    const session = quiet(ArenaMap.withObstacles(SIZE, [blockingWall]));
    session.player.invincible = false;
    session.player.passiveHealAmount = 0;
    session.spawnEnemy('necromancerWraith', CENTER + 500, CENTER, 1_000_000);
    run(session, 9000);
    expect(session.player.health).toBe(session.player.maxHealth);
  });

  it('thrown swords bounce off walls instead of flying through them', () => {
    const arena = ArenaMap.withObstacles(SIZE, [blockingWall]);
    const session = quiet(arena, 'barbarian');
    session.weapons.weapons.forEach((weapon) => { weapon.upgradeCount = 5; });
    const blocked: string[] = [];
    session.events.on('projectile-blocked', (event) => blocked.push(event.kind));
    const target = session.spawnEnemy('skeleton', CENTER - 400, CENTER, 1_000_000)!; // in view, west
    target.movementSpeed = 0;
    let passed = false;
    run(session, 4000, () => session.projectiles.forEachActive((projectile) => {
      if (projectile.kind === 'thrownSword' && projectile.x > blockingWall.x + blockingWall.halfWidth + projectile.radius && Math.abs(projectile.y - CENTER) < blockingWall.halfHeight - 30) passed = true;
    }));
    expect(blocked).toContain('thrownSword');
    expect(passed).toBe(false);
  });

  it('on the real map, a full horde never ends up inside obstacles or water', () => {
    const arena = ArenaMap.generate(11);
    const session = new GameSession({ characterId: 'reliquia', seed: 11, skipStartingUpgrades: true, arena, stressEnemyCount: 240 });
    session.player.invincible = true;
    let stuck = 0;
    run(session, 8000, () => session.enemies.forEachActive((enemy) => {
      if (enemy.alive && !arena.isWalkable(enemy.x, enemy.y, enemy.radius - 2)) stuck += 1;
    }));
    expect(session.enemies.activeCount).toBeGreaterThan(200);
    expect(stuck).toBe(0);
  });
});
