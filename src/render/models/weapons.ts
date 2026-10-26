import * as THREE from 'three';
import { WeaponConfig } from '../../config/weapons';
import { PALETTE } from '../materials';
import { ball, box, cone, cylinder, gem, mergeParts, part } from './parts';

export type WeaponModelId = WeaponConfig['id'] | 'banana';

const GOLD = 0xe0b04a;
const LEATHER = 0x5a3820;
const BANANA = 0xf2d33b;

/** Weapon geometries, one merged vertex-coloured mesh each. Modelled with the grip at the origin and the business
 *  end along +Y, so the hero view can parent them to the hand bone and the projectile view can spin them flat. */
export function weaponGeometry(id: WeaponModelId): THREE.BufferGeometry {
  switch (id) {
    case 'staff':
      return mergeParts([
        part(cylinder(0.035, 0.045, 1.5, 5), PALETTE.wood, [0, 0.55, 0]),
        part(cylinder(0.08, 0.05, 0.12, 5), GOLD, [0, 1.3, 0]),
        part(gem(0.13), PALETTE.boltCore, [0, 1.48, 0], [0, 0, 0], [1, 1.4, 1]),
        part(box(0.05, 0.22, 0.05), GOLD, [0.08, 1.42, 0], [0, 0, -0.5]),
        part(box(0.05, 0.22, 0.05), GOLD, [-0.08, 1.42, 0], [0, 0, 0.5])
      ]);
    case 'sword':
      return mergeParts([
        part(box(0.05, 0.18, 0.05), LEATHER, [0, 0.02, 0]),
        part(ball(0.045), GOLD, [0, -0.09, 0]),
        part(box(0.3, 0.05, 0.07), GOLD, [0, 0.13, 0]),
        part(box(0.1, 0.78, 0.025), PALETTE.steel, [0, 0.55, 0]),
        part(cone(0.07, 0.14, 4), PALETTE.steel, [0, 1.0, 0], [0, Math.PI / 4, 0], [1, 1, 0.35])
      ]);
    case 'whip':
      return mergeParts([
        part(cylinder(0.035, 0.04, 0.32, 5), LEATHER, [0, 0.05, 0]),
        part(ball(0.05), GOLD, [0, 0.23, 0]),
        // The lash: a few links curling forward and down.
        ...[0, 1, 2, 3, 4].map((link) => part(box(0.04, 0.2, 0.04), 0x7a4a26, [0, 0.32 + link * 0.12 - link * link * 0.012, link * 0.06], [link * 0.25, 0, 0]))
      ]);
    case 'boomerang':
      return mergeParts([
        part(box(0.1, 0.42, 0.04), 0xb07a3c, [0.11, 0.17, 0], [0, 0, -0.55]),
        part(box(0.1, 0.42, 0.04), 0xb07a3c, [-0.11, 0.17, 0], [0, 0, 0.55]),
        part(box(0.06, 0.06, 0.05), 0x5fe3ff, [0, 0.02, 0]),
        part(box(0.03, 0.12, 0.05), 0x5fe3ff, [0.2, 0.32, 0], [0, 0, -0.55]),
        part(box(0.03, 0.12, 0.05), 0x5fe3ff, [-0.2, 0.32, 0], [0, 0, 0.55])
      ]);
    case 'banana':
      return mergeParts([
        ...[0, 1, 2, 3].map((segment) => part(cylinder(0.05, 0.06, 0.16, 5), BANANA, [Math.sin(segment * 0.5) * 0.14, segment * 0.13, 0], [0, 0, -segment * 0.35])),
        part(box(0.03, 0.06, 0.03), 0x5a4020, [0.24, 0.52, 0], [0, 0, -1.2])
      ]);
    case 'amulet':
      return mergeParts([
        part(new THREE.TorusGeometry(0.1, 0.02, 4, 10), GOLD),
        part(gem(0.08), 0xffd36a, [0, 0, 0.02])
      ]);
    case 'hammer':
      return mergeParts([
        part(cylinder(0.035, 0.045, 0.72, 6), PALETTE.wood, [0, 0.3, 0]),
        part(box(0.36, 0.2, 0.2), 0x6f737c, [0, 0.72, 0]),
        part(box(0.38, 0.05, 0.22), GOLD, [0, 0.72, 0]),
        part(box(0.06, 0.12, 0.06), LEATHER, [0, -0.02, 0])
      ]);
    case 'bow':
      // Held upright: the limbs arc forward of the grip, the string behind.
      return mergeParts([
        part(new THREE.TorusGeometry(0.5, 0.025, 4, 14, Math.PI), 0x8a6a3a, [0, 0, 0], [0, Math.PI / 2, Math.PI / 2]),
        part(box(0.06, 0.16, 0.06), LEATHER, [0, 0, 0.5]),
        part(box(0.01, 1.0, 0.01), 0xe9dfc4, [0, 0, 0.02]),
        part(box(0.04, 0.04, 0.04), 0x7fd47f, [0, 0.48, 0.12]),
        part(box(0.04, 0.04, 0.04), 0x7fd47f, [0, -0.48, 0.12])
      ]);
    case 'coins':
      // A coin pouch, a coin peeking out.
      return mergeParts([
        part(ball(0.12, 1), 0x7a5232, [0, 0.04, 0]),
        part(cylinder(0.04, 0.07, 0.08, 6), 0x5a3a22, [0, 0.16, 0]),
        part(cylinder(0.07, 0.07, 0.02, 10), 0xffd25a, [0.06, 0.2, 0.04], [Math.PI / 2, 0.4, 0])
      ]);
    case 'crystal':
      return mergeParts([
        part(cylinder(0.07, 0.09, 0.06, 8), GOLD, [0, 0.02, 0]),
        part(ball(0.12, 1), 0x9fe8ff, [0, 0.16, 0])
      ]);
    case 'pack':
      // The frying pan Sergio swings out of his pack.
      return mergeParts([
        part(cylinder(0.025, 0.03, 0.3, 5), 0x3a2a1e, [0, 0.1, 0]),
        part(cylinder(0.17, 0.15, 0.05, 10), 0x4a4a52, [0, 0.4, 0], [Math.PI / 2, 0, 0]),
        part(cylinder(0.15, 0.15, 0.01, 10), 0x2a2a30, [0, 0.4, 0.03], [Math.PI / 2, 0, 0])
      ]);
    default: {
      const exhaustive: never = id;
      throw new Error(`weaponGeometry: unknown weapon "${exhaustive}"`);
    }
  }
}

