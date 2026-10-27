import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { JointSpec } from './importedRig';

/** Imported boss and guardian meshes (art-source/3d/<id> → tools/asset-pipeline → src/assets/3d/bosses). One static
 *  URL literal per asset so Vite rewrites it with the base path. Any that fails to load keeps its procedural model. */
export type ImportedBossId = 'necromancer' | 'gravedigger' | 'templeGuardian' | 'lakeSpirit';

const BOSS_MESH_URLS: Record<ImportedBossId, string> = {
  necromancer: new URL('../../assets/3d/bosses/necromancer.glb', import.meta.url).href,
  gravedigger: new URL('../../assets/3d/bosses/gravedigger.glb', import.meta.url).href,
  templeGuardian: new URL('../../assets/3d/bosses/temple-guardian.glb', import.meta.url).href,
  lakeSpirit: new URL('../../assets/3d/bosses/lake-spirit.glb', import.meta.url).href
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
