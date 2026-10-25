import * as THREE from 'three';
import { CharacterConfig } from '../../config/characters';
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

  constructor(character: CharacterConfig) {
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

    // The slice always fights with the Cajado: staff + glowing crystal in the right hand.
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 4), toonMaterial({ color: PALETTE.wood }));
    staff.position.set(0.5, 1.0, 0.1);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: PALETTE.bolt }));
    crystal.position.set(0.5, 1.9, 0.1);
    this.body.add(staff, crystal);

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
    this.materials.forEach((material) => material.emissive.setHex(flashing ? 0xaa1f1f : 0x000000));
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }
}
