import { FROST_TRAIL, MINI_BOSS_VARIANTS } from '../../config/balance';
import * as THREE from 'three';
import { ENEMY_DYING_MS, ENEMY_SLIP_MS, EnemyState } from '../../core/session/entities';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';
import { Pool } from '../../core/Pool';
import { POWER_TUNING } from '../../core/systems/PowerTierSystem';
import { NEUTRAL_TUNING, Swarm } from '../../core/systems/NeutralSystem';
import { FrostPatch } from '../../core/systems/FrostTrail';
import { BakedEnemyModel, createEnemyModels } from '../models/enemies';
import { PALETTE, toonMaterial } from '../materials';
import { WORLD_SCALE, yawFromSimDirection } from '../space';
import { groundSector } from '../vfx/CombatEffects';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Enemy tints for the heroes' power tiers. */
const POWER_TINTS = { bleed: new THREE.Color(0xff3030), slow: new THREE.Color(0x8fd8ff), held: new THREE.Color(0x6fdc5a), gold: new THREE.Color(0xffc93a) };

/** Walkers rise out of the ground over this long after spawning. */
const RISE_MS = 420;
const HIT_FLASH_MS = 110;
/** Game-units/s at which the baked walk cycle plays at 1× (slow Super Esqueletos shuffle, Aparições glide). */
const WALK_REFERENCE_SPEED = 120;
const VARIANTS: EnemyVariantId[] = ['skeleton', 'superSkeleton', 'necromancerWraith', 'apparitionWraith', 'frostSkeleton', 'frostSpirit', 'snowShaman', 'snowman', 'iceTroll', 'iceWolf', 'boar', 'stag', 'doe', 'hive', 'mimic', 'iceBlock'];
/** finalBoss is drawn by BossView (its mesh entry here is never used). */
const MESH_FOR: Record<EnemyVariantId, EnemyVariantId> = { skeleton: 'skeleton', superSkeleton: 'superSkeleton', necromancerWraith: 'necromancerWraith', apparitionWraith: 'apparitionWraith', frostSkeleton: 'frostSkeleton', frostSpirit: 'frostSpirit', snowShaman: 'snowShaman', snowman: 'snowman', iceTroll: 'iceTroll', iceWolf: 'iceWolf', finalBoss: 'superSkeleton', gravedigger: 'superSkeleton', templeGuardian: 'superSkeleton', frostKnight: 'superSkeleton', iceSerpent: 'superSkeleton', bellringer: 'superSkeleton', ancientYeti: 'superSkeleton', lakeSpirit: 'superSkeleton', boar: 'boar', stag: 'stag', doe: 'doe', hive: 'hive', mimic: 'mimic', iceBlock: 'iceBlock' };

/** The "!" over a neutral: yellow when it has just noticed the hero, red while it's angry. */
const ALERT_COLORS = { startled: new THREE.Color(0xffd23a), angry: new THREE.Color(0xff3a2a) };
/** Height of the startled hop (world units) and of the "!" above the model's head (in model sizes). */
const STARTLE_HOP = 0.35;
const ALERT_HEIGHT = 1.25;
const UP = new THREE.Vector3(0, 1, 0);
const MAX_SWARMS = 8;
const BEES_PER_SWARM = 18;
const BEE_YELLOW = new THREE.Color(0xffd23a);
const BEE_DARK = new THREE.Color(0x2a2010);

