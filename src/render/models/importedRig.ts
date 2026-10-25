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
