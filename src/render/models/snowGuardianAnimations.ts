import * as THREE from 'three';
import { MiniBossState, MINI_BOSS_TUNING } from '../../core/systems/MiniBossSystem';
import { Key, Pose, poseClip } from './clips';
import { Vec3Tuple } from './parts';
import { clipForBones } from './rig';
import { ActorModel } from './zoneActors';

export type SnowGuardianKind = 'frostKnight' | 'iceSerpent' | 'bellringer' | 'ancientYeti';
export function hasSnowAnimation(kind: string): kind is SnowGuardianKind {
  return ['frostKnight', 'iceSerpent', 'bellringer', 'ancientYeti'].includes(kind);
}

/** Every attack shares a held anticipation, an impact at t=1, and a weighted recovery.
 * The view samples this score from the simulation clock, including skipped frames and pauses. */
export function snowGuardianClips(kind: SnowGuardianKind, hips: Vec3Tuple): Record<string, THREE.AnimationClip> {
  const clips: Record<string, THREE.AnimationClip> = {};
  const neutral: Pose = Object.fromEntries(['hips', 'spine', 'chest', 'head', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'cape'].map(bone => [bone, [0, 0, 0] as Vec3Tuple]));
  const guard: Pose = kind === 'frostKnight' ? { upperArmL: [-55, 0, 18], foreArmL: [-65, 0, 0], upperArmR: [-12, 0, -18], chest: [5, -12, 0] }
    : kind === 'ancientYeti' ? { chest: [14, 0, 0], upperArmL: [-12, 0, 24], upperArmR: [-12, 0, -24], foreArmL: [-22, 0, 0], foreArmR: [-22, 0, 0], head: [-9, 0, 0] }
    : kind === 'bellringer' ? { chest: [8, 0, 0], head: [-5, 0, 0], upperArmR: [-25, 0, -15], foreArmR: [-45, 0, 0] } : {};
  const key = (t: number, pose: Pose, offset: Vec3Tuple = [0, 0, 0]): Key => ({ t, pose: { ...neutral, ...guard, ...pose }, hips: offset });
  const attack = (name: string, wind: Pose, hit: Pose, dip = -0.06) => {
    clips[name] = poseClip(name, 2.6, [key(0, {}), key(0.65, wind), key(0.95, wind), key(1, hit, [0, dip, 0]), key(1.18, hit, [0, dip, 0]), key(1.65, {}), key(2.6, {})], hips);
  };
  const serpent = kind === 'iceSerpent';
  const period = serpent ? 1.6 : kind === 'bellringer' ? 1.4 : kind === 'ancientYeti' ? 1.15 : 0.95;
  const stride = kind === 'ancientYeti' ? 22 : 14;
  const step = (side: number): Pose => serpent
    ? { spine: [0, side * 12, side * 5], chest: [-4, -side * 18, -side * 4], head: [2, side * 12, 0] }
    : { hips: [0, side * 4, side * 3], chest: [kind === 'ancientYeti' ? 17 : 6, -side * 6, -side * 4], thighL: [-side * stride, 0, 0], thighR: [side * stride, 0, 0], shinL: [side < 0 ? 25 : 5, 0, 0], shinR: [side > 0 ? 25 : 5, 0, 0], head: [-4, 0, side * 2], ...(kind === 'ancientYeti' ? { upperArmL: [side * 22, 0, 24] as Vec3Tuple, upperArmR: [-side * 22, 0, -24] as Vec3Tuple } : {}) };
  clips.walk = poseClip('snowWalk', period, [key(0, step(1)), key(period / 4, {}, [0, 0.025, 0]), key(period / 2, step(-1)), key(period * 0.75, {}, [0, 0.025, 0]), key(period, step(1))], hips, { loop: true });
  const breath: Pose = serpent ? { spine: [-5, 8, 2], chest: [6, -10, -2], head: [-3, 8, 0] } : { chest: [kind === 'ancientYeti' ? 18 : 3, 0, 1], head: [-3, 4, 0] };
  clips.idle = poseClip('snowIdle', 2.8, [key(0, {}), key(1.4, breath, [0, -0.015, 0]), key(2.8, {})], hips, { loop: true });
  clips.stagger = poseClip('snowStagger', 0.8, [key(0, { chest: [22, 0, 5], head: [15, 0, -8] }, [0, -0.07, 0]), key(0.4, { chest: [18, 0, -5], head: [12, 0, 8] }, [0, -0.06, 0]), key(0.8, { chest: [22, 0, 5], head: [15, 0, -8] }, [0, -0.07, 0])], hips, { loop: true });
  if (serpent) {
    attack('eruption', { spine: [24, 0, 0], chest: [28, 0, 0], head: [16, 0, 0] }, { spine: [-18, 0, 0], chest: [-15, 0, 0], head: [24, 0, 0] });
    attack('breath', { spine: [-12, 0, 0], chest: [-20, -18, 0], head: [-15, 18, 0] }, { spine: [12, 0, 0], chest: [18, 18, 0], head: [-12, -18, 0] });
    attack('constrict', { spine: [0, -25, 9], chest: [-8, 35, -12], head: [8, -20, 0] }, { spine: [8, 25, -9], chest: [15, -35, 12], head: [-10, 25, 0] });
    attack('shard', { chest: [-22, 0, 0], head: [-25, 0, 0] }, { chest: [25, 0, 0], head: [-8, 0, 0] });
  } else if (kind === 'bellringer') {
    attack('bellWave', { chest: [-12, -28, -8], upperArmR: [-145, 0, -20], foreArmR: [-60, 0, 0], upperArmL: [-35, 0, 40] }, { chest: [24, 25, 8], upperArmR: [-48, 0, 20], foreArmR: [-10, 0, 0], head: [14, 0, 0] });
    attack('bell', { upperArmL: [-135, 0, 25], upperArmR: [-135, 0, -25], head: [-18, 0, 0] }, { upperArmL: [-45, 0, 40], upperArmR: [-45, 0, -40], chest: [18, 0, 0] });
    attack('resonance', { chest: [0, -25, -10], upperArmL: [-65, 0, 65], upperArmR: [-110, 0, -35] }, { chest: [0, 25, 10], upperArmL: [-100, 0, 35], upperArmR: [-65, 0, -65] });
  } else if (kind === 'ancientYeti') {
    attack('snowball', { chest: [35, -20, 0], upperArmR: [-30, -20, -30], foreArmR: [-100, 0, 0], upperArmL: [-50, 0, 30] }, { chest: [25, 30, 0], upperArmR: [-100, 0, 0], foreArmR: [-5, 0, 0], upperArmL: [35, 0, 25] });
    attack('leap', { chest: [32, 0, 0], thighL: [-40, 0, -8], thighR: [-40, 0, 8], shinL: [65, 0, 0], shinR: [65, 0, 0], upperArmL: [45, 0, 30], upperArmR: [45, 0, -30] }, { chest: [40, 0, 0], upperArmL: [-65, 0, 25], upperArmR: [-65, 0, -25], thighL: [-22, 0, 0], thighR: [-22, 0, 0], shinL: [35, 0, 0], shinR: [35, 0, 0] }, -0.18);
    attack('avalanche', { chest: [-18, 0, 0], upperArmL: [-155, 0, 25], upperArmR: [-155, 0, -25], head: [-18, 0, 0] }, { chest: [40, 0, 0], upperArmL: [-50, 0, 15], upperArmR: [-50, 0, -15], head: [15, 0, 0] }, -0.16);
  } else {
    attack('iceSlash', { chest: [-5, -40, 0], upperArmR: [-75, -30, -35], foreArmR: [-45, 0, 0] }, { chest: [12, 40, 0], upperArmR: [-75, 45, 35], foreArmR: [-10, 0, 0] });
    attack('iceWall', { upperArmR: [-150, 0, -20], head: [-15, 0, 0], chest: [-8, 0, 0] }, { upperArmR: [-40, 0, -15], chest: [22, 0, 0], head: [10, 0, 0] });
    attack('charge', { chest: [20, -20, 0], upperArmL: [-75, 0, 20], foreArmL: [-80, 0, 0], upperArmR: [30, 0, -15] }, { chest: [28, -20, 0], upperArmL: [-85, 0, 15], foreArmL: [-75, 0, 0], upperArmR: [40, 0, -15] });
  }
  attack('roar', { chest: [20, 0, 0], head: [12, 0, 0], upperArmL: [-35, 0, 20], upperArmR: [-35, 0, -20] }, { chest: [-12, 0, 0], head: [-25, 0, 0], upperArmL: [-85, 0, 60], upperArmR: [-85, 0, -60] });
  return clips;
}

