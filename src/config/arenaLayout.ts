/** Authored arena layouts for the 3D game (game units = old 2D pixels; 32 units = 1 m). The zones, the lake and the
 *  trails are fixed so players learn the map; a run's seed only varies the detail inside each zone (which pillar is
 *  broken, where each tree stands). core/world/ArenaMap turns the active layout into obstacles + decoration.
 *
 *  Every arena shares one shape — a central clearing, five regions on trails around it, three of them guardian
 *  arenas — so the generator, the guardians and the renderer work on any of them. The exports below (ZONES, LAKE,
 *  TEMPLE...) are the *active* layout's: `useArenaLayout` swaps them before a map is generated, and every importer
 *  reads the new values (ES module bindings are live). Greenfield is active by default.
 *
 *  Greenfield (north = up in sim coordinates, y grows downward):
 *
 *     Dead forest            Lake (+ shrine on the south shore)
 *            \                /
 *     Ruined temple ── Central meadow ── Graveyard + crypt
 *                          |
 *                         Camp
 */

export interface Point { x: number; y: number; }

export type ZoneKind = 'meadow' | 'ruins' | 'forest' | 'lake' | 'graveyard' | 'camp';

/** A zone is the soft union of a few circles — organic blobs that blend into the grassland around them. */
export interface ZoneSpec {
  kind: ZoneKind;
  blobs: Array<Point & { radius: number }>;
}

/** Deep water: a star-shaped outline around `center` whose radius wobbles with a few harmonics (smooth, organic,
 *  and cheap to evaluate both for collision and for painting the shore). Blocks movement, not projectiles. */
export interface LakeSpec {
  center: Point;
  radius: number;
  /** [amplitude (units), frequency (lobes), phase] */
  harmonics: Array<[number, number, number]>;
  /** Sand/mud band painted around the water. */
  shoreWidth: number;
}

/** The ruin with outer walls (a rectangle with doorway gaps) and an inner sanctum: a guardian's arena. */
export interface TempleSpec {
  center: Point;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
  /** Doorways along the outer wall, as fractions of the perimeter walked clockwise from the north-west corner
   *  (0..1), and their width in units. The middle of each side: north 0.14, east 0.39, south 0.64, west 0.89. */
  doorways: Array<{ at: number; width: number }>;
  sanctum: { halfWidth: number; halfHeight: number };
}

export interface GraveyardSpec {
  center: Point;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
  /** Gate gap in the fence where the trail arrives (fraction of the perimeter walked clockwise from the north-west
   *  corner). */
  gateAt: number;
  gateWidth: number;
  crypt: Point & { halfWidth: number; halfHeight: number };
}

export interface ArenaLayout {
  id: string;
  name: string;
  zones: ZoneSpec[];
  lake: LakeSpec;
  /** Dirt trails from the centre out to every zone (painted, walkable, kept clear of obstacles). */
  trails: Point[][];
  temple: TempleSpec;
  graveyard: GraveyardSpec;
  camp: { center: Point; fire: Point };
  /** Clear of every trail and outside the spawn clearing. */
  stoneCircle: { center: Point; radius: number; stones: number };
  shrine: Point;
  /** The zone guardians that rise here, in the order the stage's slots call them (MiniBossKind ids). */
  guardians: string[];
  /** Neutral creatures living here (NeutralSystem): each group's variant, home and how many share it. */
  neutrals?: NeutralSpot[];
}

/** A group of neutral creatures (NEUTRAL_VARIANTS id) around one home spot; the group wakes together. */
export interface NeutralSpot {
  variant: string;
  home: Point;
  count: number;
  /** The first of the group is this variant instead (a stag leading does). */
  leader?: string;
}

/** 110 m across. Grown from the 2D build's 2800 so every zone fits with grassland between them. */
export const ARENA_SIZE = 3520;
export const ARENA_CENTER: Point = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
/** The player spawns here; nothing that collides is ever placed inside this radius. */
export const SPAWN_CLEARING_RADIUS = 300;
export const TRAIL_WIDTH = 46;

