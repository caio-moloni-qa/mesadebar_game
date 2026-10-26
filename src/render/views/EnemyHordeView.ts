import * as THREE from 'three';
import { ENEMY_DYING_MS, EnemyState } from '../../core/session/entities';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';
import { Pool } from '../../core/Pool';
import { BakedEnemyModel, createEnemyModels } from '../models/enemies';
import { PALETTE, toonMaterial } from '../materials';
import { WORLD_SCALE, yawFromSimDirection } from '../space';
import { groundSector } from '../vfx/CombatEffects';

/** Walkers rise out of the ground over this long after spawning. */
const RISE_MS = 420;
const HIT_FLASH_MS = 110;
/** Game-units/s at which the baked walk cycle plays at 1× (slow Super Esqueletos shuffle, Aparições glide). */
const WALK_REFERENCE_SPEED = 120;
const VARIANTS: EnemyVariantId[] = ['skeleton', 'superSkeleton', 'necromancerWraith', 'apparitionWraith'];
/** finalBoss is drawn by BossView (its mesh entry here is never used). */
const MESH_FOR: Record<EnemyVariantId, EnemyVariantId> = { skeleton: 'skeleton', superSkeleton: 'superSkeleton', necromancerWraith: 'necromancerWraith', apparitionWraith: 'apparitionWraith', finalBoss: 'superSkeleton', gravedigger: 'superSkeleton', templeGuardian: 'superSkeleton' };

interface VariantBatch {
  model: BakedEnemyModel;
  mesh: THREE.InstancedMesh;
  /** Proxy whose morphTargetInfluences are written per instance through InstancedMesh.setMorphAt. */
  morphProxy: THREE.Mesh;
  count: number;
}

/** All pooled enemies, one InstancedMesh per variant with its walk/float cycle baked into morph targets: each instance
 *  blends two consecutive frames at its own phase (setMorphAt), so 240 animated enemies cost a handful of draw calls.
 *  Hits flash through the instance colour, Fabri's banana slow tints it, dying enemies sink and tip over. */
export class EnemyHordeView {
  readonly root = new THREE.Group();
  readonly blobShadows: THREE.InstancedMesh;
  /** Aura Podre under Super Esqueletos (and the boss later): dark grey/black disc, like the 2D build's. */
  readonly rottenAuras: THREE.InstancedMesh;
  private readonly batches = new Map<EnemyVariantId, VariantBatch>();
  private readonly phases = new WeakMap<EnemyState, number>();
  private readonly yaws = new WeakMap<EnemyState, number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly color = new THREE.Color();
  private readonly bananaTint = new THREE.Color(0xf2d33b);

