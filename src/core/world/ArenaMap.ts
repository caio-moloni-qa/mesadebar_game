import { ARENA_CENTER, ARENA_SIZE, CAMP, GRAVEYARD, LAKE, Point, SHRINE, SPAWN_CLEARING_RADIUS, STONE_CIRCLE, TEMPLE, TRAILS, TRAIL_WIDTH, ZONES, ZoneKind } from '../../config/arenaLayout';
import { SpatialHash } from '../SpatialHash';
import { Circle, OrientedBox, resolveCircleCircle, resolveCircleOrientedBox } from '../collision';
import { Rng, Vec2, createRng, floatBetween, intBetween } from '../math';

export type ObstacleKind =
  | 'pillar' | 'tower' | 'wall' | 'fallenColumn' | 'tree' | 'deadTree' | 'log' | 'gravestone' | 'fence' | 'crypt'
  | 'standingStone' | 'tent' | 'brazier' | 'campfire' | 'crate' | 'cart' | 'rock' | 'shrine';

interface ObstacleBase {
  kind: ObstacleKind;
  x: number;
  y: number;
  /** Tall obstacles also stop projectiles (walls, trees, pillars); low ones only block movement. */
  tall: boolean;
  /** 0..1 seeded value the renderer uses for visual variation (broken pillar height, tree shape…). */
  variant: number;
  /** Radius of a circle enclosing the whole shape — broad-phase size. */
  bound: number;
}
export type Obstacle =
  | (ObstacleBase & { shape: 'circle'; radius: number; rotation: number })
  | (ObstacleBase & { shape: 'box'; halfWidth: number; halfHeight: number; rotation: number });

export type DecorKind = 'bush' | 'reeds' | 'lilyPad' | 'rubble';
/** Purely visual dressing: no collision, never blocks anything. */
export interface Decor { kind: DecorKind; x: number; y: number; rotation: number; variant: number; }

/** Obstacles are never placed this close to the border, where the edge mist thickens. */
const EDGE_MARGIN = 170;
/** Extra clearance kept between neighbouring obstacles: wider than any walker (radius 18 → 36 across) so the
 *  forest and the scattered rocks never seal an area off. */
const OBSTACLE_GAP = 56;
const RESOLVE_PASSES = 3;

/** The arena as gameplay sees it: every obstacle (with its exact collision shape), the lake's deep water and the
 *  zones, generated deterministically from the authored layout (config/arenaLayout) plus a run seed. The renderer
 *  draws exactly these obstacles, so whatever blocks you is what you see. Pure TS, no rendering. */
export class ArenaMap {
  readonly obstacles: Obstacle[] = [];
  readonly decor: Decor[] = [];
  private readonly hash = new SpatialHash<Obstacle>(128);
  private readonly scratch: Obstacle[] = [];

  /** How full the lake is, 0..1 (O Espírito do Lago drains it for its fight). Deep water only blocks while the lake
   *  is mostly full; the renderer lowers the water to match. The map is shared across runs, so each run resets it. */
  lakeLevel = 1;

  /** `authored` = built from the layout (zones, lake, trails); an open test field has none of them. */
  private constructor(readonly size: number, readonly authored: boolean) {}

  /** Whether the lake's deep water currently blocks movement. */
  get lakeBlocks(): boolean {
    return this.authored && this.lakeLevel > 0.5;
  }

  /** The authored arena, with seeded detail. */
  static generate(seed: number): ArenaMap {
    const map = new ArenaMap(ARENA_SIZE, true);
    new ArenaGenerator(map, createRng(seed ^ 0x5eed)).run();
    map.obstacles.forEach((obstacle) => map.hash.insert(obstacle, obstacle.bound));
    return map;
  }

  /** An empty square field (tests and sandbox): no obstacles, no water. */
  static open(size: number): ArenaMap {
    return new ArenaMap(size, false);
  }

  /** A square field with exactly these obstacles (tests: a wall between an enemy and the hero, etc.). */
  static withObstacles(size: number, obstacles: Obstacle[]): ArenaMap {
    const map = new ArenaMap(size, false);
    obstacles.forEach((obstacle) => {
      map.obstacles.push(obstacle);
      map.hash.insert(obstacle, obstacle.bound);
    });
    return map;
  }