/** Owns only the living combat poses; the existing actor keeps entrance and death clips. */
export class SnowGuardianAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<string, THREE.AnimationAction>;
  private time = 0;
  private current = '';
  private transition = 1;
  private readonly from = new Map<THREE.Bone, THREE.Quaternion>();
  private readonly hipFrom = new THREE.Vector3();

  constructor(private readonly model: ActorModel, private readonly kind: SnowGuardianKind) {
    Object.values(model.bones).forEach(bone => this.from.set(bone, bone.quaternion.clone()));
    this.mixer = new THREE.AnimationMixer(model.root);
    this.actions = Object.fromEntries(Object.entries(snowGuardianClips(kind, model.bones.hips.position.toArray() as Vec3Tuple)).map(([name, clip]) => {
      const action = this.mixer.clipAction(clipForBones(clip, model.bones));
      action.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
      return [name, action];
    }));
  }

  update(state: MiniBossState, moved: boolean, seconds: number): number {
    this.time += seconds * (state.enraged ? 1.2 : 1);
    const attack = state.stunnedMs > 0 ? null : state.attack;
    const name = state.stunnedMs > 0 ? 'stagger' : attack?.type ?? (moved ? 'walk' : 'idle');
    const action = this.actions[name] ?? this.actions.idle;
    if (name !== this.current) {
      this.from.forEach((rotation, bone) => rotation.copy(bone.quaternion));
      this.hipFrom.copy(this.model.bones.hips.position);
      this.transition = 0;
      this.current = name;
    }
    this.transition = Math.min(1, this.transition + seconds / 0.12);
    let t = this.time % action.getClip().duration;
    let height = 0;
    if (attack) {
      const warning = this.kind === 'frostKnight'
        ? attack.type === 'iceSlash' ? MINI_BOSS_TUNING.iceSlashTelegraphMs : attack.type === 'charge' ? MINI_BOSS_TUNING.knightChargeTelegraphMs : MINI_BOSS_TUNING.iceWallTelegraphMs
        : attack.type === 'bellWave' ? 1500 : attack.type === 'leap' ? 1100 : 1200;
      // Snow attacks retain elapsedMs across impact; the knight resets it at every phase.
      const elapsed = this.kind === 'frostKnight' && attack.phase !== 'telegraph' ? warning + attack.elapsedMs : attack.elapsedMs;
      t = attack.phase === 'telegraph' ? Math.min(0.999, elapsed / warning) : Math.min(2.599, 1 + Math.max(0, elapsed - warning) / 1000);
      if (attack.type === 'leap' && attack.phase === 'telegraph') {
        const flight = Math.max(0, (elapsed / warning - 0.35) / 0.65);
        height = Math.sin(flight * Math.PI) * 1.4;
      }
      if (attack.type === 'eruption' && attack.phase === 'telegraph') height = -Math.sin(Math.min(1, elapsed / warning) * Math.PI) * 1.8;
    }
    this.mixer.stopAllAction();
    action.reset().play();
    action.time = t;
    this.mixer.update(0);
    if (attack?.type === 'charge' && attack.phase === 'active') {
      const stride = Math.sin(attack.elapsedMs / 65) * 0.5;
      this.model.bones.thighL.rotation.x = stride;
      this.model.bones.thighR.rotation.x = -stride;
    }
    if (attack?.type === 'breath' && attack.phase === 'active') {
      this.model.bones.head.rotation.y += Math.sin(Math.max(0, attack.elapsedMs - 1200) / 560 * Math.PI) * 0.25;
    }
    if (this.transition < 1) {
      const blend = this.transition * this.transition * (3 - 2 * this.transition);
      this.from.forEach((rotation, bone) => bone.quaternion.slerpQuaternions(rotation, bone.quaternion, blend));
      this.model.bones.hips.position.lerpVectors(this.hipFrom, this.model.bones.hips.position, blend);
    }
    return height;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
  }
}
