import * as THREE from 'three';
import { CharacterConfig } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { PlayerState } from '../../core/session/entities';
import { PALETTE, toonMaterial } from '../materials';
import { simToWorld, yawFromSimDirection } from '../space';

const TURN_SHARPNESS = 14;
const DAMAGE_FLASH_MS = 160;

/** Placeholder low-poly hero built from primitives (final models arrive in Etapa 5/8). Chunky proportions — big head,
 *  big weapon — so it still reads at ~32 px tall from the high camera. Body/cloak use the character's accentColor. */
export class PlayerView {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly materials: THREE.MeshToonMaterial[] = [];
  private yaw = 0;
  private walkPhase = 0;
  private readonly position = new THREE.Vector3();

  constructor(character: CharacterConfig, weaponId: WeaponConfig['id']) {
    const accent = toonMaterial({ color: character.accentColor, flatShading: true });
    const skin = toonMaterial({ color: character.id === 'fabri' ? 0x8a5a32 : 0xe8b98f, flatShading: true });
    const dark = toonMaterial({ color: 0x3a2a22, flatShading: true });
    const steel = toonMaterial({ color: PALETTE.steel, flatShading: true });
    this.materials.push(accent, skin, dark, steel);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), dark);
    legs.position.y = 0.3;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.46, 0.85, 6), accent);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), skin);
    head.position.y = 1.68;
    this.body.add(legs, torso, head);

    if (character.id === 'mage') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 6), accent);
      hat.position.y = 2.15;
      hat.rotation.z = -0.15;
      this.body.add(hat);
    } else if (character.id === 'barbarian') {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.45), steel);
      pauldron.position.y = 1.38;
      this.body.add(pauldron);
    } else if (character.id === 'fabri') {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 4), skin);
      tail.position.set(0, 0.7, -0.35);
      tail.rotation.x = -0.9;
      this.body.add(tail);
    } else {
      const amulet = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xffd36a }));
      amulet.position.set(0, 1.15, 0.36);
      this.body.add(amulet);
    }

    this.body.add(weaponProp(weaponId));

    this.body.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
    this.root.add(this.body);
  }

  update(player: PlayerState, alpha: number, nowMs: number, deltaSeconds: number): void {
    const x = player.prevX + (player.x - player.prevX) * alpha;
    const y = player.prevY + (player.y - player.prevY) * alpha;
    simToWorld(x, y, 0, this.position);
    const moving = Math.abs(player.x - player.prevX) + Math.abs(player.y - player.prevY) > 0.01;
    this.root.position.copy(this.position);

    const targetYaw = yawFromSimDirection(player.facingX, player.facingY);
    const deltaYaw = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    this.yaw += deltaYaw * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
    this.root.rotation.y = this.yaw;

    if (moving) this.walkPhase += deltaSeconds * 12;
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.12 : 0;
    this.body.rotation.z = moving ? Math.sin(this.walkPhase) * 0.06 : 0;

    const flashing = nowMs - player.lastDamagedAt < DAMAGE_FLASH_MS;
    const emissive = flashing ? 0xaa1f1f : player.isSlowed(nowMs) ? 0x1f3f8a : 0x000000;
    this.materials.forEach((material) => material.emissive.setHex(emissive));
  }

  /** Removing the group from the scene frees nothing on the GPU: geometries and materials must be disposed
   *  explicitly, or every restart / trip to the menu leaks a full hero model. */
  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((material: THREE.Material) => material.dispose());
    });
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }
}

/** The starting weapon, held in the right hand — chunky enough to read from the high camera. */
function weaponProp(weaponId: WeaponConfig['id']): THREE.Group {
  const prop = new THREE.Group();
  const wood = toonMaterial({ color: PALETTE.wood, flatShading: true });
  const steel = toonMaterial({ color: PALETTE.steel, flatShading: true });
  if (weaponId === 'staff') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 4), wood);
    staff.position.y = 1.0;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: PALETTE.bolt }));
    crystal.position.y = 1.9;
    prop.add(staff, crystal);
  } else if (weaponId === 'sword') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.04), steel);
    blade.position.y = 1.35;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.1), wood);
    guard.position.y = 0.75;
    prop.add(blade, guard);
  } else if (weaponId === 'whip') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4), wood);
    handle.position.y = 0.9;
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 3, 10, Math.PI * 1.5), wood);
    lash.position.set(0, 0.55, 0.1);
    prop.add(handle, lash);
  } else if (weaponId === 'boomerang') {
    const boomerang = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.14).rotateY(0.6), toonMaterial({ color: 0xb07a3c, flatShading: true }));
    boomerang.position.y = 1.0;
    prop.add(boomerang);
  } else {
    const amulet = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xffd36a }));
    amulet.position.set(-0.5, 1.15, 0.36);
    prop.add(amulet);
  }
  prop.position.set(0.5, 0, 0.1);
  return prop;
}
