import * as THREE from 'three';

/** The one place game units (= old 2D pixels, used by all of src/core and src/config) become Three.js meters.
 *  1 m = 32 game units: a 64px hero is a ~2 m model, the 2800-unit arena is 87.5 m across. Sim (x, y) maps to the
 *  ground plane as (X, Z); height (Y) is visual only. */
export const WORLD_SCALE = 1 / 32;

export function toMeters(units: number): number {
  return units * WORLD_SCALE;
}

export function simToWorld(x: number, y: number, height = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x * WORLD_SCALE, height, y * WORLD_SCALE);
}

/** Facing angle for a model whose front is +Z, turned towards sim direction (dx, dy). */
export function yawFromSimDirection(dx: number, dy: number): number {
  return Math.atan2(dx, dy);
}
