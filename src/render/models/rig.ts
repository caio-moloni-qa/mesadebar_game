import * as THREE from 'three';
import { Vec3Tuple, mergeParts } from './parts';

/** A bone in rest pose: its offset is relative to its parent (the root bone's is relative to the model origin). */
export interface BoneSpec {
  name: string;
  parent?: string;
  offset: Vec3Tuple;
}

/** Geometry modelled in the bone's own space (origin = the joint), rigidly bound to that bone. */
export interface RigPart {
  bone: string;
  geometry: THREE.BufferGeometry;
}

export interface RiggedModel {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
}

/** Builds a SkinnedMesh with rigid skinning: every vertex follows exactly one bone (weight 1). That's the
 *  low-poly "segmented puppet" look, and it is the same structure a glTF from Blender gives us — so the views,
 *  mixers and clips written against this keep working when real models replace the procedural ones. */
export function buildRiggedModel(boneSpecs: BoneSpec[], parts: RigPart[], material: THREE.Material): RiggedModel {
  const bones: Record<string, THREE.Bone> = {};
  const ordered = boneSpecs.map((spec) => {
    const bone = new THREE.Bone();
    bone.name = spec.name;
    bone.position.set(...spec.offset);
    bones[spec.name] = bone;
    return bone;
  });
  boneSpecs.forEach((spec) => {
    if (!spec.parent) return;
    const parent = bones[spec.parent];
    if (!parent) throw new Error(`buildRiggedModel: bone "${spec.name}" has unknown parent "${spec.parent}"`);
    parent.add(bones[spec.name]);
  });
  const rootBone = ordered[0];
  rootBone.updateMatrixWorld(true);

  const boneIndex = new Map(ordered.map((bone, index) => [bone.name, index]));
  const posed = parts.map(({ bone, geometry }) => {
    const index = boneIndex.get(bone);
    if (index === undefined) throw new Error(`buildRiggedModel: part bound to unknown bone "${bone}"`);
    geometry.applyMatrix4(bones[bone].matrixWorld);
    const count = geometry.attributes.position.count;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex += 1) {
      skinIndex[vertex * 4] = index;
      skinWeight[vertex * 4] = 1;
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return geometry;
  });

  const mesh = new THREE.SkinnedMesh(mergeParts(posed), material);
  mesh.add(rootBone);
  mesh.bind(new THREE.Skeleton(ordered));
  mesh.castShadow = true;
  // A SkinnedMesh's bounding sphere is computed once in rest pose; animated limbs leave it (threejs-animation).
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bones };
}

/** Humanoid skeleton shared by heroes, skeletons and the merchant — chunky proportions (big head, short legs) so a
 *  ~2 m figure still reads at 32 px tall from the high camera. Bone names follow the common Mixamo-style pattern,
 *  minus the prefix, so a future glTF rig can reuse every clip. */
export function humanoidBones({ hipHeight = 0.82, shoulderWidth = 0.32, armLength = 0.3, legLength = 0.4, withTail = false }: { hipHeight?: number; shoulderWidth?: number; armLength?: number; legLength?: number; withTail?: boolean } = {}): BoneSpec[] {
  const bones: BoneSpec[] = [
    { name: 'root', offset: [0, 0, 0] },
    { name: 'hips', parent: 'root', offset: [0, hipHeight, 0] },
    { name: 'spine', parent: 'hips', offset: [0, 0.12, 0] },
    { name: 'chest', parent: 'spine', offset: [0, 0.28, 0] },
    { name: 'head', parent: 'chest', offset: [0, 0.3, 0] },
    { name: 'upperArmL', parent: 'chest', offset: [shoulderWidth, 0.2, 0] },
    { name: 'foreArmL', parent: 'upperArmL', offset: [0, -armLength, 0] },
    { name: 'handL', parent: 'foreArmL', offset: [0, -armLength * 0.9, 0] },
    { name: 'upperArmR', parent: 'chest', offset: [-shoulderWidth, 0.2, 0] },
    { name: 'foreArmR', parent: 'upperArmR', offset: [0, -armLength, 0] },
    { name: 'handR', parent: 'foreArmR', offset: [0, -armLength * 0.9, 0] },
    { name: 'thighL', parent: 'hips', offset: [0.14, -0.04, 0] },
    { name: 'shinL', parent: 'thighL', offset: [0, -legLength, 0] },
    { name: 'footL', parent: 'shinL', offset: [0, -legLength * 0.95, 0] },
    { name: 'thighR', parent: 'hips', offset: [-0.14, -0.04, 0] },
    { name: 'shinR', parent: 'thighR', offset: [0, -legLength, 0] },
    { name: 'footR', parent: 'shinR', offset: [0, -legLength * 0.95, 0] }
  ];
  if (withTail) bones.push({ name: 'tail', parent: 'hips', offset: [0, 0.05, -0.16] });
  return bones;
}

/** Copy of `clip` with only the tracks whose bone exists in `bones` — shared clip sets cover every rig (e.g. the
 *  tail), and binding a track to a missing bone makes PropertyBinding warn. */
export function clipForBones(clip: THREE.AnimationClip, bones: Record<string, THREE.Bone>): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => track.name.split('.')[0] in bones);
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/** toNonIndexed() warns when the geometry already is (polyhedra are); this only converts when needed. */
export function nonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}