  get center(): Vec2 {
    return { x: this.size / 2, y: this.size / 2 };
  }

  /** Signed distance from the lake's shoreline: negative in deep water, positive on land. */
  shoreDistance(x: number, y: number): number {
    if (!this.authored) return Number.POSITIVE_INFINITY;
    return lakeShoreDistance(x, y);
  }

  /** How much of `kind` is at a point, 0..1 (soft blob edges). */
  zoneWeight(kind: ZoneKind, x: number, y: number): number {
    if (!this.authored) return 0;
    return zoneWeight(kind, x, y);
  }

  trailDistance(x: number, y: number): number {
    if (!this.authored) return Number.POSITIVE_INFINITY;
    return trailDistance(x, y);
  }

  /** Pushes a body out of every obstacle, the deep water and the arena bounds, in place. Called after each move:
   *  resolving the overlap along the shortest axis is what makes walkers slide along walls instead of sticking. */
  resolve(body: Circle): void {
    for (let pass = 0; pass < RESOLVE_PASSES; pass += 1) {
      let moved = false;
      this.scratch.length = 0;
      for (const obstacle of this.hash.queryRadius(body, body.radius, this.scratch)) {
        const push = pushOut(body, obstacle);
        if (!push) continue;
        body.x += push.x;
        body.y += push.y;
        moved = true;
      }
      if (this.lakeBlocks) {
        const shore = lakeShoreDistance(body.x, body.y);
        if (shore < body.radius) {
          const dx = body.x - LAKE.center.x;
          const dy = body.y - LAKE.center.y;
          const length = Math.hypot(dx, dy);
          // Dead centre of the lake has no outward direction; any direction works there.
          const nx = length > 1e-6 ? dx / length : 1;
          const ny = length > 1e-6 ? dy / length : 0;
          body.x += nx * (body.radius - shore);
          body.y += ny * (body.radius - shore);
          moved = true;
        }
      }
      body.x = Math.min(this.size - body.radius, Math.max(body.radius, body.x));
      body.y = Math.min(this.size - body.radius, Math.max(body.radius, body.y));
      if (!moved) break;
    }
  }

  /** True when a projectile of this radius at this point is inside a tall obstacle. Water never blocks shots. */
  blocksProjectile(x: number, y: number, radius: number): boolean {
    this.scratch.length = 0;
    const probe = { x, y, radius };
    return this.hash.queryRadius(probe, radius, this.scratch).some((obstacle) => obstacle.tall && pushOut(probe, obstacle) !== null);
  }

  /** True when nothing tall stands on the straight line between two points (sampled every 16 units) — what a
   *  projectile weapon needs before it bothers aiming at a target. */
  hasLineOfSight(from: Vec2, to: Vec2): boolean {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.ceil(distance / 16);
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      if (this.blocksProjectile(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 4)) return false;
    }
    return true;
  }

  isWalkable(x: number, y: number, radius: number): boolean {
    if (x < radius || y < radius || x > this.size - radius || y > this.size - radius) return false;
    if (this.lakeBlocks && lakeShoreDistance(x, y) < radius) return false;
    this.scratch.length = 0;
    const probe = { x, y, radius };
    return !this.hash.queryRadius(probe, radius, this.scratch).some((obstacle) => pushOut(probe, obstacle) !== null);
  }

  /** The closest walkable point to (x, y), searching outward in rings — used to keep spawns and drops out of walls
   *  and water. Falls back to the arena centre (always clear) if nothing is found. */
  nearestWalkable(x: number, y: number, radius: number): Vec2 {
    if (this.isWalkable(x, y, radius)) return { x, y };
    for (let ring = 1; ring <= 30; ring += 1) {
      const distance = ring * 24;
      const steps = 8 + ring * 4;
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;
        if (this.isWalkable(px, py, radius)) return { x: px, y: py };
      }
    }
    return this.center;
  }

  /** Light sources the renderer should give a flame and a point light. */
  get fires(): Obstacle[] {
    return this.obstacles.filter((obstacle) => obstacle.kind === 'brazier' || obstacle.kind === 'campfire');
  }

  /** Generator-only: register an obstacle. */
  add(obstacle: Obstacle): void {
    this.obstacles.push(obstacle);
  }
}

