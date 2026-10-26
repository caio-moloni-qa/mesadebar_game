import * as THREE from 'three';
import { WORLD_SCALE } from '../space';

/** A generated VFX sprite sheet: a grid of equal cells, read left→right, top→bottom. */
export interface SheetSpec {
  url: string;
  columns: number;
  rows: number;
  frames: number;
}

export const SHEETS = {
  swordSweep: { url: new URL('../../assets/attacks/sword-sweep-sheet_v2.png', import.meta.url).href, columns: 3, rows: 2, frames: 6 },
  auraTick: { url: new URL('../../assets/attacks/aura-tick-sheet_v3.png', import.meta.url).href, columns: 3, rows: 2, frames: 6 },
  staffBolt: { url: new URL('../../assets/attacks/staff-bolt-sheet_v3.png', import.meta.url).href, columns: 2, rows: 2, frames: 4 },
  staffImpact: { url: new URL('../../assets/attacks/staff-impact-sheet_v2.png', import.meta.url).href, columns: 3, rows: 2, frames: 6 }
} satisfies Record<string, SheetSpec>;

const loader = new THREE.TextureLoader();
const sources = new Map<string, THREE.Texture>();
/** Frame textures waiting on their sheet's image, uploaded once it arrives. */
const waiting = new Map<string, THREE.Texture[]>();

/** The sheet's texture, shared by everything that draws it (each user clones it for its own frame offset). */
export function sheetTexture(spec: SheetSpec): THREE.Texture {
  let texture = sources.get(spec.url);
  if (!texture) {
    texture = loader.load(spec.url, () => {
      waiting.get(spec.url)?.forEach((copy) => { copy.needsUpdate = true; });
      waiting.delete(spec.url);
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    sources.set(spec.url, texture);
  }
  return texture;
}

/** A texture of its own (for its own frame offset) over the sheet's shared image — unlike clone(), it doesn't ask
 *  for an upload before the image has loaded; the load bumps the shared source for every copy. */
export function sheetFrameTexture(spec: SheetSpec): THREE.Texture {
  const source = sheetTexture(spec);
  const texture = new THREE.Texture();
  texture.source = source.source;
  texture.colorSpace = source.colorSpace;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.generateMipmaps = false;
  if (source.image) texture.needsUpdate = true;
  else waiting.set(spec.url, [...(waiting.get(spec.url) ?? []), texture]);
  return texture;
}

/** Points `texture` at frame `frame` of the sheet. */
export function showFrame(texture: THREE.Texture, spec: SheetSpec, frame: number): void {
  const column = frame % spec.columns;
  const row = Math.floor(frame / spec.columns);
  texture.repeat.set(1 / spec.columns, 1 / spec.rows);
  texture.offset.set(column / spec.columns, 1 - (row + 1) / spec.rows);
}

interface Playing {
  mesh: THREE.Mesh;
  spec: SheetSpec;
  age: number;
  duration: number;
}

/** One-shot sprite-sheet effects: decals lying flat on the ground (the sword's sweep, the Relíquia's aura tick) and
 *  camera-facing billboards (the staff bolt's impact). Pooled, advanced by simulation time like CombatEffects. */
export class SheetEffects {
  readonly root = new THREE.Group();
  private readonly playing: Playing[] = [];
  private readonly free: THREE.Mesh[] = [];
  /** Flat quad on the ground, image top towards -Z; a centred one and one pivoting on its left edge. */
  private readonly centered = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly leftPivot = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2);
  private readonly billboard = new THREE.PlaneGeometry(1, 1);

  constructor(private readonly camera: THREE.Camera, private readonly maxActive = 48) {
    Object.values(SHEETS).forEach(sheetTexture);
  }

  /** A melee sweep pivoting on (x, y) and reaching `range` (game units) towards (dirX, dirY): the sword's as drawn;
   *  `tint` recolours it and `spread` widens the arc sideways (the whip's lash is wider than the sheet's 90°). */
  sweep(x: number, y: number, dirX: number, dirY: number, range: number, tint = 0xffffff, spread = 1, duration = 0.24): void {
    const mesh = this.spawn(SHEETS.swordSweep, this.leftPivot, duration);
    if (!mesh) return;
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(tint);
    mesh.position.set(x * WORLD_SCALE, 0.5, y * WORLD_SCALE);
    mesh.rotation.set(0, -Math.atan2(dirY, dirX), 0);
    const reach = range * WORLD_SCALE * 1.1;
    mesh.scale.set(reach, 1, reach * spread);
  }

  /** A ring of holy light opening out to `radius` (game units) around (x, y). */
  ring(x: number, y: number, radius: number, duration = 0.45): void {
    const mesh = this.spawn(SHEETS.auraTick, this.centered, duration);
    if (!mesh) return;
    mesh.position.set(x * WORLD_SCALE, 0.07, y * WORLD_SCALE);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar((radius * 2 * WORLD_SCALE) / 0.95);
  }

  /** The staff bolt bursting on whatever it hit, at chest height. */
  impact(x: number, y: number, size = 1.8): void {
    const mesh = this.spawn(SHEETS.staffImpact, this.billboard, 0.3);
    if (!mesh) return;
    mesh.position.set(x * WORLD_SCALE, 1.1, y * WORLD_SCALE);
    mesh.quaternion.copy(this.camera.quaternion);
    mesh.scale.setScalar(size);
  }

  update(deltaSeconds: number): void {
    for (let index = this.playing.length - 1; index >= 0; index -= 1) {
      const effect = this.playing[index];
      effect.age += deltaSeconds;
      const frame = Math.floor((effect.age / effect.duration) * effect.spec.frames);
      if (frame >= effect.spec.frames) {
        effect.mesh.visible = false;
        this.free.push(effect.mesh);
        this.playing.splice(index, 1);
        continue;
      }
      showFrame((effect.mesh.material as THREE.MeshBasicMaterial).map!, effect.spec, frame);
    }
  }

  clear(): void {
    this.playing.forEach((effect) => {
      effect.mesh.visible = false;
      this.free.push(effect.mesh);
    });
    this.playing.length = 0;
  }

  private spawn(spec: SheetSpec, geometry: THREE.BufferGeometry, duration: number): THREE.Mesh | null {
    if (this.playing.length >= this.maxActive) return null;
    const mesh = this.free.pop() ?? this.createMesh();
    mesh.geometry = geometry;
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (material.map?.source !== sheetTexture(spec).source) {
      material.map = sheetFrameTexture(spec);
      material.needsUpdate = true;
    }
    showFrame(material.map!, spec, 0);
    material.color.setHex(0xffffff);
    mesh.visible = true;
    this.playing.push({ mesh, spec, age: 0, duration });
    return mesh;
  }

  private createMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.centered, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.02 }));
    mesh.renderOrder = 3;
    this.root.add(mesh);
    return mesh;
  }
}
