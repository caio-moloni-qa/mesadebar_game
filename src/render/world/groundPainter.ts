import { CAMP, GRAVEYARD, LAKE, TEMPLE, TRAIL_WIDTH } from '../../config/arenaLayout';
import { ArenaMap, lakeShoreDistance, trailDistance, zoneWeight } from '../../core/world/ArenaMap';
import { Rng, createRng, floatBetween, intBetween } from '../../core/math';
import { ArenaTheme, RGB, activeArenaTheme } from './arenaTheme';

/** Ground texture density matches the internal render (16 px per meter), so one texel ≈ one screen pixel. */
export const GROUND_TEXELS_PER_METER = 16;
const UNITS_PER_METER = 32;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Paints the whole arena once, every texel unique (no tiling to repeat): each texel asks the map what is there —
 *  zone weights, trails, the temple floor, the lake shore — and picks a dithered swatch from the theme's palette. */
export function paintGround(map: ArenaMap, seed: number, theme: ArenaTheme = activeArenaTheme()): HTMLCanvasElement {
  const { grass: GRASS, meadow: MEADOW, forest: FOREST_SOIL, graveyard: DEAD_GRASS, dirt: DIRT, shore: SAND, bed: MUD, flagstone: FLAGSTONE, grout: GROUT, moss: MOSS, ice: ICE } = theme.ground;
  const meters = map.size / UNITS_PER_METER;
  const size = Math.round(meters * GROUND_TEXELS_PER_METER);
  const unitsPerTexel = map.size / size;
  const rng = createRng(seed ^ 0x67a55);
  const noise = valueNoise(rng);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const data = image.data;

  const templeCos = Math.cos(-TEMPLE.rotation);
  const templeSin = Math.sin(-TEMPLE.rotation);
  const graveCos = Math.cos(-GRAVEYARD.rotation);
  const graveSin = Math.sin(-GRAVEYARD.rotation);
  const flagstone = 38; // ~1.2 m slabs

  for (let py = 0; py < size; py += 1) {
    const y = (py + 0.5) * unitsPerTexel;
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) * unitsPerTexel;
      const n = noise(px / 90, py / 90) * 0.6 + noise(px / 23, py / 23) * 0.3 + noise(px / 6, py / 6) * 0.1;
      const dither = (BAYER[(px & 3) + (py & 3) * 4] / 16 - 0.5) * 0.035;
      const wobble = (noise(px / 11 + 31, py / 11) - 0.5);
      const pick = (palette: RGB[]) => palette[Math.min(palette.length - 1, Math.max(0, Math.floor((n + dither) * palette.length)))];

      let color = pick(GRASS);
      const meadow = zoneWeight('meadow', x, y);
      if (meadow + wobble * 0.4 > 0.45) color = pick(MEADOW);
      const forest = zoneWeight('forest', x, y);
      if (forest + wobble * 0.5 > 0.5) color = pick(FOREST_SOIL);
      // Graveyard: dead grass inside the fence, fading out around it.
      const gx = x - GRAVEYARD.center.x;
      const gy = y - GRAVEYARD.center.y;
      const graveLocalX = gx * graveCos - gy * graveSin;
      const graveLocalY = gx * graveSin + gy * graveCos;
      const insideGrave = Math.max(Math.abs(graveLocalX) - GRAVEYARD.halfWidth, Math.abs(graveLocalY) - GRAVEYARD.halfHeight);
      if (insideGrave + wobble * 60 < 30 || zoneWeight('graveyard', x, y) + wobble * 0.5 > 0.7) color = pick(DEAD_GRASS);
      // Camp: trampled dirt around the fire.
      if (Math.hypot(x - CAMP.fire.x, y - CAMP.fire.y) + wobble * 80 < 260) color = pick(DIRT);
      // Temple floor: flagstones inside the outer walls, some slabs missing (grass/dirt shows through).
      const tx = x - TEMPLE.center.x;
      const ty = y - TEMPLE.center.y;
      const localX = tx * templeCos - ty * templeSin;
      const localY = tx * templeSin + ty * templeCos;
      if (Math.abs(localX) < TEMPLE.halfWidth + 10 && Math.abs(localY) < TEMPLE.halfHeight + 10) {
        const column = Math.floor((localX + 2000) / flagstone);
        const row = Math.floor((localY + 2000) / flagstone + (column % 2) * 0.5);
        const slab = hash2(column, row);
        if (slab > 0.12) {
          const u = ((localX + 2000) / flagstone) % 1;
          const v = (((localY + 2000) / flagstone + (column % 2) * 0.5)) % 1;
          const grout = u < 0.06 || v < 0.06;
          color = grout ? GROUT : FLAGSTONE[Math.floor(slab * 97) % FLAGSTONE.length];
          if (!grout && (u < .095 || v < .095)) color = [Math.min(255, color[0] + 15), Math.min(255, color[1] + 15), Math.min(255, color[2] + 12)];
          if (!grout && noise(px / 4, py / 4) > 0.82) color = MOSS; // moss (or frost) in the cracks
        } else {
          color = pick(DIRT);
        }
      }
      // A frozen lake: cracked ice over the whole lake zone (walkable), around the open water.
      if (ICE && zoneWeight('lake', x, y) + wobble * 0.35 > 0.5) {
        color = pick(ICE.colors);
        if (Math.abs(noise(px / 14 + 70, py / 14) - 0.5) < 0.018 || Math.abs(noise(px / 31, py / 31 + 40) - 0.5) < 0.012) color = ICE.crack;
      }
      // Trails (with a ragged edge).
      if (trailDistance(x, y) + wobble * 18 < TRAIL_WIDTH / 2) color = pick(DIRT);
      // Lake bed and shore: mud under the water, wet sand fading to grass.
      const shore = lakeShoreDistance(x, y);
      if (shore < 0) color = pick(MUD);
      else if (shore + wobble * 20 < LAKE.shoreWidth) color = shore < LAKE.shoreWidth * 0.45 ? pick(MUD) : pick(SAND);

      const offset = (py * size + px) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }

  // Meadow wildflowers in clusters, fallen leaves in the forest, scattered pebbles everywhere.
  const speck = (px: number, py: number, rgb: RGB) => {
    if (px < 0 || py < 0 || px >= size || py >= size) return;
    data.set(rgb, (py * size + px) * 4);
  };
  for (let cluster = 0; cluster < 220; cluster += 1) {
    const cx = intBetween(rng, 0, size - 1);
    const cy = intBetween(rng, 0, size - 1);
    const wx = cx * unitsPerTexel;
    const wy = cy * unitsPerTexel;
    if (lakeShoreDistance(wx, wy) < LAKE.shoreWidth || trailDistance(wx, wy) < TRAIL_WIDTH) continue;
    const forest = zoneWeight('forest', wx, wy) > 0.5;
    const flower: RGB = forest ? theme.ground.forestSpecks[intBetween(rng, 0, theme.ground.forestSpecks.length - 1)] : theme.ground.specks[intBetween(rng, 0, theme.ground.specks.length - 1)];
    const count = zoneWeight('meadow', wx, wy) > 0.4 ? 8 : forest ? 12 : 3;
    for (let index = 0; index < count; index += 1) speck(cx + Math.round(floatBetween(rng, -10, 10)), cy + Math.round(floatBetween(rng, -10, 10)), flower);
  }
  for (let index = 0; index < size; index += 1) speck(intBetween(rng, 0, size - 1), intBetween(rng, 0, size - 1), theme.ground.pebble);

  context.putImageData(image, 0, 0);
  // Small baked contact shadows tie props into the terrain without extra meshes or per-frame work.
  for (const obstacle of map.obstacles) {
    context.save();
    context.translate(obstacle.x / unitsPerTexel, obstacle.y / unitsPerTexel);
    context.rotate(obstacle.rotation);
    const rx = (obstacle.shape === 'circle' ? obstacle.radius : obstacle.halfWidth) / unitsPerTexel;
    const ry = (obstacle.shape === 'circle' ? obstacle.radius : obstacle.halfHeight) / unitsPerTexel;
    context.scale(Math.max(1, rx * 1.7), Math.max(1, ry * 1.7));
    const shadow = context.createRadialGradient(0, 0, .15, 0, 0, 1);
    const [r, g, b] = theme.ground.shadow;
    shadow.addColorStop(0, `rgba(${r}, ${g}, ${b}, .36)`);
    shadow.addColorStop(.5, `rgba(${r + 6}, ${g + 5}, ${b + 1}, .19)`);
    shadow.addColorStop(1, `rgba(${r + 6}, ${g + 5}, ${b + 1}, 0)`);
    context.fillStyle = shadow; context.fillRect(-1, -1, 2, 2);
    context.restore();
  }
  return canvas;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 2D value noise in [0, 1] from a seeded lattice. */
export function valueNoise(rng: Rng): (x: number, y: number) => number {
  const size = 256;
  const lattice = Float32Array.from({ length: size * size }, () => rng());
  const at = (x: number, y: number) => lattice[((y % size) + size) % size * size + (((x % size) + size) % size)];
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}
