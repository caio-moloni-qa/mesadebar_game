import * as THREE from 'three';
import { toonMaterial } from '../materials';
import { BossClipName, bossClips } from './clips';
import { ball, box, cone, cylinder, gem, part } from './parts';
import { BoneSpec, RigPart, RiggedModel, buildRiggedModel, clipForBones, humanoidBones } from './rig';

const HIP_HEIGHT = 0.95;
const ARM = 0.34;
const LEG = 0.46;

const BONE = 0xd8cfb4;
const BONE_DARK = 0xa89c80;
const ARMOR = 0x2c2638;
const ARMOR_EDGE = 0x4a4058;
const ROBE = 0x1d1828;
const CAPE = 0x2e2240;
const GOLD = 0xb8923a;
const NECRO = 0x6dff9a;
const SOCKET = 0x0c0a10;

/** Humanoid rig + a cape hanging off the shoulders and a jaw that opens for the roar. */
function bossBones(): BoneSpec[] {
  return [
    ...humanoidBones({ hipHeight: HIP_HEIGHT, shoulderWidth: 0.4, armLength: ARM, legLength: LEG }),
    { name: 'cape', parent: 'chest', offset: [0, 0.3, -0.2] },
    { name: 'jaw', parent: 'head', offset: [0, 0.14, 0.04] }
  ];
}

