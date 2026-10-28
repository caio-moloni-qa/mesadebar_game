import * as THREE from 'three';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';
import { PALETTE } from '../materials';
import { hiveSwayClip, humanoidClips, mimicChompClip, quadrupedTrotClip, wraithFloatClip } from './clips';
import { ball, box, cone, cylinder, gem, part } from './parts';
import { BoneSpec, RigPart, RiggedModel, buildRiggedModel, clipForBones, humanoidBones, quadrupedBones } from './rig';
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

/** Javali: a low, heavy wedge (big shoulders, small rump) under a bristling dark mane, a long snout with white
 *  tusks curling up, short legs on dark hooves. ~330 triangles, four tones of brown plus the details. */
const BOAR = { coat: 0x5c3f2c, shade: 0x45301f, light: 0x7a5a40, mane: 0x2a1c14, snout: 0x9a7262, hoof: 0x211812, tusk: 0xf2ead6, eye: 0x140b08 };
function boarParts(): RigPart[] {
  const leg = (name: string, shin: number): RigPart[] => [
    { bone: `leg${name}`, geometry: part(box(0.12, 0.24, 0.13), BOAR.shade, [0, -0.1, 0]) },
    { bone: `shin${name}`, geometry: part(box(0.08, shin, 0.09), BOAR.shade, [0, -shin / 2, 0]) },
    { bone: `shin${name}`, geometry: part(box(0.1, 0.05, 0.12), BOAR.hoof, [0, -shin + 0.02, 0.01]) }
  ];
  return [
    ...leg('FL', 0.26), ...leg('FR', 0.26), ...leg('BL', 0.22), ...leg('BR', 0.22),
    // Rump and belly.
    { bone: 'hips', geometry: part(box(0.4, 0.36, 0.42), BOAR.coat, [0, 0.02, 0.06]) },
    { bone: 'hips', geometry: part(box(0.3, 0.1, 0.5), BOAR.shade, [0, -0.17, 0.2]) },
    // The shoulders: the widest, tallest part, so the silhouette leans forward.
    { bone: 'chest', geometry: part(box(0.48, 0.46, 0.46), BOAR.coat, [0, 0.04, -0.12]) },
    { bone: 'chest', geometry: part(box(0.5, 0.14, 0.36), BOAR.light, [0, -0.12, -0.08]) },
    // Mane: a ridge of dark bristles from the neck down the back.
    { bone: 'chest', geometry: part(box(0.16, 0.12, 0.5), BOAR.mane, [0, 0.31, -0.14]) },
    ...[0, 1, 2].map((tuft) => ({ bone: 'chest', geometry: part(cone(0.07, 0.16, 4), BOAR.mane, [0, 0.4, 0.02 - tuft * 0.15], [-0.5, 0, 0]) })),
    { bone: 'hips', geometry: part(box(0.12, 0.08, 0.3), BOAR.mane, [0, 0.22, 0.12]) },
    // Head: a wedge ending in the snout, tusks up, ears back.
    { bone: 'head', geometry: part(box(0.3, 0.28, 0.3), BOAR.coat, [0, -0.02, 0.06]) },
    { bone: 'head', geometry: part(cylinder(0.08, 0.11, 0.2, 6), BOAR.snout, [0, -0.07, 0.28], [Math.PI / 2, 0, 0]) },
    { bone: 'head', geometry: part(cylinder(0.085, 0.085, 0.03, 6), BOAR.shade, [0, -0.07, 0.38], [Math.PI / 2, 0, 0]) },
    { bone: 'head', geometry: part(cone(0.025, 0.14, 4), BOAR.tusk, [0.1, -0.05, 0.3], [-0.5, 0, -0.35]) },
    { bone: 'head', geometry: part(cone(0.025, 0.14, 4), BOAR.tusk, [-0.1, -0.05, 0.3], [-0.5, 0, 0.35]) },
    { bone: 'head', geometry: part(cone(0.06, 0.13, 4), BOAR.shade, [0.11, 0.15, -0.02], [-0.6, 0, -0.3]) },
    { bone: 'head', geometry: part(cone(0.06, 0.13, 4), BOAR.shade, [-0.11, 0.15, -0.02], [-0.6, 0, 0.3]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), BOAR.eye, [0.12, 0.05, 0.18]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), BOAR.eye, [-0.12, 0.05, 0.18]) },
    { bone: 'tail', geometry: part(cylinder(0.015, 0.025, 0.16, 4), BOAR.shade, [0, -0.06, -0.02], [0.5, 0, 0]) }
  ];
}

