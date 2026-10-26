import * as THREE from 'three';
import { BOSS_TUNING, BossState, BossSystem } from '../../core/systems/BossSystem';
import { GameSession, PortalKind } from '../../core/session/GameSession';
import { weaponGeometry } from '../models/weapons';
import { WORLD_SCALE, simToWorld } from '../space';
import { BossViews } from '../views/BossView';
import { ParticleView } from '../views/PickupAndProjectileViews';

/** Necro-green palette (Phaser BossSystem colours) plus the new effects' accents. */
const GREEN = { base: 0x45ff90, blink: 0xd6ffd0, ring: 0x8cff8c, beamCore: 0xd6ffd0, beamGlow: 0x35c96b, meteor: 0x2fe86a, shield: 0x48ff52, reticle: 0x8cffb0, flame: 0x6dff9a, deep: 0x1f8a46 };
const PORTAL_COLORS: Record<PortalKind, number> = { end: 0x9fb4ff, continue: 0x7dffa0 };
const MAX_BEAMS = 20;
const MAX_METEORS = 48;
const MAX_SCORCHES = 40;
const MAX_CRACKS = 40;
const SWORD_SCALE = 4.2;
const SWORD_HEIGHT = 1.4;
const BEAM_HEIGHT = 1.1;
const METEOR_FALL_HEIGHT = 16;
/** Meteors come in at a slant from this direction (world x/z per metre of fall). */
const METEOR_SLANT = new THREE.Vector2(0.45, -0.3);
const SWEEP_FADE_SECONDS = 0.26;
const ARC_SEGMENTS = 64;
const SCORCH_SECONDS = 4.5;
const UP = new THREE.Vector3(0, 1, 0);

const additive = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** The shield dome: a fresnel rim (bright at the silhouette, clear in the middle) with energy bands rising through it. */
function shieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(GREEN.shield) }, flash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        vHeight = position.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 color;
      uniform float flash;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        float bands = smoothstep(0.82, 1.0, sin(vHeight * 26.0 - time * 5.0));
        float crown = smoothstep(0.9, 1.0, vHeight);
        float alpha = 0.06 + rim * 0.65 + bands * 0.12 + crown * 0.15;
        vec3 tint = mix(color, vec3(1.0), flash);
        gl_FragColor = vec4(tint * alpha * (1.0 + flash), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

/** The swept arc: a flat ring whose draw range grows with the sweep (RingGeometry orders its indices by angle). */
function arcRing(): THREE.Mesh {
  const radius = BOSS_TUNING.meleeSwingRadius * WORLD_SCALE;
  const geometry = new THREE.RingGeometry(radius - 0.35, radius + 0.35, ARC_SEGMENTS, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, additive(GREEN.ring, 0.75));
  mesh.renderOrder = 2;
  return mesh;
}

/** Ground crack decal: a few jagged slashes radiating from a point (the undead squad's warning). */
function crackGeometry(): THREE.BufferGeometry {
  const shapes: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 5; index += 1) {
    const slash = new THREE.PlaneGeometry(0.12, 0.9 + (index % 2) * 0.4).translate(0, 0.45, 0).rotateZ((index / 5) * Math.PI * 2 + (index % 2) * 0.3);
    shapes.push(slash);
  }
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  shapes.forEach((shape) => {
    const source = shape.toNonIndexed().attributes.position;
    for (let index = 0; index < source.count; index += 1) positions.push(source.getX(index), source.getY(index), source.getZ(index));
    shape.dispose();
  });
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.rotateX(-Math.PI / 2);
  return merged;
}

/** One boss's reusable pieces. */
class BossRig {
  readonly root = new THREE.Group();
  readonly sword: THREE.Mesh;
  readonly arc: THREE.Mesh;
  arcFade = 0;
  readonly shield: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly beams: THREE.Group[] = [];
  readonly lockLine: THREE.Line;
  readonly orb: THREE.Mesh;
  readonly stars: THREE.Mesh[] = [];
  readonly lungeLine: THREE.Mesh;
  readonly lungeTarget: THREE.Mesh;

