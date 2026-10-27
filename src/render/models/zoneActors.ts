import * as THREE from 'three';
import { toonMaterial } from '../materials';
import { ActorClipName, actorClips } from './clips';
import { ball, box, cone, cylinder, gem, part } from './parts';
import { BoneSpec, RigPart, RiggedModel, buildRiggedModel, clipForBones, humanoidBones } from './rig';
import { GRAVEDIGGER_HIP_HEIGHT, GRAVEDIGGER_JOINTS, ImportedBossId, LAKE_SPIRIT_HIP_HEIGHT, LAKE_SPIRIT_JOINTS, TEMPLE_GUARDIAN_HIP_HEIGHT, TEMPLE_GUARDIAN_JOINTS, bossMesh } from './importedBosses';
import { JointSpec, rigImportedMesh } from './importedRig';

/** A rigged zone actor (mini-boss or companion) with its clips; `height` is its model height at scale 1 (m). */
export interface ActorModel extends RiggedModel {
  clips: Record<ActorClipName, THREE.AnimationClip>;
  material: THREE.MeshToonMaterial;
  height: number;
}

/** The imported Tripo mesh for `id` auto-rigged at `joints` (procedural `extras` such as props ride on bones), or
 *  null when it isn't loaded — the caller then builds its procedural model. */
function imported(id: ImportedBossId, joints: JointSpec[], hipHeight: number, height: number, extras: RigPart[] = [], recolor?: (geometry: THREE.BufferGeometry) => void): ActorModel | null {
  const geometry = bossMesh(id);
  if (!geometry) return null;
  recolor?.(geometry);
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const model = rigImportedMesh(geometry, joints, material);
  extras.forEach(({ bone, geometry: extra }) => model.bones[bone].add(new THREE.Mesh(extra, material)));
  const clips = Object.fromEntries(Object.entries(actorClips(hipHeight)).map(([name, clip]) => [name, clipForBones(clip, model.bones)])) as Record<ActorClipName, THREE.AnimationClip>;
  return { ...model, clips, material, height };
}

function finish(bones: BoneSpec[], parts: RigPart[], hipHeight: number, height: number): ActorModel {
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const model = buildRiggedModel(bones, parts, material);
  const clips = Object.fromEntries(Object.entries(actorClips(hipHeight)).map(([name, clip]) => [name, clipForBones(clip, model.bones)])) as Record<ActorClipName, THREE.AnimationClip>;
  return { ...model, clips, material, height };
}

/** Turns the glowing cyan rune faces of an imported mesh to `color`. */
function repaintRunes(geometry: THREE.BufferGeometry, color: number): void {
  const colors = geometry.attributes.color;
  const target = new THREE.Color(color);
  for (let index = 0; index < colors.count; index += 1) {
    const r = colors.getX(index);
    const g = colors.getY(index);
    const b = colors.getZ(index);
    if (b > 0.35 && g > 0.3 && r < 0.25 && b > r * 3) colors.setXYZ(index, target.r, target.g, target.b);
  }
  colors.needsUpdate = true;
}

const BONE = 0xe2d8bd;
const BONE_DARK = 0xb3a685;
const SOCKET = 0x120e16;

// ── O Coveiro ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The gravedigger: a hunched skeleton in a ragged hood and apron, a long shovel in one hand and a green lantern in
 *  the other. */
