import { describe, expect, it } from 'vitest';
import { createRng, distanceSq, floatBetween, intBetween, randomPointAround, shuffled } from './math';

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const valuesA = Array.from({ length: 1000 }, () => a());
    const valuesB = Array.from({ length: 1000 }, () => b());
    expect(valuesA).toEqual(valuesB);
    valuesA.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe('range helpers', () => {
  it('intBetween is inclusive on both ends, like Phaser.Math.Between', () => {
    const rng = createRng(7);
    const seen = new Set(Array.from({ length: 2000 }, () => intBetween(rng, 0, 3)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('floatBetween stays inside [min, max)', () => {
    const rng = createRng(9);
    for (let index = 0; index < 1000; index += 1) {
      const value = floatBetween(rng, -5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });

  it('randomPointAround lands on the requested ring', () => {
    const rng = createRng(3);
    const center = { x: 1400, y: 1400 };
    for (let index = 0; index < 500; index += 1) {
      const distance = Math.sqrt(distanceSq(center, randomPointAround(rng, center, 700, 900)));
      expect(distance).toBeGreaterThanOrEqual(700 - 1e-9);
      expect(distance).toBeLessThanOrEqual(900 + 1e-9);
    }
  });

  it('shuffled is a permutation and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const output = shuffled(createRng(5), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...output].sort()).toEqual(input);
  });
});
