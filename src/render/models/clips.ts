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

/** Attacks authored for the right hand; each also exists as a left-hand mirror (`swingL`, ...) for the second weapon. */
export type HandAttack = 'swing' | 'lash' | 'cast' | 'throw' | 'pulse';
export const HAND_ATTACKS: HandAttack[] = ['swing', 'lash', 'cast', 'throw', 'pulse'];
export type HeroClipName = 'idle' | 'run' | HandAttack | `${HandAttack}L` | 'hit' | 'death';

/** The full humanoid clip set. One set is shared by every mixer (threejs-animation: share clips, not copies). */
export function humanoidClips(hipHeight: number): Record<HeroClipName, THREE.AnimationClip> {
  const clips = rightHandedClips(hipHeight);
  const mirrored = Object.fromEntries(HAND_ATTACKS.map((name) => [`${name}L`, mirrorClip(clips[name], `${name}L`)]));
  return { ...clips, ...mirrored } as Record<HeroClipName, THREE.AnimationClip>;
}

/** Left/right mirror of a clip: L and R bones swap tracks, and every rotation is reflected across the body's
 *  centre plane (x → -x), i.e. the quaternion's y and z flip sign — valid for additive (delta) clips too. */
export function mirrorClip(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const swapSide = (bone: string) => bone.replace(/(L|R)$/, (side) => (side === 'L' ? 'R' : 'L'));
  const tracks = clip.tracks.map((track) => {
    const [bone, property] = track.name.split('.');
    const values = Float32Array.from(track.values);
    if (property === 'quaternion') for (let i = 0; i < values.length; i += 4) { values[i + 1] *= -1; values[i + 2] *= -1; }
    if (property === 'position') for (let i = 0; i < values.length; i += 3) values[i] *= -1;
    const TrackType = track.constructor as new (name: string, times: ArrayLike<number>, values: ArrayLike<number>) => THREE.KeyframeTrack;
    return new TrackType(`${swapSide(bone)}.${property}`, track.times, values);
  });
  return new THREE.AnimationClip(name, clip.duration, tracks, clip.blendMode);
}

function rightHandedClips(hipHeight: number): Record<'idle' | 'run' | HandAttack | 'hit' | 'death', THREE.AnimationClip> {
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
    // Whip: an overhead crack — the arm winds up high behind the head, then snaps forward and down with the wrist
    // flicking through, the chest leaning into it.
    lash: additiveClip('lash', 0.42, [
      { t: 0, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0] } },
      { t: 0.11, pose: { upperArmR: [-155, 0, 12], foreArmR: [-70, 0, 0], handR: [-20, 0, 0], chest: [-10, -15, 0] } },
      { t: 0.19, pose: { upperArmR: [-55, 0, 6], foreArmR: [-5, 0, 0], handR: [35, 0, 0], chest: [14, 10, 0] } },
      { t: 0.26, pose: { upperArmR: [-40, 0, 4], foreArmR: [0, 0, 0], handR: [10, 0, 0], chest: [10, 8, 0] } },
      { t: 0.42, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0] } }
    ], hips),
    // Staff: raise the arm and turn the wrist over so the staff lies forward with its crystal on the target (the
    // staff stands upright in the hand, so lifting the arm alone would swing the crystal behind the hero), then a
    // short thrust as the bolt leaves.
    cast: additiveClip('cast', 0.42, [
      { t: 0, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0] } },
      { t: 0.08, pose: { upperArmR: [-72, 0, 10], foreArmR: [-20, 0, 0], handR: [148, 0, 0], chest: [-4, 0, 0] } },
      { t: 0.13, pose: { upperArmR: [-84, 0, 10], foreArmR: [-2, 0, 0], handR: [152, 0, 0], chest: [6, 0, 0] } },
      { t: 0.26, pose: { upperArmR: [-80, 0, 10], foreArmR: [-6, 0, 0], handR: [150, 0, 0], chest: [3, 0, 0] } },
      { t: 0.42, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0] } }
    ], hips),
    // Boomerang: a sidearm throw — the arm swings out level and back with the chest wound up, then whips forward
    // across the body and follows through.
    throw: additiveClip('throw', 0.48, [
      { t: 0, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0] } },
      { t: 0.12, pose: { upperArmR: [0, -45, -78], foreArmR: [-35, 0, 0], handR: [0, 0, 0], chest: [0, -30, 0] } },
      { t: 0.2, pose: { upperArmR: [0, 65, -75], foreArmR: [-10, 0, 0], handR: [0, 25, 0], chest: [0, 25, 0] } },
      { t: 0.3, pose: { upperArmR: [0, 95, -55], foreArmR: [-15, 0, 0], handR: [0, 10, 0], chest: [0, 30, 0] } },
      { t: 0.48, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0] } }
    ], hips),
    // Relíquia Divina tick: the right hand comes up and grips the relic on the chest, the body leans into it and the
    // head dips, then lets go — channelling rather than flailing (it fires every aura tick, so it stays small).
    pulse: additiveClip('pulse', 0.55, [
      { t: 0, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] } },
      { t: 0.12, pose: { upperArmR: [-40, 0, 28], foreArmR: [-95, 0, 0], handR: [0, 0, 0], chest: [6, 0, 0], head: [6, 0, 0] } },
      { t: 0.32, pose: { upperArmR: [-42, 0, 30], foreArmR: [-100, 0, 0], handR: [15, 0, 0], chest: [9, -6, 0], head: [9, 0, 0] } },
      { t: 0.55, pose: { upperArmR: [0, 0, 0], foreArmR: [0, 0, 0], handR: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] } }
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

