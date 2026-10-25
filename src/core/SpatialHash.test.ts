import { describe, expect, it } from 'vitest';
import { SpatialHash } from './SpatialHash';
import { Vec2, createRng, distanceSq, floatBetween } from './math';

interface Item extends Vec2 { id: number; alive: boolean; }

function randomItems(seed: number, count: number): Item[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, (_value, id) => ({ id, x: floatBetween(rng, -200, 3000), y: floatBetween(rng, -200, 3000), alive: rng() > 0.3 }));
}

function bruteNearest(items: Item[], center: Vec2, maxRange: number, accept: (item: Item) => boolean): Item | null {
  let best: Item | null = null;
  let bestSq = maxRange * maxRange;
  items.forEach((item) => {
    if (!accept(item)) return;
    const sq = distanceSq(item, center);
    if (sq <= bestSq && (best === null || sq < bestSq)) { best = item; bestSq = sq; }
  });
  return best;
}

describe('SpatialHash.nearest', () => {
  const items = randomItems(11, 600);
  const hash = new SpatialHash<Item>(128);
  items.forEach((item) => hash.insert(item, 18));
  const queries = randomItems(99, 80);

  it('matches a brute-force scan with no range limit', () => {
    queries.forEach((query) => {
      expect(hash.nearest(query)?.id).toBe(bruteNearest(items, query, Infinity, () => true)?.id);
    });
  });

  it('matches a brute-force scan with a range limit and a liveness filter', () => {
    const alive = (item: Item) => item.alive;
    queries.forEach((query) => {
      expect(hash.nearest(query, 250, alive)?.id ?? null).toBe(bruteNearest(items, query, 250, alive)?.id ?? null);
    });
  });

  it('returns null on an empty hash', () => {
    expect(new SpatialHash<Item>(64).nearest({ x: 0, y: 0 })).toBeNull();
  });
});

describe('SpatialHash.queryRadius', () => {
  it('returns a superset of everything inside the radius', () => {
    const items = randomItems(21, 400);
    const hash = new SpatialHash<Item>(100);
    items.forEach((item) => hash.insert(item));
    const center = { x: 1400, y: 1400 };
    const found = new Set(hash.queryRadius(center, 300).map((item) => item.id));
    items.filter((item) => distanceSq(item, center) <= 300 * 300).forEach((item) => expect(found.has(item.id)).toBe(true));
  });

  it('works far outside the arena (merchant realm coordinates)', () => {
    const hash = new SpatialHash<Item>(64);
    const far = { id: 1, x: 11_200, y: 11_200, alive: true };
    hash.insert(far);
    expect(hash.queryRadius({ x: 11_210, y: 11_190 }, 50)).toContain(far);
    expect(hash.nearest({ x: 11_000, y: 11_000 })).toBe(far);
  });
});