  constructor(capacity: number) {
    const models = createEnemyModels();
    VARIANTS.forEach((variant) => {
      const model = models[variant];
      const material = toonMaterial({ vertexColors: true, flatShading: true });
      if (variant === 'apparitionWraith') {
        material.transparent = true;
        material.opacity = 0.82;
      }
      const mesh = new THREE.InstancedMesh(model.geometry, material, capacity);
      mesh.frustumCulled = false;
      const morphProxy = new THREE.Mesh(model.geometry);
      // setMorphAt sizes its morph texture from `count` on the first call, so initialise every slot at full
      // capacity before the per-frame count shrinks to the live instances.
      morphProxy.morphTargetInfluences!.fill(0);
      morphProxy.morphTargetInfluences![0] = 1;
      for (let index = 0; index < capacity; index += 1) mesh.setMorphAt(index, morphProxy);
      mesh.count = 0;
      this.batches.set(variant, { model, mesh, morphProxy, count: 0 });
      this.root.add(mesh);
    });
    const blob = groundSector(Math.PI * 2, 0, 0.5, 8);
    this.blobShadows = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ color: PALETTE.blobShadow, transparent: true, opacity: 0.45, depthWrite: false }), capacity);
    this.blobShadows.frustumCulled = false;
    this.blobShadows.count = 0;
    this.rottenAuras = new THREE.InstancedMesh(groundSector(Math.PI * 2, 0, 1, 24), new THREE.MeshBasicMaterial({ color: 0x1c1a1e, transparent: true, opacity: 0.4, depthWrite: false }), capacity);
    this.rottenAuras.frustumCulled = false;
    this.rottenAuras.count = 0;
    this.root.add(this.blobShadows, this.rottenAuras);
  }

  update(enemies: Pool<EnemyState>, alpha: number, nowMs: number, deltaSeconds: number): void {
    this.batches.forEach((batch) => { batch.count = 0; });
    let blobIndex = 0;
    let auraIndex = 0;
    enemies.forEachActive((enemy) => {
      if (enemy.variantId === 'finalBoss' || enemy.variantId === 'gravedigger' || enemy.variantId === 'templeGuardian') {
        // Drawn by their own rigged views (BossView, MiniBossView); only the boss's Rotten Aura ring lives here.
        if (enemy.hasRottenAura && !enemy.rottenAuraSuppressed && enemy.alive) {
          this.position.set((enemy.prevX + (enemy.x - enemy.prevX) * alpha) * WORLD_SCALE, 0.04, (enemy.prevY + (enemy.y - enemy.prevY) * alpha) * WORLD_SCALE);
          this.rotation.identity();
          this.scale.setScalar(enemy.rottenAuraRadius * WORLD_SCALE * (1 + Math.sin(nowMs / 300) * 0.04));
          this.rottenAuras.setMatrixAt(auraIndex, this.matrix.compose(this.position, this.rotation, this.scale));
          auraIndex += 1;
        }
        return;
      }
      const batch = this.batches.get(MESH_FOR[enemy.variantId])!;
      const index = batch.count;
      batch.count += 1;
      const x = (enemy.prevX + (enemy.x - enemy.prevX) * alpha) * WORLD_SCALE;
      const z = (enemy.prevY + (enemy.y - enemy.prevY) * alpha) * WORLD_SCALE;
      const size = enemy.displaySize / 62;
      const dying = enemy.phase === 'dying' ? 1 - Math.max(0, enemy.phaseEndsAt - nowMs) / ENEMY_DYING_MS : 0;
      const slipping = nowMs < enemy.slipUntil;
      const stunned = nowMs < enemy.hitStunUntil;

      // Advance this enemy's own cycle phase: walkers by their real speed, hoverers at a steady float.
      const { model } = batch;
      const speedFactor = model.hovers ? 1 : enemy.effectiveMovementSpeed() / WALK_REFERENCE_SPEED;
      const frozen = dying > 0 || slipping || stunned || (!model.hovers && enemy.isStatic);
      let phase = this.phases.get(enemy) ?? Math.abs(enemy.x * 0.0137 + enemy.y * 0.0071) % 1;
      if (!frozen) phase = (phase + (deltaSeconds * speedFactor) / model.cycleSeconds) % 1;
      this.phases.set(enemy, phase);
      this.writeMorph(batch, index, phase);

      const previousYaw = this.yaws.get(enemy) ?? yawFromSimDirection(enemy.facingX, enemy.facingY);
      const targetYaw = yawFromSimDirection(enemy.facingX, enemy.facingY);
      const yaw = slipping ? previousYaw + deltaSeconds * 14 : previousYaw + Math.atan2(Math.sin(targetYaw - previousYaw), Math.cos(targetYaw - previousYaw)) * Math.min(1, deltaSeconds * 10);
      this.yaws.set(enemy, yaw);

      // Skeletons climb out of the ground when they appear (the boss's undead squad most visibly).
      const rising = model.hovers ? 0 : Math.max(0, 1 - (nowMs - enemy.spawnedAt) / RISE_MS);
      this.position.set(x, -dying * 0.9 * size - rising * rising * 2 * size, z);
      this.euler.set(-dying * 1.3, yaw, 0, 'YXZ');
      this.rotation.setFromEuler(this.euler);
      this.scale.setScalar(size * (1 - dying * 0.3));
      batch.mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));

      this.color.setRGB(1, 1, 1);
      if (enemy.slowStackPercent > 0) this.color.lerp(this.bananaTint, Math.min(0.8, enemy.slowStackPercent * 1.6));
      if (nowMs - enemy.lastHitAt < HIT_FLASH_MS) this.color.multiplyScalar(3.2);
      batch.mesh.setColorAt(index, this.color);

      this.position.set(x, 0.03, z);
      this.rotation.identity();
      this.scale.setScalar(size * (1 - dying) * (model.hovers ? 0.8 : 1));
      this.blobShadows.setMatrixAt(blobIndex, this.matrix.compose(this.position, this.rotation, this.scale));
      blobIndex += 1;
      if (enemy.hasRottenAura && !enemy.rottenAuraSuppressed && enemy.alive) {
        this.position.set(x, 0.04, z);
        this.scale.setScalar(enemy.rottenAuraRadius * WORLD_SCALE * (1 + Math.sin(nowMs / 300) * 0.04));
        this.rottenAuras.setMatrixAt(auraIndex, this.matrix.compose(this.position, this.rotation, this.scale));
        auraIndex += 1;
      }
    });
    this.batches.forEach(({ mesh, count }) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh.morphTexture) mesh.morphTexture.needsUpdate = true;
    });
    this.blobShadows.count = blobIndex;
    this.blobShadows.instanceMatrix.needsUpdate = true;
    this.rottenAuras.count = auraIndex;
    this.rottenAuras.instanceMatrix.needsUpdate = true;
  }

  /** Blend the two baked frames around `phase` (0..1 over the cycle). */
  private writeMorph(batch: VariantBatch, index: number, phase: number): void {
    const influences = batch.morphProxy.morphTargetInfluences!;
    const position = phase * batch.model.frames;
    const frame = Math.floor(position) % batch.model.frames;
    const next = (frame + 1) % batch.model.frames;
    const blend = position - Math.floor(position);
    influences.fill(0);
    influences[frame] = 1 - blend;
    influences[next] += blend;
    batch.mesh.setMorphAt(index, batch.morphProxy);
  }
}
