import * as THREE from 'three';
import { BOSS_TUNING, BossState, BossSystem } from '../../core/systems/BossSystem';
import { GameSession, PortalKind } from '../../core/session/GameSession';
import { weaponGeometry } from '../models/weapons';
import { WORLD_SCALE, simToWorld } from '../space';

/** Necro-green palette (Phaser BossSystem colours). */
const GREEN = { base: 0x45ff90, blink: 0xd6ffd0, ring: 0x8cff8c, beamCore: 0xd6ffd0, beamGlow: 0x35c96b, meteor: 0x2fe86a, shield: 0x48ff52, reticle: 0x8cffb0 };
const PORTAL_COLORS: Record<PortalKind, number> = { end: 0x9fb4ff, continue: 0x7dffa0 };
const MAX_BEAMS = BOSS_TUNING.beamCountPhase2;
const MAX_METEORS = 48;
const SWORD_SCALE = 4.2;
const SWORD_HEIGHT = 1.4;
const BEAM_HEIGHT = 1.1;
const METEOR_FALL_HEIGHT = 14;
const SWEEP_FADE_SECONDS = 0.26;
const ARC_SEGMENTS = 64;
const UP = new THREE.Vector3(0, 1, 0);

const additive = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** The swept arc: a flat ring whose draw range grows with the sweep (RingGeometry orders its indices by angle). */
function arcRing(): THREE.Mesh {
  const radius = BOSS_TUNING.meleeSwingRadius * WORLD_SCALE;
  const geometry = new THREE.RingGeometry(radius - 0.35, radius + 0.35, ARC_SEGMENTS, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, additive(GREEN.ring, 0.75));
  mesh.renderOrder = 2;
  return mesh;
}

/** One boss's reusable pieces. */
class BossRig {
  readonly root = new THREE.Group();
  readonly sword: THREE.Mesh;
  readonly arc: THREE.Mesh;
  arcFade = 0;
  readonly shield: THREE.Mesh;
  readonly beams: THREE.Group[] = [];
  readonly lockLine: THREE.Line;

  constructor(swordGeometry: THREE.BufferGeometry, shieldGeometry: THREE.BufferGeometry, beamGeometry: THREE.BufferGeometry) {
    this.sword = new THREE.Mesh(swordGeometry, new THREE.MeshBasicMaterial({ color: GREEN.base }));
    this.sword.scale.setScalar(SWORD_SCALE);
    this.arc = arcRing();
    this.shield = new THREE.Mesh(shieldGeometry, additive(GREEN.shield, 0.16));
    this.shield.scale.setScalar(230 * WORLD_SCALE);
    for (let index = 0; index < MAX_BEAMS; index += 1) {
      const beam = new THREE.Group();
      const glow = new THREE.Mesh(beamGeometry, additive(GREEN.beamGlow, 0.35));
      glow.scale.z = BOSS_TUNING.beamWidth * WORLD_SCALE;
      const core = new THREE.Mesh(beamGeometry, additive(GREEN.beamCore, 0.9));
      core.scale.z = BOSS_TUNING.beamWidth * 0.4 * WORLD_SCALE;
      core.position.y = 0.01;
      beam.add(glow, core);
      beam.visible = false;
      this.beams.push(beam);
    }
    this.lockLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.lockLine.frustumCulled = false;
    this.root.add(this.sword, this.arc, this.shield, this.lockLine, ...this.beams);
    this.hideAll();
  }

  hideAll(): void {
    this.sword.visible = false;
    this.arc.visible = false;
    this.shield.visible = false;
    this.lockLine.visible = false;
    this.beams.forEach((beam) => { beam.visible = false; });
  }
}

/** Everything the boss fight draws in the world: the telegraph sword and its sweep arc, the lock-on reticle and line,
 *  Necro-Beams, meteors (ground warning + falling rock), the shield dome, and the end / continue portals. Reads the
 *  core BossSystem state every frame; one-shot explosions come through Game3D's event handlers. */
export class BossEffects {
  readonly root = new THREE.Group();
  private readonly rigs: BossRig[] = [];
  private readonly swordGeometry: THREE.BufferGeometry;
  private readonly shieldGeometry = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  /** Unit-length beam slab along +X from the origin (scaled to the grown length). */
  private readonly beamGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  private readonly reticle: THREE.Sprite;
  private readonly meteorWarnings: THREE.InstancedMesh;
  private readonly meteorRocks: THREE.InstancedMesh;
  private readonly portals: Record<PortalKind, THREE.Group>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private time = 0;

