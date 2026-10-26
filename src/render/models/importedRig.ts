import * as THREE from 'three';
import { Vec3Tuple } from './parts';
import { RiggedModel } from './rig';

/** One joint of an imported mesh's rig, in model space (meters, feet on y = 0, facing +Z, character's left = +X).
 *  `tip` is where the bone ends when no child continues it (hand, foot, head). `radius` is the limb's thickness:
 *  a vertex goes to the bone whose capsule surface is nearest, so a fat torso beside a thin arm splits correctly. */
export interface JointSpec {
  name: string;
  parent?: string;
  at: Vec3Tuple;
  tip?: Vec3Tuple;
  radius?: number;
  /** Only skin vertices on this side (left = +X) — keeps the hand off the thigh beside it. */
  side?: 'L' | 'R';
  /** Only skin vertices inside this height band. */
  minY?: number;
  maxY?: number;
  /** Only skin vertices at least this far from the centre line (arms never take the chest). */
  minAbsX?: number;
  /** Bind rotation in degrees: the pose the mesh was modelled in, so a clip's rest pose reproduces it. */
  rest?: Vec3Tuple;
}

const SOFTNESS = 0.02;
const FALLOFF = 4;
const INFLUENCES = 4;

/** Auto-rig: builds the bones at the given joints and skins every vertex by distance to the bone capsules (inverse
 *  distance^4, top 4, normalised). Weights depend only on vertex position, so the copies of a vertex in the
 *  unindexed mesh always agree and the surface never tears. No Mixamo round trip: the clip set already written
 *  against these bone names drives the imported mesh. */
export function rigImportedMesh(geometry: THREE.BufferGeometry, joints: JointSpec[], material: THREE.Material): RiggedModel {
  const bones: Record<string, THREE.Bone> = {};
  const world = new Map<string, THREE.Vector3>(joints.map((joint) => [joint.name, new THREE.Vector3(...joint.at)]));
  const euler = new THREE.Euler();
  const ordered = joints.map((joint) => {
    const bone = new THREE.Bone();
    bone.name = joint.name;
    if (joint.rest) bone.quaternion.setFromEuler(euler.set(...joint.rest.map(THREE.MathUtils.degToRad) as Vec3Tuple));
    if (joint.parent) {
      const parent = bones[joint.parent];
      if (!parent) throw new Error(`rigImportedMesh: joint "${joint.name}" has unknown parent "${joint.parent}"`);
      parent.add(bone);
      parent.updateMatrixWorld(true);
      bone.position.copy(parent.worldToLocal(world.get(joint.name)!.clone()));
    } else {
      bone.position.copy(world.get(joint.name)!);
    }
    bone.updateMatrixWorld(true);
    bones[joint.name] = bone;
    return bone;
  });

  // Capsule per skinned joint: from the joint to its tip, or to its (first) child.
  const capsules = joints.flatMap((joint, index) => {
    if (joint.radius === undefined) return [];
    const child = joints.find((other) => other.parent === joint.name);
    const end = joint.tip ? new THREE.Vector3(...joint.tip) : child ? world.get(child.name)! : world.get(joint.name)!;
    return [{ joint, index, segment: new THREE.Line3(world.get(joint.name)!.clone(), end.clone()) }];
  });

  const position = geometry.attributes.position;
  const skinIndex = new Uint16Array(position.count * 4);
  const skinWeight = new Float32Array(position.count * 4);
  const point = new THREE.Vector3();
  const closest = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    point.fromBufferAttribute(position, vertex);
    const candidates = capsules.filter(({ joint }) => (
      (!joint.side || (joint.side === 'L' ? point.x > -0.02 : point.x < 0.02))
      && (joint.minY === undefined || point.y >= joint.minY)
      && (joint.maxY === undefined || point.y <= joint.maxY)
      && (joint.minAbsX === undefined || Math.abs(point.x) >= joint.minAbsX)
    ));
    const scored = (candidates.length ? candidates : capsules).map(({ joint, index, segment }) => {
      segment.closestPointToPoint(point, true, closest);
      const surface = Math.max(0, closest.distanceTo(point) - joint.radius!);
      return { index, weight: 1 / (surface + SOFTNESS) ** FALLOFF };
    }).sort((a, b) => b.weight - a.weight).slice(0, INFLUENCES);
    const total = scored.reduce((sum, { weight }) => sum + weight, 0);
    scored.forEach(({ index, weight }, slot) => {
      skinIndex[vertex * 4 + slot] = index;
      skinWeight[vertex * 4 + slot] = weight / total;
    });
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(ordered[0]);
  mesh.bind(new THREE.Skeleton(ordered));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bones };
}