export type BossClipName = 'idle' | 'walk' | 'summon' | 'channel' | 'point' | 'windup' | 'spin' | 'spinBack' | 'kneel' | 'roar' | 'crouch' | 'leap' | 'death';

/** The boss's own clip set: heavier, slower and more theatrical than the heroes' — a stomping walk, arms flung up to
 *  summon, a floating channel, a pointing beam stance, a sword wind-up and full-body spins for the sweep, a one-knee
 *  stagger, the phase-2 roar, a crouch-and-leap lunge, and a collapse. Bones: the humanoid set plus `cape` and `jaw`. */
export function bossClips(hipHeight: number): Record<BossClipName, THREE.AnimationClip> {
  const hips: Vec3Tuple = [0, hipHeight, 0];
  const loop = { loop: true };
  const stepA: Pose = { thighL: [-26, 0, -3], shinL: [8, 0, 0], thighR: [18, 0, 3], shinR: [34, 0, 0], upperArmL: [18, 0, 14], upperArmR: [-18, 0, -14], chest: [8, -6, 0], cape: [20, 0, 4], head: [4, 4, 0] };
  const stepB: Pose = { thighL: [18, 0, -3], shinL: [34, 0, 0], thighR: [-26, 0, 3], shinR: [8, 0, 0], upperArmL: [-18, 0, 14], upperArmR: [18, 0, -14], chest: [8, 6, 0], cape: [20, 0, -4], head: [4, -4, 0] };
  const pass: Pose = { thighL: [-4, 0, -3], shinL: [30, 0, 0], thighR: [-4, 0, 3], shinR: [30, 0, 0], chest: [9, 0, 0], cape: [26, 0, 0], head: [5, 0, 0] };
  const armsUp: Pose = { upperArmL: [-10, 0, 150], upperArmR: [-10, 0, -150], foreArmL: [-15, 0, 0], foreArmR: [-15, 0, 0], chest: [-15, 0, 0], head: [-22, 0, 0], jaw: [22, 0, 0], cape: [30, 0, 0] };
  const kneel: Pose = {
    hips: [12, 0, 0], thighL: [-95, 0, -6], shinL: [92, 0, 0], footL: [-8, 0, 0], thighR: [8, 0, 6], shinR: [105, 0, 0], footR: [40, 0, 0],
    chest: [26, 0, 0], head: [24, 0, 0], jaw: [10, 0, 0], upperArmR: [12, 0, -14], foreArmR: [-10, 0, 0], upperArmL: [-45, 0, 22], foreArmL: [-55, 0, 0], cape: [8, 0, 0]
  };
  const crouch: Pose = { thighL: [-55, 0, -6], shinL: [90, 0, 0], thighR: [-55, 0, 6], shinR: [90, 0, 0], chest: [34, 0, 0], head: [-18, 0, 0], upperArmL: [45, 0, 22], upperArmR: [45, 0, -22], cape: [12, 0, 0] };
  const channelA: Pose = { upperArmL: [-160, 0, 25], upperArmR: [-160, 0, -25], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], chest: [-12, 0, 0], head: [-16, 0, 0], jaw: [10, 0, 0], cape: [30, 0, 0], thighL: [-10, 0, 0], thighR: [6, 0, 0], shinL: [20, 0, 0], shinR: [26, 0, 0] };
  const channelB: Pose = { upperArmL: [-165, 0, 32], upperArmR: [-165, 0, -32], foreArmL: [-28, 0, 0], foreArmR: [-28, 0, 0], chest: [-16, 0, 0], head: [-20, 0, 0], jaw: [16, 0, 0], cape: [42, 0, 0], thighL: [-6, 0, 0], thighR: [10, 0, 0], shinL: [26, 0, 0], shinR: [20, 0, 0] };
  const pointA: Pose = { upperArmR: [-88, 0, -4], foreArmR: [0, 0, 0], handR: [-10, 0, 0], upperArmL: [24, 0, 32], foreArmL: [-30, 0, 0], chest: [6, -22, 0], head: [0, -12, 0], jaw: [12, 0, 0], thighL: [-14, 0, 0], thighR: [12, 0, 0], shinR: [14, 0, 0], cape: [18, 0, 0] };
  const pointB: Pose = { ...pointA, upperArmR: [-92, 0, -4], foreArmR: [-4, 0, 0], handR: [-14, 0, 0], upperArmL: [28, 0, 36], chest: [8, -24, 0], jaw: [16, 0, 0], cape: [24, 0, 0] };
  const windA: Pose = { upperArmR: [-165, 0, -12], foreArmR: [-10, 0, 0], upperArmL: [-35, 0, 45], foreArmL: [-40, 0, 0], chest: [-8, 30, 0], head: [-6, -10, 0], thighL: [-18, 0, -6], shinL: [32, 0, 0], thighR: [-18, 0, 6], shinR: [32, 0, 0], cape: [16, 0, 0], jaw: [8, 0, 0] };
  const windB: Pose = { ...windA, upperArmR: [-170, 0, -14], chest: [-10, 34, 0], jaw: [12, 0, 0], cape: [20, 0, 0] };
  const spinKeys = (direction: number) => [0, 1, 2, 3].map((step) => ({
    t: (0.32 * step) / 3,
    pose: { hips: [0, direction * 120 * step, 0] as Vec3Tuple, upperArmL: [0, 0, 85] as Vec3Tuple, upperArmR: [0, 0, -85] as Vec3Tuple, chest: [6, 0, 0] as Vec3Tuple, cape: [55, 0, 0] as Vec3Tuple },
    hips: [0, -0.06, 0] as Vec3Tuple
  }));
  return {
    idle: poseClip('idle', 2.6, [
      { t: 0, pose: { chest: [4, 0, 0], head: [5, 3, 0], cape: [10, 0, 2], upperArmL: [0, 0, 12], upperArmR: [0, 0, -12], jaw: [0, 0, 0] }, hips: [0, 0, 0] },
      { t: 1.3, pose: { chest: [8, 0, 0], head: [8, -3, 0], cape: [16, 0, -2], upperArmL: [0, 0, 16], upperArmR: [0, 0, -16], jaw: [6, 0, 0] }, hips: [0, -0.03, 0] },
      { t: 2.6, pose: { chest: [4, 0, 0], head: [5, 3, 0], cape: [10, 0, 2], upperArmL: [0, 0, 12], upperArmR: [0, 0, -12], jaw: [0, 0, 0] }, hips: [0, 0, 0] }
    ], hips, loop),
    walk: poseClip('walk', 1.4, [
      { t: 0, pose: stepA, hips: [0, -0.04, 0] },
      { t: 0.35, pose: pass, hips: [0, 0.02, 0] },
      { t: 0.7, pose: stepB, hips: [0, -0.04, 0] },
      { t: 1.05, pose: pass, hips: [0, 0.02, 0] },
      { t: 1.4, pose: stepA, hips: [0, -0.04, 0] }
    ], hips, loop),
    summon: poseClip('summon', 1.1, [
      { t: 0, pose: {}, hips: [0, 0, 0] },
      { t: 0.25, pose: armsUp, hips: [0, 0.05, 0] },
      { t: 0.75, pose: { ...armsUp, chest: [-18, 0, 0], jaw: [28, 0, 0] }, hips: [0, 0.05, 0] },
      { t: 1.1, pose: {}, hips: [0, 0, 0] }
    ], hips),
    // Hovers a little, arms raised to the sky, cape lifting.
    channel: poseClip('channel', 1.6, [
      { t: 0, pose: channelA, hips: [0, 0.18, 0] },
      { t: 0.8, pose: channelB, hips: [0, 0.28, 0] },
      { t: 1.6, pose: channelA, hips: [0, 0.18, 0] }
    ], hips, loop),
    // Right arm thrust at the target, body turned behind it, the off hand drawn back.
    point: poseClip('point', 1.2, [
      { t: 0, pose: pointA, hips: [0, -0.03, 0] },
      { t: 0.6, pose: pointB, hips: [0, -0.05, 0] },
      { t: 1.2, pose: pointA, hips: [0, -0.03, 0] }
    ], hips, loop),
    // Sword summon: the right arm raised high calling the blade, knees bent, coiled to spin.
    windup: poseClip('windup', 1.0, [
      { t: 0, pose: windA, hips: [0, -0.1, 0] },
      { t: 0.5, pose: windB, hips: [0, -0.12, 0] },
      { t: 1.0, pose: windA, hips: [0, -0.1, 0] }
    ], hips, loop),
    // One full turn with the arms flung out, in step with the sword's orbit (and back again in phase 2).
    spin: poseClip('spin', 0.32, spinKeys(1), hips),
    spinBack: poseClip('spinBack', 0.32, spinKeys(-1), hips),
    // Stagger: down on one knee, head hanging, one hand braced on the knee, breathing hard.
    kneel: poseClip('kneel', 1.0, [
      { t: 0, pose: kneel, hips: [0, -0.4, 0] },
      { t: 0.5, pose: { ...kneel, chest: [32, 0, 0], head: [30, 0, 0], jaw: [16, 0, 0] }, hips: [0, -0.42, 0] },
      { t: 1.0, pose: kneel, hips: [0, -0.4, 0] }
    ], hips, loop),
    // Phase 2: gathers itself, then rears up with the jaw thrown open and the arms flung wide.
    roar: poseClip('roar', 1.6, [
      { t: 0, pose: {}, hips: [0, 0, 0] },
      { t: 0.35, pose: { chest: [28, 0, 0], head: [22, 0, 0], upperArmL: [10, 0, 22], upperArmR: [10, 0, -22], thighL: [-28, 0, 0], thighR: [-28, 0, 0], shinL: [48, 0, 0], shinR: [48, 0, 0], cape: [8, 0, 0] }, hips: [0, -0.16, 0] },
      { t: 0.6, pose: { chest: [-30, 0, 0], head: [-38, 0, 0], jaw: [38, 0, 0], upperArmL: [-30, 0, 85], upperArmR: [-30, 0, -85], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], cape: [60, 0, 0] }, hips: [0, 0.06, 0] },
      { t: 1.25, pose: { chest: [-26, 0, 0], head: [-34, 0, 0], jaw: [34, 0, 0], upperArmL: [-26, 0, 80], upperArmR: [-26, 0, -80], foreArmL: [-24, 0, 0], foreArmR: [-24, 0, 0], cape: [48, 0, 0] }, hips: [0, 0.04, 0] },
      { t: 1.6, pose: {}, hips: [0, 0, 0] }
    ], hips),
    crouch: poseClip('crouch', 0.6, [
      { t: 0, pose: crouch, hips: [0, -0.3, 0] },
      { t: 0.3, pose: { ...crouch, chest: [38, 0, 0] }, hips: [0, -0.33, 0] },
      { t: 0.6, pose: crouch, hips: [0, -0.3, 0] }
    ], hips, loop),
    leap: poseClip('leap', 0.5, [
      { t: 0, pose: { chest: [42, 0, 0], head: [-26, 0, 0], thighL: [-62, 0, 0], shinL: [40, 0, 0], thighR: [38, 0, 0], shinR: [60, 0, 0], upperArmL: [62, 0, 30], upperArmR: [62, 0, -30], cape: [75, 0, 0] }, hips: [0, 0.25, 0] },
      { t: 0.5, pose: { chest: [44, 0, 0], head: [-28, 0, 0], thighL: [-58, 0, 0], shinL: [44, 0, 0], thighR: [34, 0, 0], shinR: [64, 0, 0], upperArmL: [66, 0, 34], upperArmR: [66, 0, -34], cape: [80, 0, 0] }, hips: [0, 0.25, 0] }
    ], hips, loop),
    // Collapses to its knees, then topples forward; held on the last frame.
    death: poseClip('death', 1.6, [
      { t: 0, pose: {}, hips: [0, 0, 0] },
      { t: 0.5, pose: kneel, hips: [0, -0.4, 0] },
      { t: 1.0, pose: { ...kneel, chest: [40, 0, 0], head: [40, 0, 0], upperArmL: [-10, 0, 30], upperArmR: [-10, 0, -30] }, hips: [0, -0.45, 0] },
      { t: 1.6, pose: { ...kneel, hips: [78, 0, 0], chest: [20, 0, 0], head: [20, 0, 0], upperArmL: [-150, 0, 30], upperArmR: [-150, 0, -30], jaw: [30, 0, 0] }, hips: [0, -hipHeight + 0.28, 0] }
    ], hips)
  };
}