function pushOut(body: Circle, obstacle: Obstacle): Vec2 | null {
  return obstacle.shape === 'circle'
    ? resolveCircleCircle(body, obstacle)
    : resolveCircleOrientedBox(body, obstacle as OrientedBox);
}

// ── Layout geometry (pure functions shared by the map, the generator and the ground painter) ─────────────────────

export function lakeRadiusAt(angle: number): number {
  return LAKE.harmonics.reduce((radius, [amplitude, frequency, phase]) => radius + amplitude * Math.sin(angle * frequency + phase), LAKE.radius);
}

export function lakeShoreDistance(x: number, y: number): number {
  const dx = x - LAKE.center.x;
  const dy = y - LAKE.center.y;
  return Math.hypot(dx, dy) - lakeRadiusAt(Math.atan2(dy, dx));
}

/** The lake outline as a closed polygon (for the water mesh). */
export function lakeOutline(points = 64): Point[] {
  return Array.from({ length: points }, (_value, index) => {
    const angle = (index / points) * Math.PI * 2;
    const radius = lakeRadiusAt(angle);
    return { x: LAKE.center.x + Math.cos(angle) * radius, y: LAKE.center.y + Math.sin(angle) * radius };
  });
}

export function zoneWeight(kind: ZoneKind, x: number, y: number): number {
  let weight = 0;
  for (const zone of ZONES) {
    if (zone.kind !== kind) continue;
    for (const blob of zone.blobs) {
      const distance = Math.hypot(x - blob.x, y - blob.y);
      weight = Math.max(weight, Math.min(1, Math.max(0, (blob.radius - distance) / (blob.radius * 0.35))));
    }
  }
  return weight;
}

export function trailDistance(x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const trail of TRAILS) {
    for (let index = 0; index < trail.length - 1; index += 1) best = Math.min(best, segmentDistance(x, y, trail[index], trail[index + 1]));
  }
  return best;
}

function segmentDistance(x: number, y: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
}

/** Local → world for an authored rotated frame (temple, graveyard). */
function frame(center: Point, rotation: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return (lx: number, ly: number): Point => ({ x: center.x + lx * cos - ly * sin, y: center.y + lx * sin + ly * cos });
}

// ── Generator ────────────────────────────────────────────────────────────────────────────────────────────────────

class ArenaGenerator {
  constructor(private readonly map: ArenaMap, private readonly rng: Rng) {}

  run(): void {
    this.temple();
    this.graveyard();
    this.camp();
    this.stoneCircle();
    this.shrine();
    this.forest();
    this.lakeShore();
    this.grassland();
  }

  // Placement helpers ───────────────────────────────────────────────────────────────────────────────────────────

  private circle(kind: ObstacleKind, x: number, y: number, radius: number, tall: boolean, rotation = this.rng() * Math.PI * 2): void {
    this.map.add({ kind, shape: 'circle', x, y, radius, rotation, tall, variant: this.rng(), bound: radius });
  }

  private box(kind: ObstacleKind, x: number, y: number, halfWidth: number, halfHeight: number, rotation: number, tall: boolean): void {
    this.map.add({ kind, shape: 'box', x, y, halfWidth, halfHeight, rotation, tall, variant: this.rng(), bound: Math.hypot(halfWidth, halfHeight) });
  }

  private decor(kind: DecorKind, x: number, y: number): void {
    this.map.decor.push({ kind, x, y, rotation: this.rng() * Math.PI * 2, variant: this.rng() });
  }

