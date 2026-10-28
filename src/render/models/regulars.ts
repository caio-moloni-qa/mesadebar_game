import * as THREE from 'three';
import { ball, box, cone, cylinder, part } from './parts';

// The tavern's figures — Sergio and the four regulars — as part lists on the shared humanoid rig (hip 0.82, arm 0.3,
// leg 0.4, the heroes' rig). The tavern stands them up idling; once a regular joins the roster the same figure is
// their hero model (with `props` off: the mug or coin in their hand gives way to the weapon).

export type RegularFigureId = 'sergio' | 'brom' | 'lyra' | 'grimbo' | 'zora' | 'eskimo' | 'joe' | 'beast' | 'voly';
export type PartSpec = { bone: string; geometry: THREE.BufferGeometry };

/** The shared humanoid body: limbs, hips/spine/chest and a head, in the given colours. */
function body(colors: { skin: number; shirt: number; sleeve: number; pants: number; boots: number }, { chestWidth = 0.5, headSize = 0.23 } = {}): PartSpec[] {
  const { skin, shirt, sleeve, pants, boots } = colors;
  const limb = (s: 'L' | 'R'): PartSpec[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.14, 0.32, 0.14), sleeve, [0, -0.15, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.07, 0.09, 0.3, 6), sleeve, [0, -0.15, 0]) },
    { bone: `hand${s}`, geometry: part(ball(0.07), skin, [0, -0.02, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.16, 0.4, 0.16), pants, [0, -0.2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.14, 0.4, 0.14), pants, [0, -0.2, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.16, 0.08, 0.26), boots, [0, 0.04, 0.05]) }
  ];
  return [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(chestWidth * 0.8, 0.22, 0.28), pants, [0, -0.02, 0]) },
    { bone: 'spine', geometry: part(box(chestWidth * 0.85, 0.3, 0.28), shirt, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(chestWidth, 0.36, 0.3), shirt, [0, 0.1, 0]) },
    { bone: 'head', geometry: part(box(0.12, 0.1, 0.12), skin, [0, 0.03, 0]) },
    { bone: 'head', geometry: part(ball(headSize, 1), skin, [0, 0.24, 0]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), 0x1a1410, [0.08, 0.27, headSize - 0.02]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), 0x1a1410, [-0.08, 0.27, headSize - 0.02]) }
  ];
}


