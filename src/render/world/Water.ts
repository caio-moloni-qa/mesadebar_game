import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAKE } from '../../config/arenaLayout';
import { ArenaMap, lakeOutline } from '../../core/world/ArenaMap';
import { createRng, floatBetween } from '../../core/math';
import { toonMaterial } from '../materials';
import { WORLD_SCALE } from '../space';
import { environmentUniforms, withEnvironment } from './environmentShader';

/** The lake: one flat mesh in the exact outline of the deep water the core blocks, shaded per pixel from the same
 *  harmonic shoreline the core uses — shallow-to-deep colour bands, animated foam hugging the shore, drifting
 *  glints and the shared cloud shadows. Plus reeds (instanced, swaying) along the waterline. */
export class Water {
  readonly root = new THREE.Group();
  private readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** The level on screen, easing towards the map's (the core refills the lake in one step; the water rises back). */
  private shownLevel = 1;

  constructor(map: ArenaMap) {
    const outline = lakeOutline(96);
    // ShapeGeometry lives in XY; (X, -Z) there lands on (X, 0, Z) after the -90° X rotation.
    const shape = new THREE.Shape(outline.map((point) => new THREE.Vector2(point.x * WORLD_SCALE, -point.y * WORLD_SCALE)));
    const geometry = new THREE.ShapeGeometry(shape, 1);
    geometry.rotateX(-Math.PI / 2);
    // Pivot on the lake's centre so draining can shrink the surface towards it.
    geometry.translate(-LAKE.center.x * WORLD_SCALE, 0, -LAKE.center.y * WORLD_SCALE);
    const harmonics = LAKE.harmonics.map(([amplitude, frequency, phase]) => new THREE.Vector3(amplitude * WORLD_SCALE, frequency, phase));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uEnvTime: environmentUniforms.uEnvTime,
        uCloudOffset: environmentUniforms.uCloudOffset,
        uCenter: { value: new THREE.Vector2(LAKE.center.x * WORLD_SCALE, LAKE.center.y * WORLD_SCALE) },
        uRadius: { value: LAKE.radius * WORLD_SCALE },
        uHarmonics: { value: harmonics },
        uShallow: { value: new THREE.Color(0x72bbaa) },
        uDeep: { value: new THREE.Color(0x244f69) },
        uFoam: { value: new THREE.Color(0xe6f2ec) },
        uLevel: { value: 1 }
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
        uniform vec2 uCloudOffset;
        uniform vec2 uCenter;
        uniform float uRadius;
        uniform vec3 uHarmonics[3];
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform float uLevel;
        varying vec2 vWorld;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
          vec2 offset = vWorld - uCenter;
          float angle = atan(offset.y, offset.x);
          float radius = uRadius;
          for (int i = 0; i < 3; i++) radius += uHarmonics[i].x * sin(angle * uHarmonics[i].y + uHarmonics[i].z);
          radius *= uLevel; // the shoreline shrinks with the water as the lake drains
          float depth = radius - length(offset); // meters from the shoreline, inward

          vec3 color = mix(uShallow, uDeep, smoothstep(0.3, 5.0, depth));
          // Gentle wave bands following the shore.
          float bands = sin(depth * 3.2 - uEnvTime * 1.4 + noise(vWorld * 0.5) * 2.0);
          color *= 0.93 + 0.07 * step(0.6, bands);
          // Broad crossing ripples and broken highlights give the lake a reflective surface.
          float rippleA = sin(dot(vWorld, vec2(1.7, 0.65)) + uEnvTime * 0.65);
          float rippleB = sin(dot(vWorld, vec2(-0.45, 2.1)) - uEnvTime * 0.9);
          float reflection = smoothstep(1.45, 1.92, rippleA + rippleB);
          color += vec3(0.11, 0.15, 0.12) * reflection * smoothstep(0.6, 2.0, depth);
          // Foam line: a ragged, breathing band right at the waterline.
          float foamEdge = 0.35 + 0.25 * noise(vWorld * 1.3 + uEnvTime * 0.4) + 0.12 * sin(uEnvTime * 1.7 + angle * 9.0);
          color = mix(color, uFoam, 1.0 - smoothstep(foamEdge * 0.6, foamEdge, depth));
          // Glints: sparse bright specks drifting with the wind.
          float glint = noise(vWorld * 4.0 + vec2(uEnvTime * 0.6, uEnvTime * 0.25));
          color += vec3(0.5) * step(0.93, glint) * smoothstep(1.0, 2.5, depth);
          // Same drifting cloud shadows as the ground.
          float cloud = smoothstep(0.52, 0.72, noise((vWorld + uCloudOffset) / 22.0) * 0.55 + noise((vWorld + uCloudOffset) / 11.0) * 0.45);
          color *= 1.0 - cloud * 0.3;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const surface = new THREE.Mesh(geometry, material);
    surface.position.set(LAKE.center.x * WORLD_SCALE, 0.02, LAKE.center.y * WORLD_SCALE);
    this.surface = surface;
    surface.receiveShadow = false;
    this.root.add(surface);
    this.root.add(this.createReeds(map));
  }

  /** Follows the map's lake level: the surface (and its shoreline) shrinks to the centre as it drains. */
  update(level: number, deltaSeconds: number): void {
    const rate = level > this.shownLevel ? 0.9 : 6;
    this.shownLevel += (level - this.shownLevel) * Math.min(1, deltaSeconds * rate);
    if (Math.abs(level - this.shownLevel) < 0.002) this.shownLevel = level;
    const scale = Math.max(0.001, this.shownLevel);
    this.surface.scale.set(scale, 1, scale);
    this.surface.material.uniforms.uLevel.value = scale;
    this.surface.visible = this.shownLevel > 0.02;
  }

  /** Reed clumps at the waterline: a few tall blades each, instanced so the wind shader phases them individually. */
  private createReeds(map: ArenaMap): THREE.InstancedMesh {
    const blades = [0, 1, 2, 3].map((index) => {
      const angle = index * 1.7;
      const lean = (index - 1.5) * 0.06;
      return new THREE.ConeGeometry(0.035, 1.1 + index * 0.18, 3).translate(Math.cos(angle) * 0.12, 0.55 + index * 0.09, Math.sin(angle) * 0.12).rotateZ(lean).toNonIndexed();
    });
    const head = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 4).translate(0.12, 1.45, 0).toNonIndexed();
    const geometry = mergeGeometries([...blades, head])!;
    // Vertex colours: green blades, a brown cattail head.
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const bladeVertices = blades.reduce((sum, blade) => sum + blade.attributes.position.count, 0);
    const green = new THREE.Color(0x6f8a3a);
    const brown = new THREE.Color(0x5a3a22);
    for (let vertex = 0; vertex < geometry.attributes.position.count; vertex += 1) (vertex < bladeVertices ? green : brown).toArray(colors, vertex * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const reeds = map.decor.filter((decor) => decor.kind === 'reeds');
    const mesh = new THREE.InstancedMesh(geometry, withEnvironment(toonMaterial({ vertexColors: true, flatShading: true }), { wind: true, clouds: true }), Math.max(1, reeds.length));
    const rng = createRng(reeds.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    reeds.forEach((reed, index) => {
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), reed.rotation);
      const size = floatBetween(rng, 0.7, 1.25);
      scale.set(size, size * floatBetween(rng, 0.8, 1.2), size);
      mesh.setMatrixAt(index, matrix.compose(new THREE.Vector3(reed.x * WORLD_SCALE, 0, reed.y * WORLD_SCALE), rotation, scale));
    });
    mesh.count = reeds.length;
    mesh.castShadow = true;
    return mesh;
  }
}
