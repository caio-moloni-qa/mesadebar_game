import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SKIN_ORDER, applySkin } from './skins';

function swatch(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.6, 0.3, 0.1, 0.2, 0.4, 0.1, 0.05, 0.05, 0.3], 3));
  return geometry;
}

describe('palette skins', () => {
  it('the original leaves the colours alone; every other skin recolours them, inside the 0..1 range', () => {
    const base = swatch();
    applySkin(base, 'base');
    expect(Array.from(base.attributes.color.array)).toEqual(Array.from(swatch().attributes.color.array));
    SKIN_ORDER.filter((skin) => skin !== 'base').forEach((skin) => {
      const geometry = swatch();
      applySkin(geometry, skin);
      const colors = Array.from(geometry.attributes.color.array);
      expect(colors).not.toEqual(Array.from(swatch().attributes.color.array));
      colors.forEach((value) => { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1); });
    });
  });
});
