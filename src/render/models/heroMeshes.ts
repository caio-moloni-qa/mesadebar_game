import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterId } from '../../config/characters';

/** Imported hero meshes (art-source/3d → tools/asset-pipeline → src/assets/3d/characters). One static URL literal
 *  per asset so Vite rewrites it with the base path. Heroes without an entry keep the procedural model. */
const HERO_MESH_URLS: Partial<Record<CharacterId, string>> = {
  barbarian: new URL('../../assets/3d/characters/barbarian.glb', import.meta.url).href,
  fabri: new URL('../../assets/3d/characters/fabri.glb', import.meta.url).href,
  mage: new URL('../../assets/3d/characters/mage.glb', import.meta.url).href,
  reliquia: new URL('../../assets/3d/characters/reliquia.glb', import.meta.url).href,
  brom: new URL('../../assets/3d/characters/brom.glb', import.meta.url).href,
  lyra: new URL('../../assets/3d/characters/lyra.glb', import.meta.url).href,
  grimbo: new URL('../../assets/3d/characters/grimbo.glb', import.meta.url).href,
  zora: new URL('../../assets/3d/characters/zora.glb', import.meta.url).href,
  sergio: new URL('../../assets/3d/characters/sergio.glb', import.meta.url).href
};

const loaded = new Map<CharacterId, THREE.BufferGeometry>();

/** Loads every imported hero mesh before the game starts. A mesh that fails to load is skipped with a warning:
 *  that hero falls back to its procedural model instead of blocking the page. */
export async function loadHeroMeshes(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(HERO_MESH_URLS).map(async ([id, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      let geometry: THREE.BufferGeometry | undefined;
      gltf.scene.traverse((object) => { if (!geometry && object instanceof THREE.Mesh) geometry = object.geometry; });
      if (!geometry) throw new Error('no mesh in file');
      registerHeroMesh(id as CharacterId, geometry);
    } catch (error) {
      console.warn(`hero mesh "${id}" failed to load, using the procedural model`, error);
    }
  }));
}

/** Also the test seam: tests register a synthetic mesh instead of loading a file. */
export function registerHeroMesh(id: CharacterId, geometry: THREE.BufferGeometry): void {
  // The pipeline ships positions + colours only; normals from the faces give the faceted look.
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  loaded.set(id, geometry);
}

export function unregisterHeroMesh(id: CharacterId): void {
  loaded.delete(id);
}

/** A fresh copy per hero model, so each model owns (and disposes) its geometry and skin attributes. */
export function heroMesh(id: CharacterId): THREE.BufferGeometry | null {
  return loaded.get(id)?.clone() ?? null;
}
