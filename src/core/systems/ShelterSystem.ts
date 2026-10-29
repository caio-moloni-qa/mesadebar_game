import { EventBus } from '../EventBus';
import { Rng, Vec2, pickOne } from '../math';
import { ArenaMap } from '../world/ArenaMap';
import { BlizzardSystem, blizzardFrontAt, blizzardPhaseAt } from './BlizzardSystem';

// O Esquimó (Campo Nevado): during a blizzard front he walks the map with his lantern, from lit torch to lit torch —
// always on to the one nearest the hero, so sooner or later he finds you. Close enough, he offers shelter for a few
// seconds ("Precisa de abrigo?"); take it (E) and you're in his igloo (MerchantSystem's room, dressed as an igloo). He
// takes you in once per front at most, and leaves when the front passes. Nothing hits him and nothing aims at him: he
// isn't an enemy, just a walker this system moves. When his time is up he doesn't vanish: he climbs on his sled and
// drives off the nearest edge of the map.

export const SHELTER_TUNING = {
  /** He sets out this far into a front, from a lit torch at least this far from the hero. */
  arriveAfterMs: 8_000,
  arriveDistance: 700,
  speed: 105,
  /** Stops at each torch this long, warming his hands. */
  torchPauseMs: 1_500,
  /** Offers shelter this close to the hero, for this long; turned down (or ignored), he asks again after a while. */
  offerReach: 140,
  offerMs: 6_000,
  askAgainMs: 10_000,
  radius: 16,
  /** Leaving: the sled's speed (straight for the nearest map edge, over anything in the way) and how long it may take
   *  before he's simply gone. */
  leaveSpeed: 340,
  leaveMaxMs: 14_000
};

export interface Eskimo {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facingX: number;
  facingY: number;
  /** The torch he's walking to (index into the blizzard's torches), and a waypoint on the way when there's no straight line. */
  target: number;
  waypoint: Vec2 | null;
  pauseUntil: number;
  /** While offering: when the offer runs out. */
  offerUntil: number;
  /** No new offer before this. */
  askAgainAt: number;
  /** On his way out by sled: when he set off (-1 while still doing his rounds). */
  leavingSince: number;
}

export interface ShelterEvents extends Record<string, unknown> {
  'eskimo-arrived': { x: number; y: number };
  'shelter-offered': { x: number; y: number };
  'shelter-accepted': Record<string, never>;
  'eskimo-departing': { x: number; y: number };
  'eskimo-left': { x: number; y: number };
}

export interface ShelterHost {
  readonly player: Vec2 & { radius: number };
  readonly rng: Rng;
  readonly arena: ArenaMap;
  readonly blizzard: BlizzardSystem;
  readonly events: Pick<EventBus<ShelterEvents>, 'emit'>;
  now(): number;
  /** True while a boss is coming or up, or the cycle portals are open: no shelter then. */
  blocked(): boolean;
}

export class ShelterSystem {
  eskimo: Eskimo | null = null;
  /** The front he last took the hero in during (once per front). */
  private servedFront = -1;
  /** The front he last walked (he sets out once per front). */
  private walkedFront = -1;

  constructor(private readonly host: ShelterHost) {}

  /** He's waiting for an answer right now. */
  get offering(): boolean {
    return !!this.eskimo && this.eskimo.leavingSince < 0 && this.host.now() < this.eskimo.offerUntil;
  }

  /** He's on his sled, heading off the map. */
  get leaving(): boolean {
    return !!this.eskimo && this.eskimo.leavingSince >= 0;
  }

  update(deltaMs: number, elapsedMs: number): void {
    const { blizzard } = this.host;
    if (!blizzard.active) return;
    const front = blizzardFrontAt(elapsedMs);
    const { phase, intoMs } = blizzardPhaseAt(elapsedMs);
    const eskimo = this.eskimo;
    if (eskimo) {
      eskimo.prevX = eskimo.x;
      eskimo.prevY = eskimo.y;
      if (eskimo.leavingSince >= 0) {
        this.drive(eskimo, deltaMs);
        return;
      }
      if (phase !== 'storm' || this.host.blocked() || front !== this.walkedFront) {
        this.depart(eskimo);
        return;
      }
      this.walk(eskimo, deltaMs);
      return;
    }
    if (phase === 'storm' && intoMs >= SHELTER_TUNING.arriveAfterMs && front !== this.walkedFront && front !== this.servedFront && !this.host.blocked()) this.arrive(front);
  }

  /** E while he's offering: in you go (the caller moves the hero into the igloo). */
  accept(elapsedMs: number): boolean {
    if (!this.offering) return false;
    this.servedFront = blizzardFrontAt(elapsedMs);
    this.eskimo = null;
    this.host.events.emit('shelter-accepted', {});
    return true;
  }

  /** Sandbox: bring him in now, right by the hero, offering. */
  summon(elapsedMs: number): void {
    const { player } = this.host;
    const spot = this.host.arena.nearestWalkable(player.x + 90, player.y, SHELTER_TUNING.radius);
    this.walkedFront = blizzardFrontAt(elapsedMs);
    this.servedFront = -1;
    this.eskimo = { ...spot, prevX: spot.x, prevY: spot.y, facingX: -1, facingY: 0, target: this.nextTorch(-1), waypoint: null, pauseUntil: 0, offerUntil: 0, askAgainAt: 0, leavingSince: -1 };
    this.offer(this.eskimo);
  }