export function createGravediggerModel(): ActorModel {
  const hip = 0.8;
  const arm = 0.3;
  const leg = 0.38;
  const cloak = 0x2a2a24;
  const apron = 0x5a4430;
  const iron = 0x6f6a62;
  const wood = 0x6b4a2e;
  const glow = 0x6dff9a;
  // The shovel (a long haft through the right hand, a broad iron blade at the bottom) and the lantern in the left.
  const props: RigPart[] = [
    { bone: 'handR', geometry: part(cylinder(0.03, 0.03, 1.5, 5), wood, [0, -0.15, 0.06]) },
    { bone: 'handR', geometry: part(box(0.26, 0.32, 0.04), iron, [0, -0.98, 0.06]) },
    { bone: 'handR', geometry: part(box(0.16, 0.05, 0.05), wood, [0, 0.6, 0.06]) }, // D-grip
    { bone: 'handL', geometry: part(box(0.04, 0.12, 0.04), iron, [0, -0.09, 0]) },
    { bone: 'handL', geometry: part(box(0.16, 0.2, 0.16), iron, [0, -0.25, 0]) },
    { bone: 'handL', geometry: part(box(0.12, 0.15, 0.12), glow, [0, -0.25, 0]) }
  ];
  const tripo = imported('gravedigger', GRAVEDIGGER_JOINTS, GRAVEDIGGER_HIP_HEIGHT, 2.0, props);
  if (tripo) return tripo;
  const bones: BoneSpec[] = [...humanoidBones({ hipHeight: hip, shoulderWidth: 0.3, armLength: arm, legLength: leg }), { name: 'jaw', parent: 'head', offset: [0, 0.12, 0.04] }];
  const limb = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.08, arm, 0.08), BONE, [0, -arm / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.07, arm, 0.07), BONE, [0, -arm / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.1, 0.08, 0.16, 6), cloak, [0, -0.06, 0]) }, // ragged sleeve
    { bone: `hand${s}`, geometry: part(box(0.09, 0.09, 0.05), BONE, [0, -0.04, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.09, leg, 0.09), BONE, [0, -leg / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.08, leg, 0.08), BONE, [0, -leg / 2, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.14, 0.07, 0.24), 0x3a2a1e, [0, 0.03, 0.05]) }
  ];
  const parts: RigPart[] = [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(0.34, 0.12, 0.2), BONE_DARK, [0, 0, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.24, 0.36, 0.42, 7), cloak, [0, -0.16, -0.02]) },
    { bone: 'hips', geometry: part(box(0.3, 0.5, 0.04), apron, [0, -0.18, 0.18]) }, // apron
    { bone: 'spine', geometry: part(box(0.06, 0.28, 0.06), BONE_DARK, [0, 0.13, -0.04]) },
    ...[0, 1, 2].map((rib) => ({ bone: 'chest', geometry: part(box(0.38 - rib * 0.04, 0.05, 0.22), BONE, [0, -0.04 + rib * 0.1, 0]) })),
    { bone: 'chest', geometry: part(box(0.48, 0.42, 0.26), cloak, [0, 0.12, -0.05]) }, // cloak over the shoulders
    { bone: 'chest', geometry: part(box(0.3, 0.38, 0.04), apron, [0, 0.02, 0.15]) },
    // Skull under a deep hood; the hood points back and droops.
    { bone: 'head', geometry: part(ball(0.19, 1), BONE, [0, 0.22, 0.03]) },
    { bone: 'head', geometry: part(box(0.06, 0.06, 0.03), SOCKET, [0.06, 0.24, 0.2]) },
    { bone: 'head', geometry: part(box(0.06, 0.06, 0.03), SOCKET, [-0.06, 0.24, 0.2]) },
    { bone: 'head', geometry: part(box(0.03, 0.03, 0.02), glow, [0.06, 0.24, 0.215]) },
    { bone: 'head', geometry: part(box(0.03, 0.03, 0.02), glow, [-0.06, 0.24, 0.215]) },
    { bone: 'head', geometry: part(cone(0.27, 0.62, 7), cloak, [0, 0.36, -0.08], [-0.45, 0, 0]) },
    { bone: 'jaw', geometry: part(box(0.2, 0.06, 0.14), BONE_DARK, [0, -0.02, 0.05]) },
    ...props
  ];
  return finish(bones, parts, hip, 2.0);
}

// ── Stone golem (Guardião do Templo, and the companion) ──────────────────────────────────────────────────────

/** A carved temple statue come to life: blocky stone, moss in the cracks, a gold crest and huge fists, with runes
 *  glowing `runes` (cold cyan on the guardian, warm gold on the companion). */
