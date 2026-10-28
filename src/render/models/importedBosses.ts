import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { JointSpec } from './importedRig';

/** Imported boss and guardian meshes (art-source/3d/<id> → tools/asset-pipeline → src/assets/3d/bosses). One static
 *  URL literal per asset so Vite rewrites it with the base path. Any that fails to load keeps its procedural model. */
export type ImportedBossId = 'necromancer' | 'gravedigger' | 'templeGuardian' | 'lakeSpirit'
  | 'frostKnight' | 'iceSerpent' | 'bellringer' | 'ancientYeti' | 'winterKing';

const BOSS_MESH_URLS: Record<ImportedBossId, string> = {
  necromancer: new URL('../../assets/3d/bosses/necromancer.glb', import.meta.url).href,
  gravedigger: new URL('../../assets/3d/bosses/gravedigger.glb', import.meta.url).href,
  templeGuardian: new URL('../../assets/3d/bosses/temple-guardian.glb', import.meta.url).href,
  lakeSpirit: new URL('../../assets/3d/bosses/lake-spirit.glb', import.meta.url).href,
  frostKnight: new URL('../../assets/3d/bosses/frost-knight.glb', import.meta.url).href,
  iceSerpent: new URL('../../assets/3d/bosses/ice-serpent.glb', import.meta.url).href,
  bellringer: new URL('../../assets/3d/bosses/bellringer.glb', import.meta.url).href,
  ancientYeti: new URL('../../assets/3d/bosses/ancient-yeti.glb', import.meta.url).href,
  winterKing: new URL('../../assets/3d/bosses/winter-king.glb', import.meta.url).href
};

const loaded = new Map<ImportedBossId, THREE.BufferGeometry>();

export async function loadBossMeshes(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(BOSS_MESH_URLS).map(async ([id, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      let geometry: THREE.BufferGeometry | undefined;
      gltf.scene.traverse((object) => { if (!geometry && object instanceof THREE.Mesh) geometry = object.geometry; });
      if (!geometry) throw new Error('no mesh in file');
      registerBossMesh(id as ImportedBossId, geometry);
    } catch (error) {
      console.warn(`boss mesh "${id}" failed to load, using the procedural model`, error);
    }
  }));
}

/** Also the test seam. */
export function registerBossMesh(id: ImportedBossId, geometry: THREE.BufferGeometry): void {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  loaded.set(id, geometry);
}

export function unregisterBossMesh(id: ImportedBossId): void {
  loaded.delete(id);
}

/** A fresh copy per model (each owns its geometry and skin attributes), or null to build the procedural one. */
export function bossMesh(id: ImportedBossId): THREE.BufferGeometry | null {
  return loaded.get(id)?.clone() ?? null;
}

// Joints measured on the processed meshes (front/side projections on a 10 cm grid). Same bone names as each
// procedural rig, so the existing clip sets drive them; the upper arms bind at their A-pose spread.

