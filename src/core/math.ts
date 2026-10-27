/** Engine-agnostic math primitives for src/core, so gameplay code runs without a renderer
 *  (unit tests and the Three.js build). Every random roll in core goes through an injected `Rng` so a
 *  seeded generator makes runs reproducible; never call Math.random inside src/core (enforced by architecture.test.ts). */

export interface Vec2 { x: number; y: number; }

/** Returns a float in [0, 1), same contract as Math.random. */
export type Rng = () => number;

/** mulberry32 — tiny, fast, good-enough PRNG for gameplay rolls (not for anything security-related). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function floatBetween(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Integer in [min, max], both inclusive. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher–Yates; returns a new array and leaves `items` untouched. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Random point on a ring around `center`: uniform angle, distance in [minDistance, maxDistance] (integer). */
export function randomPointAround(rng: Rng, center: Vec2, minDistance: number, maxDistance: number): Vec2 {
  const angle = floatBetween(rng, 0, Math.PI * 2);
  const distance = intBetween(rng, minDistance, maxDistance);
  return { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance };
}
