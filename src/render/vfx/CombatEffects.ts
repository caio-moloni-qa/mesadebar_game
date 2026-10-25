import * as THREE from 'three';
import { WeaponConfig } from '../../config/weapons';
import { WORLD_SCALE } from '../space';

/** Flat sector (or full ring when `angle` ≥ 2π) lying on the XZ ground plane, centred on +X — built directly in
 *  XZ so a sim direction (dx, dy) maps to world (X, Z) with just a Y rotation of -atan2(dy, dx). */
export function groundSector(angle: number, inner: number, outer: number, segments = 24): THREE.BufferGeometry {
  const full = angle >= Math.PI * 2 - 1e-6;
  const start = full ? 0 : -angle / 2;
  const positions: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const a0 = start + (angle * index) / segments;
    const a1 = start + (angle * (index + 1)) / segments;
    const p = (a: number, r: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    positions.push(...p(a0, inner), ...p(a1, outer), ...p(a0, outer), ...p(a0, inner), ...p(a1, inner), ...p(a1, outer));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_value, index) => (index % 3 === 1 ? 1 : 0)), 3));
  return geometry;
}

const SWING_COLORS: Partial<Record<WeaponConfig['id'], number>> = { sword: 0xf4f1e6, whip: 0xff8a5c };

interface Effect {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
}

/** Short-lived weapon feedback drawn on the ground: melee swing arcs, aura pulses, the whip's burst and the staff's
 *  explosion rings. Pooled meshes, advanced by simulation time so they freeze while the run is paused. All
 *  transparent — the pixel pipeline skips them in the normal pass so they never add outline edges. */
export class CombatEffects {
  readonly root = new THREE.Group();
  private readonly active: Effect[] = [];
  private readonly free: THREE.Mesh[] = [];
  private readonly sectorCache = new Map<number, THREE.BufferGeometry>();
  private readonly ring = groundSector(Math.PI * 2, 0.86, 1, 48);
  private readonly disc = groundSector(Math.PI * 2, 0, 1, 32);

  swing(x: number, y: number, dirX: number, dirY: number, range: number, coneAngleDegrees: number, weaponId: WeaponConfig['id']): void {
    const angle = THREE.MathUtils.degToRad(coneAngleDegrees);
    const key = Math.round(coneAngleDegrees);
    let geometry = this.sectorCache.get(key);
    if (!geometry) {
      geometry = groundSector(angle, 0.35, 1, 16);
      this.sectorCache.set(key, geometry);
    }
    const mesh = this.spawn(geometry, SWING_COLORS[weaponId] ?? 0xffffff, x, y, 0.55);
    mesh.rotation.y = -Math.atan2(dirY, dirX);
    this.track(mesh, 0.18, range * WORLD_SCALE * 0.75, range * WORLD_SCALE, 0.7);
  }

  pulse(x: number, y: number, radius: number, color: number, duration = 0.28, opacity = 0.55): void {
    const mesh = this.spawn(this.ring, color, x, y, 0.08);
    this.track(mesh, duration, radius * WORLD_SCALE * 0.92, radius * WORLD_SCALE * 1.04, opacity);
  }

  burst(x: number, y: number, radius: number, color: number, duration = 0.3, opacity = 0.35): void {
    const mesh = this.spawn(this.disc, color, x, y, 0.06);
    this.track(mesh, duration, radius * WORLD_SCALE, radius * WORLD_SCALE * 1.15, opacity);
  }

  update(deltaSeconds: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      effect.age += deltaSeconds;
      const t = Math.min(1, effect.age / effect.duration);
      const scale = effect.startScale + (effect.endScale - effect.startScale) * t;
      effect.mesh.scale.set(scale, 1, scale);
      (effect.mesh.material as THREE.MeshBasicMaterial).opacity = effect.startOpacity * (1 - t);
      if (t >= 1) {
        effect.mesh.visible = false;
        this.free.push(effect.mesh);
        this.active.splice(index, 1);
      }
    }
  }

  private spawn(geometry: THREE.BufferGeometry, color: number, x: number, y: number, height: number): THREE.Mesh {
    const mesh = this.free.pop() ?? this.createMesh();
    mesh.geometry = geometry;
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    mesh.position.set(x * WORLD_SCALE, height, y * WORLD_SCALE);
    mesh.rotation.set(0, 0, 0);
    mesh.visible = true;
    return mesh;
  }

  private createMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 2;
    this.root.add(mesh);
    return mesh;
  }

  private track(mesh: THREE.Mesh, duration: number, startScale: number, endScale: number, opacity: number): void {
    mesh.scale.set(startScale, 1, startScale);
    this.active.push({ mesh, age: 0, duration, startScale, endScale, startOpacity: opacity });
  }
}
