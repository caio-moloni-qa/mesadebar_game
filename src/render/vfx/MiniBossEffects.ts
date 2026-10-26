import * as THREE from 'three';
import { CompanionSystem } from '../../core/systems/CompanionSystem';
import { MINI_BOSS_TUNING, MiniBossState, MiniBossSystem } from '../../core/systems/MiniBossSystem';
import { WORLD_SCALE, simToWorld } from '../space';
import { ParticleView } from '../views/PickupAndProjectileViews';
import { MiniBossViews } from '../views/ZoneActorViews';

/** Mini-boss danger reads orange (the Necromancer's is green). */
const DANGER = 0xff7a3a;
const DANGER_LIGHT = 0xffc890;
const MAX_ARROWS = 64;

const additive = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

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
  readonly stars: THREE.Mesh[] = [];

  constructor(starGeometry: THREE.BufferGeometry) {
    for (let index = 0; index < 3; index += 1) this.stars.push(new THREE.Mesh(starGeometry, new THREE.MeshBasicMaterial({ color: 0xffe45c })));
    this.root.add(this.area, this.fill, this.edge, this.lane, this.wave, ...this.stars);
    this.hide();
  }

  hide(): void {
    [this.area, this.fill, this.edge, this.lane, this.wave, ...this.stars].forEach((object) => { object.visible = false; });
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
    this.root.add(this.arrows);
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
