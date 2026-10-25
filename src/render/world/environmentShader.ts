import * as THREE from 'three';

/** Uniforms shared by every material the environment touches. One object, so a single per-frame update drives the
 *  wind and the drifting cloud shadows everywhere at once. Time only advances while the run does (it freezes with
 *  pause, like every other visual effect). */
export const environmentUniforms = {
  uEnvTime: { value: 0 },
  /** World-space drift of the cloud-shadow pattern (meters). */
  uCloudOffset: { value: new THREE.Vector2() },
  /** The hero (meters) and the camera's viewing direction — tall props between them dissolve (see `occlusion`). */
  uFocus: { value: new THREE.Vector3() },
  uViewDirection: { value: new THREE.Vector3(0, -1, 0) }
};

export interface EnvironmentFeatures {
  /** Bend vertices sideways in proportion to their height (grass tufts). Instanced meshes phase by instance. */
  wind?: boolean;
  /** Darken direct sunlight under slowly drifting cloud shadows. */
  clouds?: boolean;
  /** Screen-door dissolve of whatever stands between the camera and the hero, so tall walls, trees and towers never
   *  hide the player (the standard isometric fix; a pixel checkerboard reads as pixel art and needs no sorting). */
  occlusion?: boolean;
}

// Small 2D value noise + 3-octave fbm, enough for soft cloud blobs at 16 px per meter.
const NOISE_GLSL = /* glsl */ `
  float envHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float envNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(envHash(i), envHash(i + vec2(1.0, 0.0)), u.x), mix(envHash(i + vec2(0.0, 1.0)), envHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float envFbm(vec2 p) {
    return envNoise(p) * 0.55 + envNoise(p * 2.03) * 0.3 + envNoise(p * 4.01) * 0.15;
  }
`;

/** Extends a built-in (toon) material with wind sway and/or cloud shadows via onBeforeCompile (threejs-shaders:
 *  inject at begin_vertex for displacement, and adjust the summed direct light right before lights_fragment_end
 *  applies it). customProgramCacheKey keeps each feature combination in its own shader program. */
export function withEnvironment<T extends THREE.Material>(material: T, features: EnvironmentFeatures): T {
  const key = `env:${features.wind ? 'w' : ''}${features.clouds ? 'c' : ''}${features.occlusion ? 'o' : ''}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEnvTime = environmentUniforms.uEnvTime;
    shader.uniforms.uCloudOffset = environmentUniforms.uCloudOffset;
    shader.uniforms.uFocus = environmentUniforms.uFocus;
    shader.uniforms.uViewDirection = environmentUniforms.uViewDirection;
    const header = `uniform float uEnvTime;\nuniform vec2 uCloudOffset;\nuniform vec3 uFocus;\nuniform vec3 uViewDirection;\nvarying vec3 vEnvWorld;\n${NOISE_GLSL}\n`;
    shader.vertexShader = header + shader.vertexShader;
    shader.fragmentShader = header + shader.fragmentShader;

    const wind = features.wind ? /* glsl */ `
      #ifdef USE_INSTANCING
        vec2 envAnchor = instanceMatrix[3].xz;
      #else
        vec2 envAnchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      #endif
      // Gusts roll across the field as a travelling wave; tips move, roots stay planted.
      float envGust = sin(uEnvTime * 1.7 + envAnchor.x * 0.35 + envAnchor.y * 0.22) * 0.6 + sin(uEnvTime * 3.1 + envAnchor.x * 0.9) * 0.25;
      transformed.x += envGust * 0.16 * transformed.y;
      transformed.z += envGust * 0.09 * transformed.y;
    ` : '';
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${wind}`);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
      #ifdef USE_INSTANCING
        vEnvWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vEnvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);

    if (features.occlusion) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', /* glsl */ `#include <clipping_planes_fragment>
        // Fragment's offset from the hero, split into "towards the camera" and "sideways from the sight line".
        vec3 envFromFocus = vEnvWorld - uFocus;
        float envTowardCamera = dot(envFromFocus, -uViewDirection);
        float envOffLine = length(envFromFocus + uViewDirection * envTowardCamera);
        if (envTowardCamera > 0.4 && envOffLine < 1.9 && vEnvWorld.y > 0.35) {
          // 50% checkerboard on the low-res target: everything behind shows through, still reads as the object.
          if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
        }`);
    }

    if (features.clouds) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', /* glsl */ `
        float envCloud = smoothstep(0.52, 0.72, envFbm((vEnvWorld.xz + uCloudOffset) / 22.0));
        reflectedLight.directDiffuse *= 1.0 - envCloud * 0.55;
        #include <lights_fragment_end>`);
    }
  };
  material.customProgramCacheKey = () => key;
  return material;
}
