import * as THREE from 'three';
import { ball, cone, cylinder } from '../models/parts';

type Place = (geometry: THREE.BufferGeometry, color: number, position: THREE.Vector3) => void;

/** Kitchen props join the room's existing batches rather than adding a draw per utensil. */
export function buildIglooKitchen(solid: Place, glow: Place): void {
  const steel = 0xa4b8c3, iron = 0x293b47, wood = 0x795036, cream = 0xffefd1;
  const put = (g: THREE.BufferGeometry, c: number, x: number, y: number, z: number) => solid(g, c, new THREE.Vector3(x, y, z));
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => put(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  // Rear work line faces east, leaving the chef's position and the counter approach clear.
  box(1.05, 1.15, 4.1, iron, -9.35, 0.58, -1.8);
  box(1.22, 0.12, 4.3, steel, -9.3, 1.2, -1.8);
  for (const z of [-3.15, -2.35]) {
    put(new THREE.TorusGeometry(0.28, 0.045, 5, 12).rotateX(Math.PI / 2), iron, -9.2, 1.29, z);
    glow(cylinder(0.2, 0.2, 0.04, 8), 0xff943e, new THREE.Vector3(-9.2, 1.28, z));
    put(cylinder(0.3, 0.24, 0.36, 10), steel, -9.2, 1.5, z);
    for (const side of [-1, 1]) box(0.13, 0.06, 0.18, iron, -9.2 + side * 0.33, 1.53, z);
    put(cone(0.31, 0.09, 10), iron, -9.2, 1.72, z);
  }
  // Oven with glass door, brass knobs and handle.
  box(0.04, 0.65, 1.2, 0x101f2c, -8.8, 0.65, -2.75);
  box(0.08, 0.06, 0.94, steel, -8.74, 1.0, -2.75);
  for (const z of [-3.15, -2.85, -2.55]) put(ball(0.06, 0), 0xd6a65c, -8.7, 1.14, z);
  // Fryer: oil, basket grid and an extended black handle.
  box(0.85, 0.4, 0.8, steel, -9.2, 1.45, -0.7);
  box(0.65, 0.035, 0.6, 0xd8a138, -9.2, 1.66, -0.7);
  for (let i = 0; i < 6; i++) box(0.67, 0.02, 0.025, iron, -9.2, 1.69, -0.95 + i * 0.1);
  box(0.55, 0.06, 0.07, iron, -8.65, 1.72, -0.7);
  // Two refrigerators, one freezer and a second oven.
  for (const z of [2.0, 3.65]) {
    box(1.1, 2.7, 1.3, cream, -9.2, 1.35, z);
    box(0.045, 0.035, 1.28, steel, -8.63, 1.85, z);
    for (const h of [1.35, 2.2]) box(0.1, 0.36, 0.07, iron, -8.56, h, z - 0.43);
  }
  box(1.15, 1.15, 1.25, steel, -9.2, 0.57, 5.25);
  box(0.06, 0.67, 0.95, iron, -8.59, 0.55, 5.25);
  box(0.12, 0.06, 0.86, cream, -8.53, 0.91, 5.25);
  // Shelves, plate stacks, bottles, spice jars and hanging cookware.
  for (const y of [2.35, 3.25]) {
    box(0.7, 0.09, 7.8, wood, -9.65, y, -1.9);
    for (let i = 0; i < 11; i++) {
      const z = -5.3 + i * 0.65;
      if (i % 3 === 0) for (let p = 0; p < 4; p++) put(cylinder(0.22, 0.22, 0.035, 12), cream, -9.53, y + 0.06 + p * 0.04, z);
      else {
        const c = [0x5a823d, 0x9c3346, 0xc18d36][i % 3];
        put(cylinder(0.1, 0.12, 0.3, 8), c, -9.54, y + 0.2, z);
        put(cylinder(0.045, 0.045, 0.13, 6), c, -9.54, y + 0.41, z);
        put(cylinder(0.05, 0.05, 0.04, 6), wood, -9.54, y + 0.49, z);
      }
    }
  }
  box(0.07, 0.07, 8.0, iron, -8.9, 4.1, -0.65);
  for (let i = 0; i < 5; i++) {
    const z = -4.2 + i * 1.4;
    put(cylinder(0.015, 0.015, 0.5, 4), wood, -9.8, 3.95, z);
    for (let sprig = -1; sprig <= 1; sprig++) {
      put(cone(0.09, 0.42, 5).rotateZ(sprig * 0.3), 0x66874d, -9.8 + sprig * 0.08, 3.55, z);
      put(ball(0.055, 0), 0xdbd2a6, -9.8 + sprig * 0.07, 3.85, z + 0.03);
    }
  }
  for (let i = 0; i < 11; i++) {
    const z = -4.3 + i * 0.7;
    put(new THREE.TorusGeometry(0.085, 0.018, 4, 8).rotateY(Math.PI / 2), steel, -8.9, 4.0, z);
    if (i < 3) {
      box(0.06, 0.35, 0.07, wood, -8.9, 3.8, z);
      box(0.04, 0.38, 0.24, steel, -8.9, 3.46, z); // knives
    } else if (i < 6) {
      box(0.06, 0.55, 0.06, steel, -8.9, 3.63, z);
      put(cylinder(0.24, 0.24, 0.08, 10).rotateZ(Math.PI / 2), iron, -8.9, 3.24, z);
    } else {
      put(ball(0.21, 1).scale(0.7, 1.5, 1), i % 2 ? 0x8a3830 : 0xc9a07b, -8.9, 3.65, z);
      box(0.08, 0.2, 0.09, cream, -8.9, 3.95, z); // bone-in cuts
    }
  }
  // Prep boards, local fish, carrots, winter greens and cutlery on the service counter.
  for (let i = 0; i < 5; i++) {
    const z = -4.0 + i * 2.0;
    box(0.8, 0.05, 1.05, wood, -6.1, 1.22, z);
    put(ball(0.19, 1).scale(1.4, 0.45, 0.75), 0xba6844, -6.13, 1.3, z);
    for (let v = 0; v < 3; v++) {
      put(cone(0.065, 0.3, 5).rotateX(1.5), 0xf39a35, -6.3 + v * 0.15, 1.3, z + 0.32);
      put(ball(0.085, 0), 0x558745, -6.3 + v * 0.15, 1.32, z + 0.5);
    }
    box(0.09, 0.025, 0.32, steel, -5.8, 1.28, z - 0.22);
    box(0.07, 0.025, 0.15, iron, -5.8, 1.28, z - 0.46);
  }
}
