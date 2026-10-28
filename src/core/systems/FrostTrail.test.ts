import { describe, expect, it } from 'vitest';
import { FROST_TRAIL } from '../../config/balance';
import { FrostTrail } from './FrostTrail';

const hero = (x: number, y: number) => ({ x, y, radius: 16 });

describe('FrostTrail', () => {
  it('lays one patch per spirit every dropEveryMs', () => {
    const trail = new FrostTrail();
    const spirit = { x: 100, y: 100 };
    trail.drop(spirit, 0);
    trail.drop(spirit, FROST_TRAIL.dropEveryMs - 1);
    expect(trail.patches).toHaveLength(1);
    spirit.x = 140;
    trail.drop(spirit, FROST_TRAIL.dropEveryMs);
    expect(trail.patches).toHaveLength(2);
    trail.drop({ x: 500, y: 500 }, FROST_TRAIL.dropEveryMs);
    expect(trail.patches).toHaveLength(3);
  });

  it('melts patches after their lifetime', () => {
    const trail = new FrostTrail();
    trail.drop({ x: 100, y: 100 }, 0);
    trail.update(FROST_TRAIL.lifetimeMs - 1, hero(2000, 2000));
    expect(trail.patches).toHaveLength(1);
    trail.update(FROST_TRAIL.lifetimeMs, hero(2000, 2000));
    expect(trail.patches).toHaveLength(0);
  });

  it('slows the hero on frost once per slowMs, saying so only on stepping on', () => {
    const trail = new FrostTrail();
    trail.drop({ x: 100, y: 100 }, 0);
    expect(trail.update(0, hero(2000, 2000))).toBeNull();
    expect(trail.update(10, hero(110, 100))).toBe('entered');
    expect(trail.update(10 + FROST_TRAIL.slowMs - 1, hero(110, 100))).toBeNull();
    expect(trail.update(10 + FROST_TRAIL.slowMs, hero(110, 100))).toBe('stayed');
  });

  it('keeps at most maxPatches, dropping the oldest', () => {
    const trail = new FrostTrail();
    for (let index = 0; index <= FROST_TRAIL.maxPatches; index += 1) trail.drop({ x: index, y: 0 }, index);
    expect(trail.patches).toHaveLength(FROST_TRAIL.maxPatches);
    expect(trail.patches[0].x).toBe(1);
  });
});
