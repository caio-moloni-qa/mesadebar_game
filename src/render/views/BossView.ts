import * as THREE from 'three';
import { BossState } from '../../core/systems/BossSystem';
import { EnemyState, PlayerState } from '../../core/session/entities';
import { BossClipName } from '../models/clips';
import { BossModel, createBossModel } from '../models/boss';
import { simToWorld, yawFromSimDirection } from '../space';

/** The model is ~2.4 m tall at scale 1; the horde's skeleton (display size 62) is ~2 m. */
const MODEL_SCALE = 2 / 2.4;
const FADE = 0.2;
const TURN_SHARPNESS = 6;
const HIT_FLASH_MS = 70;
/** A defeated boss keeps its view this long: the collapse plays, then it sinks away. */
const DEATH_SECONDS = 3.2;
const ONE_SHOTS = new Set<BossClipName>(['summon', 'roar', 'spin', 'spinBack', 'death']);
const SUMMON_POSE_MS = 1100;

/** One boss on screen: its own rigged model and mixer (bosses are few, so no instancing), animated from the core
 *  BossState — every ability has its own pose — and crossfaded between states. */
export class BossView {
  readonly root = new THREE.Group();
  private readonly model: BossModel;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<BossClipName, THREE.AnimationAction>;
  private current: BossClipName = 'idle';
  private yaw = 0;
  private readonly lastPosition = new THREE.Vector3();
  private dyingFor = -1;
  private readonly handWorld = new THREE.Vector3();
  private readonly headWorld = new THREE.Vector3();
  private readonly emissive = new THREE.Color();

  constructor(readonly enemy: EnemyState, winter = false) {
    this.model = createBossModel(winter);
    this.root.add(this.model.root);
    this.mixer = new THREE.AnimationMixer(this.model.root);
    this.actions = Object.fromEntries(Object.entries(this.model.clips).map(([name, clip]) => [name, this.mixer.clipAction(clip)])) as Record<BossClipName, THREE.AnimationAction>;
    ONE_SHOTS.forEach((name) => {
      this.actions[name].setLoop(THREE.LoopOnce, 1);
      this.actions[name].clampWhenFinished = true;
    });
    this.actions.idle.play();
    this.yaw = yawFromSimDirection(enemy.facingX, enemy.facingY);
  }

  get dying(): boolean {
    return this.dyingFor >= 0;
  }

  /** True once the collapse and sink are done — the manager disposes it. */
  get finished(): boolean {
    return this.dyingFor >= DEATH_SECONDS;
  }

  /** World position of the top of the skull (stagger stars, phase-2 fire). */
  headPosition(): THREE.Vector3 {
    this.model.bones.head.getWorldPosition(this.headWorld);
    this.headWorld.y += 0.5 * this.root.scale.y;
    return this.headWorld;
  }

  /** World position of the right hand (the beam charges there). */
  handPosition(): THREE.Vector3 {
    return this.model.bones.handR.getWorldPosition(this.handWorld);
  }

