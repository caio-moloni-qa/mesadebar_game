import * as THREE from 'three';
import { CompanionSystem } from '../../core/systems/CompanionSystem';
import { MINI_BOSS_TUNING, MiniBossState, MiniBossSystem } from '../../core/systems/MiniBossSystem';
import { LAKE } from '../../config/arenaLayout';
import { WORLD_SCALE, simToWorld } from '../space';
import { ParticleView } from '../views/PickupAndProjectileViews';
import { MiniBossViews } from '../views/ZoneActorViews';

/** Mini-boss danger reads orange (the Necromancer's is green). */
const DANGER = 0xff7a3a;
const DANGER_LIGHT = 0xffc890;
/** The lake spirit's water attacks. */
const WATER = 0x6fd3ff;
const FOAM = 0xe6f6ff;
const MAX_GEYSERS = 16;
const MAX_ARROWS = 64;

const additive = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A flat spiral of three arms (unit radius) for the whirlpool. */
function spiralGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const arms = 3;
  const steps = 48;
  for (let arm = 0; arm < arms; arm += 1) {
    for (let step = 0; step < steps; step += 1) {
      const point = (index: number, side: number) => {
        const t = index / steps;
        const angle = (arm / arms) * Math.PI * 2 + t * Math.PI * 2.2;
        const radius = 0.15 + t * 0.85;
        const width = 0.035 * (1 - t * 0.5);
        return [Math.cos(angle) * (radius + side * width), 0, Math.sin(angle) * (radius + side * width)];
      };
      const a = point(step, -1);
      const b = point(step, 1);
      const c = point(step + 1, -1);
      const d = point(step + 1, 1);
      positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** One mini-boss's telegraph pieces. */
class Telegraphs {
  readonly root = new THREE.Group();
  /** Danger circle: a dim area with a bright fill growing towards the moment it lands. */
  readonly area = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), additive(DANGER, 0.18));
  readonly fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), additive(DANGER, 0.35));
  readonly edge = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2), additive(DANGER_LIGHT, 0.9));
  /** Charge lane: unit slab along +X. */
  readonly lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), additive(DANGER, 0.3));
  readonly wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), additive(DANGER_LIGHT, 0.95));
  /** Tidal wave: a lane showing its path, then a wall of water rolling down it. */
  readonly waterLane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), additive(WATER, 0.22));
  readonly wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: WATER, transparent: true, opacity: 0.75, depthWrite: false }));
  /** Whirlpool: a spiral turning round the spirit. */
  readonly swirl = new THREE.Mesh(spiralGeometry(), additive(FOAM, 0.6));
  readonly stars: THREE.Mesh[] = [];

  constructor(starGeometry: THREE.BufferGeometry) {
    for (let index = 0; index < 3; index += 1) this.stars.push(new THREE.Mesh(starGeometry, new THREE.MeshBasicMaterial({ color: 0xffe45c })));
    this.root.add(this.area, this.fill, this.edge, this.lane, this.wave, this.waterLane, this.wall, this.swirl, ...this.stars);
    this.hide();
  }

  hide(): void {
    [this.area, this.fill, this.edge, this.lane, this.wave, this.waterLane, this.wall, this.swirl, ...this.stars].forEach((object) => { object.visible = false; });
  }

  circle(x: number, y: number, radius: number, progress: number): void {
    const center = simToWorld(x, y, 0.07, new THREE.Vector3());
    const scaled = radius * WORLD_SCALE;
    [this.area, this.fill, this.edge].forEach((mesh) => {
      mesh.visible = true;
      mesh.position.copy(center);
    });
    this.area.scale.set(scaled, 1, scaled);
    this.edge.scale.set(scaled, 1, scaled);
    const fill = Math.max(0.02, progress) * scaled;
    this.fill.scale.set(fill, 1, fill);
    this.fill.position.y = 0.08;
  }
}

