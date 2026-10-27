import * as THREE from 'three';
import { CAMP, LAKE, TEMPLE, TRAIL_WIDTH } from '../../config/arenaLayout';
import { createRng, floatBetween, intBetween } from '../../core/math';
import { ArenaMap, lakeShoreDistance, trailDistance, zoneWeight } from '../../core/world/ArenaMap';
import { toonMaterial } from '../materials';
import { mergeParts, part, cylinder, cone, gem } from '../models/parts';
import { WORLD_SCALE } from '../space';
import { withEnvironment } from './environmentShader';
import { valueNoise } from './groundPainter';
import { ArenaTheme, activeArenaTheme } from './arenaTheme';

const CHUNKS = 4;
const TUFTS = 26000;

/** Four bent, tapered ribbons; broad enough to read as soft grass at the world's pixel density.
 * Vertex tint grounds the roots and catches light on the tips without outlining each blade.
 */
export function grassGeometry(blade = { root: 0x76945c, middle: 0xb4cb8b, tip: 0xe0e7aa }): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const root = new THREE.Color(blade.root), middle = new THREE.Color(blade.middle), tip = new THREE.Color(blade.tip);
  for (let blade = 0; blade < 4; blade++) {
    const angle = blade * 2.39996, height = .24 + (blade % 3) * .065;
    const side = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const bend = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const base = bend.clone().multiplyScalar(.05);
    const mid = base.clone().addScaledVector(bend, .08).setY(height * .57);
    const end = base.clone().addScaledVector(bend, .20 + blade * .012).setY(height);
    const vertices = [base.clone().addScaledVector(side, -.065), base.clone().addScaledVector(side, .065), mid.clone().addScaledVector(side, -.044), mid.clone().addScaledVector(side, .044), end];
    const triangles = [[0, 1, 2], [1, 3, 2], [2, 3, 4]];
    for (const triangle of triangles) for (const index of triangle) {
      positions.push(...vertices[index].toArray()); normals.push(0, 1, 0);
      (index < 2 ? root : index < 4 ? middle : tip).toArray(colors, colors.length);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Spatial batches keep lush fields cheap: distant clumps never enter a draw call. */
export class Grass {
  readonly root = new THREE.Group();

  constructor(map: ArenaMap, seed: number, theme: ArenaTheme = activeArenaTheme()) {
    this.root.name = 'meadow-grass-and-flowers';
    const geometry = grassGeometry(theme.grass.blade);
    const material = withEnvironment(toonMaterial({ vertexColors: true, side: THREE.DoubleSide }), { wind: true, clouds: true, foliage: true });
    material.depthWrite = false;
    const flowerParts = [part(cylinder(.012, .02, .25, 3), 0x4a753d, [0, .125, 0]), part(gem(.045), 0xe5ba58, [0, .275, 0], [0, 0, 0], [1, .65, 1])];
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      flowerParts.push(part(cone(.068, .045, 4), 0xfff2cf, [Math.cos(angle) * .06, .26, Math.sin(angle) * .06], [0, angle, 0], [1, 1, .7]));
    }
    const flowerGeometry = mergeParts(flowerParts);
    const flowerMaterial = withEnvironment(toonMaterial({ vertexColors: true, side: THREE.DoubleSide }), { wind: true, clouds: true });
    const rng = createRng(seed ^ 0x6a55), clumps = valueNoise(rng);
    const records: Array<{ matrix: THREE.Matrix4; color: THREE.Color; flower: boolean }>[] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3();
    const templeCos = Math.cos(-TEMPLE.rotation), templeSin = Math.sin(-TEMPLE.rotation);
    let placed = 0;
    for (let attempt = 0; attempt < TUFTS * 6 && placed < TUFTS; attempt++) {
      const x = floatBetween(rng, 20, map.size - 20), y = floatBetween(rng, 20, map.size - 20);
      const meadow = zoneWeight('meadow', x, y), forest = zoneWeight('forest', x, y), grave = zoneWeight('graveyard', x, y);
      const density = clumps(x / 145, y / 145) + meadow * .23 - grave * .21 - forest * .1;
      if (density < theme.grass.threshold || lakeShoreDistance(x, y) < LAKE.shoreWidth * .52 || trailDistance(x, y) < TRAIL_WIDTH * .57) continue;
      if (Math.hypot(x - CAMP.fire.x, y - CAMP.fire.y) < 245) continue;
      const tx = x - TEMPLE.center.x, ty = y - TEMPLE.center.y;
      if (Math.abs(tx * templeCos - ty * templeSin) < TEMPLE.halfWidth && Math.abs(tx * templeSin + ty * templeCos) < TEMPLE.halfHeight && rng() < .94) continue;
      if (!map.isWalkable(x, y, 6)) continue;
      position.set(x * WORLD_SCALE, .006, y * WORLD_SCALE);
      rotation.setFromAxisAngle(up, rng() * Math.PI * 2);
      const size = floatBetween(rng, .65, 1.35) * (1 + meadow * .1);
      scale.set(size, size * floatBetween(rng, .7, 1.2), size);
      // Nothing grows on the ice.
      if (theme.ground.ice && zoneWeight('lake', x, y) > 0.4) continue;
      const swatches = grave > .5 ? theme.grass.graveyard : forest > .5 ? theme.grass.forest : theme.grass.field;
      const color = new THREE.Color(swatches[intBetween(rng, 0, swatches.length - 1)]);
      const index = Math.min(CHUNKS - 1, Math.floor(x / map.size * CHUNKS)) + Math.min(CHUNKS - 1, Math.floor(y / map.size * CHUNKS)) * CHUNKS;
      const flower = theme.grass.flowers && meadow > .2 && grave < .2 && forest < .3 && clumps(x / 90 + 25, y / 90) > .59 && rng() < .11;
      records[index].push({ matrix: matrix.compose(position, rotation, scale).clone(), color, flower });
      placed++;
    }
    for (const recordsInChunk of records) {
      if (!recordsInChunk.length) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, recordsInChunk.length);
      recordsInChunk.forEach((record, index) => { mesh.setMatrixAt(index, record.matrix); mesh.setColorAt(index, record.color); });
      mesh.name = 'grass-clump-batch'; mesh.receiveShadow = true; mesh.renderOrder = -1;
      mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += .3;
      this.root.add(mesh);
      const flowers = recordsInChunk.filter(record => record.flower);
      if (flowers.length) {
        const blooms = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, flowers.length);
        flowers.forEach((record, index) => {
          blooms.setMatrixAt(index, record.matrix);
          blooms.setColorAt(index, new THREE.Color([0xffffff, 0xebd5f4, 0xffecb6][index % 3]));
        });
        blooms.name = 'wildflower-batch'; blooms.computeBoundingSphere(); blooms.boundingSphere!.radius += .3;
        this.root.add(blooms);
      }
    }
  }
}