export function createStoneGolemModel(runes = 0x7fe3ff): ActorModel {
  // The imported guardian's runes are cyan; the companion's are repainted in its own colour.
  const tripo = imported('templeGuardian', TEMPLE_GUARDIAN_JOINTS, TEMPLE_GUARDIAN_HIP_HEIGHT, 2.3, [], runes === 0x7fe3ff ? undefined : (geometry) => repaintRunes(geometry, runes));
  if (tripo) return tripo;
  const hip = 0.9;
  const arm = 0.38;
  const leg = 0.4;
  const stone = 0x9a8f7c;
  const stoneDark = 0x6f675a;
  const moss = 0x5a7a3a;
  const gold = 0xb8923a;
  const bones = humanoidBones({ hipHeight: hip, shoulderWidth: 0.5, armLength: arm, legLength: leg });
  const limb = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.24, arm + 0.06, 0.24), stone, [0, -arm / 2, 0]) },
    { bone: `upperArm${s}`, geometry: part(box(0.34, 0.2, 0.34), stoneDark, [0, 0, 0]) }, // shoulder block
    { bone: `foreArm${s}`, geometry: part(box(0.22, arm, 0.22), stone, [0, -arm / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.24, 0.05, 0.24), runes, [0, -arm * 0.5, 0]) }, // rune band
    { bone: `hand${s}`, geometry: part(box(0.32, 0.3, 0.3), stoneDark, [0, -0.13, 0]) }, // fist
    { bone: `thigh${s}`, geometry: part(box(0.26, leg + 0.04, 0.26), stone, [0, -leg / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.24, leg, 0.24), stone, [0, -leg / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.18, 0.12, 0.06), moss, [0.04, -leg * 0.3, 0.12]) },
    { bone: `foot${s}`, geometry: part(box(0.3, 0.12, 0.38), stoneDark, [0, 0.06, 0.06]) }
  ];
  const parts: RigPart[] = [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(0.6, 0.26, 0.38), stoneDark, [0, 0, 0]) },
    { bone: 'spine', geometry: part(box(0.62, 0.32, 0.4), stone, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(0.9, 0.52, 0.5), stone, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(0.5, 0.18, 0.08), moss, [-0.12, 0.38, -0.24]) },
    { bone: 'chest', geometry: part(gem(0.12), runes, [0, 0.16, 0.27]) },
    { bone: 'chest', geometry: part(box(0.04, 0.3, 0.02), runes, [0.18, 0.12, 0.255]) },
    { bone: 'chest', geometry: part(box(0.04, 0.3, 0.02), runes, [-0.18, 0.12, 0.255]) },
    // A small head sunk between the shoulders, glowing eyes, the temple's gold crest.
    { bone: 'head', geometry: part(box(0.3, 0.28, 0.3), stone, [0, 0.08, 0.04]) },
    { bone: 'head', geometry: part(box(0.08, 0.05, 0.02), runes, [0.07, 0.11, 0.2]) },
    { bone: 'head', geometry: part(box(0.08, 0.05, 0.02), runes, [-0.07, 0.11, 0.2]) },
    { bone: 'head', geometry: part(cone(0.16, 0.28, 4), gold, [0, 0.34, 0.04]) },
    { bone: 'head', geometry: part(box(0.4, 0.06, 0.06), gold, [0, 0.22, 0.16]) }
  ];
  return finish(bones, parts, hip, 2.3);
}

// ── O Cavaleiro Congelado (Campo Nevado) ─────────────────────────────────────────────────────────────────────

/** A dead knight in a shell of ice: frosted plate, a tower shield on the left arm, a long blade of ice in the right
 *  hand, a great helm with a cyan visor slit, icicles hanging off the pauldrons and a tattered blue cloak. */