/** The Necromancer (2.4 m): long-legged lich, robes to the floor, arms a little forward. */
export const NECROMANCER_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 1.2, 0], radius: 0.24, minY: 0.95 },
  { name: 'spine', parent: 'hips', at: [0, 1.4, 0], radius: 0.26, minY: 1.1 },
  { name: 'chest', parent: 'spine', at: [0, 1.62, 0], radius: 0.28, minY: 1.35, maxY: 2.02 },
  { name: 'head', parent: 'chest', at: [0, 1.98, 0.03], tip: [0, 2.4, 0.03], radius: 0.16, minY: 1.9 },
  { name: 'jaw', parent: 'head', at: [0, 2.03, 0.1] },
  { name: 'cape', parent: 'chest', at: [0, 1.85, -0.15] },
  { name: 'upperArmL', parent: 'chest', at: [0.3, 1.72, 0.02], radius: 0.07, side: 'L', minAbsX: 0.27, rest: [0, 0, 17] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.45, 1.43, 0.08], radius: 0.06, side: 'L', minAbsX: 0.33 },
  { name: 'handL', parent: 'foreArmL', at: [0.58, 1.25, 0.15], tip: [0.63, 1.08, 0.2], radius: 0.07, side: 'L', minAbsX: 0.45 },
  { name: 'upperArmR', parent: 'chest', at: [-0.3, 1.72, 0.02], radius: 0.07, side: 'R', minAbsX: 0.27, rest: [0, 0, -17] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.45, 1.43, 0.08], radius: 0.06, side: 'R', minAbsX: 0.33 },
  { name: 'handR', parent: 'foreArmR', at: [-0.58, 1.25, 0.15], tip: [-0.63, 1.08, 0.2], radius: 0.07, side: 'R', minAbsX: 0.45 },
  { name: 'thighL', parent: 'hips', at: [0.13, 1.15, 0], radius: 0.12, side: 'L', maxY: 1.25 },
  { name: 'shinL', parent: 'thighL', at: [0.18, 0.62, 0], radius: 0.1, side: 'L', maxY: 0.75 },
  { name: 'footL', parent: 'shinL', at: [0.25, 0.12, 0], tip: [0.27, 0.02, 0.15], radius: 0.08, side: 'L', maxY: 0.25 },
  { name: 'thighR', parent: 'hips', at: [-0.13, 1.15, 0], radius: 0.12, side: 'R', maxY: 1.25 },
  { name: 'shinR', parent: 'thighR', at: [-0.18, 0.62, 0], radius: 0.1, side: 'R', maxY: 0.75 },
  { name: 'footR', parent: 'shinR', at: [-0.25, 0.12, 0], tip: [-0.27, 0.02, 0.15], radius: 0.08, side: 'R', maxY: 0.25 }
];
export const NECROMANCER_HIP_HEIGHT = 1.2;

/** O Coveiro (2.0 m): lanky hunched skeleton, the hood drooping forward, long bony arms. */
export const GRAVEDIGGER_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 1.05, 0], radius: 0.18, minY: 0.8 },
  { name: 'spine', parent: 'hips', at: [0, 1.25, 0], radius: 0.2, minY: 1.0 },
  { name: 'chest', parent: 'spine', at: [0, 1.45, 0], radius: 0.22, minY: 1.2, maxY: 1.7 },
  { name: 'head', parent: 'chest', at: [0, 1.6, 0.05], tip: [0, 1.95, 0.12], radius: 0.16, minY: 1.55 },
  { name: 'jaw', parent: 'head', at: [0, 1.68, 0.12] },
  { name: 'upperArmL', parent: 'chest', at: [0.27, 1.53, -0.03], radius: 0.05, side: 'L', minAbsX: 0.24, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.39, 1.3, -0.04], radius: 0.05, side: 'L', minAbsX: 0.3 },
  { name: 'handL', parent: 'foreArmL', at: [0.47, 1.08, -0.05], tip: [0.5, 0.82, -0.04], radius: 0.06, side: 'L', minAbsX: 0.38 },
  { name: 'upperArmR', parent: 'chest', at: [-0.27, 1.53, -0.03], radius: 0.05, side: 'R', minAbsX: 0.24, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.39, 1.3, -0.04], radius: 0.05, side: 'R', minAbsX: 0.3 },
  { name: 'handR', parent: 'foreArmR', at: [-0.47, 1.08, -0.05], tip: [-0.5, 0.82, -0.04], radius: 0.06, side: 'R', minAbsX: 0.38 },
  { name: 'thighL', parent: 'hips', at: [0.13, 1.02, 0], radius: 0.08, side: 'L', maxY: 1.1 },
  { name: 'shinL', parent: 'thighL', at: [0.19, 0.6, 0], radius: 0.07, side: 'L', maxY: 0.72 },
  { name: 'footL', parent: 'shinL', at: [0.27, 0.13, 0], tip: [0.32, 0.02, 0.15], radius: 0.07, side: 'L', maxY: 0.25 },
  { name: 'thighR', parent: 'hips', at: [-0.13, 1.02, 0], radius: 0.08, side: 'R', maxY: 1.1 },
  { name: 'shinR', parent: 'thighR', at: [-0.19, 0.6, 0], radius: 0.07, side: 'R', maxY: 0.72 },
  { name: 'footR', parent: 'shinR', at: [-0.27, 0.13, 0], tip: [-0.32, 0.02, 0.15], radius: 0.07, side: 'R', maxY: 0.25 }
];
export const GRAVEDIGGER_HIP_HEIGHT = 1.05;

