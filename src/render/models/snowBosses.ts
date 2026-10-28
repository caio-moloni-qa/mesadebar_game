import * as THREE from 'three';
import { toonMaterial } from '../materials';
import { actorClips, ActorClipName } from './clips';
import { ball, box, cone, cylinder, gem, part } from './parts';
import { buildRiggedModel, clipForBones, humanoidBones, RigPart } from './rig';
import { ANCIENT_YETI_HIP_HEIGHT, ANCIENT_YETI_JOINTS, BELLRINGER_HIP_HEIGHT, BELLRINGER_JOINTS, ICE_SERPENT_HIP_HEIGHT, ICE_SERPENT_JOINTS } from './importedBosses';
import { ActorModel, imported } from './zoneActors';

export type SnowModelId = 'iceSerpent' | 'bellringer' | 'ancientYeti' | 'winterKing';

/** Polygon stand-ins use the same bone contract as future imported meshes. */
export function snowBossParts(id: SnowModelId): RigPart[] {
  const parts: RigPart[] = [];
  const put = (bone: string, g: THREE.BufferGeometry, c: number, x = 0, y = 0, z = 0) => parts.push({ bone, geometry: part(g, c, [x, y, z]) });
  const ice = 0x91d9ef, pale = 0xe4f1f4, dark = 0x263f55, gold = 0xc29b55;
  if (id === 'iceSerpent') {
    for (let i = 0; i < 17; i++) {
      const t = i / 16, a = t * Math.PI * 2.4;
      put('hips', ball(0.22 - t * 0.1, 1).scale(1, 0.8, 1), i % 2 ? ice : 0x497da4, Math.cos(a) * (0.75 - t * 0.4), -0.6 + t * 0.2, Math.sin(a) * (0.75 - t * 0.4));
    }
    put('spine', cylinder(0.18, 0.27, 0.65, 8), ice, 0, 0.12);
    put('chest', ball(0.27, 1).scale(0.75, 1.6, 0.85), 0x6cb5cf, 0, 0.15);
    put('head', ball(0.3, 1).scale(0.8, 0.75, 1.5), ice, 0, 0.15, 0.15);
    put('head', box(0.4, 0.08, 0.55), 0x244964, 0, 0.06, 0.32);
    for (const side of [-1, 1]) {
      put('head', gem(0.1).scale(0.6, 0.5, 1), 0xffc45a, side * 0.22, 0.25, 0.24);
      put('head', cone(0.09, 0.4, 4).rotateZ(-side * 0.35), pale, side * 0.22, 0.52, -0.1);
      put('head', cone(0.055, 0.19, 4).rotateX(Math.PI), pale, side * 0.14, 0.03, 0.49);
    }
    return parts;
  }
  const yeti = id === 'ancientYeti', king = id === 'winterKing';
  const body = yeti ? pale : king ? 0x355d85 : 0x353549;
  put('hips', cylinder(yeti ? 0.42 : 0.3, yeti ? 0.36 : 0.46, 0.65, 8), body, 0, -0.15);
  put('spine', box(yeti ? 0.85 : 0.52, 0.38, 0.38), body, 0, 0.16);
  put('chest', ball(yeti ? 0.58 : 0.4, 1).scale(1, 0.85, 0.7), body, 0, 0.16);
  for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
    put(`upperArm${side}`, cylinder(yeti ? 0.23 : 0.13, yeti ? 0.19 : 0.1, 0.37, 6), body, 0, -0.14);
    put(`foreArm${side}`, ball(yeti ? 0.22 : 0.13, 1).scale(1, 1.2, 1), body, 0, -0.15);
    put(`hand${side}`, ball(yeti ? 0.2 : 0.11, 1), yeti ? 0x688799 : pale, 0, -0.06);
    put(`thigh${side}`, cylinder(0.16, 0.13, 0.4, 6), body, 0, -0.2);
    put(`shin${side}`, cylinder(0.13, 0.12, 0.4, 6), body, 0, -0.2);
    put(`foot${side}`, box(yeti ? 0.3 : 0.2, 0.13, yeti ? 0.4 : 0.3), dark, 0, 0.06, 0.06);
    put('chest', gem(yeti ? 0.22 : 0.18).scale(1, 1.6, 1), king ? ice : yeti ? 0xa6d3e4 : gold, sign * 0.35, 0.33, 0);
  }
  if (yeti) {
    put('head', ball(0.32, 1), pale, 0, 0.23);
    put('head', ball(0.23, 1).scale(1, 0.85, 0.6), 0x607d92, 0, 0.19, 0.21);
    put('head', box(0.24, 0.1, 0.08), 0x24374b, 0, 0.07, 0.34);
    for (const side of [-1, 1]) {
      put('head', cone(0.07, 0.2, 5), pale, side * 0.1, 0.08, 0.34);
      put('head', cone(0.12, 0.4, 5).rotateZ(-side * 0.9), 0x7aa7bf, side * 0.3, 0.43, -0.04);
    }
  } else if (!king) {
    put('head', cylinder(0.14, 0.42, 0.56, 10), gold, 0, 0.28);
    put('head', cylinder(0.43, 0.43, 0.06, 10), 0xf0c67c, 0, 0.01);
    put('head', ball(0.1, 0), 0x5a4035, 0, -0.1);
    for (const side of [-1, 1]) {
      put('chest', cylinder(0.12, 0.28, 0.44, 8), gold, side * 0.3, 0.1, -0.4);
      put('chest', cylinder(0.29, 0.29, 0.05, 8), 0xf0c67c, side * 0.3, -0.12, -0.4);
    }
    put('handR', cylinder(0.045, 0.045, 0.7, 6), 0x765338, 0, -0.16);
    put('handR', ball(0.17, 1), gold, 0, -0.53);
  } else {
    put('head', ball(0.24, 1), 0xb1ccdc, 0, 0.23);
    put('head', cone(0.18, 0.35, 6).rotateX(Math.PI), pale, 0, -0.05, 0.14);
    put('head', cylinder(0.27, 0.25, 0.12, 8), gold, 0, 0.43);
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; put('head', gem(0.1).scale(0.8, 2.5, 0.8), ice, Math.sin(a) * 0.23, 0.62, Math.cos(a) * 0.23); }
    put('cape', box(0.8, 1.3, 0.08), 0x213e64, 0, -0.6);
    put('handR', box(0.07, 0.85, 0.17), ice, 0, -0.4);
    put('handR', box(0.38, 0.07, 0.14), gold, 0, 0.02);
  }
  for (const side of [-1, 1]) put('head', box(0.065, 0.04, 0.04), 0x79eeff, side * 0.1, 0.26, yeti ? 0.35 : 0.22);
  return parts;
}

