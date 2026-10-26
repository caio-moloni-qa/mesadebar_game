import * as THREE from 'three';
import { AllySkeletonState, CompanionState } from '../../core/systems/CompanionSystem';
import { MINI_BOSS_TUNING, MiniBossState } from '../../core/systems/MiniBossSystem';
import { EnemyState } from '../../core/session/entities';
import { ActorClipName } from '../models/clips';
import { ActorModel, createAllySkeletonModel, createGravediggerModel, createLakeSpiritModel, createStoneGolemModel } from '../models/zoneActors';
import { simToWorld, yawFromSimDirection } from '../space';

const FADE = 0.18;
const HIT_FLASH_MS = 70;
const DEATH_SECONDS = 2.6;
/** A guardian's entrance (seconds): below ground while the camera arrives, climbing out, then a roar. */
export const GUARDIAN_ENTRANCE = { wait: 0.7, rise: 1.1, total: 3.5 };
const ONE_SHOTS: ActorClipName[] = ['raise', 'slamHit', 'emerge', 'shockSlam', 'shoot', 'death'];
/** Companion display sizes (game units, like an enemy's displaySize): the Coveiro hero-sized, golem a head taller;
 *  the skeletons he raises a little smaller than the horde's. */
export const COMPANION_SIZE = { gravedigger: 66, stoneGolem: 105, waterFairy: 30 };
export const ALLY_SKELETON_SIZE = 52;

/** One rigged actor: model + mixer, crossfading between named clips; one-shots play once and hold. */
class RiggedActor {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<ActorClipName, THREE.AnimationAction>;
  private current: ActorClipName = 'idle';

  constructor(readonly model: ActorModel) {
    this.root.add(model.root);
    this.mixer = new THREE.AnimationMixer(model.root);
    this.actions = Object.fromEntries(Object.entries(model.clips).map(([name, clip]) => [name, this.mixer.clipAction(clip)])) as Record<ActorClipName, THREE.AnimationAction>;
    ONE_SHOTS.forEach((name) => {
      this.actions[name].setLoop(THREE.LoopOnce, 1);
      this.actions[name].clampWhenFinished = true;
    });
    this.actions.idle.play();
  }

  /** Scale so `displaySize` game units match the horde's convention (a 62-unit skeleton is ~2 m). */
  setDisplaySize(displaySize: number): void {
    this.root.scale.setScalar((displaySize / 62) * (2 / this.model.height));
  }

  set(name: ActorClipName, fade = FADE): void {
    if (name === this.current) return;
    this.restart(name, fade);
  }

  /** Plays `name` from the start even if it's already the current clip (a new shot, a new slam). */
  restart(name: ActorClipName, fade = 0.08): void {
    const from = this.actions[this.current];
    const to = this.actions[name];
    to.reset().setEffectiveWeight(1).play();
    if (from !== to) from.crossFadeTo(to, fade, false);
    this.current = name;
  }

  get clip(): ActorClipName {
    return this.current;
  }

  /** The current clip is a one-shot still playing (a shot, a slam). */
  get busy(): boolean {
    const action = this.actions[this.current];
    return ONE_SHOTS.includes(this.current) && action.time < action.getClip().duration - 0.001;
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }

  tint(r: number, g: number, b: number): void {
    this.model.material.emissive.setRGB(r, g, b);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
    this.root.removeFromParent();
    this.root.traverse((child) => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
    this.model.material.dispose();
  }
}

/** A mini-boss on screen, animated from its MiniBossState. */
class MiniBossView {
  readonly actor: RiggedActor;
  private yaw: number;
  private readonly last = new THREE.Vector3();
  private dyingFor = -1;
  private readonly head = new THREE.Vector3();
  /** Seconds into its entrance (GUARDIAN_ENTRANCE), or -1 when it isn't making one. */
  entrance = -1;

  constructor(readonly state: MiniBossState) {
    this.actor = new RiggedActor(state.kind === 'gravedigger' ? createGravediggerModel() : state.kind === 'lakeSpirit' ? createLakeSpiritModel() : createStoneGolemModel());
    this.yaw = yawFromSimDirection(Math.cos(state.facing), Math.sin(state.facing));
  }

  get dying(): boolean {
    return this.dyingFor >= 0;
  }

  get finished(): boolean {
    return this.dyingFor >= DEATH_SECONDS;
  }

  headPosition(): THREE.Vector3 {
    this.actor.model.bones.head.getWorldPosition(this.head);
    this.head.y += 0.5 * this.actor.root.scale.y;
    return this.head;
  }

