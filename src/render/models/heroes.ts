import * as THREE from 'three';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { toonMaterial } from '../materials';
import { HeroClipName, humanoidClips } from './clips';
import { ball, box, cone, cylinder, gem, part } from './parts';
import { RigPart, RiggedModel, buildRiggedModel, clipForBones, humanoidBones } from './rig';
import { heldWeapon } from './weapons';

const HIP_HEIGHT = 0.82;
const ARM = 0.3;
const LEG = 0.4;

interface Palette { skin: number; top: number; belly: number; pants: number; boots: number; sleeve: number; }

/** Arms, legs, hands and feet every humanoid shares — only the colours change per character. */
function limbs({ skin, pants, boots, sleeve }: Palette): RigPart[] {
  const side = (s: 'L' | 'R'): RigPart[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.14, ARM + 0.04, 0.14), sleeve, [0, -ARM / 2, 0]) },
    { bone: `foreArm${s}`, geometry: part(box(0.12, ARM, 0.12), skin, [0, -ARM / 2 + 0.02, 0]) },
    { bone: `hand${s}`, geometry: part(ball(0.075), skin, [0, -0.02, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.18, LEG + 0.02, 0.18), pants, [0, -LEG / 2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.15, LEG, 0.15), pants, [0, -LEG / 2, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.17, 0.09, 0.28), boots, [0, 0.045, 0.05]) }
  ];
  return [...side('L'), ...side('R')];
}

/** Hips, belly, chest and the head core. */
function torso({ top, belly, skin }: Palette, headRadius = 0.25): RigPart[] {
  return [
    { bone: 'hips', geometry: part(box(0.42, 0.2, 0.27), belly, [0, 0.02, 0]) },
    { bone: 'spine', geometry: part(box(0.44, 0.3, 0.27), belly, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(0.54, 0.36, 0.31), top, [0, 0.1, 0]) },
    { bone: 'head', geometry: part(box(0.12, 0.1, 0.12), skin, [0, 0.03, 0]) },
    { bone: 'head', geometry: part(ball(headRadius, 1), skin, [0, 0.25, 0]) }
  ];
}

/** Eyes on the front of the head (+Z), so facing direction reads even at 32 px. */
function eyes(color = 0x1a1410, y = 0.28, spread = 0.09, z = 0.23): RigPart[] {
  return [
    { bone: 'head', geometry: part(box(0.06, 0.07, 0.03), color, [spread, y, z]) },
    { bone: 'head', geometry: part(box(0.06, 0.07, 0.03), color, [-spread, y, z]) }
  ];
}

function barbarianParts(accent: number): RigPart[] {
  const palette: Palette = { skin: 0xd9a27a, top: 0xd9a27a, belly: 0xc98f68, pants: 0x4a3426, boots: 0x2f2119, sleeve: 0xd9a27a };
  return [
    ...torso(palette, 0.25),
    ...limbs(palette),
    ...eyes(),
    { bone: 'chest', geometry: part(box(0.72, 0.16, 0.38), 0x6b5038, [0, 0.27, -0.02]) }, // fur mantle
    { bone: 'chest', geometry: part(box(0.08, 0.4, 0.33), 0x5a3a24, [0.1, 0.08, 0], [0, 0, 0.6]) }, // strap
    { bone: 'spine', geometry: part(box(0.48, 0.12, 0.3), accent, [0, 0.03, 0]) }, // red sash
    { bone: 'head', geometry: part(ball(0.27, 1), 0x2a1a10, [0, 0.33, -0.05], [0, 0, 0], [1, 0.7, 1]) }, // hair cap
    { bone: 'head', geometry: part(box(0.34, 0.16, 0.12), 0x2a1a10, [0, 0.1, 0.18]) }, // beard
    { bone: 'foreArmL', geometry: part(box(0.15, 0.12, 0.15), 0x5a3a24, [0, -0.2, 0]) },
    { bone: 'foreArmR', geometry: part(box(0.15, 0.12, 0.15), 0x5a3a24, [0, -0.2, 0]) }
  ];
}

function mageParts(accent: number): RigPart[] {
  const palette: Palette = { skin: 0xe8b98f, top: accent, belly: accent, pants: 0x1f3460, boots: 0x231a2a, sleeve: accent };
  return [
    ...torso(palette, 0.24),
    ...limbs(palette),
    { bone: 'head', geometry: part(box(0.3, 0.2, 0.06), 0x15121c, [0, 0.22, 0.2]) }, // hood shadow over the face
    ...eyes(0x7fe3ff, 0.25, 0.07, 0.24),
    { bone: 'head', geometry: part(cone(0.36, 0.7, 6), accent, [0, 0.66, -0.04], [-0.18, 0, 0]) }, // pointy hat
    { bone: 'head', geometry: part(cylinder(0.42, 0.42, 0.05, 8), 0x1f3460, [0, 0.36, 0]) }, // hat brim
    { bone: 'hips', geometry: part(cylinder(0.27, 0.42, 0.72, 8), accent, [0, -0.32, 0]) }, // robe skirt
    { bone: 'spine', geometry: part(box(0.47, 0.1, 0.3), 0x7a4fc0, [0, 0.02, 0]) }, // purple sash
    { bone: 'chest', geometry: part(gem(0.06), 0x7fe3ff, [0, 0.14, 0.17]) } // clasp
  ];
}