/** Fabri's Tripo mesh (src/assets/3d/characters/fabri.glb, art-source/3d/fabri/): joints measured on the processed
 *  mesh. It's modelled in an A-pose, so the upper arms bind at the clips' rest angle plus the extra spread. */
export const FABRI_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.78, 0], radius: 0.22, minY: 0.55 },
  { name: 'spine', parent: 'hips', at: [0, 0.98, 0], radius: 0.26, minY: 0.8 },
  { name: 'chest', parent: 'spine', at: [0, 1.22, 0], radius: 0.24, minY: 1.0, maxY: 1.56 },
  { name: 'head', parent: 'chest', at: [0, 1.48, 0], tip: [0, 1.9, 0], radius: 0.18, minY: 1.4 },
  { name: 'upperArmL', parent: 'chest', at: [0.24, 1.37, -0.02], radius: 0.07, side: 'L', minAbsX: 0.18, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.36, 1.12, -0.02], radius: 0.07, side: 'L', minAbsX: 0.2 },
  { name: 'handL', parent: 'foreArmL', at: [0.46, 0.88, -0.02], tip: [0.49, 0.72, -0.02], radius: 0.07, side: 'L', minAbsX: 0.3 },
  { name: 'upperArmR', parent: 'chest', at: [-0.24, 1.37, -0.02], radius: 0.07, side: 'R', minAbsX: 0.18, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.36, 1.12, -0.02], radius: 0.07, side: 'R', minAbsX: 0.2 },
  { name: 'handR', parent: 'foreArmR', at: [-0.46, 0.88, -0.02], tip: [-0.49, 0.72, -0.02], radius: 0.07, side: 'R', minAbsX: 0.3 },
  { name: 'thighL', parent: 'hips', at: [0.15, 0.72, -0.03], radius: 0.1, side: 'L', maxY: 0.85 },
  { name: 'shinL', parent: 'thighL', at: [0.22, 0.41, -0.06], radius: 0.08, side: 'L', maxY: 0.6 },
  { name: 'footL', parent: 'shinL', at: [0.25, 0.14, -0.07], tip: [0.3, 0.04, 0.14], radius: 0.07, side: 'L', maxY: 0.3 },
  { name: 'thighR', parent: 'hips', at: [-0.15, 0.72, -0.03], radius: 0.1, side: 'R', maxY: 0.85 },
  { name: 'shinR', parent: 'thighR', at: [-0.22, 0.41, -0.06], radius: 0.08, side: 'R', maxY: 0.6 },
  { name: 'footR', parent: 'shinR', at: [-0.25, 0.14, -0.07], tip: [-0.3, 0.04, 0.14], radius: 0.07, side: 'R', maxY: 0.3 },
  // The Tripo mesh has no tail: the procedural one is attached to this bone (not skinned).
  { name: 'tail', parent: 'hips', at: [0, 0.8, -0.16] }
];

/** Hip height the clip set is authored against (its hips.position track) for the imported Fabri. */
export const FABRI_HIP_HEIGHT = 0.78;

/** The Barbarian's Tripo mesh (src/assets/3d/characters/barbarian.glb, art-source/3d/barbarian/): a broad A-pose
 *  figure with a fur mantle over the shoulders, so the chest capsule is wider and the arms start further out. */