const IMPORTED_SNOW_GUARDIANS = {
  iceSerpent: { joints: ICE_SERPENT_JOINTS, hip: ICE_SERPENT_HIP_HEIGHT, height: 2.3 },
  bellringer: { joints: BELLRINGER_JOINTS, hip: BELLRINGER_HIP_HEIGHT, height: 2.1 },
  ancientYeti: { joints: ANCIENT_YETI_JOINTS, hip: ANCIENT_YETI_HIP_HEIGHT, height: 2.1 }
} as const;

export function createSnowGuardianModel(id: Exclude<SnowModelId, 'winterKing'>): ActorModel {
  const art = IMPORTED_SNOW_GUARDIANS[id];
  // The Sineiro's art has empty hands: he keeps his bell mallet.
  const extras: RigPart[] = id === 'bellringer' ? [
    { bone: 'handR', geometry: part(cylinder(0.045, 0.045, 0.7, 6), 0x765338, [0, -0.2, 0.04]) },
    { bone: 'handR', geometry: part(ball(0.17, 1), 0xc29b55, [0, -0.57, 0.04]) }
  ] : [];
  const tripo = imported(id, [...art.joints], art.hip, art.height, extras);
  if (tripo) return tripo;
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const model = buildRiggedModel(humanoidBones(), snowBossParts(id), material);
  const clips = Object.fromEntries(Object.entries(actorClips(0.82)).map(([name, clip]) => [name, clipForBones(clip, model.bones)])) as Record<ActorClipName, THREE.AnimationClip>;
  return { ...model, clips, material, height: id === 'iceSerpent' ? 2.3 : 2.1 };
}