/** Guardião do Templo (2.3 m): massive shoulders and fists, short thick legs, the crest high on the head. The fists
 *  hang right beside the thighs (|x| ≈ 0.47 is the gap), so arms and legs are split there or the fists walk with them. */
export const TEMPLE_GUARDIAN_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.9, 0], radius: 0.3, minY: 0.7 },
  { name: 'spine', parent: 'hips', at: [0, 1.15, 0], radius: 0.36, minY: 0.95 },
  { name: 'chest', parent: 'spine', at: [0, 1.45, 0], radius: 0.4, minY: 1.2, maxY: 1.9 },
  { name: 'head', parent: 'chest', at: [0, 1.8, 0.1], tip: [0, 2.3, 0.1], radius: 0.18, minY: 1.75 },
  { name: 'upperArmL', parent: 'chest', at: [0.45, 1.62, 0], radius: 0.17, side: 'L', minAbsX: 0.42, minY: 1.2 },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.6, 1.2, 0.03], radius: 0.16, side: 'L', minAbsX: 0.47, minY: 0.75 },
  { name: 'handL', parent: 'foreArmL', at: [0.62, 0.93, 0.05], tip: [0.6, 0.57, 0.05], radius: 0.17, side: 'L', minAbsX: 0.47, minY: 0.48 },
  { name: 'upperArmR', parent: 'chest', at: [-0.45, 1.62, 0], radius: 0.17, side: 'R', minAbsX: 0.42, minY: 1.2 },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.6, 1.2, 0.03], radius: 0.16, side: 'R', minAbsX: 0.47, minY: 0.75 },
  { name: 'handR', parent: 'foreArmR', at: [-0.62, 0.93, 0.05], tip: [-0.6, 0.57, 0.05], radius: 0.17, side: 'R', minAbsX: 0.47, minY: 0.48 },
  { name: 'thighL', parent: 'hips', at: [0.22, 0.88, 0], radius: 0.17, side: 'L', maxY: 0.95, maxAbsX: 0.47 },
  { name: 'shinL', parent: 'thighL', at: [0.23, 0.48, 0], radius: 0.16, side: 'L', maxY: 0.6, maxAbsX: 0.5 },
  { name: 'footL', parent: 'shinL', at: [0.24, 0.15, 0], tip: [0.25, 0.02, 0.18], radius: 0.16, side: 'L', maxY: 0.25 },
  { name: 'thighR', parent: 'hips', at: [-0.22, 0.88, 0], radius: 0.17, side: 'R', maxY: 0.95, maxAbsX: 0.47 },
  { name: 'shinR', parent: 'thighR', at: [-0.23, 0.48, 0], radius: 0.16, side: 'R', maxY: 0.6, maxAbsX: 0.5 },
  { name: 'footR', parent: 'shinR', at: [-0.24, 0.15, 0], tip: [-0.25, 0.02, 0.18], radius: 0.16, side: 'R', maxY: 0.25 }
];
export const TEMPLE_GUARDIAN_HIP_HEIGHT = 0.9;

/** O Espírito do Lago (2.4 m): a water torso on a swirling column — the column skins to the hips, the leg bones
 *  are there for the shared clips but skin nothing. */