export const BARBARIAN_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.85, 0], radius: 0.24, minY: 0.6 },
  { name: 'spine', parent: 'hips', at: [0, 1.05, 0], radius: 0.26, minY: 0.85 },
  { name: 'chest', parent: 'spine', at: [0, 1.3, 0], radius: 0.3, minY: 1.1, maxY: 1.72 },
  { name: 'head', parent: 'chest', at: [0, 1.65, 0], tip: [0, 1.95, 0], radius: 0.16, minY: 1.6 },
  { name: 'upperArmL', parent: 'chest', at: [0.33, 1.45, -0.02], radius: 0.09, side: 'L', minAbsX: 0.26, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.47, 1.18, 0], radius: 0.08, side: 'L', minAbsX: 0.3 },
  { name: 'handL', parent: 'foreArmL', at: [0.53, 0.92, 0.06], tip: [0.55, 0.79, 0.07], radius: 0.07, side: 'L', minAbsX: 0.4 },
  { name: 'upperArmR', parent: 'chest', at: [-0.33, 1.45, -0.02], radius: 0.09, side: 'R', minAbsX: 0.26, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.47, 1.18, 0], radius: 0.08, side: 'R', minAbsX: 0.3 },
  { name: 'handR', parent: 'foreArmR', at: [-0.53, 0.92, 0.06], tip: [-0.55, 0.79, 0.07], radius: 0.07, side: 'R', minAbsX: 0.4 },
  { name: 'thighL', parent: 'hips', at: [0.14, 0.8, -0.02], radius: 0.12, side: 'L', maxY: 0.95 },
  { name: 'shinL', parent: 'thighL', at: [0.19, 0.45, -0.03], radius: 0.1, side: 'L', maxY: 0.65 },
  { name: 'footL', parent: 'shinL', at: [0.23, 0.15, -0.03], tip: [0.27, 0.03, 0.16], radius: 0.08, side: 'L', maxY: 0.3 },
  { name: 'thighR', parent: 'hips', at: [-0.14, 0.8, -0.02], radius: 0.12, side: 'R', maxY: 0.95 },
  { name: 'shinR', parent: 'thighR', at: [-0.19, 0.45, -0.03], radius: 0.1, side: 'R', maxY: 0.65 },
  { name: 'footR', parent: 'shinR', at: [-0.23, 0.15, -0.03], tip: [-0.27, 0.03, 0.16], radius: 0.08, side: 'R', maxY: 0.3 }
];

export const BARBARIAN_HIP_HEIGHT = 0.85;

/** The Mage's Tripo mesh (src/assets/3d/characters/mage.glb, art-source/3d/mage/): hooded, with a coat skirt down to
 *  the knees. The skirt sits between the thighs and the hips, so it blends between the two and stretches with the
 *  stride instead of tearing. */
export const MAGE_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.82, 0], radius: 0.3, minY: 0.45 },
  { name: 'spine', parent: 'hips', at: [0, 1.0, 0], radius: 0.24, minY: 0.75 },
  { name: 'chest', parent: 'spine', at: [0, 1.2, 0], radius: 0.26, minY: 1.0, maxY: 1.55 },
  { name: 'head', parent: 'chest', at: [0, 1.47, 0], tip: [0, 1.86, 0], radius: 0.18, minY: 1.42 },
  { name: 'upperArmL', parent: 'chest', at: [0.26, 1.36, -0.02], radius: 0.08, side: 'L', minAbsX: 0.22, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.43, 1.1, 0], radius: 0.08, side: 'L', minAbsX: 0.28 },
  { name: 'handL', parent: 'foreArmL', at: [0.52, 0.88, 0.03], tip: [0.56, 0.74, 0.02], radius: 0.06, side: 'L', minAbsX: 0.4 },
  { name: 'upperArmR', parent: 'chest', at: [-0.26, 1.36, -0.02], radius: 0.08, side: 'R', minAbsX: 0.22, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.43, 1.1, 0], radius: 0.08, side: 'R', minAbsX: 0.28 },
  { name: 'handR', parent: 'foreArmR', at: [-0.52, 0.88, 0.03], tip: [-0.56, 0.74, 0.02], radius: 0.06, side: 'R', minAbsX: 0.4 },
  { name: 'thighL', parent: 'hips', at: [0.12, 0.78, 0], radius: 0.1, side: 'L', maxY: 0.9 },
  { name: 'shinL', parent: 'thighL', at: [0.17, 0.44, 0], radius: 0.08, side: 'L', maxY: 0.6 },
  { name: 'footL', parent: 'shinL', at: [0.21, 0.15, -0.02], tip: [0.26, 0.03, 0.16], radius: 0.07, side: 'L', maxY: 0.3 },
  { name: 'thighR', parent: 'hips', at: [-0.12, 0.78, 0], radius: 0.1, side: 'R', maxY: 0.9 },
  { name: 'shinR', parent: 'thighR', at: [-0.17, 0.44, 0], radius: 0.08, side: 'R', maxY: 0.6 },
  { name: 'footR', parent: 'shinR', at: [-0.21, 0.15, -0.02], tip: [-0.26, 0.03, 0.16], radius: 0.07, side: 'R', maxY: 0.3 }
];

