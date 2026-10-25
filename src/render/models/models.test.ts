import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WEAPONS, WeaponConfig } from '../../config/weapons';
import { CLIP_SAMPLE_RATE, humanoidClips, mirrorClip, smoothCurve } from './clips';
import { createEnemyModels } from './enemies';
import { attachWeapons, createHeroModel } from './heroes';
import { box, part } from './parts';
import { buildRiggedModel, humanoidBones } from './rig';
import { weaponGeometry } from './weapons';

describe('buildRiggedModel', () => {
  it('binds every vertex of a part rigidly to its bone', () => {
    const model = buildRiggedModel(humanoidBones(), [
      { bone: 'head', geometry: part(box(0.2, 0.2, 0.2), 0xffffff) },
      { bone: 'footL', geometry: part(box(0.2, 0.1, 0.3), 0xffffff) }
    ], new THREE.MeshBasicMaterial());
    const geometry = model.mesh.geometry;
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    const headIndex = model.mesh.skeleton.bones.findIndex((bone) => bone.name === 'head');
    const footIndex = model.mesh.skeleton.bones.findIndex((bone) => bone.name === 'footL');
    const half = skinIndex.count / 2;
    for (let vertex = 0; vertex < skinIndex.count; vertex += 1) {
      expect(skinIndex.getX(vertex)).toBe(vertex < half ? headIndex : footIndex);
      expect(skinWeight.getX(vertex)).toBe(1);
    }
    // Parts are placed at their bone in rest pose: the head box sits up high, the foot box on the ground.
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeGreaterThan(1.5);
    expect(geometry.boundingBox!.min.y).toBeLessThan(0.1);
  });

  it('rejects parts bound to bones the rig does not have', () => {
    expect(() => buildRiggedModel(humanoidBones(), [{ bone: 'wing', geometry: part(box(1, 1, 1), 0) }], new THREE.MeshBasicMaterial())).toThrow(/wing/);
  });
});

describe('humanoid clips', () => {
  const clips = humanoidClips(0.82);

  it('has every clip the hero view plays, with valid tracks', () => {
    expect(Object.keys(clips).sort()).toEqual(['cast', 'castL', 'death', 'hit', 'idle', 'lash', 'lashL', 'pulse', 'pulseL', 'run', 'swing', 'swingL', 'throw', 'throwL']);
    Object.values(clips).forEach((clip) => expect(clip.validate()).toBe(true));
  });

  it('makes one-shot actions additive and keeps locomotion/death normal', () => {
    (['swing', 'swingL', 'lash', 'lashL', 'cast', 'castL', 'throw', 'throwL', 'pulse', 'pulseL', 'hit'] as const).forEach((name) => expect(clips[name].blendMode).toBe(THREE.AdditiveAnimationBlendMode));
    (['idle', 'run', 'death'] as const).forEach((name) => expect(clips[name].blendMode).toBe(THREE.NormalAnimationBlendMode));
  });
});

describe('smoothCurve', () => {
  const times = [0, 0.2, 0.5, 0.6];
  const values: [number, number, number][] = [[0, 0, 0], [10, -5, 2], [-20, 4, 0], [0, 0, 0]];
  const slope = (curve: (t: number) => number[], t: number) => (curve(t + 1e-4)[0] - curve(t - 1e-4)[0]) / 2e-4;

  it('passes through every key', () => {
    const curve = smoothCurve(times, values, false);
    times.forEach((t, i) => curve(t).forEach((v, k) => expect(v).toBeCloseTo(values[i][k], 6)));
  });

  it('eases a one-shot in and out, and keeps a loop seam smooth', () => {
    const once = smoothCurve(times, values, false);
    expect(Math.abs(slope(once, 1e-4))).toBeLessThan(5);
    expect(Math.abs(slope(once, 0.6 - 1e-4))).toBeLessThan(5);
    const loop = smoothCurve(times, values, true);
    expect(Math.abs(slope(loop, 1e-4) - slope(loop, 0.6 - 1e-4))).toBeLessThan(2);
    expect(Math.abs(slope(loop, 1e-4))).toBeGreaterThan(50);
  });

  it('bakes clips densely enough that linear quaternion steps read as curves', () => {
    const run = humanoidClips(0.82).run;
    run.tracks.forEach((track) => expect(track.times.length).toBe(Math.round(run.duration * CLIP_SAMPLE_RATE) + 1));
  });
});

