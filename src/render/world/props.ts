import * as THREE from 'three';
import { Decor, Obstacle } from '../../core/world/ArenaMap';
import { Rng, createRng, floatBetween, intBetween, pickOne } from '../../core/math';
import { PALETTE } from '../materials';
import { ball, box, cone, cylinder, gem, part } from '../models/parts';
import { WORLD_SCALE } from '../space';

/** A visual built in the obstacle's own frame: origin on the ground at its centre, local X = the collision shape's
 *  width axis, local Z = its depth axis, so placing it with yaw = -rotation lines it up with the collision box. */
type Parts = THREE.BufferGeometry[];

const STONE = [PALETTE.stone, PALETTE.stoneDark, 0xa89d8a, 0xc9bfac];
const MOSS = 0x5e7a3a;
const BARK = 0x4a3426;
const IRON = 0x2e2a30;
const CANVAS = [0xcdb48a, 0xb89a6a, 0x8f6a4a];
const WOOD = PALETTE.wood;

const m = (units: number) => units * WORLD_SCALE;

/** Visual for one obstacle, sized from its collision shape — what you see is exactly what blocks you. */
export function obstacleParts(obstacle: Obstacle): Parts {
  const rng = createRng(Math.floor(obstacle.variant * 1e9));
  const v = obstacle.variant;
  if (obstacle.shape === 'circle') {
    const r = m(obstacle.radius);
    switch (obstacle.kind) {
      case 'pillar': {
        const broken = v < 0.4;
        const height = broken ? floatBetween(rng, 1.2, 2.4) : floatBetween(rng, 3.2, 4.4);
        const color = pickOne(rng, STONE);
        // Octagonal plinth (not square): a square's corners would poke out of the round collision.
        const parts = [part(cylinder(r * 1.2, r * 1.25, 0.3, 8), PALETTE.stoneDark, [0, 0.15, 0]), part(cylinder(r * 0.85, r, height, 7), color, [0, 0.3 + height / 2, 0])];
        parts.push(broken
          ? part(cone(r * 0.85, 0.4, 7), color, [0, 0.3 + height + 0.1, 0], [0.4, 0, 0.25])
          : part(box(r * 2.5, 0.3, r * 2.5), color, [0, 0.3 + height + 0.15, 0]));
        if (rng() < 0.5) parts.push(part(cylinder(r * 1.15, r * 1.15, 0.1, 8), MOSS, [0, 0.33, 0]));
        return parts;
      }
      case 'tower': {
        const height = floatBetween(rng, 5.5, 7);
        const parts = [
          part(cylinder(r * 0.95, r, height, 9), pickOne(rng, STONE), [0, height / 2, 0]),
          part(box(0.9, 1.6, 0.3), 0x1c1418, [0, 0.8, r * 0.97]) // doorway
        ];
        for (let index = 0; index < 7; index += 1) {
          if (rng() < 0.35) continue; // missing merlons: it's a ruin
          const angle = (index / 7) * Math.PI * 2;
          parts.push(part(box(0.7, 0.8, 0.5), PALETTE.stoneDark, [Math.cos(angle) * r * 0.85, height + 0.4, Math.sin(angle) * r * 0.85], [0, -angle, 0]));
        }
        return parts;
      }
      case 'tree':
      case 'deadTree': {
        const tall = obstacle.kind === 'tree';
        const height = tall ? floatBetween(rng, 3, 4.5) : floatBetween(rng, 2.4, 3.6);
        const lean: [number, number, number] = [floatBetween(rng, -0.08, 0.08), 0, floatBetween(rng, -0.08, 0.08)];
        // Slim, tapering trunks: from the high camera a thick one reads as a column, not a tree.
        const parts = [part(cylinder(r * 0.35, r * 0.85, height, 6), BARK, [0, height / 2, 0], lean), part(cylinder(r, r * 1.05, 0.25, 6), BARK, [0, 0.12, 0])];
        const branches = intBetween(rng, 3, 5);
        for (let branch = 0; branch < branches; branch += 1) {
          const length = floatBetween(rng, 1, tall ? 2.2 : 1.5);
          const heading = branch * 2.4 + rng();
          const y = height * floatBetween(rng, 0.5, 0.92);
          parts.push(part(cylinder(0.05, 0.12, length, 4), BARK, [Math.cos(heading) * length * 0.35, y + length * 0.3, Math.sin(heading) * length * 0.35], [Math.sin(heading) * 0.95, 0, -Math.cos(heading) * 0.95]));
        }
        // A few forest trees keep a sparse, dark crown high up (never low enough to hide what's under them).
        if (tall && v > 0.55) {
          for (let clump = 0; clump < 3; clump += 1) parts.push(part(ball(floatBetween(rng, 0.5, 0.9)), pickOne(rng, [0x3e4f2c, 0x4a5a30, 0x5a4a2c]), [floatBetween(rng, -0.8, 0.8), height + floatBetween(rng, -0.3, 0.4), floatBetween(rng, -0.8, 0.8)], [rng(), rng(), rng()], [1, 0.7, 1]));
        }
        return parts;
      }
      case 'brazier':
        return [
          part(box(r * 2.2, 0.15, r * 2.2), PALETTE.stoneDark, [0, 0.075, 0]),
          part(cylinder(r * 0.4, r * 0.55, 0.75, 6), PALETTE.stone, [0, 0.5, 0]),
          part(cylinder(r, r * 0.6, 0.3, 7), 0x4a4440, [0, 1.0, 0]),
          part(box(r * 1.3, 0.08, 0.12), 0x3a2416, [0, 1.12, 0], [0, 0.6, 0]),
          part(box(r * 1.3, 0.08, 0.12), 0x3a2416, [0, 1.14, 0], [0, -0.6, 0])
        ];
      case 'campfire': {
        const parts: Parts = [];
        for (let stone = 0; stone < 9; stone += 1) {
          const angle = (stone / 9) * Math.PI * 2;
          parts.push(part(new THREE.DodecahedronGeometry(0.16, 0), PALETTE.stoneDark, [Math.cos(angle) * r * 0.85, 0.1, Math.sin(angle) * r * 0.85], [rng(), rng(), rng()]));
        }
        parts.push(part(box(r * 1.4, 0.12, 0.16), 0x3a2416, [0, 0.12, 0], [0, 0.5, 0]), part(box(r * 1.4, 0.12, 0.16), 0x3a2416, [0, 0.16, 0], [0, -0.7, 0]));
        return parts;
      }
      case 'rock':
      default:
        return [part(new THREE.DodecahedronGeometry(r * 1.05, 0), pickOne(rng, STONE), [0, r * 0.35, 0], [rng() * 3, rng() * 3, rng() * 3], [1, floatBetween(rng, 0.55, 0.9), 1])];
    }
  }

  const w = m(obstacle.halfWidth) * 2;
  const d = m(obstacle.halfHeight) * 2;
  switch (obstacle.kind) {
    case 'wall': {
      // Ruined wall block: height varies block to block so the outline reads broken.
      const height = 0.9 + v * 2.4;
      const parts = [part(box(w, height, d), pickOne(rng, STONE), [0, height / 2, 0])];
      if (rng() < 0.4) parts.push(part(box(w * 0.5, 0.35, d * 1.02), PALETTE.stoneDark, [floatBetween(rng, -w / 4, w / 4), height + 0.17, 0]));
      if (rng() < 0.5) parts.push(part(box(w * 1.02, 0.18, d * 1.05), MOSS, [0, 0.09, 0]));
      return parts;
    }
    case 'fallenColumn': {
      const color = pickOne(rng, STONE);
      const segments = 2;
      const parts: Parts = [];
      for (let segment = 0; segment < segments; segment += 1) {
        parts.push(part(cylinder(d / 2, d / 2, w / segments * 0.95, 7), color, [(segment - 0.5) * (w / segments), d / 2, 0], [0, floatBetween(rng, -0.08, 0.08), Math.PI / 2]));
      }
      return parts;
    }
    case 'log':
      return [
        part(cylinder(d / 2, d / 2, w, 6), BARK, [0, d / 2, 0], [0, 0, Math.PI / 2]),
        part(cylinder(d / 2 * 0.9, d / 2 * 0.9, 0.04, 6), 0xa07a4a, [w / 2, d / 2, 0], [0, 0, Math.PI / 2]) // cut end
      ];
    case 'gravestone': {
      const color = pickOne(rng, [0x9a9488, 0x8a8478, 0xa8a294]);
      const tilt: [number, number, number] = [floatBetween(rng, -0.15, 0.15), 0, floatBetween(rng, -0.12, 0.12)];
      return v < 0.3
        ? [part(box(0.12, 1.0, 0.12), color, [0, 0.5, 0], tilt), part(box(w * 0.85, 0.12, 0.12), color, [0, 0.7, 0], tilt)]
        : [part(box(w, 0.75, d), color, [0, 0.375, 0], tilt), part(cylinder(w / 2, w / 2, d, 7), color, [0, 0.75, 0], [Math.PI / 2 + tilt[0], 0, tilt[2]]), part(box(w * 1.1, 0.05, 1.0), 0x5a4632, [0, 0.025, 0.6])];
    }
    case 'fence': {
      const parts: Parts = [part(box(w, 0.06, 0.06), IRON, [0, 0.85, 0]), part(box(w, 0.06, 0.06), IRON, [0, 0.35, 0])];
      const bars = Math.max(2, Math.round(w / 0.28));
      for (let bar = 0; bar <= bars; bar += 1) {
        const x = -w / 2 + (bar / bars) * w;
        parts.push(part(box(0.05, 1.0, 0.05), IRON, [x, 0.5, 0]));
        if (bar % 2 === 0) parts.push(part(cone(0.05, 0.12, 4), IRON, [x, 1.06, 0]));
      }
      return parts;
    }
    case 'crypt': {
      const height = 2.8;
      return [
        part(box(w, height, d), 0x7a746c, [0, height / 2, 0]),
        part(box(w * 1.08, 0.25, d * 1.08), 0x5f5a54, [0, height + 0.12, 0]),
        part(cone(Math.hypot(w, d) / 2 * 0.95, 1.4, 4), 0x4a4650, [0, height + 0.95, 0], [0, Math.PI / 4, 0], [w / Math.hypot(w, d) * 1.4, 1, d / Math.hypot(w, d) * 1.4]),
        part(box(1.1, 1.9, 0.12), 0x1c1418, [0, 0.95, d / 2 + 0.02]), // door
        part(box(0.12, 0.7, 0.12), 0x9a9488, [0, height + 1.9, 0]), // cross
        part(box(0.45, 0.12, 0.12), 0x9a9488, [0, height + 2.05, 0])
      ];
    }
    case 'standingStone':
      return [part(box(w, floatBetween(rng, 2.2, 3), d), pickOne(rng, STONE), [0, 1.25, 0], [floatBetween(rng, -0.06, 0.06), 0, floatBetween(rng, -0.06, 0.06)])];
    case 'tent': {
      const canvas = pickOne(rng, CANVAS);
      return [
        part(cone(Math.hypot(w, d) / 2, 2.2, 4), canvas, [0, 1.1, 0], [0, Math.PI / 4, 0], [w / Math.hypot(w, d) * 1.41, 1, d / Math.hypot(w, d) * 1.41]),
        part(box(0.06, 2.5, 0.06), WOOD, [0, 1.25, 0]),
        part(box(0.7, 1.2, 0.05), 0x2a1c14, [0, 0.6, d / 2 - 0.15]) // entrance flap shadow
      ];
    }
    case 'crate':
      return [part(box(w, w * 0.9, d), 0x8a6238, [0, w * 0.45, 0], [0, 0, 0]), part(box(w * 1.02, 0.06, d * 1.02), 0x5a3a20, [0, w * 0.6, 0])];
    case 'cart':
      return [
        part(box(w, 0.35, d), WOOD, [0, 0.75, 0]),
        part(box(w, 0.4, 0.08), 0x5a3a20, [0, 1.1, d / 2]),
        part(box(w, 0.4, 0.08), 0x5a3a20, [0, 1.1, -d / 2]),
        part(cylinder(0.45, 0.45, 0.1, 8), 0x3a2416, [w * 0.25, 0.45, d / 2 + 0.06], [Math.PI / 2, 0, 0]),
        part(cylinder(0.45, 0.45, 0.1, 8), 0x3a2416, [w * 0.25, 0.45, -d / 2 - 0.06], [Math.PI / 2, 0, 0]),
        part(box(0.5, 0.08, 0.08), WOOD, [-w / 2 + 0.2, 0.6, d / 4]), // shafts, kept inside the collision box
        part(box(0.5, 0.08, 0.08), WOOD, [-w / 2 + 0.2, 0.6, -d / 4])
      ];
    case 'shrine':
      return [
        part(box(w, 0.4, d), PALETTE.stoneDark, [0, 0.2, 0]),
        part(box(w * 0.7, 1.1, d * 0.7), PALETTE.stone, [0, 0.95, 0]),
        part(cone(w * 0.6, 0.9, 4), 0x6a5a7a, [0, 1.95, 0], [0, Math.PI / 4, 0]),
        part(gem(0.22), 0x9fe9ff, [0, 1.25, d * 0.36], [0, 0, 0], [1, 1.4, 1])
      ];
    default:
      return [part(box(w, 1, d), PALETTE.stone, [0, 0.5, 0])];
  }
}

