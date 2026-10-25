import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeParts } from '../models/parts';
import { Ambient } from './Ambient';
import { EdgeMist } from './EdgeMist';
import { environmentUniforms, withEnvironment } from './environmentShader';
import { FOOTPRINT, PROP_BUILDERS, PropKind, brazierBase, placeProp } from './props';
import { WORLD_SIZE } from '../../config/world';
import { Rng, createRng, floatBetween, intBetween } from '../../core/math';
import { PALETTE, toonMaterial } from '../materials';
import { toMeters } from '../space';

const ARENA_METERS = toMeters(WORLD_SIZE);
/** Ground texture density matches the internal render (16 px per meter), so one texel ≈ one screen pixel. */
const TEXELS_PER_METER = 16;
/** Keep props away from the player's spawn point. */
const CLEAR_RADIUS = 9;
/** Low warm sun, about 30° up — long shadows falling down-left across the screen like the style reference. */
const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.5, -0.67).normalize();
const SHADOW_HALF_EXTENT = 34;
/** Props stay this far inside the border, where the edge mist starts to thicken. */
const EDGE_MARGIN = 5;
/** Cool, slightly violet mist — matches the shadow tone so the border reads as dusk haze, not a wall. */
const MIST_COLOR = 0xb8b2c8;

/** The arena (THREEJS_3D_MIGRATION_TEMP.md §4.2/§3.1): procedurally painted ground with dirt trails, medieval set
 *  dressing (colonnades, arches, walls, a stone circle, graveyards, dead trees, bushes, rocks), wind-swept grass,
 *  drifting cloud shadows, braziers with real firelight, fireflies, mist at the borders, and the light rig.
 *  Props are decoration only — no collision, so the arena plays exactly like the open 2D map. */
export class Arena {
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly mist: EdgeMist;
  private readonly ambient: Ambient;
  private time = 0;
  private readonly sunOffset = SUN_DIRECTION.clone().multiplyScalar(60);

  constructor(seed: number) {
    const rng = createRng(seed);
    this.root.add(this.createGround(rng));
    this.root.add(this.createOuterGround());
    const props = this.createProps(rng);
    this.root.add(props.mesh);
    this.root.add(this.createGrass(rng));
    this.mist = new EdgeMist(ARENA_METERS, MIST_COLOR);
    this.ambient = new Ambient(props.braziers, rng);
    this.root.add(this.mist.root, this.ambient.root);
    // Ambient is cool purple-blue from above (that's what shadowed, upward-facing ground sees), warmth comes only
    // from the sun — gives the reference's golden light / violet shadow split.
    this.root.add(new THREE.HemisphereLight(PALETTE.shadowLight, PALETTE.shadowGround, 3.6));
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -SHADOW_HALF_EXTENT;
    shadowCamera.right = SHADOW_HALF_EXTENT;
    shadowCamera.top = SHADOW_HALF_EXTENT;
    shadowCamera.bottom = -SHADOW_HALF_EXTENT;
    shadowCamera.near = 1;
    shadowCamera.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.root.add(this.sun, this.sun.target);
  }

  /** Objects the pixel pipeline must skip in its normal pass (transparent / glowing — they'd add fake edges). */
  get normalPassExclusions(): THREE.Object3D[] {
    return [this.mist.root, ...this.ambient.glows];
  }

  /** Advances the environment clock (wind, cloud drift, mist, flames, fireflies). Pass 0 while the run is frozen. */
  update(deltaSeconds: number, focus: THREE.Vector3): void {
    this.time += deltaSeconds;
    environmentUniforms.uEnvTime.value = this.time;
    environmentUniforms.uCloudOffset.value.set(this.time * 0.9, this.time * 0.4);
    this.ambient.update(this.time, deltaSeconds, focus);
  }