export const MAGE_HIP_HEIGHT = 0.82;

/** The Relíquia's Tripo mesh (src/assets/3d/characters/reliquia.glb, art-source/3d/reliquia/): the cloak hangs down
 *  the back to mid-thigh and stays with the hips (it's closer to the hips capsule than to the thighs). */
export const RELIQUIA_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.85, 0], radius: 0.23, minY: 0.6 },
  { name: 'spine', parent: 'hips', at: [0, 1.05, 0], radius: 0.25, minY: 0.85 },
  { name: 'chest', parent: 'spine', at: [0, 1.28, 0], radius: 0.26, minY: 1.05, maxY: 1.66 },
  { name: 'head', parent: 'chest', at: [0, 1.58, 0], tip: [0, 1.92, 0], radius: 0.16, minY: 1.52 },
  { name: 'upperArmL', parent: 'chest', at: [0.3, 1.38, -0.01], radius: 0.08, side: 'L', minAbsX: 0.24, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.45, 1.1, 0], radius: 0.08, side: 'L', minAbsX: 0.3 },
  { name: 'handL', parent: 'foreArmL', at: [0.52, 0.9, 0.04], tip: [0.56, 0.76, 0.02], radius: 0.06, side: 'L', minAbsX: 0.42 },
  { name: 'upperArmR', parent: 'chest', at: [-0.3, 1.38, -0.01], radius: 0.08, side: 'R', minAbsX: 0.24, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.45, 1.1, 0], radius: 0.08, side: 'R', minAbsX: 0.3 },
  { name: 'handR', parent: 'foreArmR', at: [-0.52, 0.9, 0.04], tip: [-0.56, 0.76, 0.02], radius: 0.06, side: 'R', minAbsX: 0.42 },
  { name: 'thighL', parent: 'hips', at: [0.13, 0.8, -0.02], radius: 0.12, side: 'L', maxY: 0.95 },
  { name: 'shinL', parent: 'thighL', at: [0.21, 0.44, -0.04], radius: 0.1, side: 'L', maxY: 0.62 },
  { name: 'footL', parent: 'shinL', at: [0.25, 0.16, -0.02], tip: [0.28, 0.03, 0.15], radius: 0.08, side: 'L', maxY: 0.3 },
  { name: 'thighR', parent: 'hips', at: [-0.13, 0.8, -0.02], radius: 0.12, side: 'R', maxY: 0.95 },
  { name: 'shinR', parent: 'thighR', at: [-0.21, 0.44, -0.04], radius: 0.1, side: 'R', maxY: 0.62 },
  { name: 'footR', parent: 'shinR', at: [-0.25, 0.16, -0.02], tip: [-0.28, 0.03, 0.15], radius: 0.08, side: 'R', maxY: 0.3 }
];

export const RELIQUIA_HIP_HEIGHT = 0.85;

/** Brom's Tripo mesh (src/assets/3d/characters/brom.glb, art-source/3d/brom/): a 1.45 m dwarf in a long coat with a
 *  braided beard down to the belt. Short legs in a wide stance; the beard below the chin stays with the chest. */