/** Visual for one piece of decoration (no collision). Reeds are instanced separately (they sway). */
export function decorParts(decor: Decor): Parts {
  const rng: Rng = createRng(Math.floor(decor.variant * 1e9));
  switch (decor.kind) {
    case 'bush': {
      const colors = [0x55703a, 0x4a6634, 0x6a7f3c, 0x7a6a3a];
      const parts: Parts = [];
      const blobs = intBetween(rng, 2, 4);
      for (let index = 0; index < blobs; index += 1) {
        const size = floatBetween(rng, 0.35, 0.65);
        parts.push(part(ball(size), pickOne(rng, colors), [floatBetween(rng, -0.4, 0.4), size * 0.7, floatBetween(rng, -0.4, 0.4)], [rng(), rng(), rng()], [1, 0.8, 1]));
      }
      if (rng() < 0.3) parts.push(part(ball(0.09), 0xb04a6a, [0.2, 0.85, 0.3]), part(ball(0.09), 0xb04a6a, [-0.25, 0.7, -0.1]));
      return parts;
    }
    case 'rubble':
      return [0, 1, 2].map(() => part(box(floatBetween(rng, 0.2, 0.5), floatBetween(rng, 0.12, 0.3), floatBetween(rng, 0.2, 0.5)), pickOne(rng, STONE), [floatBetween(rng, -0.5, 0.5), 0.08, floatBetween(rng, -0.5, 0.5)], [rng() * 0.4, rng() * 3, rng() * 0.4]));
    case 'lilyPad':
      return [
        part(cylinder(floatBetween(rng, 0.3, 0.5), floatBetween(rng, 0.3, 0.5), 0.03, 8, ), 0x4f8a3c, [0, 0.05, 0]),
        ...(rng() < 0.3 ? [part(cone(0.1, 0.12, 5), 0xf2c2d8, [0.1, 0.12, 0.05])] : [])
      ];
    default:
      return [];
  }
}

/** Places parts built in an object's frame at its sim position/rotation, converted to meters. */
export function placeParts(parts: Parts, x: number, y: number, rotation: number): Parts {
  const matrix = new THREE.Matrix4().makeRotationY(-rotation).setPosition(x * WORLD_SCALE, 0, y * WORLD_SCALE);
  parts.forEach((geometry) => geometry.applyMatrix4(matrix));
  return parts;
}
