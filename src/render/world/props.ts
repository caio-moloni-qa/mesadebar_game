import * as THREE from 'three';
import { Rng, floatBetween, intBetween, pickOne } from '../../core/math';
import { PALETTE } from '../materials';
import { ball, box, cone, cylinder, part } from '../models/parts';

/** A prop is a list of vertex-coloured parts in its own space (origin on the ground, at its centre). */
type Prop = THREE.BufferGeometry[];

const STONE = [PALETTE.stone, PALETTE.stoneDark, 0xa89d8a, 0xc9bfac];
const MOSS = 0x5e7a3a;
const DEAD_WOOD = PALETTE.wood;
const BUSH = [0x55703a, 0x4a6634, 0x6a7f3c, 0x7a6a3a];

/** Placement footprint radii (meters) — the layout keeps props this far apart so they never interpenetrate. */
export type PropKind = 'colonnade' | 'arch' | 'wall' | 'fallenColumn' | 'stoneCircle' | 'graveyard' | 'deadTree' | 'bush' | 'rock' | 'brazier';
export const FOOTPRINT: Record<PropKind, number> = {
  colonnade: 6, arch: 3, wall: 4, fallenColumn: 3, stoneCircle: 6, graveyard: 5, deadTree: 1.5, bush: 1, rock: 0.9, brazier: 1.2
};

function pillar(rng: Rng, height: number, broken: boolean): Prop {
  const color = pickOne(rng, STONE);
  const parts: Prop = [
    part(box(1.1, 0.3, 1.1), PALETTE.stoneDark, [0, 0.15, 0]), // base
    part(cylinder(0.42, 0.5, height, 7), color, [0, 0.3 + height / 2, 0], [floatBetween(rng, -0.05, 0.05), rng() * Math.PI, 0])
  ];
  if (broken) {
    parts.push(part(cone(0.42, 0.35, 7), color, [0, 0.3 + height + 0.05, 0], [0.35, 0, 0.2])); // jagged break
  } else {
    parts.push(part(box(1.2, 0.32, 1.2), color, [0, 0.3 + height + 0.16, 0])); // capital
  }
  if (rng() < 0.5) parts.push(part(box(0.9, 0.12, 0.9), MOSS, [0, 0.36, 0])); // moss at the foot
  return parts;
}

/** A line of broken pillars — the medieval stand-in for the reference's giant ribs. */
function colonnade(rng: Rng): Prop {
  const count = intBetween(rng, 3, 5);
  const parts: Prop = [];
  for (let index = 0; index < count; index += 1) {
    if (rng() < 0.18) continue;
    const z = (index - (count - 1) / 2) * 2.6;
    parts.push(...translate(pillar(rng, floatBetween(rng, 1.6, 4.4), rng() < 0.55), 0, z));
  }
  return parts;
}

function arch(rng: Rng): Prop {
  const color = pickOne(rng, STONE);
  return [
    part(box(0.85, 4.2, 0.85), color, [-1.7, 2.1, 0]),
    part(box(0.85, 4.2, 0.85), color, [1.7, 2.1, 0]),
    part(box(4.6, 0.75, 1), PALETTE.stoneDark, [rng() < 0.5 ? 0 : 0.35, 4.5, 0], [0, 0, rng() < 0.4 ? 0.1 : 0]),
    part(box(1.1, 0.25, 1.1), PALETTE.stoneDark, [-1.7, 0.12, 0]),
    part(box(1.1, 0.25, 1.1), PALETTE.stoneDark, [1.7, 0.12, 0])
  ];
}

function wall(rng: Rng): Prop {
  const segments = intBetween(rng, 3, 6);
  const parts: Prop = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const height = floatBetween(rng, 0.5, 2.4);
    parts.push(part(box(1.35, height, 0.7), pickOne(rng, STONE), [(segment - segments / 2) * 1.35, height / 2, 0]));
    if (rng() < 0.3) parts.push(part(box(0.5, 0.3, 0.5), PALETTE.stoneDark, [(segment - segments / 2) * 1.35 + 0.4, 0.15, 0.7], [0, rng(), 0.3])); // rubble
  }
  return parts;
}

function fallenColumn(rng: Rng): Prop {
  const color = pickOne(rng, STONE);
  const pieces = intBetween(rng, 2, 3);
  const parts: Prop = [];
  for (let piece = 0; piece < pieces; piece += 1) {
    parts.push(part(cylinder(0.42, 0.42, 1.3, 7), color, [piece * 1.45 - 1, 0.42, floatBetween(rng, -0.15, 0.15)], [0, floatBetween(rng, -0.2, 0.2), Math.PI / 2]));
  }
  return parts;
}

/** Ring of standing stones, one toppled. */
function stoneCircle(rng: Rng): Prop {
  const stones = 7;
  const radius = 4;
  const fallen = intBetween(rng, 0, stones - 1);
  const parts: Prop = [];
  for (let index = 0; index < stones; index += 1) {
    const angle = (index / stones) * Math.PI * 2;
    const height = floatBetween(rng, 1.8, 2.8);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (index === fallen) parts.push(part(box(0.8, height, 0.45), PALETTE.stoneDark, [x * 1.2, 0.25, z * 1.2], [Math.PI / 2, -angle, 0]));
    else parts.push(part(box(0.8, height, 0.45), pickOne(rng, STONE), [x, height / 2, z], [floatBetween(rng, -0.08, 0.08), -angle + Math.PI / 2, floatBetween(rng, -0.08, 0.08)]));
  }
  parts.push(part(cylinder(0.9, 1, 0.5, 7), PALETTE.stoneDark, [0, 0.25, 0])); // altar
  return parts;
}