export const LAKE_SPIRIT_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 1.2, 0], tip: [0, 0, 0], radius: 0.45 },
  { name: 'spine', parent: 'hips', at: [0, 1.42, 0.02], radius: 0.24, minY: 1.25 },
  { name: 'chest', parent: 'spine', at: [0, 1.65, 0.04], radius: 0.26, minY: 1.45, maxY: 1.95 },
  { name: 'head', parent: 'chest', at: [0, 1.9, 0.08], tip: [0, 2.4, 0.04], radius: 0.16, minY: 1.88 },
  { name: 'upperArmL', parent: 'chest', at: [0.27, 1.78, 0.04], radius: 0.07, side: 'L', minAbsX: 0.24, rest: [0, 0, 8] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.43, 1.45, 0.06], radius: 0.07, side: 'L', minAbsX: 0.33 },
  { name: 'handL', parent: 'foreArmL', at: [0.53, 1.13, 0.08], tip: [0.56, 0.97, 0.08], radius: 0.07, side: 'L', minAbsX: 0.43 },
  { name: 'upperArmR', parent: 'chest', at: [-0.27, 1.78, 0.04], radius: 0.07, side: 'R', minAbsX: 0.24, rest: [0, 0, -8] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.43, 1.45, 0.06], radius: 0.07, side: 'R', minAbsX: 0.33 },
  { name: 'handR', parent: 'foreArmR', at: [-0.53, 1.13, 0.08], tip: [-0.56, 0.97, 0.08], radius: 0.07, side: 'R', minAbsX: 0.43 },
  { name: 'thighL', parent: 'hips', at: [0.15, 1.1, 0] },
  { name: 'shinL', parent: 'thighL', at: [0.15, 0.6, 0] },
  { name: 'footL', parent: 'shinL', at: [0.15, 0.1, 0] },
  { name: 'thighR', parent: 'hips', at: [-0.15, 1.1, 0] },
  { name: 'shinR', parent: 'thighR', at: [-0.15, 0.6, 0] },
  { name: 'footR', parent: 'shinR', at: [-0.15, 0.1, 0] }
];
export const LAKE_SPIRIT_HIP_HEIGHT = 1.2;

// ── Campo Nevado ────────────────────────────────────────────────────────────────────────────────────────────────

/** O Cavaleiro Congelado (2.2 m): plate armour with ice pauldrons and gauntlets, a torn cape down to the shins. The
 *  hands stop at y ≈ 0.9, above the cape strands beside the legs, so they don't drag the cape along. */
export const FROST_KNIGHT_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 1.05, 0], radius: 0.25, minY: 0.9 },
  { name: 'spine', parent: 'hips', at: [0, 1.3, 0], radius: 0.28, minY: 1.1 },
  { name: 'chest', parent: 'spine', at: [0, 1.55, 0], radius: 0.3, minY: 1.35, maxY: 1.95 },
  { name: 'head', parent: 'chest', at: [0, 1.85, 0.02], tip: [0, 2.2, 0.02], radius: 0.14, minY: 1.82, maxAbsX: 0.22 },
  { name: 'upperArmL', parent: 'chest', at: [0.38, 1.72, 0], radius: 0.12, side: 'L', minAbsX: 0.3, minY: 1.45, rest: [0, 0, 19] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.5, 1.38, 0.02], radius: 0.13, side: 'L', minAbsX: 0.36, minY: 1.1 },
  { name: 'handL', parent: 'foreArmL', at: [0.53, 1.06, 0.04], tip: [0.53, 0.9, 0.06], radius: 0.1, side: 'L', minAbsX: 0.38, minY: 0.85 },
  { name: 'upperArmR', parent: 'chest', at: [-0.38, 1.72, 0], radius: 0.12, side: 'R', minAbsX: 0.3, minY: 1.45, rest: [0, 0, -19] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.5, 1.38, 0.02], radius: 0.13, side: 'R', minAbsX: 0.36, minY: 1.1 },
  { name: 'handR', parent: 'foreArmR', at: [-0.53, 1.06, 0.04], tip: [-0.53, 0.9, 0.06], radius: 0.1, side: 'R', minAbsX: 0.38, minY: 0.85 },
  { name: 'thighL', parent: 'hips', at: [0.18, 1.0, 0], radius: 0.14, side: 'L', maxY: 1.05, maxAbsX: 0.4 },
  { name: 'shinL', parent: 'thighL', at: [0.21, 0.55, 0], radius: 0.13, side: 'L', maxY: 0.65, maxAbsX: 0.45 },
  { name: 'footL', parent: 'shinL', at: [0.24, 0.12, 0], tip: [0.26, 0.02, 0.18], radius: 0.12, side: 'L', maxY: 0.22 },
  { name: 'thighR', parent: 'hips', at: [-0.18, 1.0, 0], radius: 0.14, side: 'R', maxY: 1.05, maxAbsX: 0.4 },
  { name: 'shinR', parent: 'thighR', at: [-0.21, 0.55, 0], radius: 0.13, side: 'R', maxY: 0.65, maxAbsX: 0.45 },
  { name: 'footR', parent: 'shinR', at: [-0.24, 0.12, 0], tip: [-0.26, 0.02, 0.18], radius: 0.12, side: 'R', maxY: 0.22 }
];
export const FROST_KNIGHT_HIP_HEIGHT = 1.05;