  constructor() {
    this.swordGeometry = weaponGeometry('sword');
    this.reticle = new THREE.Sprite(new THREE.SpriteMaterial({ color: GREEN.reticle, depthTest: false }));
    this.reticle.scale.setScalar(1.1);
    this.reticle.visible = false;
    this.meteorWarnings = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), additive(GREEN.beamGlow, 0.3), MAX_METEORS);
    this.meteorRocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: GREEN.meteor }), MAX_METEORS);
    [this.meteorWarnings, this.meteorRocks].forEach((mesh) => { mesh.count = 0; mesh.frustumCulled = false; });
    this.portals = { end: this.portal(PORTAL_COLORS.end), continue: this.portal(PORTAL_COLORS.continue) };
    this.root.add(this.reticle, this.meteorWarnings, this.meteorRocks, this.portals.end, this.portals.continue);
  }

  /** Lazily makes the reticle texture (canvas) the first time a lock-on shows — keeps construction DOM-free. */
  private ensureReticleTexture(): void {
    const material = this.reticle.material;
    if (material.map) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.strokeStyle = '#ffffff';
    context.fillStyle = '#ffffff';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(16, 16, 11, 0, Math.PI * 2);
    context.stroke();
    [[16, 1, 16, 8], [16, 24, 16, 31], [1, 16, 8, 16], [24, 16, 31, 16]].forEach(([x1, y1, x2, y2]) => { context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); });
    context.beginPath();
    context.arc(16, 16, 2.5, 0, Math.PI * 2);
    context.fill();
    material.map = new THREE.CanvasTexture(canvas);
    material.needsUpdate = true;
  }

  private portal(color: number): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 8, 32), new THREE.MeshBasicMaterial({ color }));
    const core = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), additive(color, 0.45));
    ring.position.y = core.position.y = 1.5;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32).rotateX(-Math.PI / 2), additive(color, 0.25));
    pool.position.y = 0.05;
    group.add(ring, core, pool);
    group.visible = false;
    return group;
  }

  update(session: GameSession, alpha: number, deltaSeconds: number): void {
    this.time += deltaSeconds;
    const { bosses } = session;
    while (this.rigs.length < bosses.bosses.length) {
      const rig = new BossRig(this.swordGeometry, this.shieldGeometry, this.beamGeometry);
      this.rigs.push(rig);
      this.root.add(rig.root);
    }
    let lockOn = false;
    this.rigs.forEach((rig, index) => {
      const boss = bosses.bosses[index];
      if (!boss) {
        rig.hideAll();
        return;
      }
      if (this.updateRig(rig, boss, bosses, session, alpha, deltaSeconds)) lockOn = true;
    });
    if (!lockOn) this.reticle.visible = false;
    this.updateMeteors(bosses);
    this.updatePortals(session, deltaSeconds);
  }

  /** Returns whether this boss is showing a lock-on (the reticle is shared). */
  private updateRig(rig: BossRig, boss: BossState, bosses: BossSystem, session: GameSession, alpha: number, deltaSeconds: number): boolean {
    const { enemy } = boss;
    const bossX = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
    const bossY = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
    const center = simToWorld(bossX, bossY, 0, this.position);

    // Telegraph sword: green with 3 light blinks while parked, then one orbit with a growing arc behind it.
    const sword = bosses.swordPosition(boss);
    rig.sword.visible = sword !== null;
    if (sword && boss.melee) {
      const swordWorld = simToWorld(bossX + Math.cos(sword.angle) * BOSS_TUNING.meleeSwingRadius, bossY + Math.sin(sword.angle) * BOSS_TUNING.meleeSwingRadius, SWORD_HEIGHT, this.scratch);
      rig.sword.position.copy(swordWorld);
      // Lies flat with the blade (+Y in the weapon model) along the orbit's tangent, the way it travels.
      const tangent = sword.angle + Math.PI / 2;
      rig.sword.quaternion.setFromUnitVectors(UP, this.scratch.set(Math.cos(tangent), 0, Math.sin(tangent)));
      const telegraph = boss.melee.phase === 'telegraph';
      const blinkStep = Math.floor((boss.melee.elapsedMs / BOSS_TUNING.meleeTelegraphMs) * 6);
      (rig.sword.material as THREE.MeshBasicMaterial).color.setHex(telegraph && blinkStep % 2 === 1 ? GREEN.blink : GREEN.base);
      if (telegraph) {
        // Rises out of the ground as it summons.
        rig.sword.scale.setScalar(SWORD_SCALE * Math.min(1, 0.3 + boss.melee.elapsedMs / 500));
      } else {
        rig.sword.scale.setScalar(SWORD_SCALE);
        const progress = Math.min(1, boss.melee.elapsedMs / BOSS_TUNING.meleeSweepMs);
        this.showArc(rig, center, boss.melee.startAngle, progress, 0.75);
        rig.arcFade = SWEEP_FADE_SECONDS;
      }
    } else if (rig.arcFade > 0) {
      rig.arcFade = Math.max(0, rig.arcFade - deltaSeconds);
      (rig.arc.material as THREE.MeshBasicMaterial).opacity = 0.75 * (rig.arcFade / SWEEP_FADE_SECONDS);
      rig.arc.position.set(center.x, 0.07, center.z);
      rig.arc.visible = rig.arcFade > 0;
    } else {
      rig.arc.visible = false;
    }

    // Shield dome while channelling, flashing white through a dash telegraph.
    rig.shield.visible = boss.shieldActive;
    if (boss.shieldActive) {
      rig.shield.position.set(center.x, 0, center.z);
      const flashing = boss.dash.phase === 'telegraph' && Math.floor((boss.dash.elapsedMs / BOSS_TUNING.dashTelegraphMs) * 6) % 2 === 0;
      const material = rig.shield.material as THREE.MeshBasicMaterial;
      material.color.setHex(flashing ? 0xffffff : GREEN.shield);
      material.opacity = flashing ? 0.4 : 0.14 + Math.sin(this.time * 9) * 0.03;
    }

    // Lock-on: white line from the boss to the hero and the reticle over the hero, blinking faster and faster.
    const lockOn = boss.beamState === 'lockon';
    rig.lockLine.visible = lockOn && boss.beamLockOnVisible;
    if (lockOn) {
      const { player } = session;
      const playerX = player.prevX + (player.x - player.prevX) * alpha;
      const playerY = player.prevY + (player.y - player.prevY) * alpha;
      const points = rig.lockLine.geometry.attributes.position as THREE.BufferAttribute;
      points.setXYZ(0, center.x, BEAM_HEIGHT, center.z);
      const target = simToWorld(playerX, playerY, BEAM_HEIGHT, this.scratch);
      points.setXYZ(1, target.x, target.y, target.z);
      points.needsUpdate = true;
      this.ensureReticleTexture();
      this.reticle.visible = boss.beamLockOnVisible;
      this.reticle.position.set(target.x, 3.2, target.z);
      this.reticle.scale.setScalar(1.1 * Math.min(1, 0.2 + boss.beamLockOnElapsed / 260));
    }

    // Beams: flat slabs from the boss, grown to their current length.
    rig.beams.forEach((mesh, index) => {
      const beam = boss.beams[index];
      mesh.visible = !!beam;
      if (!beam) return;
      const length = bosses.beamLength(beam) * WORLD_SCALE;
      mesh.position.set(center.x, BEAM_HEIGHT, center.z);
      mesh.rotation.set(0, -beam.angle, 0);
      mesh.children.forEach((child) => { child.scale.x = length; });
    });
    return lockOn;
  }

  private showArc(rig: BossRig, center: THREE.Vector3, startAngle: number, progress: number, opacity: number): void {
    rig.arc.visible = progress > 0;
    rig.arc.position.set(center.x, 0.07, center.z);
    // After rotateX(-90°) ring angle θ lies at (cos θ, -sin θ) on the ground, sim angle a at (cos a, sin a): the
    // z flip matches them, then a yaw of -startAngle starts the arc where the sword did (scale applies first).
    rig.arc.scale.set(1, 1, -1);
    rig.arc.rotation.set(0, -startAngle, 0);
    rig.arc.geometry.setDrawRange(0, Math.ceil(progress * ARC_SEGMENTS) * 6);
    (rig.arc.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  private updateMeteors(bosses: BossSystem): void {
    const count = Math.min(MAX_METEORS, bosses.meteors.length);
    for (let index = 0; index < count; index += 1) {
      const meteor = bosses.meteors[index];
      const t = Math.min(1, meteor.elapsedMs / meteor.telegraphMs);
      const ground = simToWorld(meteor.x, meteor.y, 0.06, this.position);
      const radius = BOSS_TUNING.meteorRadius * WORLD_SCALE;
      this.scale.set(radius, 1, radius);
      this.meteorWarnings.setMatrixAt(index, this.matrix.compose(ground, this.quaternion.identity(), this.scale));
      // Falls with Cubic.In, growing from a pebble to a boulder, landing as the telegraph ends.
      const height = METEOR_FALL_HEIGHT * (1 - t * t * t);
      this.scratch.set(ground.x, height + 0.4, ground.z);
      this.scale.setScalar(0.5 * (0.2 + 0.8 * t));
      this.meteorRocks.setMatrixAt(index, this.matrix.compose(this.scratch, this.quaternion.setFromAxisAngle(this.scratch.clone().set(1, 1, 0).normalize(), t * 6), this.scale));
    }
    this.meteorWarnings.count = count;
    this.meteorRocks.count = count;
    this.meteorWarnings.instanceMatrix.needsUpdate = true;
    this.meteorRocks.instanceMatrix.needsUpdate = true;
    (this.meteorWarnings.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(this.time * 24));
  }

  private updatePortals(session: GameSession, deltaSeconds: number): void {
    (['end', 'continue'] as const).forEach((kind) => {
      const group = this.portals[kind];
      const spot = session.portals?.[kind];
      group.visible = !!spot;
      if (!spot) return;
      simToWorld(spot.x, spot.y, 0, group.position);
      group.children[0].rotation.y += deltaSeconds * 1.6;
      group.children[1].rotation.y = group.children[0].rotation.y;
      const reach = session.portalInReach === kind;
      (group.children[2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = reach ? 0.55 : 0.25;
    });
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        if (object.geometry !== this.swordGeometry) object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.swordGeometry.dispose();
  }
}
