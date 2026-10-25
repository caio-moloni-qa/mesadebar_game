import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeParts } from '../models/parts';
import { environmentUniforms, withEnvironment } from './environmentShader';
import { ArenaMap, Obstacle } from '../../core/world/ArenaMap';
import { WORLD_SCALE } from '../space';
import { decorParts, obstacleParts } from './props';

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

  it('declares and wires every uniform the injected code uses (GLSL lives in strings, so tsc cannot catch this)', () => {
    const shader = compile(withEnvironment(new THREE.MeshToonMaterial(), { wind: true, clouds: true, occlusion: true }));
    const source = shader.vertexShader + shader.fragmentShader;
    ['uEnvTime', 'uCloudOffset', 'uFocus', 'uViewDirection'].forEach((name) => {
      if (!source.includes(name)) return;
      expect(shader.fragmentShader, `${name} declared`).toContain(`uniform`);
      expect(shader.fragmentShader).toMatch(new RegExp(`uniform \\w+ ${name};`));
      expect(shader.uniforms[name], `${name} wired`).toBe(environmentUniforms[name as keyof typeof environmentUniforms]);
    });
    expect(shader.fragmentShader).toMatch(/#include <clipping_planes_fragment>[\s\S]*discard/);
  });

  it('leaves the wind out when only clouds are asked for', () => {
    expect(compile(withEnvironment(new THREE.MeshToonMaterial(), { clouds: true })).vertexShader).not.toContain('envGust');
  });
});

describe('obstacle visuals match their collision', () => {
  const map = ArenaMap.generate(7);
  const sample = new Map<string, Obstacle[]>();
  map.obstacles.forEach((obstacle) => {
    const list = sample.get(obstacle.kind) ?? [];
    if (list.length < 6) list.push(obstacle);
    sample.set(obstacle.kind, list);
  });

  it.each([...sample.keys()])('%s stays inside its collision shape up to 1 m high (what you see is what blocks you)', (kind) => {
    const tolerance = 0.3;
    sample.get(kind)!.forEach((obstacle) => {
      const geometry = mergeParts(obstacleParts(obstacle));
      expect(geometry.attributes.color).toBeDefined();
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        // Flat ground dressing (grave mounds) and anything above head-butting height (branches, roofs) may overhang.
        if (y <= 0.06 || y > 1.0) continue;
        if (obstacle.shape === 'circle') {
          expect(Math.hypot(x, z), `${kind} vertex at y=${y.toFixed(2)}`).toBeLessThanOrEqual(obstacle.radius * WORLD_SCALE + tolerance);
        } else {
          expect(Math.abs(x), `${kind} x at y=${y.toFixed(2)}`).toBeLessThanOrEqual(obstacle.halfWidth * WORLD_SCALE + tolerance);
          expect(Math.abs(z), `${kind} z at y=${y.toFixed(2)}`).toBeLessThanOrEqual(obstacle.halfHeight * WORLD_SCALE + tolerance);
        }
      }
    });
  });

  it('builds every decoration kind that is merged into the prop chunks', () => {
    (['bush', 'rubble', 'lilyPad'] as const).forEach((kind) => {
      const decor = map.decor.find((item) => item.kind === kind)!;
      expect(mergeParts(decorParts(decor)).attributes.position.count).toBeGreaterThan(0);
    });
  });
});
