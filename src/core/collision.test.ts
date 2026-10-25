import { describe, expect, it } from 'vitest';
import { circleOverlapsAabb, circlesOverlap, resolveCircleAabb } from './collision';

const table = { minX: 100, minY: 100, maxX: 200, maxY: 140 };

describe('circlesOverlap', () => {
  it('detects overlap and separation', () => {
    expect(circlesOverlap({ x: 0, y: 0, radius: 18 }, { x: 30, y: 0, radius: 18 })).toBe(true);
    expect(circlesOverlap({ x: 0, y: 0, radius: 18 }, { x: 36, y: 0, radius: 18 })).toBe(false);
  });
});

describe('circle vs AABB', () => {
  it('detects overlap near edges and corners', () => {
    expect(circleOverlapsAabb({ x: 90, y: 120, radius: 18 }, table)).toBe(true);
    expect(circleOverlapsAabb({ x: 80, y: 120, radius: 18 }, table)).toBe(false);
    expect(circleOverlapsAabb({ x: 90, y: 90, radius: 18 }, table)).toBe(true);
    expect(circleOverlapsAabb({ x: 85, y: 85, radius: 18 }, table)).toBe(false);
  });

  it('pushes a circle touching an edge straight out', () => {
    const push = resolveCircleAabb({ x: 90, y: 120, radius: 18 }, table)!;
    expect(push.x).toBeCloseTo(-8);
    expect(push.y).toBeCloseTo(0);
  });

  it('pushes a circle whose center is inside through the nearest face', () => {
    const circle = { x: 150, y: 105, radius: 18 };
    const push = resolveCircleAabb(circle, table)!;
    expect(push).toEqual({ x: 0, y: 100 - 18 - 105 });
    expect(circleOverlapsAabb({ x: circle.x + push.x, y: circle.y + push.y - 0.001, radius: 18 }, table)).toBe(false);
  });

  it('returns null when not overlapping', () => {
    expect(resolveCircleAabb({ x: 0, y: 0, radius: 18 }, table)).toBeNull();
  });
});