  update(boss: BossState | null, player: PlayerState, alpha: number, nowMs: number, deltaSeconds: number): void {
    const { enemy } = this;
    // Once defeated, the pooled enemy may be reused for something else: stop reading it.
    if (!boss) {
      this.updateDeath(deltaSeconds);
      return;
    }
    this.root.scale.setScalar((enemy.displaySize / 62) * MODEL_SCALE);
    const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
    const y = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
    simToWorld(x, y, 0, this.root.position);
    const moved = this.root.position.distanceTo(this.lastPosition) > 0.0005;
    this.lastPosition.copy(this.root.position);

    this.setClip(this.clipFor(boss, moved));
    // Walk cycle keeps pace with the (possibly enraged) speed.
    this.actions.walk.timeScale = Math.max(0.6, enemy.movementSpeed / 35);

    // Faces the hero; while leaping, the way it flies; through a sweep, where the sword started (the spin clip turns it).
    let targetYaw = yawFromSimDirection(player.x - enemy.x, player.y - enemy.y);
    if (boss.dash.phase === 'dashing') targetYaw = yawFromSimDirection(boss.dash.targetX - boss.dash.fromX, boss.dash.targetY - boss.dash.fromY);
    if (boss.melee) targetYaw = yawFromSimDirection(Math.cos(boss.melee.startAngle - Math.PI / 2), Math.sin(boss.melee.startAngle - Math.PI / 2));
    const turnable = boss.staggerMs <= 0 && !(boss.melee && boss.melee.phase !== 'telegraph');
    if (turnable) this.yaw += Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw)) * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
    this.root.rotation.y = this.yaw;

    this.mixer.update(deltaSeconds);
    this.applyTint(boss, nowMs);
  }

  /** The pose for the boss's current state, most dramatic first. */
  private clipFor(boss: BossState, moved: boolean): BossClipName {
    if (boss.transitionMs > 0) return 'roar';
    if (boss.staggerMs > 0) return 'kneel';
    if (boss.dash.phase === 'telegraph') return 'crouch';
    if (boss.dash.phase === 'dashing') return 'leap';
    if (boss.melee) return boss.melee.phase === 'telegraph' ? 'windup' : boss.melee.phase === 'sweep' ? 'spin' : 'spinBack';
    if (boss.channelActive || boss.shieldActive) return 'channel';
    if (boss.beamState !== 'idle') return 'point';
    if (boss.summonPoseMs < SUMMON_POSE_MS) return 'summon';
    return moved ? 'walk' : 'idle';
  }

  private setClip(next: BossClipName): void {
    if (next === this.current) return;
    const from = this.actions[this.current];
    const to = this.actions[next];
    to.reset().setEffectiveWeight(1).play();
    // The spins snap in (they're timed to the sword); everything else blends.
    from.crossFadeTo(to, next === 'spin' || next === 'spinBack' ? 0.05 : FADE, false);
    this.current = next;
  }

  /** Hit flash, enrage (red pulse), phase 2 (green smoulder), stagger (dim). */
  private applyTint(boss: BossState, nowMs: number): void {
    this.emissive.setRGB(0, 0, 0);
    // Accents only: the toon material adds emissive straight on top, so anything past ~0.1 washes the model out.
    if (boss.phaseTwo) this.emissive.setRGB(0, 0.025 + Math.sin(nowMs / 160) * 0.01, 0.01);
    if (boss.enraged) this.emissive.r += 0.04 + Math.sin(nowMs / 120) * 0.02;
    if (boss.staggerMs > 0) this.emissive.setRGB(0.03, 0.025, 0);
    if (boss.transitionMs > 0) this.emissive.setRGB(0.02, 0.07, 0.03);
    if (nowMs - this.enemy.lastHitAt < HIT_FLASH_MS) this.emissive.setRGB(0.1, 0.09, 0.08);
    this.model.material.emissive.copy(this.emissive);
  }

  private updateDeath(deltaSeconds: number): void {
    if (this.dyingFor < 0) {
      this.dyingFor = 0;
      this.setClip('death');
    }
    this.dyingFor += deltaSeconds;
    this.mixer.update(deltaSeconds);
    // After the collapse, sink into the ground.
    const sink = Math.max(0, this.dyingFor - 1.9) / (DEATH_SECONDS - 1.9);
    this.root.position.y = -sink * 2.5;
    this.model.material.emissive.setRGB(0.01 * (1 - sink), 0.05 * (1 - sink), 0.02 * (1 - sink));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
    this.root.removeFromParent();
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    this.model.material.dispose();
  }
}

/** Keeps one BossView per live boss (and lets defeated ones finish dying). */
export class BossViews {
  readonly root = new THREE.Group();
  private readonly views = new Map<EnemyState, BossView>();

  update(bosses: BossState[], player: PlayerState, alpha: number, nowMs: number, deltaSeconds: number): void {
    const live = new Map(bosses.map((boss) => [boss.enemy, boss]));
    live.forEach((_boss, enemy) => {
      const existing = this.views.get(enemy);
      // A pooled enemy reused for a new boss while its old view was still collapsing: start over.
      if (existing?.dying) {
        existing.dispose();
        this.views.delete(enemy);
      }
      if (this.views.has(enemy)) return;
      const view = new BossView(enemy, _boss.winter);
      this.views.set(enemy, view);
      this.root.add(view.root);
    });
    this.views.forEach((view, enemy) => {
      view.update(live.get(enemy) ?? null, player, alpha, nowMs, deltaSeconds);
      if (view.finished) {
        view.dispose();
        this.views.delete(enemy);
      }
    });
  }

  viewFor(enemy: EnemyState): BossView | undefined {
    return this.views.get(enemy);
  }

  /** Drops every view (new run / back to the menu). */
  clear(): void {
    this.views.forEach((view) => view.dispose());
    this.views.clear();
  }
}