function alertMarkGeometry(): THREE.BufferGeometry {
  const bar = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  bar.translate(0, 0.32, 0);
  const dot = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  return mergeGeometries([bar.toNonIndexed(), dot.toNonIndexed()])!;
}

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
  /** "!" marks over startled and angry neutrals. */
  readonly alerts: THREE.InstancedMesh;
  /** The red lane on the ground showing where a neutral is about to charge. */
  readonly lanes: THREE.InstancedMesh;
  /** The Colmeia's swarms: a buzzing cloud of bees each. */
  private readonly bees: THREE.InstancedMesh;
  /** The Espírito da Geada's frost trail: six-sided patches of pale ice that spread, then melt away. */
  private readonly frost: THREE.InstancedMesh;
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
  private readonly fateTint = new THREE.Color(0xb26bff);

  constructor(capacity: number) {
    const models = createEnemyModels();
    VARIANTS.forEach((variant) => {
      const model = models[variant];
      const material = toonMaterial({ vertexColors: true, flatShading: true });
      if (variant === 'apparitionWraith' || variant === 'frostSpirit') {
        material.transparent = true;
        material.opacity = variant === 'frostSpirit' ? 0.78 : 0.82;
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
    this.alerts = new THREE.InstancedMesh(alertMarkGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), capacity);
    this.alerts.frustumCulled = false;
    this.alerts.count = 0;
    // A unit slab along +X, from the creature to the end of its charge.
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    this.lanes = new THREE.InstancedMesh(lane, new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), capacity);
    this.lanes.frustumCulled = false;
    this.lanes.count = 0;
    this.bees = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.07, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd23a }), MAX_SWARMS * BEES_PER_SWARM);
    this.bees.frustumCulled = false;
    this.bees.count = 0;
    this.frost = new THREE.InstancedMesh(groundSector(Math.PI * 2, 0, 1, 6), new THREE.MeshBasicMaterial({ color: 0x8ccff5, transparent: true, opacity: 0.55, depthWrite: false }), FROST_TRAIL.maxPatches);
    this.frost.frustumCulled = false;
    this.frost.count = 0;
    this.root.add(this.blobShadows, this.rottenAuras, this.alerts, this.lanes, this.bees, this.frost);
  }

  update(enemies: Pool<EnemyState>, alpha: number, nowMs: number, deltaSeconds: number): void {
    this.batches.forEach((batch) => { batch.count = 0; });
    let blobIndex = 0;
    let auraIndex = 0;
    let alertIndex = 0;
    let laneIndex = 0;
    enemies.forEachActive((enemy) => {
      if (enemy.variantId === 'finalBoss' || enemy.variantId in MINI_BOSS_VARIANTS) {
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
      const speedFactor = model.hovers ? 1 : enemy.effectiveMovementSpeed(nowMs) / WALK_REFERENCE_SPEED;
      const frozen = dying > 0 || slipping || stunned || (!model.hovers && enemy.isStatic);
      // Passing for a chest: lid shut, not a twitch (beyond the shiver below).
      const playingDead = !!model.stillWhileCalm && enemy.calmNeutral;
      let phase = this.phases.get(enemy) ?? Math.abs(enemy.x * 0.0137 + enemy.y * 0.0071) % 1;
      if (playingDead) phase = 0;
      else if (!frozen) phase = (phase + (deltaSeconds * speedFactor) / model.cycleSeconds) % 1;
      this.phases.set(enemy, phase);
      this.writeMorph(batch, index, phase);

      const previousYaw = this.yaws.get(enemy) ?? yawFromSimDirection(enemy.facingX, enemy.facingY);
      const targetYaw = yawFromSimDirection(enemy.facingX, enemy.facingY);
      const yaw = slipping ? previousYaw : previousYaw + Math.atan2(Math.sin(targetYaw - previousYaw), Math.cos(targetYaw - previousYaw)) * Math.min(1, deltaSeconds * 10);
      this.yaws.set(enemy, yaw);

      // Skeletons climb out of the ground when they appear (the boss's undead squad most visibly).
      const rising = model.hovers ? 0 : Math.max(0, 1 - (nowMs - enemy.spawnedAt) / RISE_MS);
      // The Mago's hurricane carries it up and turns it over in the air.
      const liftLeft = enemy.liftedUntil - nowMs;
      const lift = liftLeft > 0 ? Math.min(1, liftLeft / 250, (POWER_TUNING.hurricaneLiftMs - liftLeft) / 250) * (2.2 + Math.sin(nowMs / 140 + x) * 0.3) : 0;
      // A neutral that notices the hero hops in surprise.
      const startleLeft = enemy.startledUntil - nowMs;
      const hop = startleLeft > 0 ? Math.sin((1 - startleLeft / NEUTRAL_TUNING.startleMs) * Math.PI) * STARTLE_HOP * size : 0;
      // A mimic shivers as the hero walks up; anything digging in for an attack trembles too.
      const shake = enemy.trembleUntil > nowMs ? 0.035 : enemy.windupUntil > nowMs ? 0.025 : 0;
      this.position.set(x + Math.sin(nowMs / 23) * shake * size, lift + hop - dying * 0.9 * size - rising * rising * 2 * size, z + Math.cos(nowMs / 29) * shake * size);
      // A slip throws it flat on its back (quick fall, lies there, scrambles up at the end).
      const slipLeft = enemy.slipUntil - nowMs;
      const fallen = slipping ? Math.min(1, (ENEMY_SLIP_MS - slipLeft) / 110) * Math.min(1, slipLeft / 180) : 0;
      this.euler.set(-dying * 1.3 - fallen * 1.45 + lift * 0.5, yaw + (lift > 0 ? nowMs / 120 : 0), 0, 'YXZ');
      this.rotation.setFromEuler(this.euler);
      this.scale.setScalar(size * (1 - dying * 0.3));
      batch.mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));

      this.color.setRGB(1, 1, 1);
      if (enemy.slowStackPercent > 0) this.color.lerp(this.bananaTint, Math.min(0.8, enemy.slowStackPercent * 1.6));
      if (enemy.markedUntil > nowMs) this.color.lerp(this.fateTint, 0.6 + Math.sin(nowMs / 120) * 0.15);
      // Power tiers: a bleed, a slow, roots, gold.
      if (enemy.bleedUntil > nowMs) this.color.lerp(POWER_TINTS.bleed, 0.45);
      if (enemy.slowUntil > nowMs) this.color.lerp(POWER_TINTS.slow, 0.4);
      if (enemy.heldUntil > nowMs) this.color.lerp(POWER_TINTS.held, 0.5);
      if (enemy.gilded) this.color.copy(POWER_TINTS.gold).multiplyScalar(1.6);
      // Digging in before a charge: it flushes red and trembles.
      const windingUp = enemy.windupUntil > nowMs;
      if (windingUp) this.color.lerp(ALERT_COLORS.angry, 0.35 + Math.sin(nowMs / 40) * 0.15);
      if (nowMs - enemy.lastHitAt < HIT_FLASH_MS) this.color.multiplyScalar(3.2);
      batch.mesh.setColorAt(index, this.color);
      if (enemy.neutral && enemy.alive && (startleLeft > 0 || enemy.mood === 'angry')) {
        this.position.set(x + (windingUp ? Math.sin(nowMs / 25) * 0.04 : 0), (ALERT_HEIGHT + 0.08 * Math.sin(nowMs / 160)) * size + hop, z);
        this.rotation.identity();
        this.scale.setScalar(size);
        this.alerts.setMatrixAt(alertIndex, this.matrix.compose(this.position, this.rotation, this.scale));
        this.alerts.setColorAt(alertIndex, startleLeft > 0 ? ALERT_COLORS.startled : ALERT_COLORS.angry);
        alertIndex += 1;
      }
      if (windingUp && enemy.windupReach > 0 && enemy.alive) {
        this.position.set(x, 0.06, z);
        this.rotation.setFromAxisAngle(UP, -Math.atan2(enemy.windupDirY, enemy.windupDirX));
        this.scale.set(enemy.windupReach * WORLD_SCALE, 1, enemy.radius * 2 * WORLD_SCALE);
        this.lanes.setMatrixAt(laneIndex, this.matrix.compose(this.position, this.rotation, this.scale));
        laneIndex += 1;
      }

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
    this.alerts.count = alertIndex;
    this.alerts.instanceMatrix.needsUpdate = true;
    if (this.alerts.instanceColor) this.alerts.instanceColor.needsUpdate = true;
    this.lanes.count = laneIndex;
    this.lanes.instanceMatrix.needsUpdate = true;
    (this.lanes.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(nowMs / 60));
  }

  /** Each swarm is a cloud of bees circling its centre on their own wobbling orbits, every other one dark. */
  updateSwarms(swarms: readonly Swarm[], alpha: number, nowMs: number): void {
    let index = 0;
    const t = nowMs / 1000;
    swarms.slice(0, MAX_SWARMS).forEach((swarm, swarmIndex) => {
      const cx = (swarm.prevX + (swarm.x - swarm.prevX) * alpha) * WORLD_SCALE;
      const cz = (swarm.prevY + (swarm.y - swarm.prevY) * alpha) * WORLD_SCALE;
      const radius = NEUTRAL_TUNING.swarmRadius * WORLD_SCALE;
      for (let bee = 0; bee < BEES_PER_SWARM; bee += 1) {
        const seed = bee * 2.39996 + swarmIndex * 7.1;
        const angle = seed + t * (3 + (bee % 4));
        const reach = radius * (0.35 + 0.65 * Math.abs(Math.sin(seed * 3.7 + t * 1.3)));
        this.position.set(cx + Math.cos(angle) * reach, 0.9 + Math.sin(seed * 5 + t * 6) * 0.35, cz + Math.sin(angle) * reach);
        this.rotation.setFromAxisAngle(UP, -angle);
        this.scale.setScalar(1);
        this.bees.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
        this.bees.setColorAt(index, bee % 2 ? BEE_DARK : BEE_YELLOW);
        index += 1;
      }
    });
    this.bees.count = index;
    this.bees.instanceMatrix.needsUpdate = true;
    if (this.bees.instanceColor) this.bees.instanceColor.needsUpdate = true;
  }

  /** Each patch spreads out in its first fifth of life and shrinks away in its last third, at its own tilt. */
  updateFrostTrail(patches: readonly FrostPatch[], nowMs: number): void {
    const count = Math.min(patches.length, FROST_TRAIL.maxPatches);
    for (let index = 0; index < count; index += 1) {
      const patch = patches[index];
      const age = (nowMs - patch.bornAt) / FROST_TRAIL.lifetimeMs;
      const grow = Math.min(1, age * 5) * Math.min(1, (1 - age) * 3);
      this.position.set(patch.x * WORLD_SCALE, 0.035 + (index % 4) * 0.002, patch.y * WORLD_SCALE);
      this.rotation.setFromAxisAngle(UP, (patch.x * 0.37 + patch.y * 0.61) % Math.PI);
      this.scale.setScalar(Math.max(0.001, FROST_TRAIL.radius * WORLD_SCALE * grow));
      this.frost.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
    }
    this.frost.count = count;
    this.frost.instanceMatrix.needsUpdate = true;
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
