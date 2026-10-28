import * as THREE from 'three';
import { SnowHazard } from '../../core/systems/SnowfieldAttacks';
import { WORLD_SCALE, simToWorld } from '../space';

/** Pooled geometry for both winter bosses and guardians, including the exact damaging rings and gaps. */
export class SnowAttackEffects {
  readonly root = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor() {
    const glow = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const solid = () => new THREE.MeshLambertMaterial({ flatShading: true });
    this.meshes = [
      new THREE.InstancedMesh(new THREE.RingGeometry(0.87, 1, 40).rotateX(-Math.PI / 2), glow(), 160),
      new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), solid(), 160),
      new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2, 6).translate(0, 1, 0), solid(), 160),
      new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), glow(), 160),
      new THREE.InstancedMesh(new THREE.RingGeometry(0.88, 1, 48, 1, 0.5, Math.PI * 2 - 1).rotateX(-Math.PI / 2), glow(), 160),
      new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 1, 1.6, 10).translate(0, 0.8, 0), solid(), 160)
    ];
    this.meshes.forEach(mesh => { mesh.count = 0; mesh.frustumCulled = false; this.root.add(mesh); });
  }

  update(hazards: readonly SnowHazard[], braziers: ReadonlyArray<{ x: number; y: number; radius: number }> = []): void {
    this.meshes.forEach(mesh => { mesh.count = 0; });
    const put = (bucket: number, h: SnowHazard, r: number, height: number, tint: number, line = false) => {
      const mesh = this.meshes[bucket];
      if (mesh.count >= 160) return;
      simToWorld(h.x, h.y, height, this.position);
      this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -h.angle);
      this.scale.set(line ? h.length * WORLD_SCALE : r * WORLD_SCALE, line || bucket === 0 || bucket === 4 ? 1 : r * WORLD_SCALE, line ? r * 2 * WORLD_SCALE : r * WORLD_SCALE);
      this.matrix.compose(this.position, this.rotation, this.scale);
      mesh.setMatrixAt(mesh.count, this.matrix);
      mesh.setColorAt(mesh.count++, this.color.setHex(tint));
    };
    hazards.forEach(h => {
      const active = h.elapsed >= h.warning;
      const t = Math.max(0, (h.elapsed - h.warning) / h.lifetime);
      const line = h.kind === 'breath' || h.kind === 'resonance';
      const bronze = h.kind === 'bell' || h.kind === 'bellWave' || h.kind === 'resonance';
      const tint = active ? bronze ? 0xf4c96c : 0xa5eaff : 0xff884d;
      let radius = h.radius;
      if (active && h.kind === 'bellWave') radius *= t;
      if (active && h.kind === 'constrict') radius *= 1 - t * 0.8;
      if (line) put(3, h, radius, 0.12, tint, true);
      else put(h.kind === 'constrict' ? 4 : 0, h, radius, 0.1, tint);
      if (!active) {
        if (h.kind === 'bell') put(5, h, radius * 0.75, 8 * (1 - h.elapsed / h.warning), 0x97743c);
        return;
      }
      if (h.kind === 'bell') put(5, h, radius * 0.75, 0, 0xbc944b);
      else if (h.kind === 'snowball') put(1, h, radius, radius * WORLD_SCALE, 0xe0eff3);
      else if (h.kind === 'shard' || h.kind === 'lance' || h.kind === 'avalanche') put(2, h, radius * 0.65, 0, 0x92d9f1);
      else if (h.kind === 'eruption') put(3, { ...h, length: radius * 2, x: h.x - radius, angle: 0 }, radius, 0.04, 0x163e62, true);
    });
    braziers.forEach(b => {
      const h = { ...b, angle: 0, length: 0 } as SnowHazard;
      put(0, h, b.radius, 0.08, 0xffcf7b);
      put(5, h, 24, 0, 0x594c42);
      put(1, h, 17, 1.0, 0xffa348);
    });
    this.meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
  }
}