/** A Serpente do Gelo (2.3 m): a coil on the ground and a neck rising to a horned head facing +Z. The coil skins to
 *  the hips; arm and leg bones are there for the shared clips but skin nothing. */
export const ICE_SERPENT_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.55, 0], tip: [0, 0, 0], radius: 0.6, maxY: 0.6 },
  { name: 'spine', parent: 'hips', at: [0, 0.75, 0.12], radius: 0.18, minY: 0.55 },
  { name: 'chest', parent: 'spine', at: [0, 1.15, -0.02], radius: 0.18, minY: 0.95, maxY: 1.65 },
  { name: 'head', parent: 'chest', at: [0, 1.62, 0], tip: [0, 1.85, 0.35], radius: 0.2, minY: 1.55 },
  { name: 'upperArmL', parent: 'chest', at: [0.2, 1.4, 0] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.25, 1.2, 0] },
  { name: 'handL', parent: 'foreArmL', at: [0.3, 1.0, 0] },
  { name: 'upperArmR', parent: 'chest', at: [-0.2, 1.4, 0] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.25, 1.2, 0] },
  { name: 'handR', parent: 'foreArmR', at: [-0.3, 1.0, 0] },
  { name: 'thighL', parent: 'hips', at: [0.15, 0.5, 0] },
  { name: 'shinL', parent: 'thighL', at: [0.15, 0.3, 0] },
  { name: 'footL', parent: 'shinL', at: [0.15, 0.1, 0] },
  { name: 'thighR', parent: 'hips', at: [-0.15, 0.5, 0] },
  { name: 'shinR', parent: 'thighR', at: [-0.15, 0.3, 0] },
  { name: 'footR', parent: 'shinR', at: [-0.15, 0.1, 0] }
];
export const ICE_SERPENT_HIP_HEIGHT = 0.55;

