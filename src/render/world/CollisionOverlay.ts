import * as THREE from 'three';
import { ArenaMap, lakeOutline } from '../../core/world/ArenaMap';
import { WORLD_SCALE } from '../space';

const TALL = 0xff4a4a;
const LOW = 0xffd24a;
const WATER = 0x4ab0ff;
const HEIGHT = 0.12;

/** Debug view (?debug=collision): every collision shape the core uses, drawn as outlines on the ground — red for
 *  tall obstacles (block movement and projectiles), yellow for low ones (movement only), blue for deep water. */
export function createCollisionOverlay(map: ArenaMap): THREE.LineSegments {
  const tall: number[] = [];
  const low: number[] = [];
  const loop = (target: number[], points: Array<[number, number]>) => {
    points.forEach(([x, y], index) => {
      const [nx, ny] = points[(index + 1) % points.length];
      target.push(x * WORLD_SCALE, HEIGHT, y * WORLD_SCALE, nx * WORLD_SCALE, HEIGHT, ny * WORLD_SCALE);
    });
  };
  map.obstacles.forEach((obstacle) => {
    const target = obstacle.tall ? tall : low;
    if (obstacle.shape === 'circle') {
      loop(target, Array.from({ length: 12 }, (_value, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return [obstacle.x + Math.cos(angle) * obstacle.radius, obstacle.y + Math.sin(angle) * obstacle.radius] as [number, number];
      }));
    } else {
      const cos = Math.cos(obstacle.rotation);
      const sin = Math.sin(obstacle.rotation);
      loop(target, ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
        const lx = sx * obstacle.halfWidth;
        const ly = sy * obstacle.halfHeight;
        return [obstacle.x + lx * cos - ly * sin, obstacle.y + lx * sin + ly * cos] as [number, number];
      }));
    }
  });
  const water: number[] = [];
  if (map.authored) loop(water, lakeOutline(64).map((point) => [point.x, point.y] as [number, number]));

  const positions = [...tall, ...low, ...water];
  const colors: number[] = [];
  const push = (count: number, hex: number) => {
    const color = new THREE.Color(hex);
    for (let index = 0; index < count / 3; index += 1) colors.push(color.r, color.g, color.b);
  };
  push(tall.length, TALL);
  push(low.length, LOW);
  push(water.length, WATER);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
  lines.renderOrder = 20;
  lines.frustumCulled = false;
  return lines;
}