  update(live: boolean, alpha: number, nowMs: number, deltaSeconds: number): void {
    const { actor, state } = this;
    if (!live) {
      if (this.dyingFor < 0) {
        this.dyingFor = 0;
        actor.root.visible = true;
        actor.set('death', 0.1);
      }
      this.dyingFor += deltaSeconds;
      actor.update(deltaSeconds);
      actor.root.position.y = -Math.max(0, this.dyingFor - 1.5) * 2;
      return;
    }
    const { enemy } = state;
    actor.setDisplaySize(enemy.displaySize);
    simToWorld(enemy.prevX + (enemy.x - enemy.prevX) * alpha, enemy.prevY + (enemy.y - enemy.prevY) * alpha, 0, actor.root.position);
    const moved = actor.root.position.distanceTo(this.last) > 0.0005;
    this.last.copy(actor.root.position);
    const target = yawFromSimDirection(Math.cos(state.facing), Math.sin(state.facing));
    this.yaw += Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)) * (1 - Math.exp(-12 * deltaSeconds));
    actor.root.rotation.y = this.yaw;

    actor.root.visible = true;
    if (this.entrance >= 0 && this.entrance < GUARDIAN_ENTRANCE.total) {
      this.playEntrance(deltaSeconds);
      return;
    }
    const attack = state.attack;
    if (state.kind === 'gravedigger') {
      if (attack?.type === 'burrow') {
        // Digs down, travels unseen (the crack trail shows where), bursts out at the exit.
        if (attack.phase === 'sink') {
          actor.set('dig');
          actor.root.position.y = -(attack.elapsedMs / MINI_BOSS_TUNING.burrowSinkMs) * 2.5 * actor.root.scale.y;
        } else if (attack.phase === 'tunnel' || attack.phase === 'emerge') {
          actor.root.visible = false;
        } else if (actor.clip !== 'emerge') {
          actor.restart('emerge');
        }
      } else if (attack?.type === 'raise') {
        if (actor.clip !== 'raise') actor.restart('raise');
      } else if (attack?.type === 'slam') {
        if (attack.phase === 'telegraph') actor.set('slamWindup');
        else if (actor.clip !== 'slamHit') actor.restart('slamHit');
      } else {
        actor.set(moved ? 'walk' : 'idle');
      }
    } else if (state.kind === 'lakeSpirit') {
      if (attack?.type === 'drain' || attack?.type === 'whirlpool') {
        // Arms to the sky as it drinks the lake; the whirlpool turns it round and round.
        actor.set('channel');
        if (attack.type === 'whirlpool') this.yaw += deltaSeconds * 5;
      } else if (attack?.type === 'wave') {
        if (attack.phase === 'telegraph') actor.set('slamWindup');
        else if (actor.clip !== 'slamHit') actor.restart('slamHit');
      } else if (attack?.type === 'geyser') {
        if (actor.clip !== 'raise') actor.restart('raise');
      } else if (!actor.busy) {
        actor.set(moved ? 'walk' : 'idle');
      }
      actor.root.rotation.y = this.yaw;
    } else if (state.stunnedMs > 0) {
      actor.set('stagger');
    } else if (attack?.type === 'charge') {
      actor.set(attack.phase === 'telegraph' ? 'chargeWindup' : attack.phase === 'active' ? 'charge' : 'idle');
    } else if (attack?.type === 'shockwave') {
      if (attack.phase === 'telegraph') actor.set('shockWindup');
      else if (actor.clip !== 'shockSlam') actor.restart('shockSlam');
    } else {
      actor.set(moved ? 'walk' : 'idle');
    }
    actor.update(deltaSeconds);
    if (nowMs - enemy.lastHitAt < HIT_FLASH_MS) actor.tint(0.1, 0.09, 0.08);
    else if (state.kind === 'lakeSpirit') actor.tint(0, 0.035 + Math.sin(nowMs / 200) * 0.01, 0.07);
    else if (state.stunnedMs > 0) actor.tint(0.03, 0.025, 0);
    else if (state.leashing) actor.tint(0, 0.02, 0.04);
    else actor.tint(0, 0, 0);
  }

  /** Climbs out of the ground (the Coveiro digging his way up, the others rising), then roars with its arms up. */
  private playEntrance(deltaSeconds: number): void {
    const { actor } = this;
    const { wait, rise } = GUARDIAN_ENTRANCE;
    const before = this.entrance;
    this.entrance += deltaSeconds;
    const climbed = Math.min(1, Math.max(0, (this.entrance - wait) / rise));
    actor.root.position.y = -(1 - climbed) * (1 - climbed) * 3 * actor.root.scale.y;
    if (before === 0) actor.restart(this.state.kind === 'gravedigger' ? 'emerge' : 'idle', 0);
    if (before < wait + rise && this.entrance >= wait + rise) actor.restart('raise');
    actor.update(deltaSeconds);
    actor.tint(0, 0, 0);
  }
}

