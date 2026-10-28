import * as THREE from 'three';
import { BLIZZARD_TUNING } from '../../config/balance';
import { BlizzardSystem } from '../../core/systems/BlizzardSystem';
import { toonMaterial } from '../materials';
import { WORLD_SCALE } from '../space';

/** Wind-driven flakes at full storm; fewer while it blows in and out. */
const STREAKS = 320;
const STREAK_RANGE = 16;
const STREAK_HEIGHT = 6;
/** The storm blows from the north-east, low and fast (meters per second). */
const WIND = new THREE.Vector3(-9, -3.2, 5);

/** The Nevasca on the field: the torches (a post, a flame that shrinks as it burns down, the warm circle it reaches)
 *  and the storm's sideways snow around the camera. All state comes from the simulation's BlizzardSystem. */
export class BlizzardView {
  readonly root = new THREE.Group();
  /** Flames, warm circles and snow: the pixel pipeline skips them in its normal pass. */
  readonly glow = new THREE.Group();
  private readonly flames: THREE.InstancedMesh;
  private readonly warmth: THREE.InstancedMesh;
  private readonly streaks: THREE.InstancedMesh;
  private readonly streakState: THREE.Vector3[] = [];
  private readonly dummy = new THREE.Object3D();
  private time = 0;

  constructor(private readonly blizzard: BlizzardSystem) {
    const count = Math.max(1, blizzard.torches.length);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 1.3, 5).translate(0, 0.65, 0), toonMaterial({ color: 0x4a3626, flatShading: true }), count);
    const bowls = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.12, 0.16, 6).translate(0, 1.36, 0), toonMaterial({ color: 0x3b3f47, flatShading: true }), count);
    this.flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 0.5, 5).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: 0xffa040 }), count);
    this.warmth = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa54a, transparent: true, opacity: 0.16, depthWrite: false }), count);
    blizzard.torches.forEach((torch, index) => {
      this.dummy.position.set(torch.x * WORLD_SCALE, 0, torch.y * WORLD_SCALE);
      this.dummy.updateMatrix();
      posts.setMatrixAt(index, this.dummy.matrix);
      bowls.setMatrixAt(index, this.dummy.matrix);
    });
    posts.count = bowls.count = blizzard.torches.length;
    posts.castShadow = true;
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xf2f8ff }), STREAKS);
    for (let index = 0; index < STREAKS; index += 1) {
      this.streakState.push(new THREE.Vector3((Math.random() - 0.5) * 2 * STREAK_RANGE, Math.random() * STREAK_HEIGHT, (Math.random() - 0.5) * 2 * STREAK_RANGE));
    }
    for (const mesh of [this.flames, this.warmth, this.streaks]) mesh.frustumCulled = false;
    this.streaks.count = 0;
    this.glow.add(this.flames, this.warmth, this.streaks);
    this.root.add(posts, bowls, this.glow);
    this.root.visible = blizzard.active;
  }

  update(focus: THREE.Vector3, deltaSeconds: number): void {
    if (!this.blizzard.active) return;
    this.time += deltaSeconds;
    const storm = this.blizzard.phase === 'storm';
    (this.warmth.material as THREE.MeshBasicMaterial).opacity = storm ? 0.18 : 0.07;
    this.blizzard.torches.forEach((torch, index) => {
      const x = torch.x * WORLD_SCALE;
      const z = torch.y * WORLD_SCALE;
      const fuel = torch.fuelMs / BLIZZARD_TUNING.torchFuelMs;
      const flicker = 0.85 + Math.sin(this.time * 12 + index * 2.3) * 0.1 + Math.sin(this.time * 27 + index) * 0.05;
      const size = fuel > 0 ? (0.45 + fuel * 0.75) * flicker : 0;
      this.place(this.flames, index, x, 1.42, z, size, size * (storm ? 0.85 : 1.1), size);
      const radius = this.blizzard.torchRadius(torch) * WORLD_SCALE;
      this.place(this.warmth, index, x, 0.05, z, radius, 1, radius);
    });
    this.flames.instanceMatrix.needsUpdate = true;
    this.warmth.instanceMatrix.needsUpdate = true;

    // Sideways snow in a box that follows the camera (wrapping), as thick as the storm blows.
    const shown = Math.round(STREAKS * this.blizzard.intensity);
    for (let index = 0; index < shown; index += 1) {
      const flake = this.streakState[index];
      flake.addScaledVector(WIND, deltaSeconds * (0.8 + (index % 5) * 0.1));
      if (flake.y < 0) flake.y += STREAK_HEIGHT;
      flake.x = wrap(flake.x, STREAK_RANGE);
      flake.z = wrap(flake.z, STREAK_RANGE);
      this.dummy.position.set(focus.x + flake.x, flake.y, focus.z + flake.z);
      this.dummy.lookAt(this.dummy.position.x + WIND.x, this.dummy.position.y + WIND.y, this.dummy.position.z + WIND.z);
      this.dummy.scale.set(1, 1, 6 + (index % 3) * 2);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(index, this.dummy.matrix);
    }
    this.dummy.rotation.set(0, 0, 0);
    this.streaks.count = shown;
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  private place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
}

/** Wraps an offset into [-range, range). */
function wrap(value: number, range: number): number {
  const span = range * 2;
  return ((((value + range) % span) + span) % span) - range;
}