/** World effects for the zone mini-bosses and companions: telegraph circles (shovel slam, burrow exit), the burrow's
 *  dust trail, the Guardião's charge lane and shockwave ring, stun stars, and the archer's arrows in flight. */
export class MiniBossEffects {
  readonly root = new THREE.Group();
  private readonly telegraphs = new Map<MiniBossState, Telegraphs>();
  private readonly starGeometry = new THREE.OctahedronGeometry(0.3, 0);
  private readonly arrows: THREE.InstancedMesh;
  /** Geyser warnings: a pale disc with a ring closing onto the eruption point. */
  private readonly geyserDiscs: THREE.InstancedMesh;
  private readonly geyserRings: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly direction = new THREE.Vector3();
  private time = 0;

  constructor(private readonly particles: ParticleView, private readonly views: MiniBossViews) {
    const arrow = new THREE.BoxGeometry(0.05, 0.05, 0.9);
    this.arrows = new THREE.InstancedMesh(arrow, new THREE.MeshBasicMaterial({ color: 0xe9dfc4 }), MAX_ARROWS);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.geyserDiscs = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), additive(WATER, 0.25), MAX_GEYSERS);
    this.geyserRings = new THREE.InstancedMesh(new THREE.RingGeometry(0.88, 1, 36).rotateX(-Math.PI / 2), additive(FOAM, 0.9), MAX_GEYSERS);
    [this.geyserDiscs, this.geyserRings].forEach((mesh) => { mesh.count = 0; mesh.frustumCulled = false; });
    this.root.add(this.arrows, this.geyserDiscs, this.geyserRings);
  }

  update(miniBosses: MiniBossSystem, companions: CompanionSystem, alpha: number, deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.telegraphs.forEach((pieces, boss) => {
      if (miniBosses.bosses.includes(boss)) return;
      pieces.root.removeFromParent();
      this.telegraphs.delete(boss);
    });
    miniBosses.bosses.forEach((boss) => {
      let pieces = this.telegraphs.get(boss);
      if (!pieces) {
        pieces = new Telegraphs(this.starGeometry);
        this.telegraphs.set(boss, pieces);
        this.root.add(pieces.root);
      }
      this.updateBoss(boss, pieces, alpha, deltaSeconds);
    });
    this.updateArrows(companions, alpha);
    this.updateGeysers(miniBosses, deltaSeconds);
  }

  private updateGeysers(miniBosses: MiniBossSystem, deltaSeconds: number): void {
    const T = MINI_BOSS_TUNING;
    const count = Math.min(MAX_GEYSERS, miniBosses.geysers.length);
    const radius = T.geyserRadius * WORLD_SCALE;
    this.quaternion.identity();
    for (let index = 0; index < count; index += 1) {
      const geyser = miniBosses.geysers[index];
      const t = Math.min(1, geyser.elapsedMs / T.geyserTelegraphMs);
      const ground = simToWorld(geyser.x, geyser.y, 0.07, this.position);
      this.geyserDiscs.setMatrixAt(index, this.matrix.compose(ground, this.quaternion, new THREE.Vector3(radius, 1, radius)));
      const closing = radius * (1.9 - 0.9 * t);
      this.geyserRings.setMatrixAt(index, this.matrix.compose(ground.setY(0.09), this.quaternion, new THREE.Vector3(closing, 1, closing)));
      // The ground bubbles more and more before it bursts.
      if (deltaSeconds > 0 && Math.random() < t) this.particles.emit(ground.x, 0.1, ground.z, FOAM, 1, { spread: 1, rise: 1.5 + t * 2, gravity: 8, life: 0.35, size: 0.8, jitter: radius * 0.6 });
    }
    [this.geyserDiscs, this.geyserRings].forEach((mesh) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private updateBoss(boss: MiniBossState, pieces: Telegraphs, alpha: number, deltaSeconds: number): void {
    const T = MINI_BOSS_TUNING;
    pieces.hide();
    const { enemy } = boss;
    const attack = boss.attack;
    const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
    const y = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
    const running = deltaSeconds > 0;
    if (attack?.type === 'slam' && attack.phase === 'telegraph') pieces.circle(attack.x, attack.y, T.slamRadius, attack.elapsedMs / T.slamTelegraphMs);
    if (attack?.type === 'burrow') {
      if (attack.phase === 'tunnel' && running) {
        // Earth heaving along the path underground.
        const ground = simToWorld(x, y, 0.2, this.position);
        this.particles.emit(ground.x, 0.2, ground.z, 0x6b5a46, 3, { spread: 2, rise: 3.5, gravity: 14, life: 0.5, size: 1.2, jitter: 0.6 });
      }
      if (attack.phase === 'emerge') pieces.circle(attack.x, attack.y, T.burrowRadius, attack.elapsedMs / T.burrowEmergeMs);
      if (attack.phase === 'sink' && running) {
        const ground = simToWorld(x, y, 0.2, this.position);
        this.particles.emit(ground.x, 0.3, ground.z, 0x6b5a46, 4, { spread: 3, rise: 3, gravity: 12, life: 0.5, size: 1.3, jitter: 1 });
      }
    }
    if (attack?.type === 'charge' && attack.phase === 'telegraph') {
      const length = T.chargeSpeed * (T.chargeMs / 1000) * WORLD_SCALE;
      simToWorld(x, y, 0.07, pieces.lane.position);
      pieces.lane.visible = true;
      pieces.lane.rotation.set(0, -boss.facing, 0);
      pieces.lane.scale.set(length, 1, enemy.radius * 2 * WORLD_SCALE);
      (pieces.lane.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 16));
    }
    if (attack?.type === 'charge' && attack.phase === 'active' && running) {
      const feet = simToWorld(x, y, 0.2, this.position);
      this.particles.emit(feet.x, 0.2, feet.z, 0x9a8a70, 4, { spread: 3, rise: 2, gravity: 6, life: 0.6, size: 1.6, jitter: 1 });
    }
    if (attack?.type === 'shockwave') {
      if (attack.phase === 'telegraph') {
        // The full reach, faint, with the fill rising to the moment the fists come down.
        pieces.circle(attack.x, attack.y, T.shockwaveRadius, attack.elapsedMs / T.shockwaveTelegraphMs);
        (pieces.area.material as THREE.MeshBasicMaterial).opacity = 0.08;
      } else if (attack.phase === 'active') {
        const radius = T.shockwaveRadius * Math.min(1, attack.elapsedMs / T.shockwaveMs) * WORLD_SCALE;
        pieces.wave.visible = true;
        simToWorld(attack.x, attack.y, 0.1, pieces.wave.position);
        pieces.wave.scale.set(radius, 1, radius);
        (pieces.wave.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - attack.elapsedMs / T.shockwaveMs * 0.6);
      }
    }
    if (boss.kind === 'lakeSpirit') this.updateSpirit(boss, pieces, x, y, deltaSeconds);
    if (boss.stunnedMs > 0) {
      const head = this.views.viewFor(enemy)?.headPosition();
      if (head) {
        pieces.stars.forEach((star, index) => {
          const angle = this.time * 4 + (index / 3) * Math.PI * 2;
          star.visible = true;
          star.position.set(head.x + Math.cos(angle) * 1, head.y + 0.6, head.z + Math.sin(angle) * 1);
          star.rotation.y = this.time * 5;
        });
      }
    }
  }

  /** The lake spirit: water streaming in as it drinks the lake; the tidal wave's lane and wall; the whirlpool spiral. */
  private updateSpirit(boss: MiniBossState, pieces: Telegraphs, x: number, y: number, deltaSeconds: number): void {
    const T = MINI_BOSS_TUNING;
    const attack = boss.attack;
    const center = simToWorld(x, y, 0, new THREE.Vector3());
    const running = deltaSeconds > 0;
    if (attack?.type === 'drain' && running) {
      // Water lifting off the shrinking lake and flying into the spirit.
      for (let index = 0; index < 4; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const reach = (LAKE.radius * WORLD_SCALE) * (0.3 + Math.random() * 0.6) * Math.max(0.2, 1 - attack.elapsedMs / T.drainMs);
        const fromX = center.x + Math.cos(angle) * reach;
        const fromZ = center.z + Math.sin(angle) * reach;
        this.particles.emit(fromX, 0.3, fromZ, Math.random() < 0.5 ? WATER : FOAM, 1, { spread: 0, rise: 6, gravity: 2, life: 0.9, size: 1.1 });
      }
      this.particles.emit(center.x, 2 + Math.random() * 4, center.z, FOAM, 2, { spread: 2, rise: 1, gravity: 4, life: 0.5, size: 0.9, jitter: 1.5 });
    }
    if (attack?.type === 'wave') {
      const length = T.waveRange * WORLD_SCALE;
      const width = T.waveHalfLength * 2 * WORLD_SCALE;
      const angle = Math.atan2(attack.dirY, attack.dirX);
      if (attack.phase === 'telegraph') {
        simToWorld(attack.x, attack.y, 0.06, pieces.waterLane.position);
        pieces.waterLane.visible = true;
        pieces.waterLane.rotation.set(0, -angle, 0);
        pieces.waterLane.scale.set(length, 1, width);
        (pieces.waterLane.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * 14));
      } else if (attack.phase === 'active') {
        const front = T.waveSpeed * (attack.elapsedMs / 1000);
        simToWorld(attack.x + attack.dirX * front, attack.y + attack.dirY * front, 0, pieces.wall.position);
        pieces.wall.visible = true;
        pieces.wall.rotation.set(0, -angle, 0);
        // Tall where it breaks, shrinking as it runs out.
        const fade = 1 - front / T.waveRange;
        pieces.wall.scale.set(T.waveThickness * WORLD_SCALE, 1.2 + 1.6 * fade, width);
        (pieces.wall.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.4 * fade;
        if (running) {
          for (let index = 0; index < 6; index += 1) {
            const across = (Math.random() - 0.5) * width;
            this.particles.emit(pieces.wall.position.x - Math.sin(angle) * across, 1.5 + 1.5 * fade, pieces.wall.position.z + Math.cos(angle) * across, FOAM, 1, { spread: 1.5, rise: 2, gravity: 10, life: 0.4, size: 1 });
          }
        }
      }
    }
    if (attack?.type === 'whirlpool') {
      pieces.swirl.visible = true;
      pieces.swirl.position.set(center.x, 0.08, center.z);
      pieces.swirl.rotation.set(0, -this.time * 3, 0);
      pieces.swirl.scale.setScalar(T.whirlRange * WORLD_SCALE);
      if (running) {
        const angle = Math.random() * Math.PI * 2;
        const reach = T.whirlRange * WORLD_SCALE * (0.3 + Math.random() * 0.7);
        this.particles.emit(center.x + Math.cos(angle) * reach, 0.2, center.z + Math.sin(angle) * reach, FOAM, 1, { spread: 0.5, rise: 1, gravity: 4, life: 0.5, size: 0.9 });
      }
      pieces.circle(boss.enemy.x, boss.enemy.y, T.whirlCoreRadius, 1);
    }
  }

  private updateArrows(companions: CompanionSystem, alpha: number): void {
    const count = Math.min(MAX_ARROWS, companions.arrows.length);
    for (let index = 0; index < count; index += 1) {
      const arrow = companions.arrows[index];
      simToWorld(arrow.prevX + (arrow.x - arrow.prevX) * alpha, arrow.prevY + (arrow.y - arrow.prevY) * alpha, 1.3, this.position);
      this.direction.set(arrow.vx, 0, arrow.vy).normalize();
      this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.direction);
      this.arrows.setMatrixAt(index, this.matrix.compose(this.position, this.quaternion, this.scale));
    }
    this.arrows.count = count;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.telegraphs.forEach((pieces) => pieces.root.removeFromParent());
    this.telegraphs.clear();
  }
}
