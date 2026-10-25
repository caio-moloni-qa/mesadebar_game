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

/** Samples per second of the baked curves. Three's quaternion tracks only interpolate linearly, so a clip made of a
 *  few keyed poses moves at constant speed and snaps direction at every key (robotic). The authored keys are
 *  instead joined by a smooth curve and baked densely. */
export const CLIP_SAMPLE_RATE = 30;

/** Cubic Hermite through the keys with Catmull-Rom tangents (non-uniform spacing), so motion eases through every
 *  pose. Looping clips take their end tangents from the wrapped neighbours (the seam stays smooth); one-shots
 *  start and end at rest (zero tangent: ease in and out). Assumes a loop's last key repeats its first. */
export function smoothCurve(times: number[], values: Vec3Tuple[], loop: boolean): (t: number) => Vec3Tuple {
  const count = times.length;
  const duration = times[count - 1] - times[0];
  const tangent = (i: number): Vec3Tuple => {
    if (count < 3) return [0, 0, 0];
    let previous: number;
    let next: number;
    let previousTime: number;
    let nextTime: number;
    if (i === 0 || i === count - 1) {
      if (!loop) return [0, 0, 0];
      previous = count - 2; previousTime = times[count - 2] - duration;
      next = 1; nextTime = times[1];
      if (i === count - 1) { previousTime += duration; nextTime += duration; }
    } else {
      previous = i - 1; previousTime = times[i - 1];
      next = i + 1; nextTime = times[i + 1];
    }
    const span = nextTime - previousTime;
    return [0, 1, 2].map((k) => (values[next][k] - values[previous][k]) / span) as Vec3Tuple;
  };
  const tangents = times.map((_t, i) => tangent(i));
  return (t: number) => {
    let i = 0;
    while (i < count - 2 && t > times[i + 1]) i += 1;
    const span = times[i + 1] - times[i];
    const u = span > 0 ? Math.min(1, Math.max(0, (t - times[i]) / span)) : 0;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    return [0, 1, 2].map((k) => h00 * values[i][k] + h10 * span * tangents[i][k] + h01 * values[i + 1][k] + h11 * span * tangents[i + 1][k]) as Vec3Tuple;
  };
}

/** Builds a clip from keyed poses. Every bone mentioned in any key gets a track; keys that omit it use REST/0. */
function poseClip(name: string, duration: number, keys: Key[], hipsRest: Vec3Tuple, { includeRest = true, loop = false } = {}): THREE.AnimationClip {
  const bones = new Set<string>();
  keys.forEach((key) => Object.keys(key.pose).forEach((bone) => bones.add(bone)));
  if (includeRest) Object.keys(REST).forEach((bone) => bones.add(bone));
  const keyTimes = keys.map((key) => key.t);
  const frames = Math.max(1, Math.round(duration * CLIP_SAMPLE_RATE));
  const times = Array.from({ length: frames + 1 }, (_v, frame) => (frame / frames) * duration);
  const tracks: THREE.KeyframeTrack[] = [...bones].map((bone) => {
    const curve = smoothCurve(keyTimes, keys.map((key) => key.pose[bone] ?? (includeRest ? REST[bone] : undefined) ?? [0, 0, 0]), loop);
    const values: number[] = [];
    times.forEach((t) => {
      const [x, y, z] = curve(t);
      quaternion.setFromEuler(euler.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z)));
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  });
  if (keys.some((key) => key.hips)) {
    const curve = smoothCurve(keyTimes, keys.map((key) => key.hips ?? [0, 0, 0]), loop);
    const values = times.flatMap((t) => {
      const [x, y, z] = curve(t);
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
  // A human jog: a short stride (thigh ~28° forward, ~18° back) with the feet landing under the body — the thighs
  // tuck in a few degrees, since the meshes stand with their feet apart. Hips twist and dip only slightly with the
  // stride; the chest counter-twists so the shoulders swing against the hips, and the head keeps the gaze steady.
  // Passing poses bend the trailing knee to clear the ground.
  const runA: Pose = { hips: [0, 5, 2], thighL: [-28, 0, -4], shinL: [10, 0, 0], thighR: [18, 0, 4], shinR: [40, 0, 0], upperArmL: [30, 0, 10], upperArmR: [-32, 0, -10], foreArmL: [-20, 0, 0], foreArmR: [-45, 0, 0], chest: [8, -10, -1], head: [-3, 4, 0], tail: [20, 20, 0] };
  const runB: Pose = { hips: [0, -5, -2], thighL: [18, 0, -4], shinL: [40, 0, 0], thighR: [-28, 0, 4], shinR: [10, 0, 0], upperArmL: [-32, 0, 10], upperArmR: [30, 0, -10], foreArmL: [-45, 0, 0], foreArmR: [-20, 0, 0], chest: [8, 10, 1], head: [-3, -4, 0], tail: [20, -20, 0] };
  const runMidAB: Pose = { thighL: [-4, 0, -3], shinL: [15, 0, 0], thighR: [-8, 0, 3], shinR: [55, 0, 0], foreArmL: [-32, 0, 0], foreArmR: [-32, 0, 0], chest: [10, 0, 0], head: [-4, 0, 0], tail: [25, 0, 0] };
  const runMidBA: Pose = { thighL: [-8, 0, -3], shinL: [55, 0, 0], thighR: [-4, 0, 3], shinR: [15, 0, 0], foreArmL: [-32, 0, 0], foreArmR: [-32, 0, 0], chest: [10, 0, 0], head: [-4, 0, 0], tail: [25, 0, 0] };
  return {
    // Breathing: chest rise, a slow weight shift, arms drifting, head settling a beat behind.
    idle: poseClip('idle', 2.4, [
      { t: 0, pose: { hips: [0, 0, 1], chest: [0, 0, -1], head: [0, 0, 0], tail: [10, 15, 0] }, hips: [0, 0, 0] },
      { t: 0.6, pose: { hips: [0, 0, 0], chest: [3, 0, 0], head: [-2, 3, 0], upperArmL: [0, 0, 13], upperArmR: [0, 0, -12], foreArmL: [-6, 0, 0], foreArmR: [-6, 0, 0], tail: [12, 0, 0] }, hips: [0, -0.015, 0] },
      { t: 1.2, pose: { hips: [0, 0, -1], chest: [0, 0, 1], head: [1, 0, 0], tail: [10, -15, 0] }, hips: [0, 0, 0] },
      { t: 1.8, pose: { hips: [0, 0, 0], chest: [3, 0, 0], head: [-2, -3, 0], upperArmL: [0, 0, 12], upperArmR: [0, 0, -13], foreArmL: [-6, 0, 0], foreArmR: [-6, 0, 0], tail: [12, 0, 0] }, hips: [0, -0.015, 0] },
      { t: 2.4, pose: { hips: [0, 0, 1], chest: [0, 0, -1], head: [0, 0, 0], tail: [10, 15, 0] }, hips: [0, 0, 0] }
    ], hips, { loop: true }),
    run: poseClip('run', 0.6, [
      { t: 0, pose: runA, hips: [0, -0.03, 0] },
      { t: 0.15, pose: runMidAB, hips: [0, 0.025, 0] },
      { t: 0.3, pose: runB, hips: [0, -0.03, 0] },
      { t: 0.45, pose: runMidBA, hips: [0, 0.025, 0] },
      { t: 0.6, pose: runA, hips: [0, -0.03, 0] }
    ], hips, { loop: true }),
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
  ], [0, 0.9, 0], { includeRest: false, loop: true });
}
