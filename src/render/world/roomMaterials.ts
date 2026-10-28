import * as THREE from 'three';
import { toonMaterial } from '../materials';

const urls = import.meta.glob('../../assets/textures/rooms/*_v2.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const cache = new Map<string, THREE.MeshToonMaterial>();

/** One shared material per surface; retains the room palette when an asset cannot load. */
export function roomMaterial(name: string, fallback: number): THREE.MeshToonMaterial {
  const key = name + fallback;
  const cached = cache.get(key);
  if (cached) return cached;
  const material = toonMaterial({ color: fallback });
  const url = urls['../../assets/textures/rooms/' + name + '_v2.png'];
  if (url) new THREE.TextureLoader().load(url, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    material.map = texture;
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
  });
  cache.set(key, material);
  return material;
}