/** Cervo: tall and slim on long legs, a pale belly and rump, a short upturned tail; the stag carries branching
 *  antlers. Bones: quadrupedBones with a high hip and a long neck reach. */
const DEER = { coat: 0x9a6a3e, shade: 0x7a5230, light: 0xe6d3b4, hoof: 0x2a1d14, nose: 0x1e1410, antler: 0xd9c49a, eye: 0x120a06 };
function deerParts(antlers: boolean): RigPart[] {
  const leg = (name: string, thigh: number, shin: number): RigPart[] => [
    { bone: `leg${name}`, geometry: part(box(0.1, thigh, 0.12), DEER.coat, [0, -thigh / 2 + 0.03, 0]) },
    { bone: `shin${name}`, geometry: part(box(0.06, shin, 0.06), DEER.shade, [0, -shin / 2, 0]) },
    { bone: `shin${name}`, geometry: part(box(0.07, 0.05, 0.08), DEER.hoof, [0, -shin + 0.02, 0.01]) }
  ];
  const tine = (side: 1 | -1, height: number, lean: number, length: number): RigPart => ({
    bone: 'head', geometry: part(cylinder(0.022, 0.034, length, 4), DEER.antler, [side * (0.08 + lean * 0.12), 0.22 + height + length / 2, 0.0], [0, 0, -side * lean])
  });
  return [
    ...leg('FL', 0.3, 0.36), ...leg('FR', 0.3, 0.36), ...leg('BL', 0.34, 0.34), ...leg('BR', 0.34, 0.34),
    { bone: 'hips', geometry: part(box(0.3, 0.3, 0.4), DEER.coat, [0, 0, 0.1]) },
    // The white rump patch and the tail flag.
    { bone: 'hips', geometry: part(box(0.24, 0.2, 0.05), DEER.light, [0, 0.02, -0.11]) },
    { bone: 'tail', geometry: part(box(0.08, 0.14, 0.04), DEER.light, [0, 0.0, -0.01], [0.5, 0, 0]) },
    { bone: 'chest', geometry: part(box(0.32, 0.34, 0.4), DEER.coat, [0, 0.02, -0.08]) },
    { bone: 'chest', geometry: part(box(0.26, 0.08, 0.62), DEER.light, [0, -0.16, -0.22]) },
    // The neck rises from the chest to the head.
    { bone: 'chest', geometry: part(box(0.14, 0.4, 0.16), DEER.coat, [0, 0.26, 0.12], [0.45, 0, 0]) },
    { bone: 'head', geometry: part(box(0.16, 0.16, 0.2), DEER.coat, [0, 0.12, 0.02]) },
    { bone: 'head', geometry: part(box(0.1, 0.1, 0.16), DEER.shade, [0, 0.08, 0.17]) },
    { bone: 'head', geometry: part(box(0.06, 0.05, 0.04), DEER.nose, [0, 0.09, 0.26]) },
    { bone: 'head', geometry: part(box(0.04, 0.04, 0.02), DEER.eye, [0.085, 0.15, 0.08]) },
    { bone: 'head', geometry: part(box(0.04, 0.04, 0.02), DEER.eye, [-0.085, 0.15, 0.08]) },
    // Big ears out to the sides.
    { bone: 'head', geometry: part(cone(0.045, 0.14, 4), DEER.shade, [0.12, 0.22, -0.04], [0, 0, -1.0]) },
    { bone: 'head', geometry: part(cone(0.045, 0.14, 4), DEER.shade, [-0.12, 0.22, -0.04], [0, 0, 1.0]) },
    ...(antlers
      ? ([1, -1] as const).flatMap((side) => [
        // The main beam sweeps up and out; two tines branch off it.
        tine(side, 0, 0.45, 0.34),
        tine(side, 0.14, 1.0, 0.2),
        tine(side, 0.24, 0.1, 0.18),
        { bone: 'head', geometry: part(cylinder(0.018, 0.026, 0.18, 4), DEER.antler, [side * 0.2, 0.46, 0.06], [0.6, 0, -side * 0.35]) }
      ])
      : [])
  ];
}