export function createFrostKnightModel(): ActorModel {
  const hip = 0.95;
  const arm = 0.36;
  const leg = 0.42;
  const plate = 0x9fc3dc;
  const plateDark = 0x5f7d96;
  const frost = 0xe8f3fb;
  const glow = 0x7fe3ff;
  const cloak = 0x2b3f63;
  const bones = humanoidBones({ hipHeight: hip, shoulderWidth: 0.44, armLength: arm, legLength: leg });
  const limb = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.17, arm + 0.04, 0.17), plate, [0, -arm / 2, 0]) },
    // Pauldron with icicles hanging off its rim.
    { bone: `upperArm${s}`, geometry: part(box(0.3, 0.16, 0.3), plateDark, [0, 0.02, 0]) },
    { bone: `upperArm${s}`, geometry: part(box(0.32, 0.04, 0.32), frost, [0, 0.11, 0]) },
    { bone: `upperArm${s}`, geometry: part(cone(0.035, 0.16, 4), frost, [0.1, -0.13, 0.08], [Math.PI, 0, 0]) },
    { bone: `upperArm${s}`, geometry: part(cone(0.03, 0.12, 4), frost, [-0.08, -0.11, 0.1], [Math.PI, 0, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.15, arm, 0.15), plate, [0, -arm / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.19, 0.08, 0.19), plateDark, [0, -arm * 0.8, 0]) },
    { bone: `hand${s}`, geometry: part(box(0.14, 0.14, 0.12), plateDark, [0, -0.06, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.19, leg + 0.04, 0.19), plate, [0, -leg / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.17, leg, 0.17), plate, [0, -leg / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.19, 0.1, 0.06), frost, [0, -leg * 0.1, 0.09]) },
    { bone: `foot${s}`, geometry: part(box(0.2, 0.1, 0.32), plateDark, [0, 0.05, 0.06]) }
  ];
  const parts: RigPart[] = [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(0.46, 0.2, 0.3), plateDark, [0, 0, 0]) },
    { bone: 'hips', geometry: part(box(0.5, 0.36, 0.06), cloak, [0, -0.18, -0.17]) },
    { bone: 'spine', geometry: part(box(0.44, 0.3, 0.3), plate, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(0.6, 0.46, 0.38), plate, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(0.62, 0.06, 0.4), frost, [0, 0.38, 0]) }, // frost on the shoulders
    { bone: 'chest', geometry: part(gem(0.08), glow, [0, 0.16, 0.2]) }, // a frozen heart
    { bone: 'chest', geometry: part(box(0.58, 0.9, 0.05), cloak, [0, -0.12, -0.21]) }, // the cloak hangs down the back
    // Great helm: a crest of ice, a glowing visor slit, a nasal bar.
    { bone: 'head', geometry: part(box(0.3, 0.34, 0.3), plate, [0, 0.14, 0.02]) },
    { bone: 'head', geometry: part(box(0.32, 0.05, 0.32), frost, [0, 0.31, 0.02]) },
    { bone: 'head', geometry: part(box(0.22, 0.04, 0.02), glow, [0, 0.17, 0.175]) },
    { bone: 'head', geometry: part(box(0.04, 0.12, 0.02), plateDark, [0, 0.1, 0.18]) },
    { bone: 'head', geometry: part(cone(0.06, 0.24, 4), frost, [0, 0.44, 0]) },
    // Tower shield on the left forearm, a blade of ice in the right hand.
    { bone: 'foreArmL', geometry: part(box(0.06, 0.66, 0.46), plateDark, [-0.1, -arm * 0.5, 0.06]) },
    { bone: 'foreArmL', geometry: part(box(0.07, 0.58, 0.38), plate, [-0.12, -arm * 0.5, 0.06]) },
    { bone: 'foreArmL', geometry: part(gem(0.07), glow, [-0.16, -arm * 0.5, 0.06]) },
    { bone: 'handR', geometry: part(box(0.04, 0.18, 0.04), plateDark, [0, -0.06, 0.04]) }, // grip
    { bone: 'handR', geometry: part(box(0.22, 0.04, 0.06), plateDark, [0, -0.16, 0.04]) }, // crossguard
    { bone: 'handR', geometry: part(box(0.06, 0.95, 0.02), glow, [0, -0.66, 0.04]) }, // the blade
    { bone: 'handR', geometry: part(box(0.1, 0.9, 0.03), frost, [0, -0.64, 0.04]) }
  ];
  return finish(bones, parts, hip, 2.2);
}

// ── Esqueleto aliado (raised by the Coveiro Aliado) ────────────────────────────────────────────────────────────

/** A friendly skeleton: teal hood and mantle, a short rusty sword in the right hand, cyan eyes so it never reads as
 *  one of the horde. */
export function createAllySkeletonModel(): ActorModel {
  const hip = 0.82;
  const arm = 0.3;
  const leg = 0.4;
  const hood = 0x2c4a4f;
  const wood = 0x7a5232;
  const eyes = 0x7fe3ff;
  const bones = humanoidBones({ hipHeight: hip, shoulderWidth: 0.3, armLength: arm, legLength: leg });
  const limb = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.08, arm, 0.08), BONE, [0, -arm / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.07, arm, 0.07), BONE, [0, -arm / 2, 0]) },
    { bone: `hand${s}`, geometry: part(box(0.09, 0.09, 0.05), BONE, [0, -0.04, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.09, leg, 0.09), BONE, [0, -leg / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.08, leg, 0.08), BONE, [0, -leg / 2, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.12, 0.06, 0.22), 0x3a3026, [0, 0.03, 0.05]) }
  ];
  const parts: RigPart[] = [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(0.34, 0.12, 0.2), BONE_DARK, [0, 0, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.22, 0.3, 0.3, 7), hood, [0, -0.12, 0]) },
    { bone: 'spine', geometry: part(box(0.06, 0.28, 0.06), BONE_DARK, [0, 0.13, -0.04]) },
    ...[0, 1, 2].map((rib) => ({ bone: 'chest', geometry: part(box(0.4 - rib * 0.04, 0.05, 0.22), BONE, [0, -0.04 + rib * 0.1, 0]) })),
    { bone: 'chest', geometry: part(box(0.46, 0.14, 0.26), hood, [0, 0.28, -0.02]) }, // mantle
    { bone: 'head', geometry: part(ball(0.18, 1), BONE, [0, 0.22, 0.02]) },
    { bone: 'head', geometry: part(box(0.06, 0.05, 0.03), eyes, [0.06, 0.24, 0.18]) },
    { bone: 'head', geometry: part(box(0.06, 0.05, 0.03), eyes, [-0.06, 0.24, 0.18]) },
    { bone: 'head', geometry: part(cone(0.24, 0.42, 7), hood, [0, 0.36, -0.04], [-0.2, 0, 0]) },
    // A short rusty sword, pointing forward out of the right fist.
    { bone: 'handR', geometry: part(box(0.04, 0.04, 0.12), wood, [0, -0.05, 0.02]) },
    { bone: 'handR', geometry: part(box(0.14, 0.03, 0.03), 0x6f6a62, [0, -0.05, 0.09]) },
    { bone: 'handR', geometry: part(box(0.05, 0.015, 0.5), 0x9a8f7c, [0, -0.05, 0.35]) }
  ];
  return finish(bones, parts, hip, 1.9);
}

