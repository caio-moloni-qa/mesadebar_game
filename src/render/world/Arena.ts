import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAMP, LAKE, TEMPLE, TRAIL_WIDTH } from '../../config/arenaLayout';
import { ArenaMap, lakeShoreDistance, trailDistance, zoneWeight } from '../../core/world/ArenaMap';
import { createRng, floatBetween, intBetween } from '../../core/math';
import { PALETTE, toonMaterial } from '../materials';
import { mergeParts } from '../models/parts';
import { WORLD_SCALE, toMeters } from '../space';
import { Ambient, FireSpot } from './Ambient';
import { EdgeMist } from './EdgeMist';
import { environmentUniforms, withEnvironment } from './environmentShader';
import { paintGround, valueNoise } from './groundPainter';
import { decorParts, obstacleParts, placeParts } from './props';
import { Water } from './Water';

/** Low warm sun, about 30° up — long shadows falling down-left across the screen like the style reference. */
const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.5, -0.67).normalize();
const SHADOW_HALF_EXTENT = 34;
/** Cool, slightly violet mist — matches the shadow tone so the border reads as dusk haze, not a wall. */
const MIST_COLOR = 0xb8b2c8;
/** Props are merged per chunk (CHUNKS × CHUNKS over the arena) so off-screen chunks are frustum-culled. */
const CHUNKS = 4;
const GRASS_TUFTS = 14000;

/** Draws the ArenaMap the core plays on (THREEJS_3D_MIGRATION_TEMP.md, arena zones): every obstacle at exactly its
 *  collision size, the decoration, a ground painted per zone (each texel unique — nothing repeats), the lake,
 *  zone-aware grass, mist at the borders, firelight, fireflies, and the light rig. */
export class Arena {
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly mist: EdgeMist;
  private readonly ambient: Ambient;
  private time = 0;
  private readonly sunOffset = SUN_DIRECTION.clone().multiplyScalar(60);