describe('hero models', () => {
  const heroes = Object.keys(CHARACTERS) as CharacterId[];

  it.each(heroes)('%s builds with its preferred weapon and only clip tracks for bones it has', (id) => {
    const weaponId = CHARACTERS[id].preferredWeaponId ?? 'staff';
    const model = createHeroModel(id, weaponId);
    const boneNames = new Set(Object.keys(model.bones));
    Object.values(model.clips).forEach((clip) => clip.tracks.forEach((track) => expect(boneNames.has(track.name.split('.')[0])).toBe(true)));
    expect(boneNames.has('tail')).toBe(id === 'fabri');
    expect(model.mesh.geometry.attributes.position.count).toBeGreaterThan(100);
  });

  it('attaches every weapon (hand, or chest for the amulet)', () => {
    (Object.keys(WEAPONS) as WeaponConfig['id'][]).forEach((weaponId) => {
      const model = createHeroModel('barbarian', weaponId);
      const holder = weaponId === 'amulet' ? model.bones.chest : model.bones.handR;
      expect(holder.children.some((child) => child instanceof THREE.Mesh)).toBe(true);
    });
  });
});

describe('two weapons', () => {
  it('mirrors an attack onto the left hand: L/R tracks swap and rotations reflect', () => {
    const clips = humanoidClips(0.82);
    const right = clips.throw.tracks.find((track) => track.name === 'upperArmR.quaternion')!;
    const left = clips.throwL.tracks.find((track) => track.name === 'upperArmL.quaternion')!;
    expect(clips.throwL.tracks.some((track) => track.name.startsWith('upperArmR'))).toBe(false);
    for (let i = 0; i < right.values.length; i += 4) {
      expect(left.values[i]).toBeCloseTo(right.values[i]);
      expect(left.values[i + 1]).toBeCloseTo(-right.values[i + 1]);
      expect(left.values[i + 2]).toBeCloseTo(-right.values[i + 2]);
      expect(left.values[i + 3]).toBeCloseTo(right.values[i + 3]);
    }
    expect(mirrorClip(clips.throwL, 'back').tracks.find((track) => track.name === 'upperArmR.quaternion')!.values).toEqual(right.values);
  });

  it('holds the first weapon in the right hand, the second in the left, and wears the amulet on the chest', () => {
    const model = createHeroModel('fabri', 'boomerang');
    attachWeapons(model, ['boomerang', 'staff']);
    expect(model.held).toHaveLength(2);
    expect(model.held[0].parent).toBe(model.bones.handR);
    expect(model.held[1].parent).toBe(model.bones.handL);
    attachWeapons(model, ['sword', 'amulet']);
    expect(model.bones.handL.children.filter((child) => child instanceof THREE.Mesh)).toHaveLength(0);
    expect(model.held[1].parent).toBe(model.bones.chest);
  });
});

describe('weapon geometry', () => {
  it.each(['staff', 'sword', 'whip', 'boomerang', 'amulet', 'banana'] as const)('%s has vertex colours and no uv', (id) => {
    const geometry = weaponGeometry(id);
    expect(geometry.attributes.color).toBeDefined();
    expect(geometry.attributes.uv).toBeUndefined();
  });
});

describe('baked enemy models', () => {
  const models = createEnemyModels();

  it.each(['skeleton', 'superSkeleton', 'necromancerWraith', 'apparitionWraith'] as const)('%s has a full cycle of absolute morph frames that actually move', (variant) => {
    const { geometry, frames } = models[variant];
    expect(geometry.morphAttributes.position).toHaveLength(frames);
    expect(geometry.morphAttributes.normal).toHaveLength(frames);
    expect(geometry.morphTargetsRelative).toBe(false);
    const morphs = geometry.morphAttributes.position!;
    const first = morphs[0].array as Float32Array;
    const middle = morphs[frames / 2].array as Float32Array;
    let maxDelta = 0;
    for (let index = 0; index < first.length; index += 1) maxDelta = Math.max(maxDelta, Math.abs(first[index] - middle[index]));
    expect(maxDelta).toBeGreaterThan(0.05);
  });
});
