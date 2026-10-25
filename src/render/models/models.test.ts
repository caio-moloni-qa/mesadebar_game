import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { WEAPONS, WeaponConfig } from '../../config/weapons';
import { humanoidClips } from './clips';
import { createEnemyModels } from './enemies';
import { createHeroModel } from './heroes';
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
    expect(Object.keys(clips).sort()).toEqual(['cast', 'death', 'hit', 'idle', 'pulse', 'run', 'swing', 'throw']);
    Object.values(clips).forEach((clip) => expect(clip.validate()).toBe(true));
  });

  it('makes one-shot actions additive and keeps locomotion/death normal', () => {
    (['swing', 'cast', 'throw', 'pulse', 'hit'] as const).forEach((name) => expect(clips[name].blendMode).toBe(THREE.AdditiveAnimationBlendMode));
    (['idle', 'run', 'death'] as const).forEach((name) => expect(clips[name].blendMode).toBe(THREE.NormalAnimationBlendMode));
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
