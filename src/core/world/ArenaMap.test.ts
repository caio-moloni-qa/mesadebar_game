import { describe, expect, it } from 'vitest';
import { ARENA_CENTER, ARENA_SIZE, GRAVEYARD, LAKE, TEMPLE, TRAILS, ZONES } from '../../config/arenaLayout';
import { ArenaMap, lakeShoreDistance } from './ArenaMap';

const WALKER = 18;
const maps = [1, 2, 3, 42, 777].map((seed) => ArenaMap.generate(seed));
const map = maps[0];

/** Flood fill over a grid of walkable cells from the spawn — what an enemy (or the hero) can actually reach. */
function reachable(arena: ArenaMap, cell = 16): (x: number, y: number) => boolean {
  const columns = Math.ceil(arena.size / cell);
  const seen = new Uint8Array(columns * columns);
  const start = Math.floor(ARENA_CENTER.x / cell) + Math.floor(ARENA_CENTER.y / cell) * columns;
  const queue = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const index = queue.pop()!;
    const cx = index % columns;
    const cy = Math.floor(index / columns);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= columns) continue;
      const next = nx + ny * columns;
      if (seen[next] || !arena.isWalkable((nx + 0.5) * cell, (ny + 0.5) * cell, WALKER)) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  // A point counts as reached when any cell touching it was reached: the cell containing the point can have its
  // centre inside an obstacle even though the point itself is free.
  return (x, y) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (seen[(cx + dx) + (cy + dy) * columns] === 1) return true;
      }
    }
    return false;
  };
}

describe('ArenaMap generation', () => {
  it('is deterministic per seed and only varies the details between seeds', () => {
    const again = ArenaMap.generate(1);
    expect(again.obstacles).toEqual(map.obstacles);
    expect(maps[1].obstacles).not.toEqual(map.obstacles);
    // The authored landmarks stay put whatever the seed.
    maps.forEach((arena) => {
      const crypt = arena.obstacles.find((obstacle) => obstacle.kind === 'crypt')!;
      expect([crypt.x, crypt.y]).toEqual([GRAVEYARD.crypt.x, GRAVEYARD.crypt.y]);
    });
  });

  it('dresses every zone with its own kinds of obstacles', () => {
    const kinds = new Set(map.obstacles.map((obstacle) => obstacle.kind));
    ['wall', 'pillar', 'tower', 'tree', 'gravestone', 'fence', 'crypt', 'tent', 'campfire', 'standingStone', 'shrine', 'brazier', 'rock'].forEach((kind) => expect(kinds).toContain(kind));
    expect(map.obstacles.filter((obstacle) => obstacle.kind === 'tree').length).toBeGreaterThan(60);
    expect(map.decor.filter((decor) => decor.kind === 'reeds').length).toBeGreaterThan(100);
  });

  it('never puts an obstacle in the water or the spawn clearing', () => {
    maps.forEach((arena) => arena.obstacles.forEach((obstacle) => {
      expect(lakeShoreDistance(obstacle.x, obstacle.y)).toBeGreaterThan(0);
      expect(arena.isWalkable(ARENA_CENTER.x, ARENA_CENTER.y, WALKER)).toBe(true);
    }));
  });

  it('keeps every trail walkable end to end', () => {
    maps.forEach((arena) => TRAILS.forEach((trail) => {
      for (let index = 0; index < trail.length - 1; index += 1) {
        for (let t = 0; t <= 1; t += 0.05) {
          const x = trail[index].x + (trail[index + 1].x - trail[index].x) * t;
          const y = trail[index].y + (trail[index + 1].y - trail[index].y) * t;
          if (lakeShoreDistance(x, y) < WALKER) continue; // the lake trail ends at the shore
          expect(arena.isWalkable(x, y, WALKER), `trail point ${x.toFixed(0)},${y.toFixed(0)}`).toBe(true);
        }
      }
    }));
  });

  it('leaves every zone reachable from the spawn — no area sealed off by walls, fences or trees', () => {
    maps.forEach((arena) => {
      const canReach = reachable(arena);
      const inside = [
        { name: 'temple interior', ...TEMPLE.center, offset: { x: 200, y: 0 } },
        { name: 'graveyard interior', ...GRAVEYARD.center, offset: { x: -120, y: 60 } }
      ];
      inside.forEach(({ name, x, y, offset }) => {
        const spot = arena.nearestWalkable(x + offset.x, y + offset.y, WALKER);
        expect(canReach(spot.x, spot.y), name).toBe(true);
      });
      ZONES.forEach((zone) => zone.blobs.forEach((blob) => {
        if (zone.kind === 'lake') return;
        const spot = arena.nearestWalkable(blob.x, blob.y, WALKER);
        expect(canReach(spot.x, spot.y), `${zone.kind} at ${blob.x},${blob.y}`).toBe(true);
      }));
      // The lake shore is reachable all the way round to the shrine side.
      const shore = arena.nearestWalkable(LAKE.center.x, LAKE.center.y + 520, WALKER);
      expect(canReach(shore.x, shore.y), 'south shore').toBe(true);
    });
  });
});

