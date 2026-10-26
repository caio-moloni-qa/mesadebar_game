import * as THREE from 'three';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';
import { PALETTE } from '../materials';
import { humanoidClips, wraithFloatClip } from './clips';
import { ball, box, cone, cylinder, gem, part } from './parts';
import { BoneSpec, RigPart, RiggedModel, buildRiggedModel, clipForBones, humanoidBones } from './rig';
import { weaponGeometry } from './weapons';

const BONE = PALETTE.bone;
const BONE_DARK = PALETTE.boneDark;
const SOCKET = 0x1c1420;

/** A weapon geometry posed into a bone's space (bound rigidly like any other part). */
function boundWeapon(bone: string, id: 'sword' | 'staff', tilt: number, scale = 1): RigPart {
  const geometry = weaponGeometry(id);
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, -0.04, 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(scale, scale, scale)));
  return { bone, geometry };
}

function skeletonParts(armored: boolean): RigPart[] {
  const bone = armored ? 0xcfc4a6 : BONE;
  const metal = 0x6f6a62;
  const limb = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.08, 0.3, 0.08), bone, [0, -0.15, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.07, 0.28, 0.07), bone, [0, -0.14, 0]) },
    { bone: `hand${s}`, geometry: part(box(0.09, 0.09, 0.05), bone, [0, -0.03, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.09, 0.4, 0.09), bone, [0, -0.2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.08, 0.38, 0.08), bone, [0, -0.19, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.12, 0.06, 0.22), bone, [0, 0.03, 0.05]) }
  ];
  const parts: RigPart[] = [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(0.36, 0.12, 0.2), BONE_DARK, [0, 0, 0]) }, // pelvis
    { bone: 'spine', geometry: part(box(0.07, 0.3, 0.07), BONE_DARK, [0, 0.14, -0.04]) }, // spine column
    // Ribcage: three slats with gaps so it reads as bones, not a solid torso.
    ...[0, 1, 2].map((rib) => ({ bone: 'chest', geometry: part(box(0.44 - rib * 0.05, 0.06, 0.26), bone, [0, -0.04 + rib * 0.11, 0]) })),
    { bone: 'chest', geometry: part(box(0.5, 0.07, 0.22), bone, [0, 0.27, 0]) }, // collarbones
    { bone: 'head', geometry: part(box(0.06, 0.12, 0.06), BONE_DARK, [0, 0.04, 0]) },
    { bone: 'head', geometry: part(ball(0.21, 1), bone, [0, 0.26, 0]) }, // skull
    { bone: 'head', geometry: part(box(0.24, 0.08, 0.16), BONE_DARK, [0, 0.1, 0.06]) }, // jaw
    { bone: 'head', geometry: part(box(0.07, 0.07, 0.04), SOCKET, [0.07, 0.27, 0.19]) }, // eye sockets
    { bone: 'head', geometry: part(box(0.07, 0.07, 0.04), SOCKET, [-0.07, 0.27, 0.19]) },
    boundWeapon('handR', 'sword', 1.35, armored ? 1.5 : 1)
  ];
  if (armored) {
    parts.push(
      { bone: 'head', geometry: part(cylinder(0.24, 0.26, 0.22, 7), metal, [0, 0.36, 0]) }, // helmet
      { bone: 'head', geometry: part(box(0.06, 0.18, 0.06), 0x8a2a1e, [0, 0.52, 0]) }, // crest
      { bone: 'chest', geometry: part(box(0.3, 0.12, 0.34), metal, [0.33, 0.27, 0]) }, // pauldrons
      { bone: 'chest', geometry: part(box(0.3, 0.12, 0.34), metal, [-0.33, 0.27, 0]) },
      { bone: 'hips', geometry: part(box(0.42, 0.28, 0.26), 0x4a3a2e, [0, -0.1, 0]) } // tattered skirt
    );
  }
  return parts;
}