export const GREENFIELD: ArenaLayout = {
  id: 'greenfield',
  name: 'Greenfield',
  zones: [
    { kind: 'meadow', blobs: [{ x: 1760, y: 1760, radius: 560 }] },
    { kind: 'ruins', blobs: [{ x: 700, y: 1900, radius: 560 }, { x: 860, y: 1480, radius: 360 }] },
    { kind: 'forest', blobs: [{ x: 760, y: 700, radius: 620 }, { x: 1400, y: 470, radius: 380 }] },
    { kind: 'lake', blobs: [{ x: 2520, y: 1000, radius: 640 }] },
    { kind: 'graveyard', blobs: [{ x: 2800, y: 2380, radius: 460 }] },
    { kind: 'camp', blobs: [{ x: 1720, y: 2940, radius: 400 }] }
  ],
  lake: {
    center: { x: 2560, y: 960 },
    radius: 420,
    harmonics: [[70, 2, 0.4], [40, 3, 1.9], [22, 5, 0.7]],
    shoreWidth: 70
  },
  trails: [
    [{ x: 1760, y: 1760 }, { x: 1320, y: 1840 }, { x: 980, y: 1870 }],
    [{ x: 1760, y: 1760 }, { x: 1520, y: 1320 }, { x: 1180, y: 900 }],
    [{ x: 1760, y: 1760 }, { x: 2080, y: 1460 }, { x: 2380, y: 1430 }],
    [{ x: 1760, y: 1760 }, { x: 2280, y: 2080 }, { x: 2640, y: 2300 }],
    [{ x: 1760, y: 1760 }, { x: 1740, y: 2340 }, { x: 1720, y: 2860 }]
  ],
  // The trail enters by the east doorway.
  temple: {
    center: { x: 700, y: 1880 },
    halfWidth: 380,
    halfHeight: 300,
    rotation: 0.12,
    doorways: [{ at: 0.14, width: 140 }, { at: 0.39, width: 170 }, { at: 0.64, width: 150 }, { at: 0.89, width: 120 }],
    sanctum: { halfWidth: 130, halfHeight: 100 }
  },
  // The gate is the north end of the west side, where the trail arrives.
  graveyard: {
    center: { x: 2800, y: 2380 },
    halfWidth: 300,
    halfHeight: 220,
    rotation: -0.08,
    gateAt: 0.975,
    gateWidth: 140,
    crypt: { x: 2880, y: 2220, halfWidth: 90, halfHeight: 70 }
  },
  camp: { center: { x: 1720, y: 2940 }, fire: { x: 1720, y: 2930 } },
  // In the meadow's south-west quarter.
  stoneCircle: { center: { x: 1450, y: 2160 }, radius: 150, stones: 8 },
  shrine: { x: 2520, y: 1440 },
  guardians: ['gravedigger', 'lakeSpirit', 'templeGuardian'],
  // Boars root around the dead forest's edges, off the trails; deer graze the open grass between the zones; hives
  // hang in the forest; a mimic waits in the ruins and another by the camp, passing for loot.
  neutrals: [
    { variant: 'boar', home: { x: 560, y: 1020 }, count: 2 },
    { variant: 'boar', home: { x: 1120, y: 620 }, count: 1 },
    { variant: 'boar', home: { x: 1560, y: 420 }, count: 2 },
    { variant: 'doe', leader: 'stag', home: { x: 2240, y: 1980 }, count: 3 },
    { variant: 'doe', leader: 'stag', home: { x: 1180, y: 2560 }, count: 2 },
    { variant: 'hive', home: { x: 900, y: 520 }, count: 1 },
    { variant: 'hive', home: { x: 380, y: 760 }, count: 1 },
    { variant: 'mimic', home: { x: 520, y: 2120 }, count: 1 },
    { variant: 'mimic', home: { x: 2140, y: 3060 }, count: 1 }
  ]
};

/** Campo Nevado: a snow field of medieval ruins worn down by time, from the approved concept
 *  (art-source/arenas/snowfield/concept-topdown.png, 2048 px = 3520 units). Same shape as Greenfield:
 *
 *     Frozen pines           Frozen lake (+ ice shrine on the south shore)
 *            \                /
 *     Castle keep ── Wind-swept clearing ── Chapel graveyard
 *                          |
 *                     Watch camp
 *
 *  The castle opens on three sides (its east gate, where the trail arrives, plus north and south breaches) so the
 *  horde can't pin the hero inside. The lake is ice you can walk on: only the dark open water near its middle is
 *  "the lake" that blocks. */
