import * as THREE from 'three';
import { Vec3Tuple } from './parts';

/** Bone rotations in degrees (X, Y, Z) — easier to author and read than quaternions. The model faces +Z, so a
 *  negative X rotation swings a hanging limb forward and a positive X on the chest leans it forward. */
type Pose = Record<string, Vec3Tuple>;
interface Key { t: number; pose: Pose; hips?: Vec3Tuple; }

/** Arms rest slightly away from the body — every pose starts from this so the silhouette never collapses. */
const REST: Pose = { upperArmL: [0, 0, 10], upperArmR: [0, 0, -10] };

const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();

/** Builds a clip from keyed poses. Every bone mentioned in any key gets a track; keys that omit it use REST/0. */
function poseClip(name: string, duration: number, keys: Key[], hipsRest: Vec3Tuple, { includeRest = true } = {}): THREE.AnimationClip {
  const bones = new Set<string>();
  keys.forEach((key) => Object.keys(key.pose).forEach((bone) => bones.add(bone)));
  if (includeRest) Object.keys(REST).forEach((bone) => bones.add(bone));
  const times = keys.map((key) => key.t);
  const tracks: THREE.KeyframeTrack[] = [...bones].map((bone) => {
    const values: number[] = [];
    keys.forEach((key) => {
      const [x, y, z] = key.pose[bone] ?? (includeRest ? REST[bone] : undefined) ?? [0, 0, 0];
      quaternion.setFromEuler(euler.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z)));
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  });
  if (keys.some((key) => key.hips)) {
    const values = keys.flatMap((key) => {
      const [x, y, z] = key.hips ?? [0, 0, 0];
      return [hipsRest[0] + x, hipsRest[1] + y, hipsRest[2] + z];
    });
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Additive one-shots (attacks, hit): authored from rest at t=0 and re-based on that frame, so they add their
 *  motion on top of whatever idle/run is playing — the arm swings while the legs keep running. */
function additiveClip(name: string, duration: number, keys: Key[], hipsRest: Vec3Tuple): THREE.AnimationClip {
  const clip = poseClip(name, duration, keys, hipsRest, { includeRest: false });
  return THREE.AnimationUtils.makeClipAdditive(clip);
}

export type HeroClipName = 'idle' | 'run' | 'swing' | 'cast' | 'throw' | 'pulse' | 'hit' | 'death';

/** The full humanoid clip set. One set is shared by every mixer (threejs-animation: share clips, not copies). */
export function humanoidClips(hipHeight: number): Record<HeroClipName, THREE.AnimationClip> {
  const hips: Vec3Tuple = [0, hipHeight, 0];
  const runA: Pose = { thighL: [-40, 0, 0], shinL: [15, 0, 0], thighR: [35, 0, 0], shinR: [55, 0, 0], upperArmL: [35, 0, 10], upperArmR: [-35, 0, -10], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0], chest: [10, 0, 0], tail: [20, 20, 0] };
  const runB: Pose = { thighL: [35, 0, 0], shinL: [55, 0, 0], thighR: [-40, 0, 0], shinR: [15, 0, 0], upperArmL: [-35, 0, 10], upperArmR: [35, 0, -10], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0], chest: [10, 0, 0], tail: [20, -20, 0] };
  const runMid: Pose = { shinL: [30, 0, 0], shinR: [30, 0, 0], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0], chest: [10, 0, 0], tail: [25, 0, 0] };
  return {
    idle: poseClip('idle', 1.6, [
      { t: 0, pose: { chest: [0, 0, 0], tail: [10, 15, 0] }, hips: [0, 0, 0] },
      { t: 0.8, pose: { chest: [3, 0, 0], upperArmL: [0, 0, 14], upperArmR: [0, 0, -14], tail: [10, -15, 0] }, hips: [0, -0.02, 0] },
      { t: 1.6, pose: { chest: [0, 0, 0], tail: [10, 15, 0] }, hips: [0, 0, 0] }
    ], hips),
    run: poseClip('run', 0.6, [
      { t: 0, pose: runA, hips: [0, -0.03, 0] },
      { t: 0.15, pose: runMid, hips: [0, 0.04, 0] },
      { t: 0.3, pose: runB, hips: [0, -0.03, 0] },
      { t: 0.45, pose: runMid, hips: [0, 0.04, 0] },
      { t: 0.6, pose: runA, hips: [0, -0.03, 0] }
    ], hips),
    // Horizontal cut: raise the weapon arm forward, then twist the chest through the swing.
    swing: additiveClip('swing', 0.36, [
      { t: 0, pose: { upperArmR: [0, 0, 0], chest: [0, 0, 0], foreArmR: [0, 0, 0] } },
      { t: 0.08, pose: { upperArmR: [-85, 0, 0], chest: [0, 55, 0], foreArmR: [-10, 0, 0] } },
      { t: 0.2, pose: { upperArmR: [-85, 0, 0], chest: [0, -55, 0], foreArmR: [-10, 0, 0] } },
      { t: 0.36, pose: { upperArmR: [0, 0, 0], chest: [0, 0, 0], foreArmR: [0, 0, 0] } }
    ], hips),
    // Point the staff at the target.
    cast: additiveClip('cast', 0.32, [
      { t: 0, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], chest: [0, 0, 0] } },
      { t: 0.08, pose: { upperArmR: [-95, 0, 0], foreArmR: [0, 0, 0], chest: [-5, 0, 0] } },
      { t: 0.18, pose: { upperArmR: [-90, 0, 0], foreArmR: [0, 0, 0], chest: [-5, 0, 0] } },
      { t: 0.32, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], chest: [0, 0, 0] } }
    ], hips),
    // Wind up behind the head, release forward.
    throw: additiveClip('throw', 0.4, [
      { t: 0, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], chest: [0, 0, 0] } },
      { t: 0.12, pose: { upperArmR: [-160, 0, 0], foreArmR: [-50, 0, 0], chest: [-8, 25, 0] } },
      { t: 0.22, pose: { upperArmR: [-60, 0, 0], foreArmR: [0, 0, 0], chest: [12, -25, 0] } },
      { t: 0.4, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], chest: [0, 0, 0] } }
    ], hips),
    // Relíquia Divina tick: arms flare out.
    pulse: additiveClip('pulse', 0.4, [
      { t: 0, pose: { upperArmL: [0, 0, 0], upperArmR: [0, 0, 0], chest: [0, 0, 0] } },
      { t: 0.12, pose: { upperArmL: [0, 0, 60], upperArmR: [0, 0, -60], chest: [-8, 0, 0] } },
      { t: 0.4, pose: { upperArmL: [0, 0, 0], upperArmR: [0, 0, 0], chest: [0, 0, 0] } }
    ], hips),
    hit: additiveClip('hit', 0.24, [
      { t: 0, pose: { chest: [0, 0, 0], head: [0, 0, 0] } },
      { t: 0.07, pose: { chest: [-22, 0, 0], head: [-18, 0, 0] } },
      { t: 0.24, pose: { chest: [0, 0, 0], head: [0, 0, 0] } }
    ], hips),
    // Falls onto its back; held on the last frame (clampWhenFinished).
    death: poseClip('death', 0.9, [
      { t: 0, pose: { hips: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], upperArmL: [0, 0, 10], upperArmR: [0, 0, -10] }, hips: [0, 0, 0] },
      { t: 0.35, pose: { hips: [-30, 0, 0], thighL: [-30, 0, 0], thighR: [-20, 0, 0], upperArmL: [0, 0, 60], upperArmR: [0, 0, -60] }, hips: [0, -0.2, 0] },
      { t: 0.9, pose: { hips: [-88, 0, 0], thighL: [-15, 0, 0], thighR: [-5, 0, 0], upperArmL: [0, 0, 80], upperArmR: [0, 0, -80] }, hips: [0, -hipHeight + 0.22, 0] }
    ], hips)
  };
}

/** Wraith float: hovering bob, beckoning arms, swaying robe — the necromancer and apparition share it. */
export function wraithFloatClip(): THREE.AnimationClip {
  return poseClip('float', 1.2, [
    { t: 0, pose: { chest: [8, 0, 0], upperArmL: [-40, 0, 25], upperArmR: [-40, 0, -25], skirt: [6, 0, 0], head: [5, 0, 0] }, hips: [0, 0, 0] },
    { t: 0.6, pose: { chest: [14, 0, 0], upperArmL: [-65, 0, 35], upperArmR: [-65, 0, -35], skirt: [-6, 0, 0], head: [-5, 0, 0] }, hips: [0, 0.12, 0] },
    { t: 1.2, pose: { chest: [8, 0, 0], upperArmL: [-40, 0, 25], upperArmR: [-40, 0, -25], skirt: [6, 0, 0], head: [5, 0, 0] }, hips: [0, 0, 0] }
  ], [0, 0.9, 0], { includeRest: false });
}