  constructor(swordGeometry: THREE.BufferGeometry, shieldGeometry: THREE.BufferGeometry, beamGeometry: THREE.BufferGeometry, starGeometry: THREE.BufferGeometry) {
    this.sword = new THREE.Mesh(swordGeometry, new THREE.MeshBasicMaterial({ color: GREEN.base }));
    this.sword.scale.setScalar(SWORD_SCALE);
    this.arc = arcRing();
    this.shield = new THREE.Mesh(shieldGeometry, shieldMaterial());
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
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), additive(GREEN.beamCore, 0.9));
    for (let index = 0; index < 3; index += 1) this.stars.push(new THREE.Mesh(starGeometry, new THREE.MeshBasicMaterial({ color: 0xffe45c })));
    this.lungeLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), additive(0xff6a3a, 0.35));
    this.lungeTarget = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), additive(0xff6a3a, 0.7));
    this.root.add(this.sword, this.arc, this.shield, this.lockLine, this.orb, this.lungeLine, this.lungeTarget, ...this.stars, ...this.beams);
    this.hideAll();
  }

  hideAll(): void {
    [this.sword, this.arc, this.shield, this.lockLine, this.orb, this.lungeLine, this.lungeTarget, ...this.stars, ...this.beams].forEach((object) => { object.visible = false; });
  }
}

/** Everything the boss fight draws in the world besides the boss itself: the telegraph sword and its sweep arc, the
 *  lock-on reticle, line and the charging orb in the boss's hand, Necro-Beams, meteors (closing ground ring, a slanted
 *  flaming rock, scorch marks after), ground cracks before the undead rise, the fresnel shield dome, stagger stars,
 *  the lunge's landing marker, phase-2 green fire and enraged embers, and the end / continue portals. Reads the core
 *  state every frame; one-shot bursts come through Game3D's event handlers (impact(), scorch()). */
export class BossEffects {
  readonly root = new THREE.Group();
  private readonly rigs: BossRig[] = [];
  private readonly swordGeometry: THREE.BufferGeometry;
  private readonly shieldGeometry = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  /** Unit-length beam slab along +X from the origin (scaled to the grown length). */
  private readonly beamGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  private readonly starGeometry = new THREE.OctahedronGeometry(0.35, 0);
  private readonly reticle: THREE.Sprite;
  private readonly meteorWarnings: THREE.InstancedMesh;
  private readonly meteorRings: THREE.InstancedMesh;
  private readonly meteorRocks: THREE.InstancedMesh;
  private readonly scorches: THREE.InstancedMesh;
  private readonly scorchList: Array<{ x: number; z: number; radius: number; age: number }> = [];
  private readonly cracks: THREE.InstancedMesh;
  private readonly portals: Record<PortalKind, THREE.Group>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private time = 0;