// ── O Espírito do Lago ───────────────────────────────────────────────────────────────────────────────────────

/** A water creature: a body of light-blue water rising from a swirling column with a foam hem, a ridge of water
 *  spikes down its back, glowing white eyes. No legs — it rises out of the water and glides. */
export function createLakeSpiritModel(): ActorModel {
  const tripo = imported('lakeSpirit', LAKE_SPIRIT_JOINTS, LAKE_SPIRIT_HIP_HEIGHT, 2.4);
  if (tripo) return tripo;
  const hip = 0.95;
  const arm = 0.4;
  const light = 0x8fdcff;
  const mid = 0x4fb3e0;
  const deep = 0x2a7fb0;
  const foam = 0xe6f6ff;
  const bones = humanoidBones({ hipHeight: hip, shoulderWidth: 0.46, armLength: arm, legLength: 0.45 });
  const limb = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(cylinder(0.12, 0.16, arm + 0.06, 7), mid, [0, -arm / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.09, 0.12, arm, 7), light, [0, -arm / 2, 0]) },
    { bone: `hand${s}`, geometry: part(ball(0.14, 1), foam, [0, -0.08, 0]) }
  ];
  const parts: RigPart[] = [
    ...limb('L'),
    ...limb('R'),
    // The water column it rises from, and the foam where it meets the ground.
    { bone: 'hips', geometry: part(cylinder(0.34, 0.78, 0.98, 9), deep, [0, -0.47, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.3, 0.5, 0.5, 9), mid, [0, -0.1, 0.04]) },
    { bone: 'hips', geometry: part(cylinder(0.82, 0.88, 0.08, 12), foam, [0, -0.93, 0]) },
    { bone: 'spine', geometry: part(cylinder(0.34, 0.36, 0.34, 9), mid, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(ball(0.44, 1), light, [0, 0.12, 0], [0, 0, 0], [1.2, 0.9, 0.9]) },
    { bone: 'chest', geometry: part(ball(0.2, 1), foam, [0, 0.16, 0.3], [0, 0, 0], [1.4, 0.7, 0.6]) },
    ...[0, 1, 2, 3].map((index) => ({ bone: 'chest', geometry: part(cone(0.09, 0.38 - index * 0.05, 5), mid, [0, 0.42 - index * 0.16, -0.32], [-0.9, 0, 0]) })),
    { bone: 'head', geometry: part(ball(0.27, 1), light, [0, 0.24, 0.04]) },
    { bone: 'head', geometry: part(box(0.09, 0.05, 0.03), 0xffffff, [0.08, 0.27, 0.29]) },
    { bone: 'head', geometry: part(box(0.09, 0.05, 0.03), 0xffffff, [-0.08, 0.27, 0.29]) },
    // A crown of curling water spikes.
    ...[0, 1, 2, 3, 4].map((index) => {
      const angle = (index / 5) * Math.PI - Math.PI / 2;
      return { bone: 'head', geometry: part(cone(0.06, 0.32, 5), foam, [Math.sin(angle) * 0.18, 0.5, -0.04 + Math.cos(angle) * 0.06], [-0.35, 0, -Math.sin(angle) * 0.4]) };
    })
  ];
  return finish(bones, parts, hip, 2.4);
}
