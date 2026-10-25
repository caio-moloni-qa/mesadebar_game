import * as THREE from 'three';

/** Shared look for the low-poly pixel style (THREEJS_3D_MIGRATION_TEMP.md §3.1): 3-band toon lighting with hard
 *  steps. Shadowed bands fall back to the cool hemisphere light, which is what tints shadows purple/blue. */
let toonGradient: THREE.DataTexture | null = null;

function gradientMap(): THREE.DataTexture {
  if (toonGradient) return toonGradient;
  const bands = new Uint8Array([70, 150, 255]);
  toonGradient = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

/** `flatShading` isn't in MeshToonMaterial's typings, but the toon shader honours the FLAT_SHADED define that the
 *  renderer derives from `material.flatShading` — faceted low-poly reads much better in the pixel pipeline. */
export function toonMaterial(parameters: THREE.MeshToonMaterialParameters & { flatShading?: boolean } = {}): THREE.MeshToonMaterial {
  const { flatShading = false, ...rest } = parameters;
  return Object.assign(new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...rest }), { flatShading });
}

/** Palette — warm light, cool shadows, saturated magic. Kept here so every view pulls from the same swatches. */
export const PALETTE = {
  sun: 0xffcf8f,
  shadowLight: 0x7a6bc4,
  shadowGround: 0x3b2f52,
  background: 0x2a2140,
  bone: 0xe9dfc4,
  boneDark: 0xb9ab8c,
  stone: 0xbfb3a0,
  stoneDark: 0x8f8574,
  wood: 0x6b4a2e,
  steel: 0x9aa3ad,
  boltCore: 0xbff8ff,
  bolt: 0x5fe3ff,
  gem: 0x58e0a6,
  blobShadow: 0x2b2148
} as const;