export const BROM_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.55, 0], radius: 0.26, minY: 0.3 },
  { name: 'spine', parent: 'hips', at: [0, 0.7, 0], radius: 0.28, minY: 0.55 },
  { name: 'chest', parent: 'spine', at: [0, 0.88, 0], radius: 0.3, minY: 0.72, maxY: 1.15 },
  { name: 'head', parent: 'chest', at: [0, 1.08, 0], tip: [0, 1.45, 0], radius: 0.18, minY: 1.02 },
  { name: 'upperArmL', parent: 'chest', at: [0.34, 0.97, 0], radius: 0.09, side: 'L', minAbsX: 0.28, maxY: 1.05, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.42, 0.75, 0.02], radius: 0.08, side: 'L', minAbsX: 0.33 },
  { name: 'handL', parent: 'foreArmL', at: [0.45, 0.62, 0.03], tip: [0.46, 0.48, 0.03], radius: 0.06, side: 'L', minAbsX: 0.38 },
  { name: 'upperArmR', parent: 'chest', at: [-0.34, 0.97, 0], radius: 0.09, side: 'R', minAbsX: 0.28, maxY: 1.05, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.42, 0.75, 0.02], radius: 0.08, side: 'R', minAbsX: 0.33 },
  { name: 'handR', parent: 'foreArmR', at: [-0.45, 0.62, 0.03], tip: [-0.46, 0.48, 0.03], radius: 0.06, side: 'R', minAbsX: 0.38 },
  { name: 'thighL', parent: 'hips', at: [0.13, 0.5, 0], radius: 0.12, side: 'L', maxY: 0.62 },
  { name: 'shinL', parent: 'thighL', at: [0.2, 0.27, 0], radius: 0.1, side: 'L', maxY: 0.4 },
  { name: 'footL', parent: 'shinL', at: [0.25, 0.09, 0], tip: [0.27, 0.02, 0.17], radius: 0.08, side: 'L', maxY: 0.18 },
  { name: 'thighR', parent: 'hips', at: [-0.13, 0.5, 0], radius: 0.12, side: 'R', maxY: 0.62 },
  { name: 'shinR', parent: 'thighR', at: [-0.2, 0.27, 0], radius: 0.1, side: 'R', maxY: 0.4 },
  { name: 'footR', parent: 'shinR', at: [-0.25, 0.09, 0], tip: [-0.27, 0.02, 0.17], radius: 0.08, side: 'R', maxY: 0.18 }
];

export const BROM_HIP_HEIGHT = 0.55;

/** Lyra's Tripo mesh (src/assets/3d/characters/lyra.glb, art-source/3d/lyra/): a tall elf archer with a cloak to the
 *  shins and a quiver over the shoulder. The cloak's back panel stays with the hips, like the Mage's coat. */
export const LYRA_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.92, 0], radius: 0.28, minY: 0.45 },
  { name: 'spine', parent: 'hips', at: [0, 1.1, 0], radius: 0.24, minY: 0.9 },
  { name: 'chest', parent: 'spine', at: [0, 1.3, 0], radius: 0.24, minY: 1.08, maxY: 1.6 },
  { name: 'head', parent: 'chest', at: [0, 1.56, 0], tip: [0, 1.9, 0], radius: 0.17, minY: 1.5 },
  { name: 'upperArmL', parent: 'chest', at: [0.22, 1.45, 0], radius: 0.07, side: 'L', minAbsX: 0.2, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.34, 1.15, 0], radius: 0.07, side: 'L', minAbsX: 0.26 },
  { name: 'handL', parent: 'foreArmL', at: [0.4, 0.98, 0.02], tip: [0.42, 0.85, 0.02], radius: 0.06, side: 'L', minAbsX: 0.33 },
  { name: 'upperArmR', parent: 'chest', at: [-0.22, 1.45, 0], radius: 0.07, side: 'R', minAbsX: 0.2, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.34, 1.15, 0], radius: 0.07, side: 'R', minAbsX: 0.26 },
  { name: 'handR', parent: 'foreArmR', at: [-0.4, 0.98, 0.02], tip: [-0.42, 0.85, 0.02], radius: 0.06, side: 'R', minAbsX: 0.33 },
  { name: 'thighL', parent: 'hips', at: [0.1, 0.86, 0], radius: 0.1, side: 'L', maxY: 0.98 },
  { name: 'shinL', parent: 'thighL', at: [0.12, 0.48, -0.02], radius: 0.08, side: 'L', maxY: 0.62 },
  { name: 'footL', parent: 'shinL', at: [0.13, 0.12, -0.02], tip: [0.15, 0.03, 0.16], radius: 0.07, side: 'L', maxY: 0.26 },
  { name: 'thighR', parent: 'hips', at: [-0.1, 0.86, 0], radius: 0.1, side: 'R', maxY: 0.98 },
  { name: 'shinR', parent: 'thighR', at: [-0.12, 0.48, -0.02], radius: 0.08, side: 'R', maxY: 0.62 },
  { name: 'footR', parent: 'shinR', at: [-0.13, 0.12, -0.02], tip: [-0.15, 0.03, 0.16], radius: 0.07, side: 'R', maxY: 0.26 }
];

export const LYRA_HIP_HEIGHT = 0.92;