describe('ArenaMap collision queries', () => {
  const pillar = map.obstacles.find((obstacle) => obstacle.kind === 'pillar')!;
  const wall = map.obstacles.find((obstacle) => obstacle.kind === 'wall' && obstacle.shape === 'box')!;
  const gravestone = map.obstacles.find((obstacle) => obstacle.kind === 'gravestone')!;

  it('pushes a body standing inside a pillar back out to touching distance', () => {
    const body = { x: pillar.x + 3, y: pillar.y, radius: WALKER };
    map.resolve(body);
    expect(Math.hypot(body.x - pillar.x, body.y - pillar.y)).toBeGreaterThanOrEqual((pillar.shape === 'circle' ? pillar.radius : 0) + WALKER - 1e-6);
  });

  it('slides along a wall: walking diagonally into it keeps the sideways motion', () => {
    if (wall.shape !== 'box') throw new Error('expected a box wall');
    const cos = Math.cos(wall.rotation);
    const sin = Math.sin(wall.rotation);
    // Start just outside the wall's long face, then step diagonally into it.
    const body = { x: wall.x - sin * (wall.halfHeight + WALKER + 1), y: wall.y + cos * (wall.halfHeight + WALKER + 1), radius: WALKER };
    const before = { ...body };
    body.x += sin * 10 + cos * 10;
    body.y += -cos * 10 + sin * 10;
    map.resolve(body);
    const along = (body.x - before.x) * cos + (body.y - before.y) * sin;
    const into = -((body.x - before.x) * -sin + (body.y - before.y) * cos);
    expect(along).toBeGreaterThan(5);
    // It started 1 unit from the face, so it may close that gap — but never pass into the wall.
    expect(into).toBeLessThan(1.5);
  });

  it('keeps bodies out of deep water and inside the arena', () => {
    const swimmer = { x: LAKE.center.x, y: LAKE.center.y, radius: WALKER };
    map.resolve(swimmer);
    expect(lakeShoreDistance(swimmer.x, swimmer.y)).toBeGreaterThanOrEqual(WALKER - 1);
    const runaway = { x: -50, y: ARENA_SIZE + 50, radius: WALKER };
    map.resolve(runaway);
    expect(runaway.x).toBe(WALKER);
    expect(runaway.y).toBe(ARENA_SIZE - WALKER);
  });

  it('blocks projectiles with tall obstacles only — not gravestones, not water', () => {
    expect(map.blocksProjectile(pillar.x, pillar.y, 7)).toBe(true);
    expect(map.blocksProjectile(wall.x, wall.y, 7)).toBe(true);
    expect(map.blocksProjectile(gravestone.x, gravestone.y, 7)).toBe(false);
    expect(map.blocksProjectile(LAKE.center.x, LAKE.center.y, 7)).toBe(false);
  });

  it('finds the nearest walkable spot for spawns and drops', () => {
    const spot = map.nearestWalkable(pillar.x, pillar.y, WALKER);
    expect(map.isWalkable(spot.x, spot.y, WALKER)).toBe(true);
    const shore = map.nearestWalkable(LAKE.center.x, LAKE.center.y, WALKER);
    expect(map.isWalkable(shore.x, shore.y, WALKER)).toBe(true);
  });

  it('an open map has no obstacles and no water', () => {
    const open = ArenaMap.open(2800);
    expect(open.obstacles).toHaveLength(0);
    expect(open.isWalkable(1400, 1400, WALKER)).toBe(true);
    expect(open.blocksProjectile(1400, 1400, 7)).toBe(false);
  });
});