/** Each figure's parts. `props`: what they hold in the tavern (Brom's mug, Grimbo's coin). */
export const REGULAR_FIGURES: Record<RegularFigureId, (props: boolean) => PartSpec[]> = {
  sergio: (props) => {
  const robe = 0x5a3a6b;
  const hat = 0x3a2a1e;
    return [
      ...body({ skin: 0xd9a77e, shirt: robe, sleeve: robe, pants: 0x3a2a40, boots: 0x2a1d14 }, { chestWidth: 0.54 }),
      { bone: 'hips', geometry: part(cylinder(0.3, 0.42, 0.62, 8), robe, [0, -0.26, 0]) },
      { bone: 'spine', geometry: part(box(0.48, 0.08, 0.32), 0xc9963f, [0, 0.02, 0]) },
      { bone: 'chest', geometry: part(box(0.56, 0.7, 0.36), 0x7a5232, [0, 0.12, -0.36]) },
      { bone: 'chest', geometry: part(cylinder(0.11, 0.11, 0.62, 8), 0xa8342a, [0, 0.52, -0.36], [0, 0, Math.PI / 2]) },
      { bone: 'head', geometry: part(cone(0.2, 0.32, 6), 0xcfc8bb, [0, 0.08, 0.14], [Math.PI, 0, 0]) },
      { bone: 'head', geometry: part(cylinder(0.5, 0.5, 0.05, 10), hat, [0, 0.42, 0]) },
      { bone: 'head', geometry: part(cone(0.26, 0.42, 8), hat, [0, 0.64, -0.02], [-0.15, 0, 0]) }
  ];
  },
  brom: (props) => {
  const beard = 0xc0502a;
    return [
      ...body({ skin: 0xe0a882, shirt: 0x7a4a2a, sleeve: 0x6a3e22, pants: 0x4a4a5a, boots: 0x2a1d14 }, { chestWidth: 0.66, headSize: 0.25 }),
      { bone: 'chest', geometry: part(box(0.5, 0.62, 0.04), 0x4a3020, [0, -0.08, 0.17]) },
      { bone: 'spine', geometry: part(box(0.62, 0.08, 0.32), 0x2a1d14, [0, 0.0, 0]) },
      { bone: 'head', geometry: part(cone(0.24, 0.5, 6), beard, [0, -0.02, 0.15], [Math.PI, 0, 0]) },
      { bone: 'head', geometry: part(box(0.05, 0.22, 0.05), beard, [0.1, -0.3, 0.2]) },
      { bone: 'head', geometry: part(box(0.05, 0.22, 0.05), beard, [-0.1, -0.3, 0.2]) },
      { bone: 'head', geometry: part(box(0.2, 0.05, 0.05), beard, [0, 0.19, 0.24]) },
      { bone: 'head', geometry: part(new THREE.SphereGeometry(0.27, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8f99, [0, 0.3, 0]) },
      { bone: 'head', geometry: part(cylinder(0.29, 0.29, 0.05, 8), 0x6f737c, [0, 0.31, 0]) },
      ...(props ? [{ bone: 'handR', geometry: part(cylinder(0.08, 0.08, 0.18, 8), 0x8a5a32, [0, 0.02, 0.08]) }] : []),
      ...(props ? [{ bone: 'handR', geometry: part(cylinder(0.085, 0.085, 0.04, 8), 0xf5ecd0, [0, 0.12, 0.08]) }] : []),
  ];
  },
  lyra: (props) => {
  const cloak = 0x2f5a36;
  const hair = 0xe8d27a;
    return [
      ...body({ skin: 0xf0d0b0, shirt: 0x3f7a4a, sleeve: 0x3f7a4a, pants: 0x5a4a32, boots: 0x3a2a1a }, { chestWidth: 0.42, headSize: 0.21 }),
      { bone: 'chest', geometry: part(box(0.5, 0.8, 0.05), cloak, [0, -0.1, -0.18]) },
      { bone: 'spine', geometry: part(box(0.44, 0.06, 0.3), 0x8a6a3a, [0, 0.02, 0]) },
      { bone: 'head', geometry: part(box(0.4, 0.3, 0.12), hair, [0, 0.2, -0.13]) },
      { bone: 'head', geometry: part(box(0.12, 0.42, 0.06), hair, [0, -0.02, -0.18]) },
      { bone: 'head', geometry: part(cone(0.05, 0.22, 4), 0xf0d0b0, [0.22, 0.3, 0], [0, 0, -1.2]) },
      { bone: 'head', geometry: part(cone(0.05, 0.22, 4), 0xf0d0b0, [-0.22, 0.3, 0], [0, 0, 1.2]) },
      { bone: 'head', geometry: part(new THREE.SphereGeometry(0.25, 8, 4, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI / 1.7), cloak, [0, 0.26, -0.02]) },
      { bone: 'chest', geometry: part(new THREE.TorusGeometry(0.45, 0.025, 4, 12, Math.PI), 0x6a4a2a, [0, 0.1, -0.24], [0, 0, Math.PI / 2 + 0.4]) }
  ];
  },
  grimbo: (props) => {
  const skin = 0x7fb04a;
    return [
      ...body({ skin, shirt: 0x8a3a5a, sleeve: 0xd8cbb0, pants: 0x4a3a2a, boots: 0x2a1d14 }, { chestWidth: 0.44, headSize: 0.3 }),
      { bone: 'head', geometry: part(cone(0.09, 0.42, 4), skin, [0.36, 0.3, 0], [0, 0, -1.35]) },
      { bone: 'head', geometry: part(cone(0.09, 0.42, 4), skin, [-0.36, 0.3, 0], [0, 0, 1.35]) },
      { bone: 'head', geometry: part(cone(0.07, 0.22, 4), 0x6a9a3a, [0, 0.2, 0.36], [Math.PI / 2, 0, 0]) },
      { bone: 'head', geometry: part(box(0.07, 0.07, 0.03), 0xffe14a, [0.11, 0.29, 0.28]) },
      { bone: 'head', geometry: part(box(0.07, 0.07, 0.03), 0xffe14a, [-0.11, 0.29, 0.28]) },
      { bone: 'head', geometry: part(cylinder(0.3, 0.3, 0.04, 10), 0x1e1a24, [0, 0.5, 0]) },
      { bone: 'head', geometry: part(cylinder(0.18, 0.2, 0.36, 10), 0x1e1a24, [0, 0.7, 0]) },
      { bone: 'head', geometry: part(cylinder(0.205, 0.205, 0.06, 10), 0xc9963f, [0, 0.56, 0]) },
      ...(props ? [{ bone: 'handR', geometry: part(cylinder(0.07, 0.07, 0.02, 10), 0xffd25a, [0, 0.02, 0.06], [Math.PI / 2, 0, 0]) }] : []),
  ];
  },
  zora: (props) => {
  const gown = 0x5a2a7a;
  const scarf = 0xd4a83a;
    return [
      ...body({ skin: 0xc8946a, shirt: gown, sleeve: 0x7a3a9a, pants: gown, boots: 0x2a1a2a }, { chestWidth: 0.46, headSize: 0.22 }),
      { bone: 'hips', geometry: part(cylinder(0.28, 0.5, 0.82, 10), gown, [0, -0.38, 0]) },
      { bone: 'chest', geometry: part(box(0.6, 0.14, 0.34), 0x9a4a6a, [0, 0.22, 0]) },
      { bone: 'head', geometry: part(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 1.9), scarf, [0, 0.27, -0.02]) },
      { bone: 'head', geometry: part(cone(0.12, 0.3, 4), scarf, [0, 0.12, -0.24], [-2.6, 0, 0]) },
      { bone: 'head', geometry: part(new THREE.TorusGeometry(0.06, 0.012, 4, 10), 0xffd25a, [0.22, 0.14, 0]) },
      { bone: 'head', geometry: part(new THREE.TorusGeometry(0.06, 0.012, 4, 10), 0xffd25a, [-0.22, 0.14, 0]) },
      { bone: 'head', geometry: part(box(0.32, 0.04, 0.04), 0x2a1a2a, [0, 0.33, 0.21]) }
  ];
  },
  // ── The igloo: the Esquimó and the Campo Nevado's regulars ──
  eskimo: (props) => {
    const parka = 0x6b4226;
    const fur = 0xeee2c8;
    return [
      ...body({ skin: 0xe0a07a, shirt: parka, sleeve: parka, pants: 0x4a2e1a, boots: 0x3a2414 }, { chestWidth: 0.62, headSize: 0.22 }),
      { bone: 'hips', geometry: part(cylinder(0.34, 0.4, 0.4, 8), parka, [0, -0.14, 0]) },
      { bone: 'hips', geometry: part(cylinder(0.41, 0.41, 0.1, 8), fur, [0, -0.34, 0]) },
      { bone: 'spine', geometry: part(box(0.6, 0.08, 0.34), 0xa8342a, [0, 0.0, 0]) },
      { bone: 'foreArmL', geometry: part(cylinder(0.11, 0.11, 0.08, 6), fur, [0, -0.26, 0]) },
      { bone: 'foreArmR', geometry: part(cylinder(0.11, 0.11, 0.08, 6), fur, [0, -0.26, 0]) },
      { bone: 'shinL', geometry: part(cylinder(0.1, 0.1, 0.08, 6), fur, [0, -0.08, 0]) },
      { bone: 'shinR', geometry: part(cylinder(0.1, 0.1, 0.08, 6), fur, [0, -0.08, 0]) },
      // The hood: brown shell, a thick fur ring framing the face, a white moustache.
      { bone: 'head', geometry: part(ball(0.3, 1), parka, [0, 0.26, -0.06]) },
      { bone: 'head', geometry: part(new THREE.TorusGeometry(0.24, 0.08, 5, 10), fur, [0, 0.25, 0.12]) },
      { bone: 'head', geometry: part(box(0.16, 0.04, 0.04), 0xf5f0e6, [0, 0.18, 0.21]) },
      { bone: 'head', geometry: part(ball(0.04), 0xd8705a, [0, 0.23, 0.23]) },
      // The lantern, hanging from his right hand.
      ...(props ? [
        { bone: 'handR', geometry: part(cylinder(0.01, 0.01, 0.14, 4), 0x3a2414, [0, -0.08, 0]) },
        { bone: 'handR', geometry: part(box(0.14, 0.18, 0.14), 0x4a3a2a, [0, -0.24, 0]) },
        { bone: 'handR', geometry: part(box(0.1, 0.13, 0.15), 0xffc65a, [0, -0.24, 0]) }
      ] : [])
    ];
  },
  joe: () => {
    const ice = 0x8fcdf0;
    const deep = 0x5aa6d8;
    const scarf = 0x232a5a;
    return [
      ...body({ skin: ice, shirt: ice, sleeve: deep, pants: deep, boots: ice }, { chestWidth: 0.6, headSize: 0.05 }),
      // A block of ice for a body and head in one, snow on top, a navy scarf and glowing violet eyes.
      { bone: 'chest', geometry: part(box(0.66, 0.9, 0.5), ice, [0, 0.3, 0]) },
      { bone: 'chest', geometry: part(box(0.4, 0.5, 0.52), deep, [0.12, 0.2, 0.01]) },
      { bone: 'chest', geometry: part(box(0.68, 0.08, 0.52), 0xf2f8ff, [0, 0.78, 0]) },
      { bone: 'chest', geometry: part(ball(0.12), 0xf2f8ff, [0.12, 0.84, 0.05]) },
      { bone: 'chest', geometry: part(new THREE.TorusGeometry(0.33, 0.07, 4, 10), scarf, [0, 0.06, 0], [Math.PI / 2, 0, 0]) },
      { bone: 'chest', geometry: part(box(0.12, 0.34, 0.06), scarf, [0.2, -0.16, 0.27]) },
      { bone: 'chest', geometry: part(box(0.07, 0.05, 0.03), 0xb48cff, [0.12, 0.46, 0.26]) },
      { bone: 'chest', geometry: part(box(0.07, 0.05, 0.03), 0xb48cff, [-0.12, 0.46, 0.26]) },
      { bone: 'chest', geometry: part(box(0.2, 0.03, 0.03), 0x3a78a8, [0, 0.3, 0.26]) }
    ];
  },
  beast: () => {
    const pelt = 0xd8dde4;
    const hair = 0x3a2a22;
    return [
      ...body({ skin: 0xe8b894, shirt: 0x6a4a32, sleeve: 0xe8b894, pants: 0x4a3a2a, boots: 0x2a1d14 }, { chestWidth: 0.42, headSize: 0.21 }),
      // The wolf pelt: its head as her hood (ears, snout over the brow) and the hide down her back.
      { bone: 'head', geometry: part(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), pelt, [0, 0.28, -0.02]) },
      { bone: 'head', geometry: part(box(0.16, 0.12, 0.2), pelt, [0, 0.42, 0.18]) },
      { bone: 'head', geometry: part(box(0.06, 0.05, 0.05), 0x1a1a1a, [0, 0.42, 0.29]) },
      { bone: 'head', geometry: part(cone(0.06, 0.16, 4), pelt, [0.13, 0.56, 0]) },
      { bone: 'head', geometry: part(cone(0.06, 0.16, 4), pelt, [-0.13, 0.56, 0]) },
      { bone: 'head', geometry: part(box(0.34, 0.36, 0.1), hair, [0, 0.12, -0.16]) },
      { bone: 'chest', geometry: part(box(0.56, 0.9, 0.06), pelt, [0, -0.16, -0.19]) },
      { bone: 'spine', geometry: part(box(0.46, 0.06, 0.3), 0x8a6a3a, [0, 0.02, 0]) },
      { bone: 'chest', geometry: part(ball(0.05), 0x7fe3ff, [0, 0.0, 0.17]) }
    ];
  },
  voly: () => {
    const fur = 0xeef0f0;
    const steel = 0x7a8796;
    return [
      ...body({ skin: fur, shirt: steel, sleeve: fur, pants: fur, boots: fur }, { chestWidth: 0.72, headSize: 0.24 }),
      { bone: 'hips', geometry: part(box(0.62, 0.3, 0.42), fur, [0, -0.05, 0]) },
      { bone: 'spine', geometry: part(box(0.66, 0.36, 0.44), fur, [0, 0.12, 0]) },
      // Armour: a steel breastplate with a gold trim and pauldrons.
      { bone: 'chest', geometry: part(box(0.76, 0.42, 0.46), steel, [0, 0.1, 0]) },
      { bone: 'chest', geometry: part(box(0.78, 0.05, 0.48), 0xc9963f, [0, -0.1, 0]) },
      { bone: 'upperArmL', geometry: part(ball(0.15, 1), steel, [0, 0.02, 0]) },
      { bone: 'upperArmR', geometry: part(ball(0.15, 1), steel, [0, 0.02, 0]) },
      // The bear's head: round ears, a muzzle with a black nose.
      { bone: 'head', geometry: part(ball(0.08), fur, [0.18, 0.44, 0]) },
      { bone: 'head', geometry: part(ball(0.08), fur, [-0.18, 0.44, 0]) },
      { bone: 'head', geometry: part(box(0.18, 0.12, 0.14), 0xdfe2e2, [0, 0.18, 0.24]) },
      { bone: 'head', geometry: part(box(0.08, 0.05, 0.04), 0x1a1a1a, [0, 0.22, 0.31]) },
      { bone: 'handL', geometry: part(cone(0.03, 0.08, 4), 0x2a2a2a, [0, -0.08, 0.05], [Math.PI, 0, 0]) },
      { bone: 'handR', geometry: part(cone(0.03, 0.08, 4), 0x2a2a2a, [0, -0.08, 0.05], [Math.PI, 0, 0]) }
    ];
  }
};

/** Figure scale (the dwarf and the goblin stand shorter) and idle phase offset in the tavern. */
export const REGULAR_FIGURE_LOOK: Record<RegularFigureId, { scale: number; phase: number }> = {
  sergio: { scale: 1.2, phase: 0 },
  brom: { scale: 0.78, phase: 0.2 },
  lyra: { scale: 1.02, phase: 0.45 },
  grimbo: { scale: 0.64, phase: 0.7 },
  zora: { scale: 0.96, phase: 0.9 },
  eskimo: { scale: 0.92, phase: 0.1 },
  joe: { scale: 0.95, phase: 0.3 },
  beast: { scale: 0.9, phase: 0.55 },
  voly: { scale: 1.3, phase: 0.8 }
};
