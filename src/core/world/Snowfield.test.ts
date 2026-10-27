import { afterEach, describe, expect, it } from 'vitest';
import { ARENA_CENTER, ARENA_SIZE, GREENFIELD, LAKE, SNOWFIELD, SPAWN_CLEARING_RADIUS, TEMPLE, useArenaLayout } from '../../config/arenaLayout';
import { MINI_BOSSES } from '../systems/MiniBossSystem';
import { ArenaMap, lakeShoreDistance } from './ArenaMap';

const WALKER = 18;
const CELL = 30;
/** On the frozen lake, west of the open water. */
const ICE = { x: 2380, y: 640 };

/** Every grid cell a walker can reach on foot from the spawn (4-neighbour flood fill over isWalkable). */
function reachable(map: ArenaMap): (x: number, y: number) => boolean {
  const cells = Math.ceil(ARENA_SIZE / CELL);
  const seen = new Uint8Array(cells * cells);
  const start = [Math.floor(ARENA_CENTER.x / CELL), Math.floor(ARENA_CENTER.y / CELL)];
  const queue = [start];
  seen[start[1] * cells + start[0]] = 1;
  while (queue.length > 0) {
    const [cx, cy] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells || seen[ny * cells + nx]) continue;
      if (!map.isWalkable(nx * CELL + CELL / 2, ny * CELL + CELL / 2, WALKER)) continue;
      seen[ny * cells + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  return (x, y) => {
    // The nearest walkable spot to (x, y) — a zone's centre may sit on a prop.
    const spot = map.nearestWalkable(x, y, WALKER);
    return seen[Math.floor(spot.y / CELL) * cells + Math.floor(spot.x / CELL)] === 1;
  };
}

describe('Campo Nevado (snowfield layout)', () => {
  afterEach(() => useArenaLayout(GREENFIELD));

  it('keeps the spawn clearing free and every region reachable on foot, whatever the seed', () => {
    useArenaLayout(SNOWFIELD);
    for (const seed of [1, 7, 42, 1234]) {
      const map = ArenaMap.generate(seed);
      expect(map.obstacles.filter((obstacle) => Math.hypot(obstacle.x - ARENA_CENTER.x, obstacle.y - ARENA_CENTER.y) < SPAWN_CLEARING_RADIUS), `seed ${seed}`).toEqual([]);
      const canReach = reachable(map);
      // Every zone's heart, the castle courtyard, the graveyard, the camp fire and the ice shrine's trail end.
      // The lake zone's heart is the open water itself: check its ice instead.
      SNOWFIELD.zones.forEach((zone) => zone.blobs.forEach((blob) => {
        const onIce = zone.kind === 'lake' ? ICE : blob;
        expect(canReach(onIce.x, onIce.y), `seed ${seed}: ${zone.kind}`).toBe(true);
      }));
      expect(canReach(SNOWFIELD.temple.center.x, SNOWFIELD.temple.center.y + 200), `seed ${seed}: castle courtyard`).toBe(true);
      expect(canReach(SNOWFIELD.graveyard.center.x, SNOWFIELD.graveyard.center.y), `seed ${seed}: graveyard`).toBe(true);
      SNOWFIELD.trails.forEach((trail) => {
        const end = trail[trail.length - 1];
        expect(canReach(end.x, end.y), `seed ${seed}: trail end ${end.x},${end.y}`).toBe(true);
      });
    }
  });

  it('the frozen lake is ice you walk on; only the open water blocks', () => {
    useArenaLayout(SNOWFIELD);
    const map = ArenaMap.generate(3);
    expect(map.isWalkable(LAKE.center.x, LAKE.center.y, WALKER)).toBe(false);
    expect(lakeShoreDistance(ICE.x, ICE.y)).toBeGreaterThan(150);
    expect(map.isWalkable(ICE.x, ICE.y, WALKER)).toBe(true);
  });

  it('the castle opens on three sides and the guardians rise in the new regions', () => {
    useArenaLayout(SNOWFIELD);
    expect(TEMPLE.doorways).toHaveLength(3);
    expect(MINI_BOSSES.templeGuardian.anchor).toEqual(SNOWFIELD.temple.center);
    expect(MINI_BOSSES.lakeSpirit.anchor).toEqual(SNOWFIELD.lake.center);
    expect(MINI_BOSSES.gravedigger.anchor).toEqual(SNOWFIELD.graveyard.center);
    useArenaLayout(GREENFIELD);
    expect(MINI_BOSSES.templeGuardian.anchor).toEqual(GREENFIELD.temple.center);
  });
});