  constructor(private readonly particles: ParticleView, private readonly views: BossViews) {
    this.swordGeometry = weaponGeometry('sword');
    this.reticle = new THREE.Sprite(new THREE.SpriteMaterial({ color: GREEN.reticle, depthTest: false }));
    this.reticle.scale.setScalar(1.1);
    this.reticle.visible = false;
    this.meteorWarnings = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), additive(GREEN.beamGlow, 0.3), MAX_METEORS);
    this.meteorRings = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), additive(GREEN.ring, 0.9), MAX_METEORS);
    this.meteorRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: GREEN.meteor }), MAX_METEORS);
    this.scorches = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }), MAX_SCORCHES);
    this.cracks = new THREE.InstancedMesh(crackGeometry(), additive(GREEN.flame, 0.85), MAX_CRACKS);
    [this.meteorWarnings, this.meteorRings, this.meteorRocks, this.scorches, this.cracks].forEach((mesh) => { mesh.count = 0; mesh.frustumCulled = false; });
    this.portals = { end: this.portal(PORTAL_COLORS.end), continue: this.portal(PORTAL_COLORS.continue) };
    this.root.add(this.reticle, this.scorches, this.cracks, this.meteorWarnings, this.meteorRings, this.meteorRocks, this.portals.end, this.portals.continue);
  }

  /** A scorch mark where a meteor (or the shield blast) hit; fades over a few seconds. */
  scorch(x: number, y: number, radius: number): void {
    if (this.scorchList.length >= MAX_SCORCHES) this.scorchList.shift();
    this.scorchList.push({ x: x * WORLD_SCALE, z: y * WORLD_SCALE, radius: radius * WORLD_SCALE, age: 0 });
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
      const rig = new BossRig(this.swordGeometry, this.shieldGeometry, this.beamGeometry, this.starGeometry);
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
    this.updateMeteors(bosses, deltaSeconds);
    this.updateCracks(bosses, deltaSeconds);
    this.updateScorches(deltaSeconds);
    this.updatePortals(session, deltaSeconds);
  }

  /** Returns whether this boss is showing a lock-on (the reticle is shared). */
  private updateRig(rig: BossRig, boss: BossState, bosses: BossSystem, session: GameSession, alpha: number, deltaSeconds: number): boolean {
    const { enemy } = boss;
    const bossX = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
    const bossY = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
    const center = simToWorld(bossX, bossY, 0, this.position).clone();
    const view = this.views.viewFor(enemy);
    const size = enemy.displaySize / 62;
    const running = deltaSeconds > 0;

    // Telegraph sword: green with 3 light blinks while parked, then the orbit with a growing arc behind it.
    const sword = bosses.swordPosition(boss);
    rig.sword.visible = sword !== null;
    if (sword && boss.melee) {
      const swordWorld = simToWorld(bossX + Math.cos(sword.angle) * BOSS_TUNING.meleeSwingRadius, bossY + Math.sin(sword.angle) * BOSS_TUNING.meleeSwingRadius, SWORD_HEIGHT, this.scratch);
      rig.sword.position.copy(swordWorld);
      // Lies flat with the blade (+Y in the weapon model) along the orbit's tangent, the way it travels.
      const tangent = sword.angle + (boss.melee.phase === 'sweepBack' ? -Math.PI / 2 : Math.PI / 2);
      rig.sword.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(tangent), 0, Math.sin(tangent)));
      const telegraph = boss.melee.phase === 'telegraph';
      const blinkStep = Math.floor((boss.melee.elapsedMs / BOSS_TUNING.meleeTelegraphMs) * 6);
      (rig.sword.material as THREE.MeshBasicMaterial).color.setHex(telegraph && blinkStep % 2 === 1 ? GREEN.blink : GREEN.base);
      if (telegraph) {
        // Rises out of the ground as it's summoned, shedding green sparks.
        rig.sword.scale.setScalar(SWORD_SCALE * Math.min(1, 0.3 + boss.melee.elapsedMs / 500));
        if (running && Math.random() < 0.5) this.particles.emit(swordWorld.x, swordWorld.y, swordWorld.z, GREEN.flame, 1, { spread: 0.6, rise: 1.5, gravity: -1, life: 0.5, size: 0.8 });
      } else {
        rig.sword.scale.setScalar(SWORD_SCALE);
        const progress = Math.min(1, boss.melee.elapsedMs / BOSS_TUNING.meleeSweepMs);
        this.showArc(rig, center, boss.melee.startAngle, progress, boss.melee.phase === 'sweepBack', 0.75);
        rig.arcFade = SWEEP_FADE_SECONDS;
        if (running) this.particles.emit(swordWorld.x, swordWorld.y, swordWorld.z, 0xb6ffb0, 3, { spread: 1.5, rise: 0.5, gravity: 2, life: 0.25, size: 0.9 });
      }
    } else if (rig.arcFade > 0) {
      rig.arcFade = Math.max(0, rig.arcFade - deltaSeconds);
      (rig.arc.material as THREE.MeshBasicMaterial).opacity = 0.75 * (rig.arcFade / SWEEP_FADE_SECONDS);
      rig.arc.position.set(center.x, 0.07, center.z);
      rig.arc.visible = rig.arcFade > 0;
    } else {
      rig.arc.visible = false;
    }

    // Shield dome while channelling, flashing white through a dash telegraph; motes swirl up while it channels.
    rig.shield.visible = boss.shieldActive;
    if (boss.shieldActive) {
      rig.shield.position.set(center.x, 0, center.z);
      const flashing = boss.dash.phase === 'telegraph' && Math.floor((boss.dash.elapsedMs / BOSS_TUNING.dashTelegraphMs) * 6) % 2 === 0;
      rig.shield.material.uniforms.time.value = this.time;
      rig.shield.material.uniforms.flash.value = flashing ? 0.8 : 0;
      if (running && boss.channelActive) {
        const angle = this.time * 3 + Math.random() * 0.6;
        const radius = 230 * WORLD_SCALE * (0.4 + Math.random() * 0.5);
        this.particles.emit(center.x + Math.cos(angle) * radius, 0.3, center.z + Math.sin(angle) * radius, GREEN.flame, 2, { spread: 0.3, rise: 4, gravity: -2, life: 1, size: 0.9 });
      }
    }

    // Lock-on: white line from the boss to the hero, the reticle over the hero (both blinking faster and faster), and
    // the beam charging as a growing orb in the boss's raised hand.
    const lockOn = boss.beamState === 'lockon';
    rig.lockLine.visible = lockOn && boss.beamLockOnVisible;
    rig.orb.visible = lockOn && !!view;
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
      if (view) {
        const charge = Math.min(1, boss.beamLockOnElapsed / BOSS_TUNING.beamLockOnMs);
        const hand = view.handPosition();
        rig.orb.position.copy(hand);
        rig.orb.scale.setScalar((0.3 + charge * 1.1) * (1 + Math.sin(this.time * 30) * 0.08));
        // Energy sucked in towards the hand.
        if (running) {
          const angle = Math.random() * Math.PI * 2;
          this.particles.emit(hand.x + Math.cos(angle) * 2.5, hand.y + (Math.random() - 0.5) * 2, hand.z + Math.sin(angle) * 2.5, GREEN.beamCore, 1, { spread: 0, rise: 0, gravity: 0, life: 0.25, size: 0.7 });
        }
      }
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
      // Sparks where the beam's tip is burning the ground.
      if (running && Math.random() < 0.6) {
        this.particles.emit(center.x + Math.cos(beam.angle) * length, 0.3, center.z + Math.sin(beam.angle) * length, GREEN.beamCore, 1, { spread: 2, rise: 3, gravity: 10, life: 0.35, size: 0.8 });
      }
    });

    // Stagger: three stars circling over the kneeling boss's head.
    const staggered = boss.staggerMs > 0;
    rig.stars.forEach((star, index) => {
      star.visible = staggered;
      if (!staggered) return;
      const angle = this.time * 4 + (index / 3) * Math.PI * 2;
      const head = view ? view.headPosition() : this.scratch.set(center.x, 9 * size / 6.3, center.z);
      star.position.set(head.x + Math.cos(angle) * 1.4, head.y + 1.2 + Math.sin(this.time * 6 + index) * 0.2, head.z + Math.sin(angle) * 1.4);
      star.rotation.y = this.time * 5;
    });

    // Lunge telegraph: a glowing path to where it will land, plus dust kicked up as it crouches and flies.
    const lunging = boss.dash.kind === 'lunge' && boss.dash.phase !== 'idle';
    const telegraphing = lunging && boss.dash.phase === 'telegraph';
    rig.lungeLine.visible = rig.lungeTarget.visible = telegraphing;
    if (telegraphing) {
      const landing = simToWorld(boss.dash.targetX, boss.dash.targetY, 0.08, this.scratch);
      const dx = landing.x - center.x;
      const dz = landing.z - center.z;
      rig.lungeLine.position.set(center.x, 0.08, center.z);
      rig.lungeLine.rotation.set(0, -Math.atan2(dz, dx), 0);
      rig.lungeLine.scale.set(Math.hypot(dx, dz), 1, BOSS_TUNING.lungeRadius * WORLD_SCALE * 0.6);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 18);
      (rig.lungeLine.material as THREE.MeshBasicMaterial).opacity = 0.2 + pulse * 0.2;
      rig.lungeTarget.position.copy(landing);
      rig.lungeTarget.scale.setScalar(BOSS_TUNING.lungeRadius * WORLD_SCALE * (1.2 - Math.min(1, boss.dash.elapsedMs / BOSS_TUNING.lungeTelegraphMs) * 0.2));
    }
    if (running && (lunging || boss.dash.phase === 'dashing')) {
      this.particles.emit(center.x, 0.2, center.z, 0x9a8a70, boss.dash.phase === 'dashing' ? 4 : 1, { spread: 3, rise: 1.5, gravity: 4, life: 0.6, size: 1.3, jitter: 1 });
    }

    // Phase 2 burns with green fire from the shoulders and crown; enraged bosses shed red embers.
    if (running && view && (boss.phaseTwo || boss.enraged)) {
      const head = view.headPosition();
      if (boss.phaseTwo && Math.random() < 0.9) this.particles.emit(head.x, head.y, head.z, GREEN.flame, 2, { spread: 1.2, rise: 3, gravity: -3, life: 0.7, size: 1.1, jitter: 1.5 });
      if (boss.enraged && Math.random() < 0.6) this.particles.emit(center.x, head.y * 0.6, center.z, 0xff5a3a, 1, { spread: 2, rise: 2.5, gravity: -1, life: 0.8, size: 0.9, jitter: 2.5 });
    }
    return lockOn;
  }

  private showArc(rig: BossRig, center: THREE.Vector3, startAngle: number, progress: number, reverse: boolean, opacity: number): void {
    rig.arc.visible = progress > 0;
    rig.arc.position.set(center.x, 0.07, center.z);
    // After rotateX(-90°) ring angle θ lies at (cos θ, -sin θ) on the ground, sim angle a at (cos a, sin a): the
    // z flip matches them, then a yaw of -startAngle starts the arc where the sword did (scale applies first). The
    // back-sweep draws the same arc mirrored (it runs the other way from the same start).
    rig.arc.scale.set(1, 1, reverse ? 1 : -1);
    rig.arc.rotation.set(0, reverse ? startAngle : -startAngle, 0);
    rig.arc.geometry.setDrawRange(0, Math.ceil(progress * ARC_SEGMENTS) * 6);
    (rig.arc.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  /** Each meteor: a warning disc on the ground with a ring closing in on the impact radius, and a rock falling in at a
   *  slant with a flaming trail. */
  private updateMeteors(bosses: BossSystem, deltaSeconds: number): void {
    const count = Math.min(MAX_METEORS, bosses.meteors.length);
    const radius = BOSS_TUNING.meteorRadius * WORLD_SCALE;
    for (let index = 0; index < count; index += 1) {
      const meteor = bosses.meteors[index];
      const t = Math.min(1, meteor.elapsedMs / meteor.telegraphMs);
      const ground = simToWorld(meteor.x, meteor.y, 0.06, this.position);
      this.quaternion.identity();
      this.meteorWarnings.setMatrixAt(index, this.matrix.compose(ground, this.quaternion, this.scale.set(radius, 1, radius)));
      const closing = radius * (2.2 - 1.2 * t);
      this.meteorRings.setMatrixAt(index, this.matrix.compose(this.scratch.set(ground.x, 0.08, ground.z), this.quaternion, this.scale.set(closing, 1, closing)));
      // Cubic.In fall from high up and off to the side, growing from a pebble to a boulder.
      const fall = 1 - t * t * t;
      const height = METEOR_FALL_HEIGHT * fall;
      this.scratch.set(ground.x + METEOR_SLANT.x * height, height + 0.6, ground.z + METEOR_SLANT.y * height);
      this.quaternion.setFromAxisAngle(UP, t * 9);
      this.meteorRocks.setMatrixAt(index, this.matrix.compose(this.scratch, this.quaternion, this.scale.setScalar(0.35 + 0.55 * t)));
      if (deltaSeconds > 0) this.particles.emit(this.scratch.x, this.scratch.y, this.scratch.z, Math.random() < 0.5 ? GREEN.flame : 0xd6ffd0, 2, { spread: 0.5, rise: 0.5, gravity: -1, life: 0.35, size: 1.1 });
    }
    [this.meteorWarnings, this.meteorRings, this.meteorRocks].forEach((mesh) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    });
    (this.meteorWarnings.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 24));
  }

  /** Ground cracks glowing where the undead squad is about to climb out; dirt spits up just before they do. */
  private updateCracks(bosses: BossSystem, deltaSeconds: number): void {
    const count = Math.min(MAX_CRACKS, bosses.risings.length);
    for (let index = 0; index < count; index += 1) {
      const rising = bosses.risings[index];
      const t = Math.min(1, rising.elapsedMs / BOSS_TUNING.undeadRiseMs);
      const ground = simToWorld(rising.x, rising.y, 0.07, this.position);
      this.quaternion.setFromAxisAngle(UP, (rising.x * 0.13 + rising.y * 0.07) % (Math.PI * 2));
      const size = 0.4 + t * 1.2;
      this.cracks.setMatrixAt(index, this.matrix.compose(ground, this.quaternion, this.scale.set(size, 1, size)));
      if (deltaSeconds > 0 && t > 0.6 && Math.random() < 0.4) this.particles.emit(ground.x, 0.1, ground.z, 0x6b5a46, 1, { spread: 1.5, rise: 3, gravity: 12, life: 0.45, size: 1 });
    }
    this.cracks.count = count;
    this.cracks.instanceMatrix.needsUpdate = true;
    (this.cracks.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(this.time * 16);
  }

  private updateScorches(deltaSeconds: number): void {
    for (let index = this.scorchList.length - 1; index >= 0; index -= 1) {
      this.scorchList[index].age += deltaSeconds;
      if (this.scorchList[index].age >= SCORCH_SECONDS) this.scorchList.splice(index, 1);
    }
    this.quaternion.identity();
    this.scorchList.forEach((mark, index) => {
      const fade = 1 - mark.age / SCORCH_SECONDS;
      this.scorches.setMatrixAt(index, this.matrix.compose(this.position.set(mark.x, 0.05, mark.z), this.quaternion, this.scale.set(mark.radius, 1, mark.radius)));
      // Fresh scorch glows green, then cools to dark soot.
      this.scorches.setColorAt(index, this.color.setHex(0x14100c).lerp(this.color.clone().setHex(0x2a7a40), Math.max(0, fade - 0.75) * 4));
    });
    this.scorches.count = this.scorchList.length;
    this.scorches.instanceMatrix.needsUpdate = true;
    if (this.scorches.instanceColor) this.scorches.instanceColor.needsUpdate = true;
    (this.scorches.material as THREE.MeshBasicMaterial).opacity = 0.55;
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
      if (deltaSeconds > 0 && Math.random() < 0.3) this.particles.emit(group.position.x, 0.2, group.position.z, PORTAL_COLORS[kind], 1, { spread: 0.6, rise: 2, gravity: -1, life: 0.9, size: 0.8, jitter: 1 });
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
