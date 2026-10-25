import * as THREE from 'three';
import { GemState, ProjectileState } from '../../core/session/entities';
import { Pool } from '../../core/Pool';
import { PALETTE, toonMaterial } from '../materials';
import { WORLD_SCALE } from '../space';

/** Cajado bolts: unlit bright spheres flying at ~1 m, one instanced draw call. */
export class ProjectileView {
  readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();

  constructor(capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ color: PALETTE.bolt }), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(projectiles: Pool<ProjectileState>, alpha: number, nowMs: number): void {
    let index = 0;
    projectiles.forEachActive((projectile) => {
      const x = (projectile.prevX + (projectile.x - projectile.prevX) * alpha) * WORLD_SCALE;
      const z = (projectile.prevY + (projectile.y - projectile.prevY) * alpha) * WORLD_SCALE;
      const pulse = 1 + Math.sin(nowMs / 40 + index) * 0.15;
      this.matrix.makeScale(pulse, pulse, pulse).setPosition(x, 1.1, z);
      this.mesh.setMatrixAt(index, this.matrix);
      index += 1;
    });
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Currency gems: small spinning, bobbing crystals. */
export class GemView {
  readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();

  constructor(capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0), toonMaterial({ color: PALETTE.gem, emissive: 0x1d6b4c, flatShading: true }), capacity);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(gems: Pool<GemState>, alpha: number, nowMs: number): void {
    let index = 0;
    gems.forEachActive((gem) => {
      const x = (gem.prevX + (gem.x - gem.prevX) * alpha) * WORLD_SCALE;
      const z = (gem.prevY + (gem.y - gem.prevY) * alpha) * WORLD_SCALE;
      const phase = nowMs / 1000 * 2 + (gem.x + gem.y) * 0.05;
      this.rotation.makeRotationY(phase);
      this.matrix.makeScale(1, 1.4, 1).premultiply(this.rotation).setPosition(x, 0.4 + Math.sin(phase * 1.5) * 0.08, z);
      this.mesh.setMatrixAt(index, this.matrix);
      index += 1;
    });
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; color: THREE.Color; size: number; }

/** Pixel-square particles (the style reference's chunky trails/sparks): tiny cubes that burst and fall. Purely
 *  visual — advanced with frame time only while the session is running, so they freeze with pause. */
export class ParticleView {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly matrix = new THREE.Matrix4();

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
        life, maxLife: life, color: new THREE.Color(color), size: 0.7 + Math.random() * 0.8
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
      this.mesh.setColorAt(index, particle.color);
    });
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