  private arrive(front: number): void {
    const { blizzard, player, rng } = this.host;
    const lit = blizzard.torches.map((torch, index) => ({ torch, index })).filter(({ torch }) => torch.fuelMs > 0);
    if (lit.length === 0) return;
    const far = lit.filter(({ torch }) => Math.hypot(torch.x - player.x, torch.y - player.y) >= SHELTER_TUNING.arriveDistance);
    const start = pickOne(rng, far.length > 0 ? far : lit);
    this.walkedFront = front;
    this.eskimo = {
      x: start.torch.x, y: start.torch.y, prevX: start.torch.x, prevY: start.torch.y, facingX: 0, facingY: 1,
      target: this.nextTorch(start.index), waypoint: null, pauseUntil: this.host.now() + SHELTER_TUNING.torchPauseMs, offerUntil: 0, askAgainAt: 0, leavingSince: -1
    };
    this.host.events.emit('eskimo-arrived', { x: start.torch.x, y: start.torch.y });
  }

  /** Time's up: no more offers, he turns his sled for the nearest map edge. */
  private depart(eskimo: Eskimo): void {
    const { size } = this.host.arena;
    const exits = [
      { distance: eskimo.x, x: -1, y: 0 },
      { distance: size - eskimo.x, x: 1, y: 0 },
      { distance: eskimo.y, x: 0, y: -1 },
      { distance: size - eskimo.y, x: 0, y: 1 }
    ];
    const exit = exits.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best));
    eskimo.leavingSince = this.host.now();
    eskimo.offerUntil = 0;
    eskimo.waypoint = null;
    eskimo.facingX = exit.x;
    eskimo.facingY = exit.y;
    this.host.events.emit('eskimo-departing', { x: eskimo.x, y: eskimo.y });
  }

  /** The sled runs straight out, through trees and snowdrifts alike; gone once past the edge. */
  private drive(eskimo: Eskimo, deltaMs: number): void {
    const step = (SHELTER_TUNING.leaveSpeed * deltaMs) / 1000;
    eskimo.x += eskimo.facingX * step;
    eskimo.y += eskimo.facingY * step;
    const { size } = this.host.arena;
    const margin = SHELTER_TUNING.radius * 4;
    const out = eskimo.x < -margin || eskimo.y < -margin || eskimo.x > size + margin || eskimo.y > size + margin;
    if (!out && this.host.now() - eskimo.leavingSince < SHELTER_TUNING.leaveMaxMs) return;
    this.eskimo = null;
    this.host.events.emit('eskimo-left', { x: eskimo.x, y: eskimo.y });
  }

  private offer(eskimo: Eskimo): void {
    const now = this.host.now();
    eskimo.offerUntil = now + SHELTER_TUNING.offerMs;
    eskimo.askAgainAt = eskimo.offerUntil + SHELTER_TUNING.askAgainMs;
    this.host.events.emit('shelter-offered', { x: eskimo.x, y: eskimo.y });
  }

  private walk(eskimo: Eskimo, deltaMs: number): void {
    const { player, arena, blizzard } = this.host;
    const now = this.host.now();
    const toHeroX = player.x - eskimo.x;
    const toHeroY = player.y - eskimo.y;
    const heroDistance = Math.hypot(toHeroX, toHeroY);
    if (now < eskimo.offerUntil) {
      // Stands and waits for the answer, facing the hero.
      if (heroDistance > 0) { eskimo.facingX = toHeroX / heroDistance; eskimo.facingY = toHeroY / heroDistance; }
      return;
    }
    if (heroDistance <= SHELTER_TUNING.offerReach + player.radius && now >= eskimo.askAgainAt) {
      this.offer(eskimo);
      return;
    }
    if (now < eskimo.pauseUntil) return;
    const torch = blizzard.torches[eskimo.target];
    if (!torch) return;
    // No straight line (a wall, the castle): by way of the clearing, where every trail meets.
    if (!eskimo.waypoint && !arena.hasLineOfSight(eskimo, torch)) eskimo.waypoint = { ...arena.center };
    const goal = eskimo.waypoint ?? torch;
    const dx = goal.x - eskimo.x;
    const dy = goal.y - eskimo.y;
    const distance = Math.hypot(dx, dy);
    const step = (SHELTER_TUNING.speed * deltaMs) / 1000;
    if (distance <= step) {
      eskimo.x = goal.x;
      eskimo.y = goal.y;
      if (eskimo.waypoint) {
        eskimo.waypoint = null;
        return;
      }
      eskimo.pauseUntil = now + SHELTER_TUNING.torchPauseMs;
      eskimo.target = this.nextTorch(eskimo.target);
      return;
    }
    eskimo.x += (dx / distance) * step;
    eskimo.y += (dy / distance) * step;
    eskimo.facingX = dx / distance;
    eskimo.facingY = dy / distance;
    const body = { x: eskimo.x, y: eskimo.y, radius: SHELTER_TUNING.radius };
    arena.resolve(body);
    eskimo.x = body.x;
    eskimo.y = body.y;
  }

  /** The lit torch nearest the hero, other than the one he's at (any torch if every other one is out). */
  private nextTorch(current: number): number {
    const { blizzard, player } = this.host;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    blizzard.torches.forEach((torch, index) => {
      if (index === current) return;
      const distance = Math.hypot(torch.x - player.x, torch.y - player.y) + (torch.fuelMs > 0 ? 0 : 100_000);
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    return best >= 0 ? best : Math.max(0, current);
  }
}