/** Grimbo's Tripo mesh (src/assets/3d/characters/grimbo.glb, art-source/3d/grimbo/): a 1.25 m goblin with a top hat
 *  and long ears. The arms stop below the ears (maxY) so the ear tips stay with the head. */
export const GRIMBO_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.45, 0], radius: 0.18, minY: 0.3 },
  { name: 'spine', parent: 'hips', at: [0, 0.55, 0], radius: 0.18, minY: 0.42 },
  { name: 'chest', parent: 'spine', at: [0, 0.68, 0], radius: 0.18, minY: 0.55, maxY: 0.88 },
  { name: 'head', parent: 'chest', at: [0, 0.86, 0.02], tip: [0, 1.25, 0], radius: 0.2, minY: 0.82 },
  { name: 'upperArmL', parent: 'chest', at: [0.2, 0.8, 0], radius: 0.07, side: 'L', minAbsX: 0.17, maxY: 0.86, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.27, 0.62, 0], radius: 0.06, side: 'L', minAbsX: 0.21 },
  { name: 'handL', parent: 'foreArmL', at: [0.32, 0.45, 0.01], tip: [0.34, 0.36, 0.01], radius: 0.05, side: 'L', minAbsX: 0.26 },
  { name: 'upperArmR', parent: 'chest', at: [-0.2, 0.8, 0], radius: 0.07, side: 'R', minAbsX: 0.17, maxY: 0.86, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.27, 0.62, 0], radius: 0.06, side: 'R', minAbsX: 0.21 },
  { name: 'handR', parent: 'foreArmR', at: [-0.32, 0.45, 0.01], tip: [-0.34, 0.36, 0.01], radius: 0.05, side: 'R', minAbsX: 0.26 },
  { name: 'thighL', parent: 'hips', at: [0.1, 0.42, 0], radius: 0.09, side: 'L', maxY: 0.5 },
  { name: 'shinL', parent: 'thighL', at: [0.15, 0.24, 0], radius: 0.07, side: 'L', maxY: 0.32 },
  { name: 'footL', parent: 'shinL', at: [0.19, 0.07, 0], tip: [0.21, 0.01, 0.15], radius: 0.06, side: 'L', maxY: 0.13 },
  { name: 'thighR', parent: 'hips', at: [-0.1, 0.42, 0], radius: 0.09, side: 'R', maxY: 0.5 },
  { name: 'shinR', parent: 'thighR', at: [-0.15, 0.24, 0], radius: 0.07, side: 'R', maxY: 0.32 },
  { name: 'footR', parent: 'shinR', at: [-0.19, 0.07, 0], tip: [-0.21, 0.01, 0.15], radius: 0.06, side: 'R', maxY: 0.13 }
];

export const GRIMBO_HIP_HEIGHT = 0.45;

/** Zora's Tripo mesh (src/assets/3d/characters/zora.glb, art-source/3d/zora/): a long dress to the ankles and a
 *  headscarf down the back. The hem follows the shins (it swings with the stride); the scarf stays with the chest. */
export const ZORA_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.9, 0.05], radius: 0.3, minY: 0.3 },
  { name: 'spine', parent: 'hips', at: [0, 1.08, 0.05], radius: 0.24, minY: 0.88 },
  { name: 'chest', parent: 'spine', at: [0, 1.28, 0.05], radius: 0.24, minY: 1.0, maxY: 1.55 },
  { name: 'head', parent: 'chest', at: [0, 1.5, 0.05], tip: [0, 1.8, 0.05], radius: 0.16, minY: 1.45 },
  { name: 'upperArmL', parent: 'chest', at: [0.24, 1.38, 0.08], radius: 0.08, side: 'L', minAbsX: 0.2, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.38, 1.15, 0.1], radius: 0.08, side: 'L', minAbsX: 0.28 },
  { name: 'handL', parent: 'foreArmL', at: [0.42, 0.95, 0.15], tip: [0.45, 0.8, 0.18], radius: 0.06, side: 'L', minAbsX: 0.36 },
  { name: 'upperArmR', parent: 'chest', at: [-0.24, 1.38, 0.08], radius: 0.08, side: 'R', minAbsX: 0.2, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.38, 1.15, 0.1], radius: 0.08, side: 'R', minAbsX: 0.28 },
  { name: 'handR', parent: 'foreArmR', at: [-0.42, 0.95, 0.15], tip: [-0.45, 0.8, 0.18], radius: 0.06, side: 'R', minAbsX: 0.36 },
  { name: 'thighL', parent: 'hips', at: [0.1, 0.85, 0.05], radius: 0.1, side: 'L', maxY: 0.95 },
  { name: 'shinL', parent: 'thighL', at: [0.15, 0.48, 0.05], radius: 0.09, side: 'L', maxY: 0.6 },
  { name: 'footL', parent: 'shinL', at: [0.18, 0.1, 0.05], tip: [0.2, 0.02, 0.2], radius: 0.07, side: 'L', maxY: 0.2 },
  { name: 'thighR', parent: 'hips', at: [-0.1, 0.85, 0.05], radius: 0.1, side: 'R', maxY: 0.95 },
  { name: 'shinR', parent: 'thighR', at: [-0.15, 0.48, 0.05], radius: 0.09, side: 'R', maxY: 0.6 },
  { name: 'footR', parent: 'shinR', at: [-0.18, 0.1, 0.05], tip: [-0.2, 0.02, 0.2], radius: 0.07, side: 'R', maxY: 0.2 }
];

