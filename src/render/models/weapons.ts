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
    default: {
      const exhaustive: never = id;
      throw new Error(`weaponGeometry: unknown weapon "${exhaustive}"`);
    }
  }
}

/** How far each weapon tips forward out of a hanging hand (radians about X): blades point ahead, the staff is
 *  carried mostly upright so it doesn't skewer the ground in front of the hero. */
const HAND_TILT: Record<Exclude<WeaponModelId, 'amulet'>, number> = { staff: 0.45, sword: 1.35, whip: 1.2, boomerang: 1.4, banana: 1.4 };

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