/** A few crooked gravestones. */
function graveyard(rng: Rng): Prop {
  const parts: Prop = [];
  const rows = 2;
  const columns = 3;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (rng() < 0.2) continue;
      const x = (column - 1) * 1.4 + floatBetween(rng, -0.2, 0.2);
      const z = (row - 0.5) * 1.8;
      const tilt: [number, number, number] = [floatBetween(rng, -0.2, 0.2), floatBetween(rng, -0.3, 0.3), floatBetween(rng, -0.15, 0.15)];
      const color = pickOne(rng, [0x9a9488, 0x8a8478, 0xa8a294]);
      if (rng() < 0.3) {
        parts.push(part(box(0.14, 1.1, 0.14), color, [x, 0.55, z], tilt), part(box(0.6, 0.14, 0.14), color, [x, 0.75, z], tilt)); // cross
      } else {
        parts.push(part(box(0.62, 0.8, 0.18), color, [x, 0.4, z], tilt), part(cylinder(0.31, 0.31, 0.18, 7), color, [x, 0.8, z], [Math.PI / 2 + tilt[0], tilt[1], tilt[2]]));
      }
      parts.push(part(box(0.7, 0.06, 1.2), 0x5a4632, [x, 0.03, z + 0.7])); // grave mound
    }
  }
  return parts;
}

function deadTree(rng: Rng): Prop {
  const height = floatBetween(rng, 2.4, 4.6);
  const parts: Prop = [part(cylinder(0.12, 0.28, height, 5), DEAD_WOOD, [0, height / 2, 0], [floatBetween(rng, -0.1, 0.1), 0, floatBetween(rng, -0.1, 0.1)])];
  for (let branch = 0; branch < 3; branch += 1) {
    const length = floatBetween(rng, 0.8, 1.7);
    const heading = branch * 2.1 + rng();
    const y = height * floatBetween(rng, 0.55, 0.9);
    parts.push(part(cylinder(0.04, 0.09, length, 4), DEAD_WOOD, [Math.cos(heading) * length * 0.35, y + length * 0.3, Math.sin(heading) * length * 0.35], [Math.sin(heading) * 0.9, 0, -Math.cos(heading) * 0.9]));
  }
  return parts;
}

function bush(rng: Rng): Prop {
  const color = pickOne(rng, BUSH);
  const parts: Prop = [];
  const blobs = intBetween(rng, 2, 4);
  for (let index = 0; index < blobs; index += 1) {
    const size = floatBetween(rng, 0.4, 0.7);
    parts.push(part(ball(size), index === 0 ? color : pickOne(rng, BUSH), [floatBetween(rng, -0.4, 0.4), size * 0.7, floatBetween(rng, -0.4, 0.4)], [rng(), rng(), rng()], [1, 0.8, 1]));
  }
  if (rng() < 0.35) parts.push(part(ball(0.1), 0xb04a6a, [0.2, 0.9, 0.3]), part(ball(0.1), 0xb04a6a, [-0.25, 0.75, -0.1])); // berries
  return parts;
}

function rock(rng: Rng): Prop {
  return [part(new THREE.DodecahedronGeometry(floatBetween(rng, 0.25, 0.85), 0), pickOne(rng, STONE), [0, 0.1, 0], [rng() * 3, rng() * 3, rng() * 3], [1, floatBetween(rng, 0.5, 0.9), 1])];
}

/** Stone bowl on a short pillar — the flame and its light are added separately (they animate). */
export function brazierBase(): Prop {
  return [
    part(box(0.6, 0.15, 0.6), PALETTE.stoneDark, [0, 0.075, 0]),
    part(cylinder(0.16, 0.22, 0.75, 6), PALETTE.stone, [0, 0.5, 0]),
    part(cylinder(0.42, 0.24, 0.3, 7), 0x4a4440, [0, 1.0, 0]),
    part(box(0.5, 0.08, 0.12), 0x3a2416, [0, 1.12, 0], [0, 0.6, 0]), // logs
    part(box(0.5, 0.08, 0.12), 0x3a2416, [0, 1.14, 0], [0, -0.6, 0])
  ];
}

export const PROP_BUILDERS: Record<Exclude<PropKind, 'brazier'>, (rng: Rng) => Prop> = {
  colonnade, arch, wall, fallenColumn, stoneCircle, graveyard, deadTree, bush, rock
};

function translate(parts: Prop, x: number, z: number): Prop {
  parts.forEach((geometry) => geometry.translate(x, 0, z));
  return parts;
}

/** Places a prop in the world (position on the ground + yaw) — returns its parts ready to merge. */
export function placeProp(parts: Prop, x: number, z: number, yaw: number): Prop {
  const matrix = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  parts.forEach((geometry) => geometry.applyMatrix4(matrix));
  return parts;
}