/** One view per live mini-boss; defeated ones finish their collapse. */
export class MiniBossViews {
  readonly root = new THREE.Group();
  private readonly views = new Map<EnemyState, MiniBossView>();
  private readonly entrances = new Set<EnemyState>();

  /** This guardian makes an entrance when it first shows (the intro scene). */
  playEntrance(enemy: EnemyState): void {
    this.entrances.add(enemy);
  }

  update(bosses: MiniBossState[], alpha: number, nowMs: number, deltaSeconds: number): void {
    const live = new Set(bosses.map((boss) => boss.enemy));
    bosses.forEach((boss) => {
      const existing = this.views.get(boss.enemy);
      if (existing && existing.state !== boss) {
        existing.actor.dispose();
        this.views.delete(boss.enemy);
      }
      if (this.views.has(boss.enemy)) return;
      const view = new MiniBossView(boss);
      if (this.entrances.delete(boss.enemy)) view.entrance = 0;
      this.views.set(boss.enemy, view);
      this.root.add(view.actor.root);
    });
    this.views.forEach((view, enemy) => {
      view.update(live.has(enemy) && view.state.enemy.alive, alpha, nowMs, deltaSeconds);
      if (view.finished) {
        view.actor.dispose();
        this.views.delete(enemy);
      }
    });
  }

  viewFor(enemy: EnemyState): MiniBossView | undefined {
    return this.views.get(enemy);
  }

  clear(): void {
    this.views.forEach((view) => view.actor.dispose());
    this.views.clear();
  }
}

/** The water fairy: no rig — a small glowing body and head, two pairs of translucent wings beating fast, a soft halo,
 *  bobbing at the hero's shoulder; it flares when it heals. */
class FairyView {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wings: THREE.Mesh[] = [];
  private readonly halo: THREE.Mesh;
  private time = Math.random() * 10;
  private flare = 0;

  constructor() {
    const glow = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshBasicMaterial({ color: 0x6fd3ff }));
    torso.scale.set(0.8, 1.4, 0.8);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshBasicMaterial({ color: 0xe6f6ff }));
    head.position.y = 0.2;
    this.halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), glow(0x9fe8ff, 0.25));
    this.body.add(torso, head, this.halo);
    [[1, 0.06], [-1, 0.06], [1, -0.08], [-1, -0.08]].forEach(([side, height], index) => {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(index < 2 ? 0.32 : 0.24, index < 2 ? 0.2 : 0.15).translate((index < 2 ? 0.16 : 0.12) * side, 0, 0), glow(0xbff0ff, 0.55));
      wing.position.set(0.03 * side, height, -0.05);
      this.wings.push(wing);
      this.body.add(wing);
    });
    this.root.add(this.body);
  }

  update(companion: CompanionState, alpha: number, deltaSeconds: number, healed: boolean): void {
    this.time += deltaSeconds;
    if (healed) this.flare = 1;
    this.flare = Math.max(0, this.flare - deltaSeconds * 1.6);
    simToWorld(companion.prevX + (companion.x - companion.prevX) * alpha, companion.prevY + (companion.y - companion.prevY) * alpha, 1.7 + Math.sin(this.time * 2.4) * 0.15, this.root.position);
    this.root.rotation.y = yawFromSimDirection(companion.facingX, companion.facingY);
    const beat = Math.sin(this.time * 32) * 0.9;
    this.wings.forEach((wing, index) => { wing.rotation.y = (index % 2 === 0 ? 1 : -1) * (0.3 + beat * 0.5); });
    this.halo.scale.setScalar(1 + this.flare * 2.2 + Math.sin(this.time * 5) * 0.08);
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.22 + this.flare * 0.5;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    });
  }
}

/** One view per companion: the Coveiro swings his shovel or raises the dead, the golem pounds on every slam; a
 *  fallen companion is gone until it reforms. Plus one per skeleton the Coveiro raised. */
export class CompanionViews {
  readonly root = new THREE.Group();
  private readonly views = new Map<CompanionState, { actor: RiggedActor; lastAttack: number; yaw: number; last: THREE.Vector3 }>();
  private readonly fairies = new Map<CompanionState, { view: FairyView; lastHeal: number }>();
  private readonly skeletons = new Map<AllySkeletonState, { actor: RiggedActor; lastAttack: number; yaw: number }>();