  /** Free spot test for scattered props: inside the margin, on land, off trails, out of the spawn clearing and
   *  clear of every obstacle placed so far (with a walking gap). */
  private free(x: number, y: number, radius: number, { allowTrail = false } = {}): boolean {
    if (x < EDGE_MARGIN || y < EDGE_MARGIN || x > ARENA_SIZE - EDGE_MARGIN || y > ARENA_SIZE - EDGE_MARGIN) return false;
    if (lakeShoreDistance(x, y) < radius + 30) return false;
    if (!allowTrail && trailDistance(x, y) < TRAIL_WIDTH / 2 + radius + 12) return false;
    if (Math.hypot(x - ARENA_CENTER.x, y - ARENA_CENTER.y) < SPAWN_CLEARING_RADIUS + radius) return false;
    return !this.map.obstacles.some((other) => Math.hypot(other.x - x, other.y - y) < other.bound + radius + OBSTACLE_GAP);
  }

  /** Scatter `count` of something inside a zone (weight above `minWeight`), trying a bounded number of spots. */
  private scatter(zone: ZoneKind | null, count: number, radius: number, place: (x: number, y: number) => void, minWeight = 0.5): void {
    let placed = 0;
    for (let attempt = 0; attempt < count * 30 && placed < count; attempt += 1) {
      const x = floatBetween(this.rng, EDGE_MARGIN, ARENA_SIZE - EDGE_MARGIN);
      const y = floatBetween(this.rng, EDGE_MARGIN, ARENA_SIZE - EDGE_MARGIN);
      if (zone && zoneWeight(zone, x, y) < minWeight) continue;
      if (!zone && ZONES.some((spec) => zoneWeight(spec.kind, x, y) > 0.15)) continue;
      if (!this.free(x, y, radius)) continue;
      place(x, y);
      placed += 1;
    }
  }