/** Hovering robed figure: robe skirt on its own bone so the float clip can sway it. */
function wraithBones(): BoneSpec[] {
  return [
    { name: 'root', offset: [0, 0, 0] },
    { name: 'hips', parent: 'root', offset: [0, 0.9, 0] },
    { name: 'skirt', parent: 'hips', offset: [0, 0, 0] },
    { name: 'spine', parent: 'hips', offset: [0, 0.12, 0] },
    { name: 'chest', parent: 'spine', offset: [0, 0.28, 0] },
    { name: 'head', parent: 'chest', offset: [0, 0.3, 0] },
    { name: 'upperArmL', parent: 'chest', offset: [0.28, 0.18, 0] },
    { name: 'foreArmL', parent: 'upperArmL', offset: [0, -0.3, 0] },
    { name: 'upperArmR', parent: 'chest', offset: [-0.28, 0.18, 0] },
    { name: 'foreArmR', parent: 'upperArmR', offset: [0, -0.3, 0] }
  ];
}

function wraithParts(robe: number, trim: number, eyes: number, withStaff: boolean): RigPart[] {
  const arm = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(cylinder(0.08, 0.11, 0.32, 5), robe, [0, -0.15, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.1, 0.14, 0.3, 5), robe, [0, -0.13, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.08, 0.12, 0.05), BONE, [0, -0.32, 0]) } // bony hand
  ];
  const parts: RigPart[] = [
    ...arm('L'),
    ...arm('R'),
    { bone: 'skirt', geometry: part(cylinder(0.22, 0.46, 0.85, 7), robe, [0, -0.38, 0]) },
    { bone: 'skirt', geometry: part(cylinder(0.47, 0.5, 0.08, 7), trim, [0, -0.78, 0]) },
    { bone: 'spine', geometry: part(cylinder(0.24, 0.24, 0.3, 7), robe, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(cylinder(0.3, 0.25, 0.4, 7), robe, [0, 0.1, 0]) },
    { bone: 'chest', geometry: part(box(0.12, 0.42, 0.04), trim, [0, 0.08, 0.27]) },
    { bone: 'head', geometry: part(cone(0.27, 0.6, 7), robe, [0, 0.3, -0.04]) }, // hood
    { bone: 'head', geometry: part(box(0.26, 0.24, 0.06), SOCKET, [0, 0.18, 0.15]) }, // dark face
    { bone: 'head', geometry: part(box(0.06, 0.05, 0.03), eyes, [0.06, 0.21, 0.19]) },
    { bone: 'head', geometry: part(box(0.06, 0.05, 0.03), eyes, [-0.06, 0.21, 0.19]) }
  ];
  if (withStaff) {
    parts.push(
      { bone: 'foreArmR', geometry: part(cylinder(0.03, 0.03, 1.5, 5), 0x3a2a30, [0, -0.2, 0.08]) },
      { bone: 'foreArmR', geometry: part(ball(0.11), BONE, [0, 0.58, 0.08]) }, // skull on the staff
      { bone: 'foreArmR', geometry: part(gem(0.07), eyes, [0, 0.72, 0.08]) }
    );
  }
  return parts;
}

export interface BakedEnemyModel {
  /** Rest geometry with `frames` absolute morph targets (positions + normals) sampled from the clip. */
  geometry: THREE.BufferGeometry;
  frames: number;
  /** Seconds per full cycle at the reference speed; the view scales it with the enemy's real speed. */
  cycleSeconds: number;
  hovers: boolean;
}

/** Samples `clip` at `frames` evenly spaced times and stores each pose as a morph target. Rigid skinning makes this
 *  exact: every vertex follows one bone, so pose = boneWorld × boneInverse × rest position (normals rotate alike). */
