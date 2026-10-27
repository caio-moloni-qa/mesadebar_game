import { ACTIVE_LAYOUT } from '../../config/arenaLayout';

export type RGB = [number, number, number];

/** How an arena looks: the ground's palettes, the grass, the water, the light and the air. Each layout
 *  (config/arenaLayout) has one; Greenfield's is the look the arena always had. */
export interface ArenaTheme {
  ground: {
    grass: RGB[];
    meadow: RGB[];
    forest: RGB[];
    /** Inside the graveyard fence. */
    graveyard: RGB[];
    /** Trails and the camp's trampled ground. */
    dirt: RGB[];
    /** The band around the water. */
    shore: RGB[];
    /** Under the water. */
    bed: RGB[];
    flagstone: RGB[];
    grout: RGB;
    /** Grows in the flagstones' cracks. */
    moss: RGB;
    /** Frozen surface over the lake zone (walkable ice); none = the zone is plain ground. */
    ice?: { colors: RGB[]; crack: RGB };
    /** Little things in clusters (wildflowers, twigs), in the forest, and pebbles everywhere. */
    specks: RGB[];
    forestSpecks: RGB[];
    pebble: RGB;
    /** Baked contact shadow under props, as r, g, b. */
    shadow: RGB;
  };
  /** Grass tufts: how sparse (noise threshold, higher = fewer), their colours by place, and whether flowers grow. */
  grass: { threshold: number; field: number[]; forest: number[]; graveyard: number[]; flowers: boolean; blade?: { root: number; middle: number; tip: number } };
  water: { shallow: number; deep: number; foam: number; reeds: boolean };
  /** Upward-facing faces of every prop are whitened this much (snow lying on walls, rocks and pines). */
  snowCover: number;
  outerGround: number;
  mist: number;
  light: { sun: number; sunIntensity: number; sky: number; ground: number; ambientIntensity: number };
  /** What drifts in the air around the camera. */
  particles: 'fireflies' | 'snow';
}

export const GREENFIELD_THEME: ArenaTheme = {
  ground: {
    grass: [[64, 99, 56], [74, 112, 61], [85, 126, 66], [99, 138, 73], [113, 149, 79]],
    meadow: [[73, 115, 59], [85, 129, 64], [99, 143, 71], [115, 156, 78], [131, 168, 88]],
    forest: [[48, 59, 43], [57, 67, 47], [65, 73, 51], [63, 75, 48], [75, 85, 54]],
    graveyard: [[104, 104, 70], [118, 114, 76], [92, 92, 64], [130, 124, 84], [84, 82, 60]],
    dirt: [[119, 99, 70], [135, 113, 80], [151, 128, 91], [107, 90, 66]],
    shore: [[176, 156, 112], [190, 170, 124], [160, 140, 100]],
    bed: [[88, 74, 56], [100, 84, 62], [76, 64, 50]],
    flagstone: [[150, 142, 128], [136, 128, 116], [164, 156, 140], [124, 118, 108]],
    grout: [74, 70, 62],
    moss: [96, 116, 64],
    specks: [[240, 230, 200], [236, 210, 96], [196, 120, 170], [170, 150, 230]],
    forestSpecks: [[150, 90, 40], [120, 70, 34]],
    pebble: [146, 146, 116],
    shadow: [18, 33, 22]
  },
  grass: { threshold: 0.43, field: [0xa5c76e, 0xb5d47c, 0x8eb663, 0x9dc48a], forest: [0x728657, 0x819764, 0x677c53], graveyard: [0xa29867, 0x97966c, 0xb1a774], flowers: true },
  water: { shallow: 0x72bbaa, deep: 0x244f69, foam: 0xe6f2ec, reeds: true },
  snowCover: 0,
  outerGround: 0x627c3a,
  mist: 0xb8b2c8,
  // Cool purple-blue from above (what shadowed ground sees), warmth only from the sun.
  light: { sun: 0xffcf8f, sunIntensity: 3.0, sky: 0x7a6bc4, ground: 0x3b2f52, ambientIntensity: 3.6 },
  particles: 'fireflies'
};

/** Campo Nevado: wind-swept snow, frozen stone, a lake of cracked ice around dark open water, pale cold light and
 *  falling snow; a few dry tufts poke through. */
export const SNOWFIELD_THEME: ArenaTheme = {
  ground: {
    grass: [[214, 223, 235], [224, 231, 241], [233, 238, 246], [205, 215, 229], [242, 245, 250]],
    meadow: [[226, 233, 243], [236, 241, 248], [244, 247, 251], [218, 227, 239], [248, 250, 253]],
    // Bluish snow in the pines' shade.
    forest: [[186, 199, 217], [196, 208, 224], [176, 190, 210], [205, 215, 229], [168, 183, 205]],
    // Trampled grey snow among the graves.
    graveyard: [[188, 192, 202], [198, 202, 211], [178, 183, 194], [207, 210, 218], [170, 175, 187]],
    // Packed snow, a little earth showing through.
    dirt: [[198, 194, 188], [208, 204, 198], [188, 184, 178], [216, 213, 208]],
    // Slushy rim of the open water.
    shore: [[152, 184, 206], [140, 174, 200], [164, 194, 214]],
    bed: [[30, 48, 66], [36, 56, 76], [26, 42, 60]],
    flagstone: [[166, 172, 184], [152, 158, 171], [180, 186, 197], [142, 148, 162]],
    grout: [98, 104, 118],
    // Frost in the cracks.
    moss: [222, 232, 242],
    ice: { colors: [[176, 210, 232], [164, 201, 227], [189, 219, 238], [152, 191, 220]], crack: [236, 244, 251] },
    specks: [[116, 112, 108], [96, 90, 86], [140, 136, 132]],
    forestSpecks: [[92, 84, 76], [74, 68, 62]],
    pebble: [128, 132, 140],
    shadow: [40, 58, 92]
  },
  // Few, dry, frosted straw tufts.
  grass: { threshold: 0.74, field: [0xffffff, 0xf2f0ea], forest: [0xe4e6e2, 0xd8dbd6], graveyard: [0xeae4d6, 0xdcd6c8], flowers: false, blade: { root: 0x8c8672, middle: 0xc8c1a2, tip: 0xece8d8 } },
  water: { shallow: 0x2f5f7a, deep: 0x0e2234, foam: 0xdbeaf5, reeds: false },
  snowCover: 0.78,
  outerGround: 0xdfe7f0,
  mist: 0xd4dcea,
  light: { sun: 0xe8f0ff, sunIntensity: 2.6, sky: 0x8fa4d8, ground: 0x3a4660, ambientIntensity: 3.4 },
  particles: 'snow'
};

const THEMES: Record<string, ArenaTheme> = { greenfield: GREENFIELD_THEME, snowfield: SNOWFIELD_THEME };

/** The look of the active arena layout. */
export function activeArenaTheme(): ArenaTheme {
  return THEMES[ACTIVE_LAYOUT.id] ?? GREENFIELD_THEME;
}