  /** Walls along a rotated rectangle's perimeter, block by block, leaving the doorway gaps (and a few ruined holes). */
  private perimeter(center: Point, halfWidth: number, halfHeight: number, rotation: number, block: number, kind: ObstacleKind, thickness: number, tall: boolean, gaps: Array<{ at: number; width: number }>, ruin: number): void {
    const toWorld = frame(center, rotation);
    const sides = [
      { from: [-halfWidth, -halfHeight], to: [halfWidth, -halfHeight] },
      { from: [halfWidth, -halfHeight], to: [halfWidth, halfHeight] },
      { from: [halfWidth, halfHeight], to: [-halfWidth, halfHeight] },
      { from: [-halfWidth, halfHeight], to: [-halfWidth, -halfHeight] }
    ];
    const total = 4 * halfWidth + 4 * halfHeight;
    let walked = 0;
    sides.forEach(({ from, to }) => {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const count = Math.max(1, Math.round(length / block));
      const step = length / count;
      const direction = Math.atan2(to[1] - from[1], to[0] - from[0]);
      for (let index = 0; index < count; index += 1) {
        const along = walked + (index + 0.5) * step;
        // Distance along the closed perimeter wraps around: a gate near the starting corner also cuts the first
        // blocks of the first side, not just the last blocks of the last one.
        const inGap = gaps.some((gap) => {
          const offset = Math.abs(along - gap.at * total) % total;
          return Math.min(offset, total - offset) < gap.width / 2 + step / 2;
        });
        if (inGap || this.rng() < ruin) continue;
        const t = (index + 0.5) / count;
        const point = toWorld(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
        this.box(kind, point.x, point.y, step / 2, thickness / 2, rotation + direction, tall);
      }
      walked += length;
    });
  }

  // Zones ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Ruined temple: broken outer walls with four doorways, two colonnades, an inner sanctum, a toppled tower, fallen
   *  columns and rubble — corridors and chokepoints. */
  private temple(): void {
    const { center, halfWidth, halfHeight, rotation, doorways, sanctum } = TEMPLE;
    const toWorld = frame(center, rotation);
    this.perimeter(center, halfWidth, halfHeight, rotation, 70, 'wall', 24, true, doorways, 0.1);
    this.perimeter(center, sanctum.halfWidth, sanctum.halfHeight, rotation, 60, 'wall', 22, true, [{ at: 0.39, width: 90 }], 0);
    for (const side of [-1, 1]) {
      for (let row = -2; row <= 2; row += 1) {
        const point = toWorld(side * 250, row * 105);
        this.circle('pillar', point.x, point.y, 16, true);
      }
    }
    const tower = toWorld(-halfWidth - 30, -halfHeight + 40);
    this.circle('tower', tower.x, tower.y, 72, true);
    for (let index = 0; index < 6; index += 1) {
      const point = toWorld(floatBetween(this.rng, -halfWidth + 60, halfWidth - 60), floatBetween(this.rng, -halfHeight + 60, halfHeight - 60));
      if (Math.abs(point.x - center.x) < sanctum.halfWidth + 60 && Math.abs(point.y - center.y) < sanctum.halfHeight + 60) continue;
      if (this.free(point.x, point.y, 50, { allowTrail: true })) this.box('fallenColumn', point.x, point.y, 46, 14, this.rng() * Math.PI, false);
    }
    for (let index = 0; index < 40; index += 1) {
      const point = toWorld(floatBetween(this.rng, -halfWidth - 80, halfWidth + 80), floatBetween(this.rng, -halfHeight - 80, halfHeight + 80));
      this.decor('rubble', point.x, point.y);
    }
  }

  /** Fenced graveyard (low iron fence with a gate facing the trail), gravestone rows and a tall crypt. */
  private graveyard(): void {
    const { center, halfWidth, halfHeight, rotation, gateAt, gateWidth, crypt } = GRAVEYARD;
    const toWorld = frame(center, rotation);
    this.perimeter(center, halfWidth, halfHeight, rotation, 60, 'fence', 8, false, [{ at: gateAt, width: gateWidth }], 0.04);
    this.box('crypt', crypt.x, crypt.y, crypt.halfWidth, crypt.halfHeight, rotation, true);
    for (let row = -2; row <= 2; row += 1) {
      for (let column = -3; column <= 3; column += 1) {
        const point = toWorld(column * 75 + floatBetween(this.rng, -8, 8), row * 80 + 20);
        if (Math.abs(point.x - crypt.x) < crypt.halfWidth + 50 && Math.abs(point.y - crypt.y) < crypt.halfHeight + 50) continue;
        if (trailDistance(point.x, point.y) < TRAIL_WIDTH / 2 + 30) continue; // keep the path from the gate clear
        if (this.rng() < 0.15) continue;
        this.box('gravestone', point.x, point.y, 11, 5, rotation + floatBetween(this.rng, -0.2, 0.2), false);
      }
    }
    for (let index = 0; index < 3; index += 1) {
      const point = toWorld(floatBetween(this.rng, -halfWidth + 40, halfWidth - 40), floatBetween(this.rng, -halfHeight + 40, halfHeight - 40));
      if (this.free(point.x, point.y, 14, { allowTrail: true })) this.circle('deadTree', point.x, point.y, 12, true);
    }
  }

  /** Camp around a fire: tents facing it, log benches, crates, a cart, and braziers at the entrance. */
  private camp(): void {
    const { center, fire } = CAMP;
    this.circle('campfire', fire.x, fire.y, 26, false);
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + 0.6;
      const x = fire.x + Math.cos(angle) * 200;
      const y = fire.y + Math.sin(angle) * 200;
      if (this.free(x, y, 70)) this.box('tent', x, y, 56, 44, angle + Math.PI / 2, true);
    }
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2 + 0.2;
      const x = fire.x + Math.cos(angle) * 85;
      const y = fire.y + Math.sin(angle) * 85;
      if (trailDistance(x, y) < TRAIL_WIDTH / 2 + 50) continue; // the bench ring leaves the trail's end open
      this.box('log', x, y, 42, 11, angle + Math.PI / 2, false);
    }
    this.scatter('camp', 7, 20, (x, y) => this.box('crate', x, y, 15, 15, this.rng() * Math.PI, false), 0.3);
    this.scatter('camp', 1, 60, (x, y) => this.box('cart', x, y, 52, 28, this.rng() * Math.PI, true), 0.3);
    for (const side of [-1, 1]) {
      const x = center.x + side * 90;
      const y = center.y - 300;
      if (this.free(x, y, 14, { allowTrail: true })) this.circle('brazier', x, y, 13, true);
    }
  }

  /** Ring of standing stones in the meadow, one toppled; a pair of braziers lights the spawn clearing. */
  private stoneCircle(): void {
    const { center, radius, stones } = STONE_CIRCLE;
    const fallen = intBetween(this.rng, 0, stones - 1);
    for (let index = 0; index < stones; index += 1) {
      const angle = (index / stones) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (index === fallen) this.box('fallenColumn', x + Math.cos(angle) * 30, y + Math.sin(angle) * 30, 40, 14, angle, false);
      else this.box('standingStone', x, y, 14, 9, angle + Math.PI / 2, true);
    }
    for (const angle of [-0.9, 2.3]) {
      const x = ARENA_CENTER.x + Math.cos(angle) * (SPAWN_CLEARING_RADIUS + 70);
      const y = ARENA_CENTER.y + Math.sin(angle) * (SPAWN_CLEARING_RADIUS + 70);
      if (this.free(x, y, 14, { allowTrail: true })) this.circle('brazier', x, y, 13, true);
    }
  }

  private shrine(): void {
    this.box('shrine', SHRINE.x, SHRINE.y, 32, 32, 0.2, true);
    for (const side of [-1, 1]) this.circle('brazier', SHRINE.x + side * 70, SHRINE.y + 40, 13, true);
  }

  /** Dense dead forest: Poisson-ish trees (min spacing), fallen logs, undergrowth — trails stay open. */
  private forest(): void {
    this.scatter('forest', 95, 12, (x, y) => this.circle('tree', x, y, 11, true), 0.35);
    this.scatter('forest', 12, 55, (x, y) => this.box('log', x, y, 50, 12, this.rng() * Math.PI, false), 0.5);
    for (let index = 0; index < 180; index += 1) {
      const x = floatBetween(this.rng, 0, ARENA_SIZE);
      const y = floatBetween(this.rng, 0, ARENA_SIZE);
      if (zoneWeight('forest', x, y) > 0.3 && lakeShoreDistance(x, y) > 20) this.decor('bush', x, y);
    }
  }

  /** Reeds along the waterline, lily pads on the water, a few shore rocks. */
  private lakeShore(): void {
    for (let index = 0; index < 520; index += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = lakeRadiusAt(angle) + floatBetween(this.rng, -20, 45);
      const x = LAKE.center.x + Math.cos(angle) * radius;
      const y = LAKE.center.y + Math.sin(angle) * radius;
      if (trailDistance(x, y) < TRAIL_WIDTH) continue;
      if (this.rng() < 0.55) this.decor('reeds', x, y);
    }
    for (let index = 0; index < 40; index += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = lakeRadiusAt(angle) * floatBetween(this.rng, 0.2, 0.85);
      this.decor('lilyPad', LAKE.center.x + Math.cos(angle) * radius, LAKE.center.y + Math.sin(angle) * radius);
    }
    for (let index = 0; index < 12; index += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = lakeRadiusAt(angle) + floatBetween(this.rng, 40, 90);
      const x = LAKE.center.x + Math.cos(angle) * radius;
      const y = LAKE.center.y + Math.sin(angle) * radius;
      if (this.free(x, y, 22)) this.circle('rock', x, y, floatBetween(this.rng, 12, 22), false);
    }
  }

  /** Grassland between the zones: a sprinkling of rocks, lone dead trees and bushes so open ground isn't empty. */
  private grassland(): void {
    this.scatter(null, 70, 22, (x, y) => this.circle('rock', x, y, floatBetween(this.rng, 9, 24), false));
    this.scatter(null, 26, 14, (x, y) => this.circle('deadTree', x, y, 12, true));
    this.scatter('meadow', 10, 22, (x, y) => this.circle('rock', x, y, floatBetween(this.rng, 9, 18), false), 0.4);
    for (let index = 0; index < 260; index += 1) {
      const x = floatBetween(this.rng, EDGE_MARGIN, ARENA_SIZE - EDGE_MARGIN);
      const y = floatBetween(this.rng, EDGE_MARGIN, ARENA_SIZE - EDGE_MARGIN);
      if (lakeShoreDistance(x, y) > 30 && trailDistance(x, y) > TRAIL_WIDTH && zoneWeight('ruins', x, y) < 0.3) this.decor('bush', x, y);
    }
  }
}
