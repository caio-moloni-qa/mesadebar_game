import * as THREE from 'three';
import { ICE_TROLL } from '../../config/balance';
import { GameSession } from '../../core/session/GameSession';
import { SHATTER_MS } from '../../core/systems/IcicleField';
import { WORLD_SCALE } from '../space';

/** Shared instanced warnings and falling ice; all timing comes from the simulation. */
export class SnowfieldView {
  readonly root = new THREE.Group();
  /** Ice around the hero shares the character pass, so compositing cannot hide it behind the hero. */
  readonly heroIce = new THREE.Group();
  private readonly warnings: THREE.InstancedMesh;
  private readonly spikes: THREE.InstancedMesh;
  private readonly auras: THREE.InstancedMesh;
  // Character compositing keeps alpha > 0.5; lower opacity erases the ice outside the hero's silhouette.
  private readonly prison = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x9de6ff, transparent: true, opacity: 0.65, depthWrite: false }));
  private readonly stacks: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(capacity: number) {
    const disc = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
    this.warnings = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0xe64e86, transparent: true, opacity: 0.85, depthWrite: false }), capacity * ICE_TROLL.icicles);
    this.spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 1.7, 5).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x91dcff }), capacity * ICE_TROLL.icicles);
    this.auras = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x469ee8, transparent: true, opacity: 0.3, depthWrite: false }), capacity);
    this.stacks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0x75d9ff }), 5);
    for (const mesh of [this.warnings, this.spikes, this.auras, this.stacks]) { mesh.count = 0; mesh.frustumCulled = false; }
    this.prison.visible = false;
    this.prison.renderOrder = 5;
    this.heroIce.add(this.stacks, this.prison);
    this.root.add(this.warnings, this.spikes, this.auras, this.heroIce);
  }

  update(session: GameSession, alpha: number, now: number): void {
    let warning = 0;
    let spike = 0;
    for (const ice of session.icicles.icicles) {
      if (warning >= this.warnings.instanceMatrix.count) break;
      const progress = THREE.MathUtils.clamp((now - ice.markedAt) / ICE_TROLL.warnMs, 0, 1);
      const radius = ICE_TROLL.icicleRadius * WORLD_SCALE;
      this.place(this.warnings, warning++, ice.x * WORLD_SCALE, 0.07, ice.y * WORLD_SCALE, radius, 1, radius);
      this.place(this.spikes, spike++, ice.x * WORLD_SCALE, 0.85 + (1 - progress) * 7, ice.y * WORLD_SCALE, 1, 1, 1);
    }
    for (const ice of session.icicles.shatters) {
      if (spike >= this.spikes.instanceMatrix.count) break;
      const left = Math.max(0, 1 - (now - ice.at) / SHATTER_MS);
      this.place(this.spikes, spike++, ice.x * WORLD_SCALE, 0.3 * left, ice.y * WORLD_SCALE, 1.5 * left, 0.4 * left, 1.5 * left);
    }
    let aura = 0;
    session.enemies.forEachActive((enemy) => {
      if (!enemy.alive || !enemy.hasFrostAura) return;
      const radius = enemy.frostAuraRadius * WORLD_SCALE;
      this.place(this.auras, aura++, (enemy.prevX + (enemy.x - enemy.prevX) * alpha) * WORLD_SCALE, 0.045, (enemy.prevY + (enemy.y - enemy.prevY) * alpha) * WORLD_SCALE, radius, 1, radius);
    });
    const player = session.player;
    const x = (player.prevX + (player.x - player.prevX) * alpha) * WORLD_SCALE;
    const z = (player.prevY + (player.y - player.prevY) * alpha) * WORLD_SCALE;
    this.prison.visible = player.alive && player.isFrozen(now);
    this.prison.position.set(x, 1.05, z);
    this.prison.scale.set(0.85, 1.4, 0.85);
    const stacks = player.alive ? player.frostStacksAt(now) : 0;
    for (let i = 0; i < stacks; i++) this.place(this.stacks, i, x + (i - (stacks - 1) / 2) * 0.19, 2.2, z, 1, 1, 1);
    for (const [mesh, count] of [[this.warnings, warning], [this.spikes, spike], [this.auras, aura], [this.stacks, stacks]] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
}