/** Colmeia: a drooping drop of honeycomb (stacked six-sided rings, darker bands, a dark entrance) hanging from the
 *  arm of a dead stump. The stump is on `root`, the comb on `hips`, at the branch's tip. */
const HIVE = { comb: 0xe0a530, band: 0xb27718, hole: 0x2a1a08, bark: 0x5a4632, barkDark: 0x3d2f22 };
function hiveParts(): RigPart[] {
  return [
    { bone: 'root', geometry: part(cylinder(0.14, 0.2, 1.3, 6), HIVE.bark, [-0.12, 0.65, 0]) },
    { bone: 'root', geometry: part(box(0.6, 0.09, 0.09), HIVE.barkDark, [0.12, 1.24, 0], [0, 0, 0.12]) },
    { bone: 'root', geometry: part(cone(0.1, 0.25, 5), HIVE.bark, [-0.12, 1.4, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.03, 0.03, 0.12, 4), HIVE.barkDark, [0, -0.02, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.12, 0.2, 0.16, 6), HIVE.comb, [0, -0.13, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.205, 0.205, 0.04, 6), HIVE.band, [0, -0.22, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.2, 0.22, 0.16, 6), HIVE.comb, [0, -0.32, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.225, 0.225, 0.04, 6), HIVE.band, [0, -0.41, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.21, 0.13, 0.16, 6), HIVE.comb, [0, -0.5, 0]) },
    { bone: 'hips', geometry: part(cone(0.12, 0.12, 6), HIVE.band, [0, -0.63, 0], [Math.PI, 0, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.05, 0.05, 0.03, 6), HIVE.hole, [0, -0.36, 0.2], [Math.PI / 2, 0, 0]) }
  ];
}

/** Mímico: the loot chest's own box and rounded lid (same size and wood), with a row of teeth along the rim, a
 *  long red tongue and two little eyes that only show once it opens. */
