import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/math';
import { mergeParts } from '../models/parts';
import { environmentUniforms, withEnvironment } from './environmentShader';
import { FOOTPRINT, PROP_BUILDERS, brazierBase, placeProp } from './props';

/** Runs a material's onBeforeCompile against the real r186 toon shader source, like the renderer would. */
function compile(material: THREE.Material): { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> } {
  const toon = THREE.ShaderLib.toon;
  const shader = { vertexShader: toon.vertexShader, fragmentShader: toon.fragmentShader, uniforms: THREE.UniformsUtils.clone(toon.uniforms) };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

describe('withEnvironment', () => {
  it('injects wind into begin_vertex and cloud shadows before lights_fragment_end (no silent misses)', () => {
    const shader = compile(withEnvironment(new THREE.MeshToonMaterial(), { wind: true, clouds: true }));
    expect(shader.vertexShader).toContain('envGust');
    expect(shader.vertexShader).toContain('vEnvWorld = (modelMatrix * instanceMatrix');
    expect(shader.fragmentShader).toMatch(/envCloud[\s\S]*#include <lights_fragment_end>/);
  });

  it('shares the environment uniforms so one update drives every material', () => {
    const a = compile(withEnvironment(new THREE.MeshToonMaterial(), { clouds: true }));
    const b = compile(withEnvironment(new THREE.MeshToonMaterial(), { wind: true }));
    expect(a.uniforms.uEnvTime).toBe(environmentUniforms.uEnvTime);
    expect(b.uniforms.uEnvTime).toBe(environmentUniforms.uEnvTime);
  });

  it('gives each feature combination its own program cache key', () => {
    const keys = [{ wind: true }, { clouds: true }, { wind: true, clouds: true }].map((features) => withEnvironment(new THREE.MeshToonMaterial(), features).customProgramCacheKey());
    expect(new Set(keys).size).toBe(3);
  });

  it('leaves the wind out when only clouds are asked for', () => {
    expect(compile(withEnvironment(new THREE.MeshToonMaterial(), { clouds: true })).vertexShader).not.toContain('envGust');
  });
});

describe('props', () => {
  it.each(Object.keys(PROP_BUILDERS) as Array<keyof typeof PROP_BUILDERS>)('%s builds vertex-coloured parts that merge, within its footprint', (kind) => {
    const rng = createRng(3);
    const parts = placeProp(PROP_BUILDERS[kind](rng), 0, 0, 0);
    const merged = mergeParts(parts);
    expect(merged.attributes.color).toBeDefined();
    merged.computeBoundingBox();
    const box = merged.boundingBox!;
    const reach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    // Footprints are the spacing radius used by the layout; a prop may overhang it slightly, never by much.
    expect(reach).toBeLessThan(FOOTPRINT[kind] + 1.5);
    expect(box.min.y).toBeGreaterThan(-0.6);
  });

  it('brazier base merges with the other props', () => {
    expect(() => mergeParts([...brazierBase(), ...PROP_BUILDERS.rock(createRng(1))])).not.toThrow();
  });
});