export const ZORA_HIP_HEIGHT = 0.9;

/** Sergio's Tripo mesh (src/assets/3d/characters/sergio.glb, art-source/3d/sergio/): robed, with a big pack on his
 *  back, so the body sits forward of the mesh centre (z ≈ 0.15) and the pack, far behind the arms, stays with the
 *  chest. Wide sleeves and a wide stance. */
export const SERGIO_JOINTS: JointSpec[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'hips', parent: 'root', at: [0, 0.85, 0.12], radius: 0.3, minY: 0.45 },
  { name: 'spine', parent: 'hips', at: [0, 1.05, 0.15], radius: 0.3, minY: 0.82 },
  { name: 'chest', parent: 'spine', at: [0, 1.28, 0.15], radius: 0.32, minY: 1.05, maxY: 1.75 },
  { name: 'head', parent: 'chest', at: [0, 1.5, 0.17], tip: [0, 1.9, 0.17], radius: 0.2, minY: 1.45 },
  { name: 'upperArmL', parent: 'chest', at: [0.33, 1.42, 0.15], radius: 0.1, side: 'L', minAbsX: 0.3, rest: [0, 0, 10] },
  { name: 'foreArmL', parent: 'upperArmL', at: [0.5, 1.12, 0.18], radius: 0.1, side: 'L', minAbsX: 0.38 },
  { name: 'handL', parent: 'foreArmL', at: [0.57, 0.95, 0.2], tip: [0.6, 0.78, 0.2], radius: 0.07, side: 'L', minAbsX: 0.46 },
  { name: 'upperArmR', parent: 'chest', at: [-0.33, 1.42, 0.15], radius: 0.1, side: 'R', minAbsX: 0.3, rest: [0, 0, -10] },
  { name: 'foreArmR', parent: 'upperArmR', at: [-0.5, 1.12, 0.18], radius: 0.1, side: 'R', minAbsX: 0.38 },
  { name: 'handR', parent: 'foreArmR', at: [-0.57, 0.95, 0.2], tip: [-0.6, 0.78, 0.2], radius: 0.07, side: 'R', minAbsX: 0.46 },
  { name: 'thighL', parent: 'hips', at: [0.14, 0.8, 0.12], radius: 0.12, side: 'L', maxY: 0.95 },
  { name: 'shinL', parent: 'thighL', at: [0.2, 0.45, 0.12], radius: 0.1, side: 'L', maxY: 0.62 },
  { name: 'footL', parent: 'shinL', at: [0.25, 0.13, 0.12], tip: [0.27, 0.03, 0.34], radius: 0.09, side: 'L', maxY: 0.3 },
  { name: 'thighR', parent: 'hips', at: [-0.14, 0.8, 0.12], radius: 0.12, side: 'R', maxY: 0.95 },
  { name: 'shinR', parent: 'thighR', at: [-0.2, 0.45, 0.12], radius: 0.1, side: 'R', maxY: 0.62 },
  { name: 'footR', parent: 'shinR', at: [-0.25, 0.13, 0.12], tip: [-0.27, 0.03, 0.34], radius: 0.09, side: 'R', maxY: 0.3 }
];

export const SERGIO_HIP_HEIGHT = 0.85;