  update(companions: CompanionState[], skeletons: AllySkeletonState[], alpha: number, deltaSeconds: number): void {
    this.updateFairies(companions, alpha, deltaSeconds);
    this.updateSkeletons(skeletons, alpha, deltaSeconds);
    companions.forEach((companion) => {
      if (companion.kind === 'waterFairy' || this.views.has(companion)) return;
      const actor = new RiggedActor(companion.kind === 'gravedigger' ? createGravediggerModel() : createStoneGolemModel(0xffd36a));
      actor.setDisplaySize(COMPANION_SIZE[companion.kind]);
      this.root.add(actor.root);
      this.views.set(companion, { actor, lastAttack: companion.attackedAt, yaw: 0, last: new THREE.Vector3() });
    });
    this.views.forEach((view, companion) => {
      if (!companions.includes(companion)) {
        view.actor.dispose();
        this.views.delete(companion);
        return;
      }
      const { actor } = view;
      actor.root.visible = companion.downUntil === 0;
      if (!actor.root.visible) return;
      simToWorld(companion.prevX + (companion.x - companion.prevX) * alpha, companion.prevY + (companion.y - companion.prevY) * alpha, 0, actor.root.position);
      const moved = actor.root.position.distanceTo(view.last) > 0.0005;
      view.last.copy(actor.root.position);
      const target = yawFromSimDirection(companion.facingX, companion.facingY);
      view.yaw += Math.atan2(Math.sin(target - view.yaw), Math.cos(target - view.yaw)) * (1 - Math.exp(-12 * deltaSeconds));
      actor.root.rotation.y = view.yaw;
      if (companion.attackedAt !== view.lastAttack) {
        view.lastAttack = companion.attackedAt;
        // The Coveiro's raise resets its raise timer; anything else from him is a shovel swipe.
        actor.restart(companion.kind === 'gravedigger' ? (companion.raiseMs === 0 ? 'raise' : 'slamHit') : 'shockSlam');
      } else if (!actor.busy) {
        actor.set(moved ? 'walk' : 'idle');
      }
      actor.update(deltaSeconds);
    });
  }

  /** Raised skeletons climb out of the ground, chase and hack at the horde; gone when they crumble. */
  private updateSkeletons(skeletons: AllySkeletonState[], alpha: number, deltaSeconds: number): void {
    skeletons.forEach((skeleton) => {
      if (this.skeletons.has(skeleton)) return;
      const actor = new RiggedActor(createAllySkeletonModel());
      actor.setDisplaySize(ALLY_SKELETON_SIZE);
      actor.restart('emerge', 0);
      this.root.add(actor.root);
      this.skeletons.set(skeleton, { actor, lastAttack: skeleton.attackedAt, yaw: yawFromSimDirection(skeleton.facingX, skeleton.facingY) });
    });
    this.skeletons.forEach((view, skeleton) => {
      if (!skeletons.includes(skeleton)) {
        view.actor.dispose();
        this.skeletons.delete(skeleton);
        return;
      }
      const { actor } = view;
      simToWorld(skeleton.prevX + (skeleton.x - skeleton.prevX) * alpha, skeleton.prevY + (skeleton.y - skeleton.prevY) * alpha, 0, actor.root.position);
      const target = yawFromSimDirection(skeleton.facingX, skeleton.facingY);
      view.yaw += Math.atan2(Math.sin(target - view.yaw), Math.cos(target - view.yaw)) * (1 - Math.exp(-14 * deltaSeconds));
      actor.root.rotation.y = view.yaw;
      const moved = Math.hypot(skeleton.x - skeleton.prevX, skeleton.y - skeleton.prevY) > 0.01;
      if (skeleton.attackedAt !== view.lastAttack) {
        view.lastAttack = skeleton.attackedAt;
        actor.restart('slamHit');
      } else if (!actor.busy) {
        actor.set(moved ? 'walk' : 'idle');
      }
      actor.update(deltaSeconds);
    });
  }

  private updateFairies(companions: CompanionState[], alpha: number, deltaSeconds: number): void {
    companions.forEach((companion) => {
      if (companion.kind !== 'waterFairy' || this.fairies.has(companion)) return;
      const view = new FairyView();
      this.root.add(view.root);
      this.fairies.set(companion, { view, lastHeal: companion.attackedAt });
    });
    this.fairies.forEach((entry, companion) => {
      if (!companions.includes(companion)) {
        entry.view.dispose();
        this.fairies.delete(companion);
        return;
      }
      const healed = companion.attackedAt !== entry.lastHeal;
      entry.lastHeal = companion.attackedAt;
      entry.view.root.visible = companion.downUntil === 0;
      entry.view.update(companion, alpha, deltaSeconds, healed);
    });
  }

  clear(): void {
    this.views.forEach((view) => view.actor.dispose());
    this.views.clear();
    this.fairies.forEach((entry) => entry.view.dispose());
    this.fairies.clear();
    this.skeletons.forEach((view) => view.actor.dispose());
    this.skeletons.clear();
  }
}
