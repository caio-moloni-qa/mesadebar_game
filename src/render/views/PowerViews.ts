import * as THREE from 'three';
import { GameSession } from '../../core/session/GameSession';
import { POWER_TUNING } from '../../core/systems/PowerTierSystem';
import { toonMaterial } from '../materials';
import { box, cone, mergeParts, part } from '../models/parts';
import { WORLD_SCALE, simToWorld } from '../space';
import { ParticleView } from './PickupAndProjectileViews';

const MAX_ARCS = 24;
const ARC_POINTS = 48;
const ARC_LIFE = 0.22;
const MAX_HURRICANES = 3;
const HURRICANE_RINGS = 6;
const MAX_ZONES = 6;
const MAX_CRATES = 4;
const MAX_TRAIL = 160;
const METEOR_FALL_S = POWER_TUNING.meteorFallMs / 1000;

const glowMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

interface Arc { line: THREE.Line; points: THREE.Vector3[]; age: number }
interface Meteor { mesh: THREE.Mesh; x: number; y: number; age: number }

/** The heroes' power tiers on the field: lightning arcs, the Mago's hurricanes, Brom's embers and falling meteor, the
 *  Relíquia's sanctuary, Lyra's hawk, Zora's astral trail, foresight ward and eclipse, Sergio's crates, the Bárbaro's
 *  fury and Grimbo's golden coins. Everything is drawn from the session each frame (one-shot arcs and meteors come
 *  from Game3D's event handlers) and advanced by simulation time, so it freezes with the run. */