  /** Keeps the shadow frustum centered on what the camera sees, snapped to whole shadow texels to avoid shimmer. */
  followFocus(focus: THREE.Vector3): void {
    const texel = (SHADOW_HALF_EXTENT * 2) / this.sun.shadow.mapSize.x;
    const x = Math.round(focus.x / texel) * texel;
    const z = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x, 0, z).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();
  }

  private createGround(rng: Rng): THREE.Mesh {
    const size = Math.round(ARENA_METERS * TEXELS_PER_METER);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);
    const grass = [[86, 112, 52], [98, 126, 58], [112, 140, 64], [126, 152, 70], [140, 160, 76]];
    const dirt = [[150, 116, 78], [168, 134, 90], [132, 100, 66]];
    const noise = valueNoise(rng);
    const paths = this.pathField(rng, size);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = noise(x / 90, y / 90) * 0.6 + noise(x / 23, y / 23) * 0.3 + noise(x / 6, y / 6) * 0.1;
        const dither = (bayer[(x & 3) + (y & 3) * 4] / 16 - 0.5) * 0.18;
        const pathAmount = paths[y * size + x] + (noise(x / 9 + 50, y / 9) - 0.5) * 0.35;
        const swatch = pathAmount > 0.55
          ? dirt[Math.min(dirt.length - 1, Math.max(0, Math.floor((n + dither) * dirt.length)))]
          : grass[Math.min(grass.length - 1, Math.max(0, Math.floor((n + dither) * grass.length)))];
        const offset = (y * size + x) * 4;
        image.data[offset] = swatch[0];
        image.data[offset + 1] = swatch[1];
        image.data[offset + 2] = swatch[2];
        image.data[offset + 3] = 255;
      }
    }
    // Sparse flowers / pebbles, a pixel or two each.
    for (let index = 0; index < size * 4; index += 1) {
      const x = intBetween(rng, 0, size - 1);
      const y = intBetween(rng, 0, size - 1);
      const offset = (y * size + x) * 4;
      const color = rng() < 0.5 ? [230, 214, 120] : rng() < 0.5 ? [196, 120, 160] : [180, 172, 150];
      image.data.set([color[0], color[1], color[2]], offset);
    }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_METERS, ARENA_METERS), withEnvironment(toonMaterial({ map: texture }), { clouds: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ARENA_METERS / 2, 0, ARENA_METERS / 2);
    ground.receiveShadow = true;
    // Ground first, then the depth-less grass tufts on top of it, then everything else (see createGrass).
    ground.renderOrder = -2;
    return ground;
  }

  /** Winding dirt trails: a few random walks splatted into a [0..1] field. */
  private pathField(rng: Rng, size: number): Float32Array {
    const field = new Float32Array(size * size);
    for (let trail = 0; trail < 5; trail += 1) {
      let x = floatBetween(rng, 0, size);
      let y = floatBetween(rng, 0, size);
      let angle = floatBetween(rng, 0, Math.PI * 2);
      const width = floatBetween(rng, 10, 18);
      for (let step = 0; step < size * 1.2; step += 4) {
        angle += floatBetween(rng, -0.12, 0.12);
        x += Math.cos(angle) * 4;
        y += Math.sin(angle) * 4;
        if (x < 0 || y < 0 || x >= size || y >= size) break;
        const r = Math.ceil(width);
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            const px = Math.floor(x + dx);
            const py = Math.floor(y + dy);
            if (px < 0 || py < 0 || px >= size || py >= size) continue;
            const amount = 1 - Math.hypot(dx, dy) / width;
            if (amount > field[py * size + px]) field[py * size + px] = amount;
          }
        }
      }
    }
    return field;
  }

  /** Dark ring outside the arena so the edge of the world fades instead of ending in the void. */
  private createOuterGround(): THREE.Mesh {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_METERS * 4, ARENA_METERS * 4), withEnvironment(toonMaterial({ color: 0x627c3a }), { clouds: true }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(ARENA_METERS / 2, -0.02, ARENA_METERS / 2);
    outer.receiveShadow = true;
    outer.renderOrder = -3;
    return outer;
  }

  /** Scatters the props with simple rejection sampling: every prop kind has a footprint radius and nothing is placed
   *  overlapping another prop, inside the spawn clearing, or too close to the arena edge (where the mist is). All of
   *  it is merged into ONE vertex-coloured mesh — a single draw call per pass for the whole set dressing. Braziers
   *  are returned separately because their flames and lights animate. */
  private createProps(rng: Rng): { mesh: THREE.Mesh; braziers: THREE.Vector3[] } {
    const center = ARENA_METERS / 2;
    const placed: Array<{ x: number; z: number; radius: number }> = [];
    const parts: THREE.BufferGeometry[] = [];
    const braziers: THREE.Vector3[] = [];
    const findSpot = (radius: number, near?: { x: number; z: number; within: number }): { x: number; z: number } | null => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const x = near ? near.x + floatBetween(rng, -near.within, near.within) : floatBetween(rng, EDGE_MARGIN, ARENA_METERS - EDGE_MARGIN);
        const z = near ? near.z + floatBetween(rng, -near.within, near.within) : floatBetween(rng, EDGE_MARGIN, ARENA_METERS - EDGE_MARGIN);
        if (Math.hypot(x - center, z - center) < CLEAR_RADIUS + radius) continue;
        if (x < EDGE_MARGIN || z < EDGE_MARGIN || x > ARENA_METERS - EDGE_MARGIN || z > ARENA_METERS - EDGE_MARGIN) continue;
        if (placed.some((other) => Math.hypot(other.x - x, other.z - z) < other.radius + radius)) continue;
        placed.push({ x, z, radius });
        return { x, z };
      }
      return null;
    };
    const scatter = (kind: Exclude<PropKind, 'brazier'>, count: number) => {
      for (let index = 0; index < count; index += 1) {
        const spot = findSpot(FOOTPRINT[kind]);
        if (spot) parts.push(...placeProp(PROP_BUILDERS[kind](rng), spot.x, spot.z, rng() * Math.PI * 2));
      }
    };
    // Landmarks first (they need the most room), then the filler.
    scatter('stoneCircle', 2);
    scatter('graveyard', 3);
    scatter('colonnade', 7);
    scatter('arch', 5);
    scatter('wall', 9);
    scatter('fallenColumn', 8);
    scatter('deadTree', 18);
    scatter('bush', 110);
    scatter('rock', 70);
    // Braziers: one just outside the spawn clearing so the warm light is on screen from the first second.
    const firstBrazier = findSpot(FOOTPRINT.brazier, { x: center + 11, z: center - 6, within: 2 });
    [firstBrazier, ...Array.from({ length: 6 }, () => findSpot(FOOTPRINT.brazier))].forEach((spot) => {
      if (!spot) return;
      parts.push(...placeProp(brazierBase(), spot.x, spot.z, 0));
      braziers.push(new THREE.Vector3(spot.x, 0, spot.z));
    });
    const mesh = new THREE.Mesh(mergeParts(parts), withEnvironment(toonMaterial({ vertexColors: true, flatShading: true }), { clouds: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, braziers };
  }

  /** Instanced grass tufts: three crossed blades with normals pointing up, so they light like the ground and don't
   *  add normal-edge noise to the outline pass. Kept short so they never hide enemies. */
  private createGrass(rng: Rng): THREE.InstancedMesh {
    const blades = [0, 1, 2].map((index) => {
      const blade = new THREE.BufferGeometry();
      const angle = (index / 3) * Math.PI + 0.3;
      const dx = Math.cos(angle) * 0.14;
      const dz = Math.sin(angle) * 0.14;
      const lean = (index - 1) * 0.08;
      blade.setAttribute('position', new THREE.Float32BufferAttribute([-dx, 0, -dz, dx, 0, dz, lean, 0.42 + index * 0.05, 0], 3));
      blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      return blade;
    });
    const geometry = mergeGeometries(blades)!;
    const material = withEnvironment(toonMaterial({ side: THREE.DoubleSide }), { wind: true, clouds: true });
    const count = 9000;
    const tufts = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const swatches = [0x7d9a45, 0x8fae4f, 0x6a8a3c, 0xa3b45a, 0x8a6f9c];
    // Clumps, not an even sprinkle: only keep candidate spots where a low-frequency noise field is high.
    const clumps = valueNoise(rng);
    for (let index = 0; index < count; index += 1) {
      do {
        position.set(floatBetween(rng, 0.5, ARENA_METERS - 0.5), 0, floatBetween(rng, 0.5, ARENA_METERS - 0.5));
      } while (clumps(position.x / 5, position.z / 5) < 0.58);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      const size = floatBetween(rng, 0.7, 1.5);
      scale.set(size, size * floatBetween(rng, 0.8, 1.3), size);
      tufts.setMatrixAt(index, matrix.compose(position, rotation, scale));
      tufts.setColorAt(index, color.setHex(rng() < 0.06 ? swatches[4] : swatches[intBetween(rng, 0, 3)]));
    }
    tufts.receiveShadow = true;
    // Blades are thinner than a texel: if they wrote depth, the outline pass would treat every one as a silhouette
    // and darken it into dirt specks. Drawn first without depth, they read as ground texture and never hide enemies.
    material.depthWrite = false;
    tufts.renderOrder = -1;
    return tufts;
  }
}

/** Smooth 2D value noise in [0, 1] from a seeded lattice. */
function valueNoise(rng: Rng): (x: number, y: number) => number {
  const size = 256;
  const lattice = Float32Array.from({ length: size * size }, () => rng());
  const at = (x: number, y: number) => lattice[((y % size) + size) % size * size + (((x % size) + size) % size)];
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}
