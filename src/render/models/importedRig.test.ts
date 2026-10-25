/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createHeroModel } from './heroes';
import { registerHeroMesh, unregisterHeroMesh } from './heroMeshes';
import { BARBARIAN_JOINTS, FABRI_HIP_HEIGHT, FABRI_JOINTS, JointSpec, MAGE_JOINTS, RELIQUIA_JOINTS, rigImportedMesh } from './importedRig';
import barbarianGlb from '../../assets/3d/characters/barbarian.glb?inline';
import fabriGlb from '../../assets/3d/characters/fabri.glb?inline';
import mageGlb from '../../assets/3d/characters/mage.glb?inline';
import reliquiaGlb from '../../assets/3d/characters/reliquia.glb?inline';
import { box, mergeParts, part } from './parts';

/** A blocky stand-in for the Tripo mesh at Fabri's proportions: torso, head, A-pose arms, legs (limbs subdivided
 *  along their length so there are vertices at every joint). */
function syntheticFigure(): THREE.BufferGeometry {
  const limb = (width: number, length: number) => new THREE.BoxGeometry(width, length, width, 1, 8, 1);
  return mergeParts([
    part(box(0.5, 0.7, 0.3), 0xffffff, [0, 1.1, 0]),
    part(box(0.34, 0.4, 0.34), 0xffffff, [0, 1.68, 0]),
    part(limb(0.1, 0.6), 0xffffff, [0.38, 1.08, 0], [0, 0, 0.4]),
    part(limb(0.1, 0.6), 0xffffff, [-0.38, 1.08, 0], [0, 0, -0.4]),
    part(limb(0.16, 0.72), 0xffffff, [0.19, 0.38, 0]),
    part(limb(0.16, 0.72), 0xffffff, [-0.19, 0.38, 0])
  ]);
}

/** Bone the vertex nearest `point` follows most. */
function dominantBone(mesh: THREE.SkinnedMesh, point: THREE.Vector3): string {
  const position = mesh.geometry.attributes.position;
  let best = 0;
  let bestDistance = Infinity;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const distance = vertex.fromBufferAttribute(position, i).distanceToSquared(point);
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  const index = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  let slot = 0;
  for (let k = 1; k < 4; k += 1) if (weight.getComponent(best, k) > weight.getComponent(best, slot)) slot = k;
  return mesh.skeleton.bones[index.getComponent(best, slot)].name;
}

describe('rigImportedMesh', () => {
  const model = rigImportedMesh(syntheticFigure(), FABRI_JOINTS, new THREE.MeshBasicMaterial());

  it('normalises the weights of every vertex', () => {
    const weight = model.mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < weight.count; i += 1) {
      const total = [0, 1, 2, 3].reduce((sum, k) => sum + weight.getComponent(i, k), 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('skins each body region to its own bone and side', () => {
    const cases: [THREE.Vector3, string][] = [
      [new THREE.Vector3(0, 1.85, 0), 'head'],
      [new THREE.Vector3(0.48, 0.82, 0), 'handL'],
      [new THREE.Vector3(-0.48, 0.82, 0), 'handR'],
      [new THREE.Vector3(0.19, 0.5, 0), 'thighL'],
      [new THREE.Vector3(-0.19, 0.28, 0), 'shinR'],
      [new THREE.Vector3(0.25, 1.45, 0.15), 'chest']
    ];
    cases.forEach(([point, bone]) => expect(dominantBone(model.mesh, point)).toBe(bone));
  });

  it('reproduces the mesh in its bind pose, and bending a leg moves the leg but not the head', () => {
    const position = model.mesh.geometry.attributes.position;
    const footIndex = Array.from({ length: position.count }, (_v, i) => i).find((i) => position.getY(i) < 0.05 && position.getX(i) > 0)!;
    const headIndex = Array.from({ length: position.count }, (_v, i) => i).find((i) => position.getY(i) > 1.8)!;
    const skinned = (i: number) => model.mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i));
    model.root.updateMatrixWorld(true);
    expect(skinned(footIndex).distanceTo(new THREE.Vector3().fromBufferAttribute(position, footIndex))).toBeLessThan(1e-5);

    model.bones.thighL.rotation.x = -1;
    model.root.updateMatrixWorld(true);
    expect(skinned(footIndex).z).toBeGreaterThan(0.2);
    expect(skinned(headIndex).distanceTo(new THREE.Vector3().fromBufferAttribute(position, headIndex))).toBeLessThan(1e-5);
    model.bones.thighL.rotation.x = 0;
  });
});

describe('imported hero model', () => {
  afterEach(() => unregisterHeroMesh('fabri'));

  it('uses the registered mesh for Fabri, with the procedural tail and clips at its hip height', () => {
    registerHeroMesh('fabri', syntheticFigure());
    const model = createHeroModel('fabri', 'boomerang');
    expect(model.mesh.geometry.attributes.normal).toBeDefined();
    expect(model.bones.tail.children.some((child) => child instanceof THREE.Mesh)).toBe(true);
    expect(model.bones.handR.children.some((child) => child instanceof THREE.Mesh)).toBe(true);
    const hips = model.clips.idle.tracks.find((track) => track.name === 'hips.position')!;
    expect(hips.values[1]).toBeCloseTo(FABRI_HIP_HEIGHT);
  });

  it('falls back to the procedural model when no mesh is loaded', () => {
    const model = createHeroModel('fabri', 'boomerang');
    expect(model.bones.tail).toBeDefined();
    expect(model.clips.idle.tracks.find((track) => track.name === 'hips.position')!.values[1]).toBeCloseTo(0.82);
  });

  // [file, joints, hand x, hand y]: a hand point and a foot point that must follow the limbs, the crown the head.
  it.each([
    ['fabri.glb', fabriGlb, FABRI_JOINTS, 0.48, 0.76],
    ['barbarian.glb', barbarianGlb, BARBARIAN_JOINTS, 0.54, 0.84],
    ['mage.glb', mageGlb, MAGE_JOINTS, 0.55, 0.8],
    ['reliquia.glb', reliquiaGlb, RELIQUIA_JOINTS, 0.55, 0.82]
  ] as [string, string, JointSpec[], number, number][])('rigs the shipped %s: hands follow the arms and feet the legs', async (_name, url, joints, handX, handY) => {
    const file = await (await fetch(url)).arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(file, '');
    let geometry: THREE.BufferGeometry | undefined;
    gltf.scene.traverse((object) => { if (!geometry && object instanceof THREE.Mesh) geometry = object.geometry; });
    const model = rigImportedMesh(geometry!, joints, new THREE.MeshBasicMaterial());
    expect(['handL', 'foreArmL']).toContain(dominantBone(model.mesh, new THREE.Vector3(handX, handY, 0)));
    expect(['handR', 'foreArmR']).toContain(dominantBone(model.mesh, new THREE.Vector3(-handX, handY, 0)));
    expect(['footL', 'shinL']).toContain(dominantBone(model.mesh, new THREE.Vector3(0.28, 0.03, 0.1)));
    expect(dominantBone(model.mesh, new THREE.Vector3(0, 1.9, 0))).toBe('head');
  });
});
