import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Vec3Tuple = [number, number, number];

/** One coloured, posed primitive. Models are lists of these merged into a single vertex-coloured geometry, so a whole
 *  character or weapon is one draw call with one shared toon material. */
export function part(geometry: THREE.BufferGeometry, color: number, position: Vec3Tuple = [0, 0, 0], rotation: Vec3Tuple = [0, 0, 0], scale: Vec3Tuple = [1, 1, 1]): THREE.BufferGeometry {
  const shaped = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  // Only position/normal/color are kept so every primitive type merges with every other.
  shaped.deleteAttribute('uv');
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale)
  );
  shaped.applyMatrix4(matrix);
  const rgb = new THREE.Color(color);
  const colors = new Float32Array(shaped.attributes.position.count * 3);
  for (let index = 0; index < colors.length; index += 3) colors.set([rgb.r, rgb.g, rgb.b], index);
  shaped.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return shaped;
}

export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('mergeParts: parts have mismatched attributes');
  parts.forEach((geometry) => geometry.dispose());
  return merged;
}

// Short primitive constructors, low segment counts on purpose (faceted low-poly reads better at 16 px/m).
export const box = (width: number, height: number, depth: number) => new THREE.BoxGeometry(width, height, depth);
export const cylinder = (top: number, bottom: number, height: number, segments = 6) => new THREE.CylinderGeometry(top, bottom, height, segments);
export const cone = (radius: number, height: number, segments = 6) => new THREE.ConeGeometry(radius, height, segments);
export const ball = (radius: number, detail = 0) => new THREE.IcosahedronGeometry(radius, detail);
export const gem = (radius: number) => new THREE.OctahedronGeometry(radius, 0);