function bossParts(): RigPart[] {
  const arm = (s: 'L' | 'R', side: number): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.1, ARM + 0.02, 0.1), BONE, [0, -ARM / 2, 0]) },
    { bone: `upperArm${s}`, geometry: part(ball(0.13, 0), BONE_DARK, [0, 0, 0]) }, // shoulder joint
    { bone: `foreArm${s}`, geometry: part(box(0.09, ARM, 0.09), BONE, [0, -ARM / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.12, 0.1, 0.22, 6), ARMOR, [0, -ARM * 0.6, 0]) }, // bracer
    { bone: `foreArm${s}`, geometry: part(cylinder(0.125, 0.125, 0.04, 6), GOLD, [0, -ARM * 0.45, 0]) },
    { bone: `hand${s}`, geometry: part(box(0.13, 0.1, 0.07), BONE, [0, -0.04, 0]) },
    // Claws.
    ...[-0.045, 0, 0.045].map((x) => ({ bone: `hand${s}`, geometry: part(cone(0.022, 0.13, 4), BONE_DARK, [x * side, -0.14, 0.01], [Math.PI, 0, 0]) }))
  ];
  const leg = (s: 'L' | 'R'): RigPart[] => [
    { bone: `thigh${s}`, geometry: part(box(0.11, LEG + 0.02, 0.11), BONE, [0, -LEG / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.1, LEG, 0.1), BONE, [0, -LEG / 2, 0]) },
    { bone: `shin${s}`, geometry: part(cylinder(0.12, 0.1, LEG * 0.7, 6), ARMOR, [0, -LEG * 0.55, 0.01]) }, // greave
    { bone: `shin${s}`, geometry: part(box(0.16, 0.1, 0.12), ARMOR_EDGE, [0, -0.02, 0.06]) }, // knee guard
    { bone: `foot${s}`, geometry: part(box(0.16, 0.08, 0.3), ARMOR, [0, 0.04, 0.06]) }
  ];
  return [
    ...arm('L', 1),
    ...arm('R', -1),
    ...leg('L'),
    ...leg('R'),
    // Pelvis, belt and a short torn robe (short so the legs read when kneeling and striding).
    { bone: 'hips', geometry: part(box(0.4, 0.14, 0.24), BONE_DARK, [0, 0, 0]) },
    { bone: 'hips', geometry: part(cylinder(0.3, 0.46, 0.5, 8), ROBE, [0, -0.2, 0]) },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
      const angle = (index / 8) * Math.PI * 2;
      return { bone: 'hips', geometry: part(cone(0.1, 0.24, 3), ROBE, [Math.sin(angle) * 0.4, -0.52, Math.cos(angle) * 0.4], [Math.PI, angle, 0]) };
    }),
    { bone: 'spine', geometry: part(box(0.09, 0.32, 0.09), BONE_DARK, [0, 0.14, -0.05]) },
    { bone: 'spine', geometry: part(cylinder(0.27, 0.29, 0.12, 8), GOLD, [0, 0.02, 0]) }, // belt
    { bone: 'spine', geometry: part(gem(0.06), NECRO, [0, 0.02, 0.28]) },
    // Armoured chest: breastplate, ribs showing at the sides, the necro gem, huge spiked pauldrons.
    { bone: 'chest', geometry: part(box(0.56, 0.42, 0.32), ARMOR, [0, 0.08, 0.02]) },
    { bone: 'chest', geometry: part(box(0.6, 0.08, 0.34), ARMOR_EDGE, [0, 0.3, 0.02]) },
    ...[0, 1, 2].map((rib) => ({ bone: 'chest', geometry: part(box(0.64, 0.05, 0.22), BONE, [0, -0.08 + rib * 0.1, -0.02]) })),
    { bone: 'chest', geometry: part(gem(0.1), NECRO, [0, 0.12, 0.2]) },
    ...([1, -1] as const).flatMap((side) => [
      { bone: 'chest', geometry: part(ball(0.2, 1), ARMOR, [0.42 * side, 0.3, 0], [0, 0, 0], [1.2, 0.75, 1.1]) },
      { bone: 'chest', geometry: part(cone(0.06, 0.32, 4), BONE, [0.46 * side, 0.5, 0], [0, 0, -0.35 * side]) },
      { bone: 'chest', geometry: part(cone(0.05, 0.24, 4), BONE, [0.56 * side, 0.42, -0.04], [0, 0, -0.9 * side]) }
    ]),
    // High collar framing the skull.
    { bone: 'chest', geometry: part(cylinder(0.24, 0.3, 0.2, 8), ARMOR_EDGE, [0, 0.42, -0.04]) },
    // Skull: cranium, cheekbones, sockets with green fire, the crown.
    { bone: 'head', geometry: part(box(0.08, 0.14, 0.08), BONE_DARK, [0, 0.05, 0]) },
    { bone: 'head', geometry: part(ball(0.24, 1), BONE, [0, 0.3, 0]) },
    { bone: 'head', geometry: part(box(0.3, 0.08, 0.2), BONE_DARK, [0, 0.2, 0.07]) },
    { bone: 'head', geometry: part(box(0.09, 0.08, 0.04), SOCKET, [0.08, 0.31, 0.21]) },
    { bone: 'head', geometry: part(box(0.09, 0.08, 0.04), SOCKET, [-0.08, 0.31, 0.21]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), NECRO, [0.08, 0.31, 0.235]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), NECRO, [-0.08, 0.31, 0.235]) },
    { bone: 'head', geometry: part(cylinder(0.25, 0.27, 0.07, 8), GOLD, [0, 0.47, 0]) }, // crown band
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
      const angle = (index / 8) * Math.PI * 2;
      const tall = index % 2 === 0 ? 0.22 : 0.14;
      return { bone: 'head', geometry: part(cone(0.045, tall, 4), GOLD, [Math.sin(angle) * 0.25, 0.5 + tall / 2, Math.cos(angle) * 0.25]) };
    }),
    { bone: 'head', geometry: part(gem(0.06), NECRO, [0, 0.52, 0.25]) },
    { bone: 'jaw', geometry: part(box(0.24, 0.07, 0.16), BONE, [0, -0.03, 0.06]) },
    { bone: 'jaw', geometry: part(box(0.2, 0.03, 0.03), 0xf0e8d0, [0, 0.01, 0.13]) }, // teeth
    // Tattered cape: a long sheet with a ragged hem.
    { bone: 'cape', geometry: part(box(0.78, 1.25, 0.04), CAPE, [0, -0.62, 0]) },
    ...[-0.3, -0.1, 0.1, 0.3].map((x, index) => ({ bone: 'cape', geometry: part(cone(0.1, 0.26 + (index % 2) * 0.1, 3), CAPE, [x, -1.32 - (index % 2) * 0.05, 0], [Math.PI, 0, 0]) })),
    { bone: 'cape', geometry: part(box(0.8, 0.06, 0.06), GOLD, [0, 0, 0.01]) }
  ];
}

export interface BossModel extends RiggedModel {
  clips: Record<BossClipName, THREE.AnimationClip>;
  material: THREE.MeshToonMaterial;
}

const CLIPS = bossClips(HIP_HEIGHT);

/** The final boss, the Ancestral Necromancer: crowned, armoured skeleton king with a cape and green soul-fire.
 *  ~2.4 m at scale 1; BossView scales it to the boss's display size. */
export function createBossModel(): BossModel {
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const model = buildRiggedModel(bossBones(), bossParts(), material);
  const clips = Object.fromEntries(Object.entries(CLIPS).map(([name, clip]) => [name, clipForBones(clip, model.bones)])) as Record<BossClipName, THREE.AnimationClip>;
  return { ...model, clips, material };
}