function reliquiaParts(accent: number): RigPart[] {
  const palette: Palette = { skin: 0xc68a5e, top: 0x6a4428, belly: 0xefe2c4, pants: 0xb89a6a, boots: 0x4a3020, sleeve: 0xefe2c4 };
  return [
    ...torso(palette, 0.24),
    ...limbs(palette),
    ...eyes(),
    { bone: 'head', geometry: part(box(0.16, 0.04, 0.03), 0xfff4e0, [0, 0.16, 0.23]) }, // the grin
    { bone: 'head', geometry: part(ball(0.26, 1), 0x1e140c, [0, 0.34, -0.06], [0, 0, 0], [1, 0.65, 1]) }, // hair cap
    { bone: 'spine', geometry: part(box(0.47, 0.12, 0.3), accent, [0, 0.03, 0]) }, // sash
    { bone: 'chest', geometry: part(box(0.62, 0.8, 0.06), 0x2f5a3a, [0, -0.12, -0.19]) }, // cloak down the back
    { bone: 'chest', geometry: part(box(0.6, 0.12, 0.36), 0x2f5a3a, [0, 0.27, -0.02]) } // cloak collar
  ];
}

function fabriParts(accent: number): RigPart[] {
  const fur = 0x8a5a32;
  const palette: Palette = { skin: fur, top: 0xcfd6dc, belly: fur, pants: fur, boots: 0x5a3a24, sleeve: 0xcfd6dc };
  return [
    ...torso(palette, 0.26),
    ...limbs(palette),
    { bone: 'head', geometry: part(box(0.3, 0.24, 0.08), 0xd8a878, [0, 0.21, 0.2]) }, // face
    ...eyes(0x1a1410, 0.27, 0.07, 0.25),
    { bone: 'head', geometry: part(ball(0.09), 0xd8a878, [0.27, 0.27, 0]) }, // ears
    { bone: 'head', geometry: part(ball(0.09), 0xd8a878, [-0.27, 0.27, 0]) },
    { bone: 'chest', geometry: part(box(0.58, 0.08, 0.34), 0xe0b04a, [0, 0.26, 0]) }, // gold trim
    { bone: 'hips', geometry: part(box(0.3, 0.32, 0.05), 0x2c4f8c, [0, -0.12, 0.15]) }, // loincloth
    { bone: 'hips', geometry: part(box(0.12, 0.12, 0.06), 0xe0b04a, [0, 0, 0.16]) },
    // Banana belt.
    ...[-0.16, -0.05, 0.06, 0.17].map((x) => ({ bone: 'hips', geometry: part(cylinder(0.035, 0.04, 0.16, 5), 0xf2d33b, [x, 0.04, 0.15], [0, 0, 0.5]) })),
    // Tail: three segments curling up behind.
    { bone: 'tail', geometry: part(cylinder(0.05, 0.06, 0.3, 5), fur, [0, 0.05, -0.12], [-1.0, 0, 0]) },
    { bone: 'tail', geometry: part(cylinder(0.04, 0.05, 0.28, 5), fur, [0, 0.27, -0.27], [-0.4, 0, 0]) },
    { bone: 'tail', geometry: part(cylinder(0.03, 0.04, 0.24, 5), accent, [0, 0.48, -0.26], [0.4, 0, 0]) }
  ];
}

const PART_BUILDERS: Record<CharacterId, (accent: number) => RigPart[]> = {
  barbarian: barbarianParts,
  mage: mageParts,
  reliquia: reliquiaParts,
  fabri: fabriParts
};

const CLIPS = humanoidClips(HIP_HEIGHT);

export interface HeroModel extends RiggedModel {
  /** Clips filtered to bones this rig actually has (no binding warnings for, e.g., the tail on non-Fabri). */
  clips: Record<HeroClipName, THREE.AnimationClip>;
  material: THREE.Material;
}

/** Procedural low-poly hero — the placeholder for Etapa 8's final art. Same bone names and clip names a glTF
 *  replacement would ship with, so HeroView stays unchanged when the art swaps. */
export function createHeroModel(characterId: CharacterId, weaponId: WeaponConfig['id']): HeroModel {
  const character = CHARACTERS[characterId];
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const boneSpecs = humanoidBones({ hipHeight: HIP_HEIGHT, armLength: ARM, legLength: LEG, withTail: characterId === 'fabri' });
  const model = buildRiggedModel(boneSpecs, PART_BUILDERS[characterId](character.accentColor), material);

  // The Relíquia Divina hangs on the chest; every other weapon goes in the right hand.
  const weapon = heldWeapon(weaponId, material);
  if (weaponId === 'amulet') {
    weapon.position.set(0, 0.12, 0.18);
    model.bones.chest.add(weapon);
  } else {
    model.bones.handR.add(weapon);
  }

  const clips = Object.fromEntries(Object.entries(CLIPS).map(([name, clip]) => [name, clipForBones(clip, model.bones)])) as Record<HeroClipName, THREE.AnimationClip>;

  return { ...model, clips, material };
}