/** O Sineiro (2.1 m): bell hat, two bells strapped to his back, bare grey arms and a ragged robe to the shins. */
export const BELLRINGER_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 1.0, 0], radius: 0.22, minY: 0.85 },
  { name: 'spine', parent: 'hips', at: [0, 1.2, 0], radius: 0.26, minY: 1.0 },
  { name: 'chest', parent: 'spine', at: [0, 1.45, -0.05], radius: 0.32, minY: 1.25, maxY: 1.9 },
  { name: 'head', parent: 'chest', at: [0, 1.7, 0.02], tip: [0, 2.05, 0.02], radius: 0.16, minY: 1.68, maxAbsX: 0.25 },
  { name: 'upperArmL', parent: 'chest', at: [0.26, 1.65, 0], radius: 0.06, side: 'L', minAbsX: 0.25, minY: 1.25, rest: [0, 0, 20] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.38, 1.3, 0.02], radius: 0.06, side: 'L', minAbsX: 0.33, minY: 1.05 },
  { name: 'handL', parent: 'foreArmL', at: [0.47, 1.04, 0.04], tip: [0.47, 0.88, 0.05], radius: 0.07, side: 'L', minAbsX: 0.38, minY: 0.85 },
  { name: 'upperArmR', parent: 'chest', at: [-0.26, 1.65, 0], radius: 0.06, side: 'R', minAbsX: 0.25, minY: 1.25, rest: [0, 0, -20] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.38, 1.3, 0.02], radius: 0.06, side: 'R', minAbsX: 0.33, minY: 1.05 },
  { name: 'handR', parent: 'foreArmR', at: [-0.47, 1.04, 0.04], tip: [-0.47, 0.88, 0.05], radius: 0.07, side: 'R', minAbsX: 0.38, minY: 0.85 },
  { name: 'thighL', parent: 'hips', at: [0.14, 0.95, 0], radius: 0.13, side: 'L', maxY: 1.0, maxAbsX: 0.4 },
  { name: 'shinL', parent: 'thighL', at: [0.17, 0.5, 0], radius: 0.11, side: 'L', maxY: 0.6, maxAbsX: 0.42 },
  { name: 'footL', parent: 'shinL', at: [0.2, 0.1, 0], tip: [0.22, 0.02, 0.15], radius: 0.09, side: 'L', maxY: 0.2 },
  { name: 'thighR', parent: 'hips', at: [-0.14, 0.95, 0], radius: 0.13, side: 'R', maxY: 1.0, maxAbsX: 0.4 },
  { name: 'shinR', parent: 'thighR', at: [-0.17, 0.5, 0], radius: 0.11, side: 'R', maxY: 0.6, maxAbsX: 0.42 },
  { name: 'footR', parent: 'shinR', at: [-0.2, 0.1, 0], tip: [-0.22, 0.02, 0.15], radius: 0.09, side: 'R', maxY: 0.2 }
];
export const BELLRINGER_HIP_HEIGHT = 1.0;

/** O Yeti Ancião (2.1 m): hunched, huge shoulders, ice-crusted arms with fists hanging to the knees (|x| ≈ 0.44 is
 *  the gap between fists and legs), big flat feet. */
export const ANCIENT_YETI_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.95, 0], radius: 0.35, minY: 0.8 },
  { name: 'spine', parent: 'hips', at: [0, 1.2, 0], radius: 0.4, minY: 1.0 },
  { name: 'chest', parent: 'spine', at: [0, 1.45, 0], radius: 0.42, minY: 1.2, maxY: 1.95 },
  { name: 'head', parent: 'chest', at: [0, 1.75, 0.06], tip: [0, 2.1, 0.06], radius: 0.18, minY: 1.72, maxAbsX: 0.22 },
  { name: 'upperArmL', parent: 'chest', at: [0.45, 1.6, 0], radius: 0.18, side: 'L', minAbsX: 0.35, minY: 1.2, rest: [0, 0, 18] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.6, 1.15, 0.02], radius: 0.17, side: 'L', minAbsX: 0.42, minY: 0.8 },
  { name: 'handL', parent: 'foreArmL', at: [0.6, 0.78, 0.05], tip: [0.58, 0.52, 0.05], radius: 0.15, side: 'L', minAbsX: 0.44, minY: 0.45 },
  { name: 'upperArmR', parent: 'chest', at: [-0.45, 1.6, 0], radius: 0.18, side: 'R', minAbsX: 0.35, minY: 1.2, rest: [0, 0, -18] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.6, 1.15, 0.02], radius: 0.17, side: 'R', minAbsX: 0.42, minY: 0.8 },
  { name: 'handR', parent: 'foreArmR', at: [-0.6, 0.78, 0.05], tip: [-0.58, 0.52, 0.05], radius: 0.15, side: 'R', minAbsX: 0.44, minY: 0.45 },
  { name: 'thighL', parent: 'hips', at: [0.2, 0.92, 0], radius: 0.18, side: 'L', maxY: 1.0, maxAbsX: 0.44 },
  { name: 'shinL', parent: 'thighL', at: [0.24, 0.45, 0], radius: 0.16, side: 'L', maxY: 0.6, maxAbsX: 0.46 },
  { name: 'footL', parent: 'shinL', at: [0.27, 0.1, 0], tip: [0.3, 0.02, 0.2], radius: 0.16, side: 'L', maxY: 0.2 },
  { name: 'thighR', parent: 'hips', at: [-0.2, 0.92, 0], radius: 0.18, side: 'R', maxY: 1.0, maxAbsX: 0.44 },
  { name: 'shinR', parent: 'thighR', at: [-0.24, 0.45, 0], radius: 0.16, side: 'R', maxY: 0.6, maxAbsX: 0.46 },
  { name: 'footR', parent: 'shinR', at: [-0.27, 0.1, 0], tip: [-0.3, 0.02, 0.2], radius: 0.16, side: 'R', maxY: 0.2 }
];
export const ANCIENT_YETI_HIP_HEIGHT = 0.95;

