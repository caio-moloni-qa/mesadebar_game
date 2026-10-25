import * as THREE from 'three';
import { environmentUniforms } from './environmentShader';

const LAYERS = [
  { height: 0.25, opacity: 0.95, drift: 1 },
  { height: 1.3, opacity: 0.75, drift: -0.7 },
  { height: 2.6, opacity: 0.55, drift: 0.5 }
];

/** Mist rolling in at the arena's edges (the 3D version of GameScene.createMapFog): stacked horizontal layers whose
 *  opacity ramps up from a few meters inside the border to fully opaque outside it, broken up by drifting noise.
 *  Enemies spawn right at the border, so they emerge out of it. Transparent and depth-less, and skipped in the
 *  pixel pipeline's normal pass, so it never adds outline edges. */
export class EdgeMist {
  readonly root = new THREE.Group();

  constructor(arenaMeters: number, color: number) {
    const size = arenaMeters * 3;
    LAYERS.forEach(({ height, opacity, drift }, index) => {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uEnvTime: environmentUniforms.uEnvTime,
          uArenaCenter: { value: arenaMeters / 2 },
          uArenaHalf: { value: arenaMeters / 2 },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uDrift: { value: drift },
          uSeed: { value: index * 17.3 }
        },
        vertexShader: /* glsl */ `
          varying vec2 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uEnvTime;
          uniform float uArenaCenter;
          uniform float uArenaHalf;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uDrift;
          uniform float uSeed;
          varying vec2 vWorld;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }

          void main() {
            vec2 flow = vWorld / 6.0 + vec2(uEnvTime * 0.08 * uDrift, uEnvTime * 0.05) + uSeed;
            float wisps = noise(flow) * 0.6 + noise(flow * 2.3) * 0.4;
            // Signed distance outside the arena square (negative inside), pushed in and out by slow large-scale noise
            // so the border reads as drifting tongues of mist instead of a ruler-straight line.
            vec2 local = abs(vWorld - uArenaCenter);
            float tongues = (noise(vWorld / 9.0 + uSeed + uEnvTime * 0.03) - 0.5) * 7.0;
            float outside = max(local.x, local.y) - uArenaHalf + tongues;
            // Starts thickening ~3 m inside, so a hero standing at the border is still clearly readable.
            float ramp = smoothstep(-3.0, 4.0, outside);
            if (ramp <= 0.001) discard;
            float alpha = clamp(ramp * (0.45 + wisps * 0.9), 0.0, 1.0) * uOpacity;
            gl_FragColor = vec4(uColor * (0.85 + wisps * 0.25), alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });
      const layer = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
      layer.rotation.x = -Math.PI / 2;
      layer.position.set(arenaMeters / 2, height, arenaMeters / 2);
      layer.renderOrder = 5 + index;
      layer.frustumCulled = false;
      this.root.add(layer);
    });
  }

  set visible(value: boolean) {
    this.root.visible = value;
  }
}