export class PowerViews {
  readonly root = new THREE.Group();
  /** The transparent parts, kept out of the outline pass. */
  readonly glow = new THREE.Group();
  private readonly arcs: Arc[] = [];
  private readonly hurricanes: THREE.Group[] = [];
  private readonly zones: Array<{ disc: THREE.Mesh; ring: THREE.Mesh }> = [];
  private readonly crates: THREE.Mesh[] = [];
  private readonly trail: THREE.InstancedMesh;
  private readonly hawk: THREE.Group;
  private readonly wings: THREE.Mesh[] = [];
  private readonly eclipse: THREE.Group;
  private readonly ward: THREE.Mesh;
  private readonly fury: THREE.Mesh;
  private readonly meteors: Meteor[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly hawkPrevious = new THREE.Vector3();
  private sparkleClock = 0;

  constructor(private readonly particles: ParticleView) {
    this.root.add(this.glow);
    for (let index = 0; index < MAX_ARCS; index += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xc8f4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.visible = false;
      line.frustumCulled = false;
      line.renderOrder = 4;
      this.glow.add(line);
      this.arcs.push({ line, points: [], age: ARC_LIFE });
    }
    const ringGeometry = new THREE.TorusGeometry(1, 0.08, 4, 20).rotateX(Math.PI / 2);
    for (let index = 0; index < MAX_HURRICANES; index += 1) {
      const group = new THREE.Group();
      for (let ring = 0; ring < HURRICANE_RINGS; ring += 1) {
        const mesh = new THREE.Mesh(ringGeometry, glowMaterial(ring % 2 ? 0xbfe9ff : 0xffffff, 0.45));
        const t = ring / (HURRICANE_RINGS - 1);
        mesh.position.y = 0.2 + t * 4.2;
        mesh.scale.setScalar(0.6 + t * 2.6);
        group.add(mesh);
      }
      group.visible = false;
      this.hurricanes.push(group);
      this.glow.add(group);
    }
    const disc = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    const rim = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    for (let index = 0; index < MAX_ZONES; index += 1) {
      const zone = { disc: new THREE.Mesh(disc, glowMaterial(0xff6a1a, 0.3)), ring: new THREE.Mesh(rim, glowMaterial(0xffc04a, 0.6)) };
      zone.disc.visible = zone.ring.visible = false;
      zone.disc.renderOrder = zone.ring.renderOrder = 2;
      this.glow.add(zone.disc, zone.ring);
      this.zones.push(zone);
    }
    const crate = mergeParts([
      part(box(0.9, 0.9, 0.9), 0x9a6a3a),
      part(box(0.95, 0.12, 0.95), 0x5a3a1e, [0, 0.3, 0]),
      part(box(0.95, 0.12, 0.95), 0x5a3a1e, [0, -0.3, 0]),
      part(box(0.12, 0.95, 0.96), 0xd8b25a, [0, 0, 0])
    ]);
    const crateMaterial = toonMaterial({ vertexColors: true, flatShading: true });
    for (let index = 0; index < MAX_CRATES; index += 1) {
      const mesh = new THREE.Mesh(crate, crateMaterial);
      mesh.castShadow = true;
      mesh.visible = false;
      this.root.add(mesh);
      this.crates.push(mesh);
    }
    this.trail = new THREE.InstancedMesh(new THREE.CircleGeometry(0.4, 10).rotateX(-Math.PI / 2), glowMaterial(0xb9a2ff, 0.55), MAX_TRAIL);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.glow.add(this.trail);

    // A spectral hawk: pale green, glowing.
    this.hawk = new THREE.Group();
    const spirit = glowMaterial(0xc8ffd8, 0.85);
    const body = new THREE.Mesh(cone(0.22, 0.9, 6).rotateX(Math.PI / 2), spirit);
    this.hawk.add(body);
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35).translate(0.45, 0, 0).rotateX(-Math.PI / 2), spirit);
      wing.scale.x = side;
      this.wings.push(wing);
      this.hawk.add(wing);
    });
    this.hawk.visible = false;
    this.glow.add(this.hawk);

    this.eclipse = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0x0c0618 }));
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 2), glowMaterial(0x8a4dff, 0.45));
    const floor = new THREE.Mesh(rim, glowMaterial(0xb26bff, 0.6));
    floor.name = 'floor';
    this.eclipse.add(core, halo, floor);
    this.eclipse.visible = false;
    this.glow.add(this.eclipse);

    this.ward = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 4, 32).rotateX(Math.PI / 2), glowMaterial(0xd8a8ff, 0.8));
    this.ward.visible = false;
    this.glow.add(this.ward);
    this.fury = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), glowMaterial(0xff3a2a, 0.3));
    this.fury.visible = false;
    this.glow.add(this.fury);
  }

  /** A lightning arc through these sim points (at chest height), or from the sky down to one (`fromSky`). */
  arc(points: Array<{ x: number; y: number }>, fromSky = false): void {
    const arc = this.arcs.find((candidate) => candidate.age >= ARC_LIFE);
    if (!arc) return;
    arc.points = fromSky
      ? [simToWorld(points[0].x, points[0].y, 11), simToWorld(points[0].x, points[0].y, 0.4)]
      : points.map((point) => simToWorld(point.x, point.y, 1.1));
    arc.age = 0;
    arc.line.visible = true;
    this.jag(arc);
  }

  /** Brom's Forja Viva: a burning stone falling on him. */
  meteor(x: number, y: number): void {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), glowMaterial(0xffa040, 0.95));
    this.glow.add(mesh);
    this.meteors.push({ mesh, x, y, age: 0 });
  }

  clear(): void {
    this.arcs.forEach((arc) => { arc.age = ARC_LIFE; arc.line.visible = false; });
    this.meteors.forEach((meteor) => { this.glow.remove(meteor.mesh); meteor.mesh.geometry.dispose(); });
    this.meteors.length = 0;
  }

  update(session: GameSession, alpha: number, nowMs: number, deltaSeconds: number): void {
    const powers = session.powers;
    const { player } = session;
    const heroX = player.prevX + (player.x - player.prevX) * alpha;
    const heroY = player.prevY + (player.y - player.prevY) * alpha;

    this.arcs.forEach((arc) => {
      if (arc.age >= ARC_LIFE) return;
      arc.age += deltaSeconds;
      if (arc.age >= ARC_LIFE) { arc.line.visible = false; return; }
      (arc.line.material as THREE.LineBasicMaterial).opacity = 1 - arc.age / ARC_LIFE;
      if (deltaSeconds > 0) this.jag(arc);
    });

    this.hurricanes.forEach((group, index) => {
      const storm = powers.hurricanes[index];
      group.visible = Boolean(storm);
      if (!storm) return;
      simToWorld(storm.prevX + (storm.x - storm.prevX) * alpha, storm.prevY + (storm.y - storm.prevY) * alpha, 0, group.position);
      const fade = Math.min(1, storm.lifeMs / 500, (POWER_TUNING.hurricaneLifeMs - storm.lifeMs) / 300);
      group.scale.setScalar((POWER_TUNING.hurricaneRadius * WORLD_SCALE) / 3.2 * Math.max(0.2, fade));
      group.children.forEach((ring, ringIndex) => {
        ring.rotation.y = storm.spin * (6 + ringIndex) + ringIndex;
        ring.position.x = Math.sin(storm.spin * 5 + ringIndex) * 0.25;
      });
      if (deltaSeconds > 0) this.particles.emit(group.position.x, 0.4, group.position.z, 0xdff4ff, 2, { spread: 2.5, rise: 6, gravity: -2, life: 0.6, size: 1.1, jitter: 1 });
    });

    this.zones.forEach((zone, index) => {
      const state = powers.zones[index];
      zone.disc.visible = zone.ring.visible = Boolean(state);
      if (!state) return;
      const radius = state.radius * WORLD_SCALE;
      const life = Math.min(1, (state.endsAt - nowMs) / 600, (nowMs - state.startedAt) / 200);
      simToWorld(state.x, state.y, 0.06, zone.disc.position);
      zone.ring.position.copy(zone.disc.position).setY(0.08);
      zone.disc.scale.setScalar(radius);
      zone.ring.scale.setScalar(radius * (1 + Math.sin(nowMs / 160) * 0.03));
      const embers = state.kind === 'embers';
      (zone.disc.material as THREE.MeshBasicMaterial).color.setHex(embers ? 0xff5a14 : 0xfff0a0);
      (zone.ring.material as THREE.MeshBasicMaterial).color.setHex(embers ? 0xffb040 : 0xffe066);
      (zone.disc.material as THREE.MeshBasicMaterial).opacity = (embers ? 0.15 + Math.sin(nowMs / 90) * 0.04 : 0.14) * life;
      (zone.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 * life;
      if (deltaSeconds > 0 && Math.random() < 0.6) {
        const angle = Math.random() * Math.PI * 2;
        const reach = Math.sqrt(Math.random()) * radius;
        this.particles.emit(zone.disc.position.x + Math.cos(angle) * reach, 0.1, zone.disc.position.z + Math.sin(angle) * reach, embers ? 0xff8a2a : 0xfff6c0, 1, { spread: 0.3, rise: embers ? 3 : 2, gravity: -1, life: 0.7, size: 1 });
      }
    });

    this.crates.forEach((mesh, index) => {
      const crate = powers.crates[index];
      mesh.visible = Boolean(crate);
      if (!crate) return;
      const t = Math.min(1, crate.elapsedMs / POWER_TUNING.crateFlightMs);
      simToWorld(crate.fromX + (crate.toX - crate.fromX) * t, crate.fromY + (crate.toY - crate.fromY) * t, 0.5 + Math.sin(t * Math.PI) * 4, mesh.position);
      mesh.rotation.set(t * 5, t * 3, 0);
    });

    const trail = powers.trail.slice(-MAX_TRAIL);
    trail.forEach((point, index) => {
      const life = Math.max(0, (point.expiresAt - nowMs) / POWER_TUNING.trailLifeMs);
      simToWorld(point.x, point.y, 0.07, this.position);
      this.rotation.identity();
      this.scale.setScalar(0.4 + life * 0.8);
      this.trail.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
    });
    this.trail.count = trail.length;
    this.trail.instanceMatrix.needsUpdate = true;

    const hawk = powers.hawk;
    this.hawk.visible = Boolean(hawk);
    if (hawk) {
      this.hawkPrevious.copy(this.hawk.position);
      simToWorld(hawk.prevX + (hawk.x - hawk.prevX) * alpha, hawk.prevY + (hawk.y - hawk.prevY) * alpha, hawk.target ? 1.4 : 3.2, this.hawk.position);
      const dx = this.hawk.position.x - this.hawkPrevious.x;
      const dz = this.hawk.position.z - this.hawkPrevious.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) this.hawk.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(nowMs / (hawk.target ? 40 : 90)) * 0.7;
      this.wings.forEach((wing, side) => { wing.rotation.z = (side === 0 ? -1 : 1) * flap; });
      if (deltaSeconds > 0 && Math.random() < 0.5) this.particles.emit(this.hawk.position.x, this.hawk.position.y, this.hawk.position.z, 0xc8ffd8, 1, { spread: 0.2, rise: 0, gravity: 0, life: 0.4, size: 0.9 });
    }

    const eclipse = powers.eclipse;
    this.eclipse.visible = Boolean(eclipse);
    if (eclipse) {
      const t = Math.min(1, (nowMs - eclipse.startedAt) / POWER_TUNING.eclipsePullMs);
      simToWorld(eclipse.x, eclipse.y, 0, this.eclipse.position);
      const size = 0.6 + t * 1.6;
      this.eclipse.children.forEach((child) => {
        if (child.name === 'floor') {
          child.position.y = 0.08;
          child.scale.setScalar(POWER_TUNING.eclipsePullRadius * WORLD_SCALE * (1 - t * 0.6));
        } else {
          child.position.y = 2;
          child.scale.setScalar(size * (child === this.eclipse.children[1] ? 1 + Math.sin(nowMs / 80) * 0.08 : 1));
        }
      });
      if (deltaSeconds > 0) {
        // Motes spiral in.
        const angle = Math.random() * Math.PI * 2;
        const reach = POWER_TUNING.eclipsePullRadius * WORLD_SCALE;
        this.particles.emit(this.eclipse.position.x + Math.cos(angle) * reach, 0.5, this.eclipse.position.z + Math.sin(angle) * reach, 0xb26bff, 1, { spread: 0.2, rise: 2, gravity: 0, life: 0.5, size: 1.1 });
      }
    }

    const foreseeing = session.characterId === 'zora' && powers.foresightReady && powers.has(2) && !session.merchant.inside;
    this.ward.visible = foreseeing;
    if (foreseeing) {
      simToWorld(heroX, heroY, 1.2 + Math.sin(nowMs / 300) * 0.15, this.ward.position);
      this.ward.rotation.set(Math.sin(nowMs / 500) * 0.3, nowMs / 400, 0);
    }
    const furious = powers.furious;
    this.fury.visible = furious;
    if (furious) {
      simToWorld(heroX, heroY, 1, this.fury.position);
      this.fury.scale.setScalar(1 + Math.sin(nowMs / 70) * 0.12);
      if (deltaSeconds > 0) this.particles.emit(this.fury.position.x, 0.6, this.fury.position.z, 0xff4a2a, 2, { spread: 1.4, rise: 4, gravity: -2, life: 0.5, size: 1.2, jitter: 0.5 });
    }

    for (let index = this.meteors.length - 1; index >= 0; index -= 1) {
      const meteor = this.meteors[index];
      meteor.age += deltaSeconds;
      const t = Math.min(1, meteor.age / METEOR_FALL_S);
      // It follows the hero down (the blast lands where he stands).
      simToWorld(heroX, heroY, 14 * (1 - t * t), meteor.mesh.position);
      meteor.mesh.rotation.set(meteor.age * 6, meteor.age * 4, 0);
      if (deltaSeconds > 0) this.particles.emit(meteor.mesh.position.x, meteor.mesh.position.y, meteor.mesh.position.z, t < 0.5 ? 0xffd070 : 0xff6a1a, 3, { spread: 0.5, rise: 2, gravity: -4, life: 0.4, size: 1.6 });
      if (t >= 1) {
        this.glow.remove(meteor.mesh);
        meteor.mesh.geometry.dispose();
        this.meteors.splice(index, 1);
      }
    }

    // Grimbo's golden coins sparkle as they fly.
    this.sparkleClock += deltaSeconds;
    if (this.sparkleClock >= 0.05) {
      this.sparkleClock = 0;
      session.projectiles.forEachActive((projectile) => {
        if (!projectile.golden) return;
        simToWorld(projectile.x, projectile.y, 1, this.position);
        this.particles.emit(this.position.x, this.position.y, this.position.z, 0xffe066, 2, { spread: 0.4, rise: 1, gravity: 2, life: 0.35, size: 1.1 });
      });
    }
  }

  /** Re-zigzags an arc between its points (redrawn every frame, so it crackles). */
  private jag(arc: Arc): void {
    const attribute = arc.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const segments = arc.points.length - 1;
    const perSegment = Math.max(1, Math.floor((ARC_POINTS - 1) / Math.max(1, segments)));
    let written = 0;
    for (let segment = 0; segment < segments && written < ARC_POINTS - 1; segment += 1) {
      const from = arc.points[segment];
      const to = arc.points[segment + 1];
      for (let step = 0; step < perSegment && written < ARC_POINTS - 1; step += 1) {
        const t = step / perSegment;
        const wobble = step === 0 ? 0 : 0.35;
        attribute.setXYZ(written, from.x + (to.x - from.x) * t + (Math.random() - 0.5) * wobble, from.y + (to.y - from.y) * t + (Math.random() - 0.5) * wobble, from.z + (to.z - from.z) * t + (Math.random() - 0.5) * wobble);
        written += 1;
      }
    }
    const last = arc.points[arc.points.length - 1];
    attribute.setXYZ(written, last.x, last.y, last.z);
    written += 1;
    attribute.needsUpdate = true;
    arc.line.geometry.setDrawRange(0, written);
  }
}