/** O Rei do Inverno (2.4 m): ice crown, fur collar with crystal pauldrons, a long cape flaring to the floor. Same
 *  bones as the boss rig (jaw, cape) so the final-boss clips drive it; the cape bone skins nothing. */
export const WINTER_KING_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 1.05, 0], radius: 0.3, minY: 0.85 },
  { name: 'spine', parent: 'hips', at: [0, 1.3, 0], radius: 0.3, minY: 1.1 },
  { name: 'chest', parent: 'spine', at: [0, 1.6, 0], radius: 0.32, minY: 1.4, maxY: 2.08 },
  { name: 'head', parent: 'chest', at: [0, 1.95, 0.03], tip: [0, 2.4, 0.03], radius: 0.15, minY: 1.9, maxAbsX: 0.2 },
  { name: 'jaw', parent: 'head', at: [0, 2.0, 0.1] },
  { name: 'cape', parent: 'chest', at: [0, 1.9, -0.18] },
  { name: 'upperArmL', parent: 'chest', at: [0.35, 1.8, 0], radius: 0.12, side: 'L', minAbsX: 0.3, minY: 1.55, rest: [0, 0, 23] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.5, 1.45, 0.02], radius: 0.11, side: 'L', minAbsX: 0.43, minY: 1.2 },
  { name: 'handL', parent: 'foreArmL', at: [0.55, 1.18, 0.04], tip: [0.55, 1.03, 0.06], radius: 0.09, side: 'L', minAbsX: 0.43, minY: 1.0 },
  { name: 'upperArmR', parent: 'chest', at: [-0.35, 1.8, 0], radius: 0.12, side: 'R', minAbsX: 0.3, minY: 1.55, rest: [0, 0, -23] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.5, 1.45, 0.02], radius: 0.11, side: 'R', minAbsX: 0.43, minY: 1.2 },
  { name: 'handR', parent: 'foreArmR', at: [-0.55, 1.18, 0.04], tip: [-0.55, 1.03, 0.06], radius: 0.09, side: 'R', minAbsX: 0.43, minY: 1.0 },
  { name: 'thighL', parent: 'hips', at: [0.17, 1.0, 0], radius: 0.15, side: 'L', maxY: 1.05 },
  { name: 'shinL', parent: 'thighL', at: [0.2, 0.55, 0], radius: 0.14, side: 'L', maxY: 0.65 },
  { name: 'footL', parent: 'shinL', at: [0.22, 0.1, 0], tip: [0.24, 0.02, 0.17], radius: 0.11, side: 'L', maxY: 0.2 },
  { name: 'thighR', parent: 'hips', at: [-0.17, 1.0, 0], radius: 0.15, side: 'R', maxY: 1.05 },
  { name: 'shinR', parent: 'thighR', at: [-0.2, 0.55, 0], radius: 0.14, side: 'R', maxY: 0.65 },
  { name: 'footR', parent: 'shinR', at: [-0.22, 0.1, 0], tip: [-0.24, 0.02, 0.17], radius: 0.11, side: 'R', maxY: 0.2 }
];
export const WINTER_KING_HIP_HEIGHT = 1.05;