/** How far each weapon tips forward out of a hanging hand (radians about X): blades point ahead, the staff is
 *  carried mostly upright so it doesn't skewer the ground in front of the hero. */
const HAND_TILT: Record<Exclude<WeaponModelId, 'amulet'>, number> = { staff: 0.45, sword: 1.35, whip: 1.2, boomerang: 1.4, banana: 1.4, hammer: 1.25, bow: 0.15, coins: 0.2, crystal: 0.3, pack: 1.3 };

/** The straight-flying projectiles of the regulars' weapons, modelled pointing along +X (the view turns them to
 *  their heading): an arrow, a coin, and what the Mochila throws. */
export type ThrownModelId = 'arrow' | 'coin' | 'pan' | 'bottle' | 'potion';

export function thrownGeometry(id: ThrownModelId): THREE.BufferGeometry {
  switch (id) {
    case 'arrow':
      return mergeParts([
        part(box(0.62, 0.025, 0.025), 0x8a6a3a, [0, 0, 0]),
        part(cone(0.045, 0.14, 4), 0xcfd6dc, [0.36, 0, 0], [0, 0, -Math.PI / 2]),
        part(box(0.12, 0.08, 0.01), 0x7fd47f, [-0.28, 0, 0]),
        part(box(0.12, 0.01, 0.08), 0x7fd47f, [-0.28, 0, 0])
      ]);
    case 'coin':
      return mergeParts([
        part(cylinder(0.12, 0.12, 0.03, 12), 0xffd25a, [0, 0, 0], [Math.PI / 2, 0, 0]),
        part(cylinder(0.07, 0.07, 0.035, 8), 0xc9963f, [0, 0, 0], [Math.PI / 2, 0, 0])
      ]);
    case 'pan':
      return mergeParts([
        part(cylinder(0.2, 0.18, 0.06, 10), 0x4a4a52, [0, 0, 0]),
        part(box(0.3, 0.03, 0.05), 0x3a2a1e, [-0.32, 0, 0])
      ]);
    case 'bottle':
      return mergeParts([
        part(cylinder(0.08, 0.09, 0.22, 7), 0x3a8a4a, [0, 0, 0], [0, 0, Math.PI / 2]),
        part(cylinder(0.03, 0.04, 0.12, 6), 0x3a8a4a, [0.16, 0, 0], [0, 0, Math.PI / 2]),
        part(box(0.05, 0.04, 0.04), 0x8a5a32, [0.23, 0, 0])
      ]);
    case 'potion':
      return mergeParts([
        part(ball(0.11, 1), 0xd8304a, [0, 0, 0]),
        part(cylinder(0.035, 0.04, 0.08, 6), 0xe9dfc4, [0.12, 0, 0], [0, 0, Math.PI / 2])
      ]);
    default: {
      const exhaustive: never = id;
      throw new Error(`thrownGeometry: unknown "${exhaustive}"`);
    }
  }
}

/** Hand-held weapon mesh (the amulet is returned untilted — it's worn on the chest). */
export function heldWeapon(id: WeaponModelId, material: THREE.Material): THREE.Object3D {
  const mesh = new THREE.Mesh(weaponGeometry(id), material);
  mesh.castShadow = true;
  if (id !== 'amulet') {
    mesh.rotation.x = HAND_TILT[id];
    mesh.position.set(0, -0.04, 0.02);
  }
  return mesh;
}