export type ActorClipName = 'idle' | 'walk' | 'death' | 'channel' | 'raise' | 'slamWindup' | 'slamHit' | 'dig' | 'emerge' | 'chargeWindup' | 'charge' | 'stagger' | 'shockWindup' | 'shockSlam' | 'shoot';

/** Clips for the zone mini-bosses and companions. The heavy walk, idle, collapse, raised-arms summon, crouch, leap and
 *  kneel come from the boss set (tracks for bones a rig lacks are filtered by clipForBones); the rest are new: a
 *  shovel (or two-handed) wind-up and slam, digging down, bursting out of the ground, a two-fist overhead slam, and a
 *  bow draw-and-release. */
export function actorClips(hipHeight: number): Record<ActorClipName, THREE.AnimationClip> {
  const boss = bossClips(hipHeight);
  const hips: Vec3Tuple = [0, hipHeight, 0];
  const loop = { loop: true };
  const overhead: Pose = { upperArmR: [-170, 0, -10], upperArmL: [-165, 0, 10], foreArmR: [-30, 0, 0], foreArmL: [-30, 0, 0], chest: [-14, 0, 0], head: [-10, 0, 0], thighL: [-12, 0, 0], thighR: [-12, 0, 0], shinL: [20, 0, 0], shinR: [20, 0, 0] };
  const slammed: Pose = { upperArmR: [-40, 0, -5], upperArmL: [-40, 0, 5], foreArmR: [-10, 0, 0], foreArmL: [-10, 0, 0], chest: [38, 0, 0], head: [22, 0, 0], thighL: [-32, 0, 0], thighR: [-32, 0, 0], shinL: [55, 0, 0], shinR: [55, 0, 0] };
  const digA: Pose = { chest: [42, 0, 0], head: [25, 0, 0], upperArmR: [-70, 0, -10], upperArmL: [-50, 0, 10], foreArmR: [-30, 0, 0], foreArmL: [-40, 0, 0], thighL: [-45, 0, 0], thighR: [-45, 0, 0], shinL: [80, 0, 0], shinR: [80, 0, 0] };
  const digB: Pose = { ...digA, upperArmR: [-25, 0, -10], upperArmL: [-15, 0, 10], chest: [48, 0, 0] };
  const fists: Pose = { upperArmR: [-175, 0, -15], upperArmL: [-175, 0, 15], foreArmR: [-15, 0, 0], foreArmL: [-15, 0, 0], chest: [-16, 0, 0], head: [-12, 0, 0] };
  const pounded: Pose = { upperArmR: [-60, 0, -10], upperArmL: [-60, 0, 10], foreArmR: [-10, 0, 0], foreArmL: [-10, 0, 0], chest: [46, 0, 0], head: [24, 0, 0], thighL: [-45, 0, 0], thighR: [-45, 0, 0], shinL: [70, 0, 0], shinR: [70, 0, 0] };
  const drawn: Pose = { upperArmL: [-90, 0, 0], foreArmL: [0, 0, 0], upperArmR: [-88, 0, -28], foreArmR: [-115, 0, 0], chest: [0, -32, 0], head: [0, 28, 0] };
  return {
    idle: boss.idle,
    walk: boss.walk,
    death: boss.death,
    channel: boss.channel,
    raise: boss.summon,
    chargeWindup: boss.crouch,
    charge: boss.leap,
    stagger: boss.kneel,
    slamWindup: poseClip('slamWindup', 0.8, [
      { t: 0, pose: overhead, hips: [0, -0.05, 0] },
      { t: 0.4, pose: { ...overhead, chest: [-18, 0, 0] }, hips: [0, -0.07, 0] },
      { t: 0.8, pose: overhead, hips: [0, -0.05, 0] }
    ], hips, loop),
    slamHit: poseClip('slamHit', 0.45, [
      { t: 0, pose: overhead, hips: [0, -0.05, 0] },
      { t: 0.1, pose: slammed, hips: [0, -0.2, 0] },
      { t: 0.45, pose: slammed, hips: [0, -0.2, 0] }
    ], hips),
    dig: poseClip('dig', 0.5, [
      { t: 0, pose: digA, hips: [0, -0.28, 0] },
      { t: 0.25, pose: digB, hips: [0, -0.32, 0] },
      { t: 0.5, pose: digA, hips: [0, -0.28, 0] }
    ], hips, loop),
    // Bursts up out of the ground, arms flung wide.
    emerge: poseClip('emerge', 0.55, [
      { t: 0, pose: digA, hips: [0, -0.5, 0] },
      { t: 0.18, pose: { upperArmL: [-20, 0, 120], upperArmR: [-20, 0, -120], chest: [-20, 0, 0], head: [-18, 0, 0] }, hips: [0, 0.1, 0] },
      { t: 0.55, pose: {}, hips: [0, 0, 0] }
    ], hips),
    shockWindup: poseClip('shockWindup', 0.8, [
      { t: 0, pose: fists, hips: [0, 0.04, 0] },
      { t: 0.4, pose: { ...fists, chest: [-20, 0, 0] }, hips: [0, 0.08, 0] },
      { t: 0.8, pose: fists, hips: [0, 0.04, 0] }
    ], hips, loop),
    shockSlam: poseClip('shockSlam', 0.5, [
      { t: 0, pose: fists, hips: [0, 0.04, 0] },
      { t: 0.12, pose: pounded, hips: [0, -0.28, 0] },
      { t: 0.5, pose: pounded, hips: [0, -0.26, 0] }
    ], hips),
    // Bow in the left hand: draw to the cheek, loose, recover.
    shoot: poseClip('shoot', 0.5, [
      { t: 0, pose: { ...drawn, foreArmR: [-60, 0, 0] } },
      { t: 0.18, pose: drawn },
      { t: 0.26, pose: { ...drawn, upperArmR: [-80, 0, -50], foreArmR: [-40, 0, 0] } },
      { t: 0.5, pose: {} }
    ], hips)
  };
}