const MIMIC = { wood: 0x8a5a2b, dark: 0x5e3a18, metal: 0xc9a24a, mouth: 0x3a0c0c, tooth: 0xf4ecd8, tongue: 0xc8323a, eye: 0xffe14a };
function mimicParts(): RigPart[] {
  const teeth = (bone: 'hips' | 'head', y: number, z: number, flip: number): RigPart[] =>
    [-0.27, -0.16, -0.05, 0.06, 0.17, 0.28].map((x) => ({ bone, geometry: part(cone(0.035, 0.08, 4), MIMIC.tooth, [x, y, z], [flip * Math.PI, 0, 0]) }));
  return [
    { bone: 'hips', geometry: part(box(0.7, 0.45, 0.5), MIMIC.wood, [0, 0.22, 0]) },
    { bone: 'hips', geometry: part(box(0.72, 0.06, 0.52), MIMIC.metal, [0, 0.06, 0]) },
    { bone: 'hips', geometry: part(box(0.62, 0.04, 0.42), MIMIC.mouth, [0, 0.44, 0]) },
    // The tongue lies inside, only seen when the lid gapes.
    { bone: 'hips', geometry: part(box(0.14, 0.05, 0.34), MIMIC.tongue, [0, 0.43, 0.04], [-0.15, 0, 0]) },
    ...teeth('hips', 0.48, 0.22, 0),
    // The lid hinges at the back (head bone sits at the back top edge, lid extends towards +Z).
    { bone: 'head', geometry: part(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 6, 1, false, 0, Math.PI), MIMIC.wood, [0, 0, 0.25], [0, 0, Math.PI / 2]) },
    { bone: 'head', geometry: part(box(0.72, 0.04, 0.5), MIMIC.dark, [0, 0.01, 0.25]) },
    { bone: 'head', geometry: part(box(0.1, 0.12, 0.05), MIMIC.metal, [0, -0.02, 0.51]) },
    ...teeth('head', -0.04, 0.46, 1),
    { bone: 'head', geometry: part(box(0.06, 0.06, 0.03), MIMIC.eye, [0.14, -0.06, 0.42]) },
    { bone: 'head', geometry: part(box(0.06, 0.06, 0.03), MIMIC.eye, [-0.14, -0.06, 0.42]) }
  ];
}

export interface BakedEnemyModel {
  /** Rest geometry with `frames` absolute morph targets (positions + normals) sampled from the clip. */
  geometry: THREE.BufferGeometry;
  frames: number;
  /** Seconds per full cycle at the reference speed; the view scales it with the enemy's real speed. */
  cycleSeconds: number;
  hovers: boolean;
  /** Holds its first frame while calm (the mímico keeps its lid shut, passing for a chest). */
  stillWhileCalm?: boolean;
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
  const boarBones = quadrupedBones();
  const trot = quadrupedTrotClip(boarBones[1].offset);
  const boar: BakedEnemyModel = {
    geometry: bake(buildRiggedModel(boarBones, boarParts(), material()), trot, WALK_FRAMES),
    frames: WALK_FRAMES,
    cycleSeconds: trot.duration,
    hovers: false
  };
  const deerBones = quadrupedBones({ hipHeight: 0.74, bodyLength: 0.52, shoulderRise: 0.06, legSpread: 0.11, thighLength: 0.3, headReach: 0.36 });
  const deerTrot = quadrupedTrotClip(deerBones[1].offset, 0.46);
  const deer = (antlers: boolean): BakedEnemyModel => ({
    geometry: bake(buildRiggedModel(deerBones, deerParts(antlers), material()), deerTrot, WALK_FRAMES),
    frames: WALK_FRAMES,
    cycleSeconds: deerTrot.duration,
    hovers: false
  });
  const hiveBones: BoneSpec[] = [{ name: 'root', offset: [0, 0, 0] }, { name: 'hips', parent: 'root', offset: [0.38, 1.22, 0] }];
  const sway = hiveSwayClip(hiveBones[1].offset);
  const mimicBones: BoneSpec[] = [{ name: 'root', offset: [0, 0, 0] }, { name: 'hips', parent: 'root', offset: [0, 0, 0] }, { name: 'head', parent: 'hips', offset: [0, 0.45, -0.25] }];
  const chomp = mimicChompClip(mimicBones[1].offset);
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
    frostKnight: superSkeleton,
    lakeSpirit: superSkeleton,
    boar,
    stag: deer(true),
    doe: deer(false),
    // A hive never walks: it sways at its own pace, so it plays like a hoverer.
    hive: { geometry: bake(buildRiggedModel(hiveBones, hiveParts(), material()), sway, WALK_FRAMES), frames: WALK_FRAMES, cycleSeconds: sway.duration, hovers: true },
    mimic: { geometry: bake(buildRiggedModel(mimicBones, mimicParts(), material()), chomp, WALK_FRAMES), frames: WALK_FRAMES, cycleSeconds: chomp.duration, hovers: false, stillWhileCalm: true }
  };
}