  constructor(private readonly map: ArenaMap, seed: number) {
    const arenaMeters = toMeters(map.size);
    this.root.add(this.createGround(seed, arenaMeters));
    this.root.add(this.createOuterGround(arenaMeters));
    this.createPropChunks().forEach((chunk) => this.root.add(chunk));
    this.root.add(this.createGrass(seed));
    this.root.add(new Water(map).root);
    this.mist = new EdgeMist(arenaMeters, MIST_COLOR);
    this.ambient = new Ambient(this.fireSpots(), createRng(seed ^ 0xf17e));
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

  /** Advances the environment clock (wind, cloud drift, mist, water, flames, fireflies). Pass 0 while frozen. */
  update(deltaSeconds: number, focus: THREE.Vector3, hero?: THREE.Vector3, viewDirection?: THREE.Vector3): void {
    if (hero) environmentUniforms.uFocus.value.copy(hero);
    if (viewDirection) environmentUniforms.uViewDirection.value.copy(viewDirection);
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

  private createGround(seed: number, arenaMeters: number): THREE.Mesh {
    const texture = new THREE.CanvasTexture(paintGround(this.map, seed));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(arenaMeters, arenaMeters), withEnvironment(toonMaterial({ map: texture }), { clouds: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(arenaMeters / 2, 0, arenaMeters / 2);
    ground.receiveShadow = true;
    // Ground first, then the depth-less grass tufts on top of it, then everything else (see createGrass).
    ground.renderOrder = -2;
    return ground;
  }

  /** Grass-toned ring outside the arena, under the edge mist, so the border dissolves instead of ending. */
  private createOuterGround(arenaMeters: number): THREE.Mesh {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(arenaMeters * 4, arenaMeters * 4), withEnvironment(toonMaterial({ color: 0x627c3a }), { clouds: true }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(arenaMeters / 2, -0.02, arenaMeters / 2);
    outer.receiveShadow = true;
    outer.renderOrder = -3;
    return outer;
  }

  /** Every obstacle and decoration, built at its map position and merged per chunk into one vertex-coloured mesh. */
  private createPropChunks(): THREE.Mesh[] {
    const chunkSize = this.map.size / CHUNKS;
    const buckets: THREE.BufferGeometry[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
    const bucket = (x: number, y: number) => buckets[Math.min(CHUNKS - 1, Math.floor(x / chunkSize)) + Math.min(CHUNKS - 1, Math.floor(y / chunkSize)) * CHUNKS];
    this.map.obstacles.forEach((obstacle) => bucket(obstacle.x, obstacle.y).push(...placeParts(obstacleParts(obstacle), obstacle.x, obstacle.y, obstacle.rotation)));
    this.map.decor.forEach((decor) => {
      if (decor.kind === 'reeds') return; // instanced by Water (they sway)
      bucket(decor.x, decor.y).push(...placeParts(decorParts(decor), decor.x, decor.y, decor.rotation));
    });
    const material = withEnvironment(toonMaterial({ vertexColors: true, flatShading: true }), { clouds: true, occlusion: true });
    return buckets.filter((parts) => parts.length > 0).map((parts) => {
      const mesh = new THREE.Mesh(mergeParts(parts), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.geometry.computeBoundingSphere();
      return mesh;
    });
  }

  /** Light sources from the map: braziers burn at bowl height, the camp's bonfire at ground level (and bigger). */
  private fireSpots(): FireSpot[] {
    return this.map.fires.map((fire) => ({
      position: new THREE.Vector3(fire.x * WORLD_SCALE, 0, fire.y * WORLD_SCALE),
      flameHeight: fire.kind === 'campfire' ? 0.15 : 1.1,
      scale: fire.kind === 'campfire' ? 1.8 : 1
    }));
  }

  /** Instanced grass tufts that follow the zones: lush in the meadow, sparse and dry in the graveyard, dark in the
   *  forest, none on paving, trails, water, the camp's trampled ground or under obstacles. Three crossed blades with
   *  up-facing normals, swaying in the wind shader. */
  private createGrass(seed: number): THREE.InstancedMesh {
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
    const tufts = new THREE.InstancedMesh(geometry, material, GRASS_TUFTS);
    const rng = createRng(seed ^ 0x6a55);
    const clumps = valueNoise(rng);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const templeCos = Math.cos(-TEMPLE.rotation);
    const templeSin = Math.sin(-TEMPLE.rotation);
    let placed = 0;
    for (let attempt = 0; attempt < GRASS_TUFTS * 6 && placed < GRASS_TUFTS; attempt += 1) {
      const x = floatBetween(rng, 20, this.map.size - 20);
      const y = floatBetween(rng, 20, this.map.size - 20);
      const meadow = zoneWeight('meadow', x, y);
      const forest = zoneWeight('forest', x, y);
      const graveyard = zoneWeight('graveyard', x, y);
      // Density: clumped noise, boosted in the meadow, thinned on dry/dark ground.
      const density = clumps(x / 160, y / 160) + meadow * 0.25 - graveyard * 0.2 - forest * 0.1;
      if (density < 0.55) continue;
      if (lakeShoreDistance(x, y) < LAKE.shoreWidth * 0.5 || trailDistance(x, y) < TRAIL_WIDTH / 2) continue;
      if (Math.hypot(x - CAMP.fire.x, y - CAMP.fire.y) < 240) continue;
      const tx = x - TEMPLE.center.x;
      const ty = y - TEMPLE.center.y;
      if (Math.abs(tx * templeCos - ty * templeSin) < TEMPLE.halfWidth && Math.abs(tx * templeSin + ty * templeCos) < TEMPLE.halfHeight && rng() < 0.9) continue;
      if (!this.map.isWalkable(x, y, 6)) continue;
      position.set(x * WORLD_SCALE, 0, y * WORLD_SCALE);
      rotation.setFromAxisAngle(up, rng() * Math.PI * 2);
      const size = floatBetween(rng, 0.7, 1.5) * (1 + meadow * 0.25);
      scale.set(size, size * floatBetween(rng, 0.8, 1.3), size);
      tufts.setMatrixAt(placed, matrix.compose(position, rotation, scale));
      const swatch = graveyard > 0.5
        ? [0x9a9466, 0x8a8a5a, 0xa8a070][intBetween(rng, 0, 2)]
        : forest > 0.5
          ? [0x4f6232, 0x5a6a34, 0x6a5a34][intBetween(rng, 0, 2)]
          : rng() < 0.06 ? 0x8a6f9c : [0x7d9a45, 0x8fae4f, 0x6a8a3c, 0xa3b45a][intBetween(rng, 0, 3)];
      tufts.setColorAt(placed, color.setHex(swatch));
      placed += 1;
    }
    tufts.count = placed;
    tufts.receiveShadow = true;
    // Blades are thinner than a texel: if they wrote depth, the outline pass would treat every one as a silhouette
    // and darken it into dirt specks. Drawn first without depth, they read as ground texture and never hide enemies.
    material.depthWrite = false;
    tufts.renderOrder = -1;
    return tufts;
  }
}
