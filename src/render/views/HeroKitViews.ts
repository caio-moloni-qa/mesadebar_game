import * as THREE from 'three';
import { GameSession } from '../../core/session/GameSession';
import { toonMaterial } from '../materials';
import { ball, cylinder, mergeParts, part } from '../models/parts';
import { simToWorld } from '../space';

const MAX_ORBS = 10;
const MAX_BARRELS = 8;

/** The regulars' kit pieces on the field: the Bola de Cristal's orbs circling the hero (glowing, bobbing) and Brom's
 *  barrels rolling through the horde. Instanced, filled from the session each frame. */
export class HeroKitViews {
  readonly root = new THREE.Group();
  private readonly orbs: THREE.InstancedMesh;
  private readonly orbGlow: THREE.InstancedMesh;
  private readonly barrels: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3(1, 1, 1);

  constructor() {
    this.orbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: 0xbff2ff }), MAX_ORBS);
    this.orbGlow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0x5ac8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_ORBS);
    const barrel = mergeParts([
      part(cylinder(0.42, 0.42, 0.9, 10), 0x8a5a32, [0, 0, 0], [0, 0, Math.PI / 2]),
      part(cylinder(0.45, 0.45, 0.07, 10), 0x4a4a52, [-0.28, 0, 0], [0, 0, Math.PI / 2]),
      part(cylinder(0.45, 0.45, 0.07, 10), 0x4a4a52, [0.28, 0, 0], [0, 0, Math.PI / 2]),
      part(ball(0.08), 0xf5ecd0, [0.47, 0, 0])
    ]);
    this.barrels = new THREE.InstancedMesh(barrel, toonMaterial({ vertexColors: true, flatShading: true }), MAX_BARRELS);
    this.barrels.castShadow = true;
    [this.orbs, this.orbGlow, this.barrels].forEach((mesh) => { mesh.count = 0; mesh.frustumCulled = false; });
    this.root.add(this.orbs, this.orbGlow, this.barrels);
  }

  /** The glow halo, drawn like the other transparent effects (kept out of the outline pass). */
  get glow(): THREE.Object3D {
    return this.orbGlow;
  }

  update(session: GameSession, alpha: number, nowMs: number): void {
    let orbCount = 0;
    session.weapons.weapons.filter((weapon) => weapon.config.id === 'crystal').forEach((weapon) => {
      session.weapons.crystalOrbs(weapon).forEach((orb, index) => {
        if (orbCount >= MAX_ORBS) return;
        simToWorld(orb.x, orb.y, 1.2 + Math.sin(nowMs / 300 + index) * 0.15, this.position);
        this.rotation.identity();
        this.scale.setScalar(1);
        this.orbs.setMatrixAt(orbCount, this.matrix.compose(this.position, this.rotation, this.scale));
        this.scale.setScalar(1 + Math.sin(nowMs / 160 + index) * 0.12);
        this.orbGlow.setMatrixAt(orbCount, this.matrix.compose(this.position, this.rotation, this.scale));
        orbCount += 1;
      });
    });
    this.orbs.count = this.orbGlow.count = orbCount;
    this.orbs.instanceMatrix.needsUpdate = true;
    this.orbGlow.instanceMatrix.needsUpdate = true;

    const barrels = session.abilities.barrels.slice(0, MAX_BARRELS);
    barrels.forEach((barrel, index) => {
      simToWorld(barrel.prevX + (barrel.x - barrel.prevX) * alpha, barrel.prevY + (barrel.y - barrel.prevY) * alpha, 0.45, this.position);
      // The barrel's axis lies across its path; it rolls about that axis.
      this.euler.set(0, -Math.atan2(barrel.dirY, barrel.dirX) + Math.PI / 2, -barrel.spin, 'YXZ');
      this.rotation.setFromEuler(this.euler);
      this.scale.setScalar(1);
      this.barrels.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
    });
    this.barrels.count = barrels.length;
    this.barrels.instanceMatrix.needsUpdate = true;
  }
}
