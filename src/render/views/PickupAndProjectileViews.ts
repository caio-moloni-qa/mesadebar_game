import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PeelState, PickupKind, PickupState, ProjectileKind, ProjectileState, SoulState } from '../../core/session/entities';
import { Pool } from '../../core/Pool';
import { PALETTE, toonMaterial } from '../materials';
import { WORLD_SCALE } from '../space';

/** Builds one InstancedMesh per kind and fills them from a pool each frame (count = instances used this frame). */
class InstancedBatch<K extends string> {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<K, THREE.InstancedMesh>();
  private readonly counts = new Map<K, number>();

  constructor(parts: Record<K, { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow?: boolean }>, capacity: number) {
    (Object.keys(parts) as K[]).forEach((kind) => {
      const { geometry, material, castShadow } = parts[kind];
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.frustumCulled = false;
      mesh.castShadow = Boolean(castShadow);
      mesh.count = 0;
      this.meshes.set(kind, mesh);
      this.root.add(mesh);
    });
  }

  begin(): void {
    this.meshes.forEach((_mesh, kind) => this.counts.set(kind, 0));
  }

  push(kind: K, matrix: THREE.Matrix4): void {
    const mesh = this.meshes.get(kind)!;
    const index = this.counts.get(kind)!;
    if (index >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(index, matrix);
    this.counts.set(kind, index + 1);
  }

  end(): void {
    this.meshes.forEach((mesh, kind) => {
      mesh.count = this.counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
}

/** Interpolated world position, written into one shared scratch object — this runs for every projectile, pickup
 *  and soul every frame, and a fresh object per call would be steady garbage for the collector. */
const lerped = { x: 0, z: 0 };
const lerp = (body: { x: number; y: number; prevX: number; prevY: number }, alpha: number) => {
  lerped.x = (body.prevX + (body.x - body.prevX) * alpha) * WORLD_SCALE;
  lerped.z = (body.prevY + (body.y - body.prevY) * alpha) * WORLD_SCALE;
  return lerped;
};

/** Player projectiles: Cajado bolts (unlit glowing), boomerang / banana (spinning flat V / crescent), thrown swords. */
export class ProjectileView {
  readonly batch: InstancedBatch<ProjectileKind>;
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();

  constructor(capacity: number) {
    const boomerang = mergeGeometries([
      new THREE.BoxGeometry(0.7, 0.08, 0.16).translate(0.25, 0, 0).rotateY(0.6),
      new THREE.BoxGeometry(0.7, 0.08, 0.16).translate(0.25, 0, 0).rotateY(-0.6)
    ])!;
    const banana = new THREE.TorusGeometry(0.32, 0.09, 4, 8, Math.PI * 0.9).rotateX(Math.PI / 2);
    const sword = mergeGeometries([new THREE.BoxGeometry(1.1, 0.06, 0.14), new THREE.BoxGeometry(0.1, 0.08, 0.4).translate(-0.4, 0, 0)])!;
    this.batch = new InstancedBatch<ProjectileKind>({
      bolt: { geometry: new THREE.IcosahedronGeometry(0.24, 0), material: new THREE.MeshBasicMaterial({ color: PALETTE.bolt }) },
      boomerang: { geometry: boomerang, material: toonMaterial({ color: 0xb07a3c, emissive: 0x2a1600, flatShading: true }), castShadow: true },
      banana: { geometry: banana, material: toonMaterial({ color: 0xf2d33b, emissive: 0x3a2e00, flatShading: true }), castShadow: true },
      thrownSword: { geometry: sword, material: toonMaterial({ color: PALETTE.steel, emissive: 0x20262c, flatShading: true }), castShadow: true }
    }, capacity);
  }

  get root(): THREE.Group {
    return this.batch.root;
  }

  update(projectiles: Pool<ProjectileState>, alpha: number, nowMs: number): void {
    this.batch.begin();
    projectiles.forEachActive((projectile) => {
      const { x, z } = lerp(projectile, alpha);
      if (projectile.kind === 'bolt') {
        const size = projectile.sizeMultiplier * (1 + Math.sin(nowMs / 40 + x) * 0.15);
        this.matrix.makeScale(size, size, size).setPosition(x, 1.1, z);
      } else {
        const size = projectile.sizeMultiplier;
        this.rotation.makeRotationY(projectile.spin);
        this.matrix.makeScale(size, size, size).premultiply(this.rotation).setPosition(x, 1.0, z);
      }
      this.batch.push(projectile.kind, this.matrix);
    });
    this.batch.end();
  }
}

/** Gems, loot chests and health potions bobbing on the ground. */
export class PickupView {
  readonly batch: InstancedBatch<PickupKind>;
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();

  constructor(capacity: number) {
    const chest = mergeGeometries([
      new THREE.BoxGeometry(0.7, 0.45, 0.5).translate(0, 0.22, 0),
      new THREE.CylinderGeometry(0.25, 0.25, 0.7, 6, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.45, 0)
    ].map((geometry) => geometry.toNonIndexed()))!;
    const potion = mergeGeometries([
      new THREE.IcosahedronGeometry(0.22, 0).translate(0, 0.22, 0),
      new THREE.CylinderGeometry(0.07, 0.09, 0.18, 5).translate(0, 0.5, 0).toNonIndexed()
    ].map((geometry) => geometry.toNonIndexed()))!;
    this.batch = new InstancedBatch<PickupKind>({
      gem: { geometry: new THREE.OctahedronGeometry(0.2, 0), material: toonMaterial({ color: PALETTE.gem, emissive: 0x1d6b4c, flatShading: true }), castShadow: true },
      chest: { geometry: chest, material: toonMaterial({ color: 0x8a5a2b, emissive: 0x3a2400, flatShading: true }), castShadow: true },
      potion: { geometry: potion, material: toonMaterial({ color: 0xe0413c, emissive: 0x4a0d0b, flatShading: true }), castShadow: true }
    }, capacity);
  }

  get root(): THREE.Group {
    return this.batch.root;
  }

  update(pickups: Pool<PickupState>, alpha: number, nowMs: number): void {
    this.batch.begin();
    pickups.forEachActive((pickup) => {
      const { x, z } = lerp(pickup, alpha);
      const phase = (nowMs / 1000) * 2 + (pickup.x + pickup.y) * 0.05;
      if (pickup.kind === 'gem') {
        this.rotation.makeRotationY(phase);
        this.matrix.makeScale(1, 1.4, 1).premultiply(this.rotation).setPosition(x, 0.4 + Math.sin(phase * 1.5) * 0.08, z);
      } else {
        this.rotation.makeRotationY(phase * 0.4);
        this.matrix.copy(this.rotation).setPosition(x, Math.abs(Math.sin(phase)) * 0.12, z);
      }
      this.batch.push(pickup.kind, this.matrix);
    });
    this.batch.end();
  }
}

/** Necromancer souls (glowing green skulls) and Fabri's banana peels. */
export class HazardView {
  readonly batch: InstancedBatch<'soul' | 'peel'>;
  private readonly matrix = new THREE.Matrix4();

  constructor(capacity: number) {
    const skull = mergeGeometries([
      new THREE.IcosahedronGeometry(0.3, 0).toNonIndexed(),
      new THREE.BoxGeometry(0.3, 0.14, 0.2).translate(0, -0.22, 0.08).toNonIndexed()
    ])!;
    const peel = mergeGeometries([0, 1, 2].map((index) =>
      new THREE.BoxGeometry(0.5, 0.05, 0.14).translate(0.22, 0.03, 0).rotateY((index * Math.PI * 2) / 3).toNonIndexed()
    ))!;
    this.batch = new InstancedBatch<'soul' | 'peel'>({
      soul: { geometry: skull, material: new THREE.MeshBasicMaterial({ color: 0x7dff9a }) },
      peel: { geometry: peel, material: toonMaterial({ color: 0xf2d33b, flatShading: true }) }
    }, capacity);
  }

  get root(): THREE.Group {
    return this.batch.root;
  }

  update(souls: Pool<SoulState>, peels: Pool<PeelState>, alpha: number, nowMs: number): void {
    this.batch.begin();
    souls.forEachActive((soul) => {
      const { x, z } = lerp(soul, alpha);
      const wobble = 1 + Math.sin(nowMs / 60 + x * 3) * 0.12;
      this.matrix.makeScale(wobble, wobble, wobble).setPosition(x, 1.2, z);
      this.batch.push('soul', this.matrix);
    });
    peels.forEachActive((peel) => {
      this.matrix.makeRotationY(peel.x * 0.37).setPosition(peel.x * WORLD_SCALE, 0, peel.y * WORLD_SCALE);
      this.batch.push('peel', this.matrix);
    });
    this.batch.end();
  }
}

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; color: number; size: number; }

/** Pixel-square particles (the style reference's chunky trails/sparks): tiny cubes that burst and fall. Purely
 *  visual — advanced with frame time only while the session is running, so they freeze with pause. */
export class ParticleView {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(private readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), new THREE.MeshBasicMaterial({ color: 0xffffff }), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  burst(worldX: number, worldZ: number, color: number, count: number, height = 1, speed = 3): void {
    for (let index = 0; index < count && this.particles.length < this.capacity; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.4 + Math.random() * 0.8);
      const life = 0.35 + Math.random() * 0.35;
      this.particles.push({
        x: worldX, y: height, z: worldZ,
        vx: Math.cos(angle) * velocity, vy: 2 + Math.random() * 3, vz: Math.sin(angle) * velocity,
        life, maxLife: life, color, size: 0.7 + Math.random() * 0.8
      });
    }
  }

  update(deltaSeconds: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= deltaSeconds;
      if (particle.life <= 0 || particle.y < 0) { this.particles.splice(index, 1); continue; }
      particle.vy -= 14 * deltaSeconds;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.z += particle.vz * deltaSeconds;
    }
    this.particles.forEach((particle, index) => {
      const size = particle.size * (particle.life / particle.maxLife);
      this.matrix.makeScale(size, size, size).setPosition(particle.x, particle.y, particle.z);
      this.mesh.setMatrixAt(index, this.matrix);
      this.mesh.setColorAt(index, this.color.setHex(particle.color));
    });
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