function bake(model: RiggedModel, clip: THREE.AnimationClip, frames: number): THREE.BufferGeometry {
  const { mesh, root } = model;
  const source = mesh.geometry;
  const rest = source.attributes.position as THREE.BufferAttribute;
  const restNormal = source.attributes.normal as THREE.BufferAttribute;
  const skinIndex = source.attributes.skinIndex as THREE.BufferAttribute;
  const skeleton = mesh.skeleton;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clipForBones(clip, model.bones)).play();
  const boneMatrices = skeleton.bones.map(() => new THREE.Matrix4());
  const normalMatrices = skeleton.bones.map(() => new THREE.Matrix3());
  const point = new THREE.Vector3();
  const positions: THREE.BufferAttribute[] = [];
  const normals: THREE.BufferAttribute[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    mixer.setTime((clip.duration * frame) / frames);
    root.updateMatrixWorld(true);
    skeleton.bones.forEach((bone, index) => {
      boneMatrices[index].multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[index]);
      normalMatrices[index].getNormalMatrix(boneMatrices[index]);
    });
    const framePositions = new Float32Array(rest.count * 3);
    const frameNormals = new Float32Array(rest.count * 3);
    for (let vertex = 0; vertex < rest.count; vertex += 1) {
      const bone = skinIndex.getX(vertex);
      point.fromBufferAttribute(rest, vertex).applyMatrix4(boneMatrices[bone]).toArray(framePositions, vertex * 3);
      point.fromBufferAttribute(restNormal, vertex).applyMatrix3(normalMatrices[bone]).normalize().toArray(frameNormals, vertex * 3);
    }
    positions.push(new THREE.Float32BufferAttribute(framePositions, 3));
    normals.push(new THREE.Float32BufferAttribute(frameNormals, 3));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);

  const baked = new THREE.BufferGeometry();
  baked.setAttribute('position', positions[0].clone());
  baked.setAttribute('normal', normals[0].clone());
  baked.setAttribute('color', source.attributes.color.clone());
  baked.morphAttributes.position = positions;
  baked.morphAttributes.normal = normals;
  baked.morphTargetsRelative = false;
  source.dispose();
  return baked;
}

/** Frames baked per cycle; the horde view blends the two around each enemy's phase. 12 keeps the smoothed run
 *  curve readable (8 cut corners) for 1.5× the morph texture. */
const WALK_FRAMES = 12;
const material = () => new THREE.MeshBasicMaterial();

/** Builds every enemy variant once: rig the procedural model, bake its cycle, keep only the baked geometry. */
export function createEnemyModels(): Record<EnemyVariantId, BakedEnemyModel> {
  const walk = humanoidClips(0.82).run;
  const float = wraithFloatClip();
  const humanoid = (armored: boolean): BakedEnemyModel => ({
    geometry: bake(buildRiggedModel(humanoidBones(), skeletonParts(armored), material()), walk, WALK_FRAMES),
    frames: WALK_FRAMES,
    cycleSeconds: walk.duration,
    hovers: false
  });
  const wraith = (robe: number, trim: number, eyes: number, staff: boolean): BakedEnemyModel => ({
    geometry: bake(buildRiggedModel(wraithBones(), wraithParts(robe, trim, eyes, staff), material()), float, WALK_FRAMES),
    frames: WALK_FRAMES,
    cycleSeconds: float.duration,
    hovers: true
  });
  const skeleton = humanoid(false);
  const superSkeleton = humanoid(true);
  return {
    skeleton,
    superSkeleton,
    necromancerWraith: wraith(0x4a2f6b, 0x9a6bd8, 0x7dff9a, true),
    apparitionWraith: wraith(0x8fd8f0, 0xe6fbff, 0xffffff, false),
    // The boss has no 3D model yet (it isn't spawned on the 3D page); the armored skeleton stands in.
    finalBoss: superSkeleton,
    // Drawn by their own rigged views; never instanced.
    gravedigger: superSkeleton,
    templeGuardian: superSkeleton,
    lakeSpirit: superSkeleton
  };
}