export const SNOWFIELD: ArenaLayout = {
  id: 'snowfield',
  name: 'Campo Nevado',
  zones: [
    { kind: 'meadow', blobs: [{ x: 1760, y: 1760, radius: 520 }] },
    { kind: 'ruins', blobs: [{ x: 720, y: 1720, radius: 640 }] },
    { kind: 'forest', blobs: [{ x: 790, y: 640, radius: 600 }, { x: 1370, y: 460, radius: 340 }] },
    // The whole frozen surface: walkable, kept clear of props.
    { kind: 'lake', blobs: [{ x: 2700, y: 560, radius: 600 }] },
    { kind: 'graveyard', blobs: [{ x: 2800, y: 2080, radius: 560 }] },
    { kind: 'camp', blobs: [{ x: 1680, y: 2720, radius: 520 }] }
  ],
  // The open water in the ice.
  lake: {
    center: { x: 2760, y: 620 },
    radius: 200,
    harmonics: [[34, 2, 0.4], [20, 3, 1.9], [12, 5, 0.7]],
    shoreWidth: 40
  },
  trails: [
    // To the castle's east gate.
    [{ x: 1760, y: 1760 }, { x: 1460, y: 1730 }, { x: 1200, y: 1720 }],
    // Into the pines.
    [{ x: 1760, y: 1760 }, { x: 1640, y: 1460 }, { x: 1460, y: 1020 }, { x: 1040, y: 780 }],
    // To the ice shrine.
    [{ x: 1760, y: 1760 }, { x: 1970, y: 1320 }, { x: 2280, y: 1140 }, { x: 2440, y: 1150 }],
    // To the graveyard gate.
    [{ x: 1760, y: 1760 }, { x: 2060, y: 1700 }, { x: 2350, y: 1790 }],
    // Down to the camp.
    [{ x: 1760, y: 1760 }, { x: 1720, y: 2180 }, { x: 1690, y: 2560 }]
  ],
  // The castle: north breach, east gate, south breach. The west wall stands against the cliffs.
  temple: {
    center: { x: 720, y: 1720 },
    halfWidth: 470,
    halfHeight: 500,
    rotation: 0,
    doorways: [{ at: 0.14, width: 170 }, { at: 0.39, width: 190 }, { at: 0.64, width: 170 }],
    sanctum: { halfWidth: 90, halfHeight: 70 }
  },
  // The chapel stands in the north half; the gate is the north end of the west side, where the trail arrives.
  graveyard: {
    center: { x: 2800, y: 2080 },
    halfWidth: 420,
    halfHeight: 400,
    rotation: 0,
    gateAt: 0.975,
    gateWidth: 170,
    crypt: { x: 2860, y: 1790, halfWidth: 120, halfHeight: 90 }
  },
  camp: { center: { x: 1680, y: 2720 }, fire: { x: 1680, y: 2720 } },
  // Frost-covered stones south-west of the clearing.
  stoneCircle: { center: { x: 1380, y: 2060 }, radius: 130, stones: 7 },
  shrine: { x: 2560, y: 1060 },
  // The castle's Cavaleiro Congelado first; the lake and the chapel keep Greenfield's guardians until theirs arrive.
  guardians: ['frostKnight', 'lakeSpirit', 'gravedigger']
};

export const ARENA_LAYOUTS: Record<string, ArenaLayout> = { greenfield: GREENFIELD, snowfield: SNOWFIELD };

// ── The active layout ───────────────────────────────────────────────────────────────────────────────────────────

export let ACTIVE_LAYOUT: ArenaLayout = GREENFIELD;
export let ZONES: ZoneSpec[] = GREENFIELD.zones;
export let LAKE: LakeSpec = GREENFIELD.lake;
export let TRAILS: Point[][] = GREENFIELD.trails;
export let TEMPLE: TempleSpec = GREENFIELD.temple;
export let GRAVEYARD: GraveyardSpec = GREENFIELD.graveyard;
export let CAMP: ArenaLayout['camp'] = GREENFIELD.camp;
export let STONE_CIRCLE: ArenaLayout['stoneCircle'] = GREENFIELD.stoneCircle;
export let SHRINE: Point = GREENFIELD.shrine;

/** Makes `layout` the arena every generator, guardian and painter reads from. Call before generating a map. */
export function useArenaLayout(layout: ArenaLayout): void {
  ACTIVE_LAYOUT = layout;
  ZONES = layout.zones;
  LAKE = layout.lake;
  TRAILS = layout.trails;
  TEMPLE = layout.temple;
  GRAVEYARD = layout.graveyard;
  CAMP = layout.camp;
  STONE_CIRCLE = layout.stoneCircle;
  SHRINE = layout.shrine;
}
