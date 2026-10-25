/** Authored arena layout for the 3D game (game units = old 2D pixels; 32 units = 1 m). The zones, the lake and the
 *  trails are fixed so players learn the map; a run's seed only varies the detail inside each zone (which pillar is
 *  broken, where each tree stands). core/world/ArenaMap turns this into obstacles + decoration.
 *
 *  Rough map (north = up in sim coordinates, y grows downward):
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

/** 110 m across. Grown from the 2D build's 2800 so every zone fits with grassland between them. */
export const ARENA_SIZE = 3520;
export const ARENA_CENTER: Point = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
/** The player spawns here; nothing that collides is ever placed inside this radius. */
export const SPAWN_CLEARING_RADIUS = 300;

export const ZONES: ZoneSpec[] = [
  { kind: 'meadow', blobs: [{ x: 1760, y: 1760, radius: 560 }] },
  { kind: 'ruins', blobs: [{ x: 700, y: 1900, radius: 560 }, { x: 860, y: 1480, radius: 360 }] },
  { kind: 'forest', blobs: [{ x: 760, y: 700, radius: 620 }, { x: 1400, y: 470, radius: 380 }] },
  { kind: 'lake', blobs: [{ x: 2520, y: 1000, radius: 640 }] },
  { kind: 'graveyard', blobs: [{ x: 2800, y: 2380, radius: 460 }] },
  { kind: 'camp', blobs: [{ x: 1720, y: 2940, radius: 400 }] }
];

/** Deep water: a star-shaped outline around `center` whose radius wobbles with a few harmonics (smooth, organic,
 *  and cheap to evaluate both for collision and for painting the shore). Blocks movement, not projectiles. */
export const LAKE = {
  center: { x: 2560, y: 960 },
  radius: 420,
  /** [amplitude (units), frequency (lobes), phase] */
  harmonics: [[70, 2, 0.4], [40, 3, 1.9], [22, 5, 0.7]] as Array<[number, number, number]>,
  /** Sand/mud band painted around the water. */
  shoreWidth: 70
};

/** Dirt trails from the meadow out to every zone (painted, walkable, kept clear of obstacles). */
export const TRAILS: Point[][] = [
  [{ x: 1760, y: 1760 }, { x: 1320, y: 1840 }, { x: 980, y: 1870 }],
  [{ x: 1760, y: 1760 }, { x: 1520, y: 1320 }, { x: 1180, y: 900 }],
  [{ x: 1760, y: 1760 }, { x: 2080, y: 1460 }, { x: 2380, y: 1430 }],
  [{ x: 1760, y: 1760 }, { x: 2280, y: 2080 }, { x: 2640, y: 2300 }],
  [{ x: 1760, y: 1760 }, { x: 1740, y: 2340 }, { x: 1720, y: 2860 }]
];
export const TRAIL_WIDTH = 46;

/** The ruined temple's outer walls (a rectangle with doorway gaps) and inner sanctum, in game units. */
export const TEMPLE = {
  center: { x: 700, y: 1880 },
  halfWidth: 380,
  halfHeight: 300,
  rotation: 0.12,
  /** Doorways along the outer wall, as fractions of the perimeter walked clockwise from the north-west corner
   *  (0..1), and their width in units. The middle of each side: north 0.14, east 0.39 (where the trail enters),
   *  south 0.64, west 0.89. */
  doorways: [{ at: 0.14, width: 140 }, { at: 0.39, width: 170 }, { at: 0.64, width: 150 }, { at: 0.89, width: 120 }],
  sanctum: { halfWidth: 130, halfHeight: 100 }
};

export const GRAVEYARD = {
  center: { x: 2800, y: 2380 },
  halfWidth: 300,
  halfHeight: 220,
  rotation: -0.08,
  /** Gate gap in the fence where the trail arrives: the north end of the west side (fraction of the perimeter
   *  walked clockwise from the north-west corner). */
  gateAt: 0.975,
  gateWidth: 140,
  crypt: { x: 2880, y: 2220, halfWidth: 90, halfHeight: 70 }
};

export const CAMP = {
  center: { x: 1720, y: 2940 },
  fire: { x: 1720, y: 2930 }
};

/** In the meadow's south-west quarter, clear of every trail and outside the spawn clearing. */
export const STONE_CIRCLE = { center: { x: 1450, y: 2160 }, radius: 150, stones: 8 };

export const SHRINE = { x: 2520, y: 1440 };
