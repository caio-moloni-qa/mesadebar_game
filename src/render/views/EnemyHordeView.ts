import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENEMY_DYING_MS, EnemyState } from '../../core/session/entities';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';
import { Pool } from '../../core/Pool';
import { PALETTE, toonMaterial } from '../materials';
import { WORLD_SCALE, yawFromSimDirection } from '../space';

const HIT_FLASH_MS = 110;
/** Per-variant tint multiplied over the bone/steel vertex colors (placeholder until real models). */
const VARIANT_TINT: Record<EnemyVariantId, number> = {
  skeleton: 0xffffff,
  necromancerWraith: 0x9a6bd8,
  apparitionWraith: 0x8fe6ff,
  superSkeleton: 0xd8cfb8,
  finalBoss: 0x7dff9a
};

/** Every pooled enemy drawn by one InstancedMesh (+ one for blob shadows): one draw call per pass no matter how many
 *  are alive — the plan's first step for 240-enemy hordes, before morph-target walk cycles (Etapa 5). Walk is faked
 *  with a bob + sway in the instance matrix; hits flash by pushing the instance color past white; dying enemies
 *  sink and shrink over ENEMY_DYING_MS. */
export class EnemyHordeView {
  readonly root = new THREE.Group();
  readonly blobShadows: THREE.InstancedMesh;
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly color = new THREE.Color();
  private readonly yaws = new WeakMap<EnemyState, number>();

  constructor(capacity: number) {
    this.mesh = new THREE.InstancedMesh(skeletonGeometry(), toonMaterial({ vertexColors: true, flatShading: true }), capacity);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const blob = new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2);
    this.blobShadows = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ color: PALETTE.blobShadow, transparent: true, opacity: 0.45, depthWrite: false }), capacity);
    this.blobShadows.frustumCulled = false;
    this.blobShadows.count = 0;
    this.root.add(this.mesh, this.blobShadows);
  }

  update(enemies: Pool<EnemyState>, alpha: number, nowMs: number, deltaSeconds: number): void {
    let index = 0;
    enemies.forEachActive((enemy) => {
      const x = (enemy.prevX + (enemy.x - enemy.prevX) * alpha) * WORLD_SCALE;
      const z = (enemy.prevY + (enemy.y - enemy.prevY) * alpha) * WORLD_SCALE;
      const size = enemy.displaySize / 62;
      const dyingProgress = enemy.phase === 'dying' ? 1 - Math.max(0, enemy.phaseEndsAt - nowMs) / ENEMY_DYING_MS : 0;
      const time = nowMs / 1000 + (enemy.x * 0.013 + enemy.y * 0.007);
      const hovering = enemy.variantId === 'necromancerWraith' || enemy.variantId === 'apparitionWraith';
      const bob = hovering ? 0.35 + Math.sin(time * 2.4) * 0.12 : Math.abs(Math.sin(time * 9)) * 0.08;

      const previousYaw = this.yaws.get(enemy) ?? yawFromSimDirection(enemy.facingX, enemy.facingY);
      const targetYaw = yawFromSimDirection(enemy.facingX, enemy.facingY);
      const yaw = previousYaw + Math.atan2(Math.sin(targetYaw - previousYaw), Math.cos(targetYaw - previousYaw)) * Math.min(1, deltaSeconds * 10);
      this.yaws.set(enemy, yaw);

      this.position.set(x, bob * size - dyingProgress * 1.2 * size, z);
      this.euler.set(dyingProgress * 0.9, yaw, hovering ? 0 : Math.sin(time * 9) * 0.1);
      this.rotation.setFromEuler(this.euler);
      const shrink = 1 - dyingProgress * 0.6;
      this.scale.setScalar(size * shrink);
      this.mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));

      this.color.setHex(VARIANT_TINT[enemy.variantId]);
      if (nowMs - enemy.lastHitAt < HIT_FLASH_MS) this.color.multiplyScalar(3.2);
      this.mesh.setColorAt(index, this.color);

      this.position.set(x, 0.03, z);
      this.rotation.identity();
      this.scale.setScalar(size * (1 - dyingProgress) * (hovering ? 0.8 : 1));
      this.blobShadows.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      index += 1;
    });
    this.mesh.count = index;
    this.blobShadows.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.blobShadows.instanceMatrix.needsUpdate = true;
  }
}

/** ~1.9 m skeleton with a sword, from boxes, vertex-colored so one material/draw call covers everything. */
function skeletonGeometry(): THREE.BufferGeometry {
  const parts: Array<{ size: [number, number, number]; at: [number, number, number]; color: number }> = [
    { size: [0.16, 0.8, 0.16], at: [-0.15, 0.4, 0], color: PALETTE.bone },
    { size: [0.16, 0.8, 0.16], at: [0.15, 0.4, 0], color: PALETTE.bone },
    { size: [0.5, 0.18, 0.28], at: [0, 0.86, 0], color: PALETTE.boneDark },
    { size: [0.44, 0.62, 0.26], at: [0, 1.22, 0], color: PALETTE.bone },
    { size: [0.13, 0.62, 0.13], at: [-0.33, 1.18, 0.04], color: PALETTE.bone },
    { size: [0.13, 0.62, 0.13], at: [0.33, 1.18, 0.1], color: PALETTE.bone },
    { size: [0.46, 0.42, 0.42], at: [0, 1.78, 0.02], color: PALETTE.bone },
    { size: [0.3, 0.1, 0.05], at: [0, 1.74, 0.24], color: 0x2a2030 },
    { size: [0.08, 0.95, 0.04], at: [0.36, 1.2, 0.5], color: PALETTE.steel },
    { size: [0.26, 0.06, 0.08], at: [0.36, 0.76, 0.5], color: PALETTE.wood }
  ];
  const geometries = parts.map(({ size, at, color }) => {
    const box = new THREE.BoxGeometry(...size).toNonIndexed();
    box.translate(...at);
    const rgb = new THREE.Color(color);
    const colors = new Float32Array(box.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i);
    box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return box;
  });
  return mergeGeometries(geometries)!;
}
