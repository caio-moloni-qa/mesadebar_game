import * as THREE from 'three';
import { SkinId } from '../../core/progress/Progress';

/** Mastery palette skins: each one remaps the colour of every face of a hero's mesh (imported or procedural) while
 *  keeping its light and shade, so a skin needs no new art. "lenda" stands in for the signature model at level 10
 *  until that hero's arrives. */
export interface SkinSpec {
  name: string;
  /** Swatch shown on the picker. */
  swatch: string;
  remap?: (hsl: { h: number; s: number; l: number }) => void;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const SKINS: Record<SkinId, SkinSpec> = {
  base: { name: 'Original', swatch: '#b88a5a' },
  sombra: {
    name: 'Sombra',
    swatch: '#3b2f52',
    remap: (c) => { c.h = 0.74 + (c.h - 0.5) * 0.08; c.s = c.s * 0.45 + 0.1; c.l = c.l * 0.6; }
  },
  gelo: {
    name: 'Gelo',
    swatch: '#9fd8ef',
    remap: (c) => { c.h = 0.55 + (c.h - 0.5) * 0.06; c.s = 0.25 + c.s * 0.35; c.l = clamp(0.25 + c.l * 0.85); }
  },
  brasa: {
    name: 'Brasa',
    swatch: '#d4571f',
    // Dark faces burn red, bright ones glow orange-yellow.
    remap: (c) => { c.h = 0.99 + c.l * 0.13; c.s = 0.88; c.l = clamp(c.l < 0.5 ? c.l * 0.6 : 0.3 + (c.l - 0.5) * 1.4); }
  },
  ouro: {
    name: 'Ouro',
    swatch: '#e2b24a',
    remap: (c) => { c.h = 0.11 + (c.h - 0.5) * 0.03; c.s = 0.65; c.l = clamp(0.15 + c.l * 0.9); }
  },
  lenda: {
    name: 'Lenda',
    swatch: '#3fe0c8',
    // Two tones: shadows become a deep night violet, highlights glow teal.
    remap: (c) => {
      if (c.l < 0.42) { c.h = 0.7; c.s = 0.5; c.l = c.l * 0.5; } else { c.h = 0.47; c.s = 0.85; c.l = clamp(0.55 + (c.l - 0.42) * 0.5); }
    }
  }
};

export const SKIN_ORDER: SkinId[] = ['base', 'sombra', 'gelo', 'brasa', 'ouro', 'lenda'];

/** Recolours `geometry`'s vertex colours in place (they're stored linear; the remap works on sRGB HSL). */
export function applySkin(geometry: THREE.BufferGeometry, skin: SkinId): void {
  const remap = SKINS[skin]?.remap;
  const colors = geometry.attributes.color;
  if (!remap || !colors) return;
  const color = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let index = 0; index < colors.count; index += 1) {
    color.setRGB(colors.getX(index), colors.getY(index), colors.getZ(index), THREE.LinearSRGBColorSpace);
    color.getHSL(hsl);
    remap(hsl);
    color.setHSL(((hsl.h % 1) + 1) % 1, clamp(hsl.s), clamp(hsl.l));
    colors.setXYZ(index, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
}
