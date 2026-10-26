import { WEAPONS, WeaponFamily, weaponFamily } from '../../config/weapons';
import { EventBus } from '../EventBus';
import { Rng, Vec2, floatBetween, pickOne } from '../math';
import { PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';

// The merchant (port of the Phaser MerchantSystem): every so often a portal opens somewhere on the arena for a short
// while; stepping through it leaves the horde behind — the arena freezes — for the merchant's room, a pocket realm
// outside the map. Walk to an item's pedestal to buy it, then take the exit portal back to where you entered. Same
// four offers, prices and run-wide price inflation as the Phaser build.

export const MERCHANT_TUNING = {
  /** Time between portals (counted only while none is open, you're not inside, and no boss is coming or up). */
  intervalMs: 40_000,
  /** How long a portal stays open on the arena. */
  portalOpenMs: 20_000,
  /** The portal opens this far from the hero. */
  minDistance: 450,
  maxDistance: 1000,
  /** Close enough to step through / buy / leave. */
  reach: 80,
  /** Each item bought this run (any visit) multiplies every price by this, compounding: ×1, ×3, ×9, ... */
  priceInflation: 3,
  randomBuffCost: 100
};

/** The merchant's room (Phaser MERCHANT_ROOM_SIZE and layout): far outside the arena so nothing in it can reach. */
export const MERCHANT_ROOM = {
  /** Square side, game units. */
  size: 480,
  /** Offsets from the room's centre: the exit portal at the top, the merchant behind his counter on the left,
   *  four pedestals down the right. */
  exit: { x: 0, y: -190 },
  arrival: { x: 0, y: -130 },
  merchant: { x: -140, y: -20 },
  counter: { x: -40, y: 0, halfWidth: 38, halfHeight: 150 },
  slots: [0, 1, 2, 3].map((index) => ({ x: 150, y: -120 + index * 80 }))
};

export type MerchantItemId = 'divine-blessing' | 'arcane-curse' | 'heal' | 'damage' | 'speed' | 'affinity-tome' | 'max-health';

export interface MerchantOffer {
  id: MerchantItemId;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
}

interface ItemSpec { id: MerchantItemId; name: string; description: string; cost: number }

const DIVINE_BLESSING: ItemSpec = { id: 'divine-blessing', name: 'Bênção Divina', description: '+5 HP/s de cura passiva. Empilha se comprado de novo.', cost: 150 };
const ARCANE_CURSE: ItemSpec = { id: 'arcane-curse', name: 'Maldição Arcana', description: '-50 de vida máxima, +150% de dano. Empilha se comprado de novo.', cost: 120 };
/** One of these per visit, re-priced to MERCHANT_TUNING.randomBuffCost. */
const RANDOM_BUFFS: ItemSpec[] = [
  { id: 'heal', name: 'Poção de Cura', description: 'Cura 40 de vida instantaneamente.', cost: 0 },
  { id: 'damage', name: 'Lâmina Afiada', description: '+15% de dano.', cost: 0 },
  { id: 'speed', name: 'Botas Ligeiras', description: '+15 de velocidade de movimento.', cost: 0 }
];
const AFFINITY_TOME: ItemSpec = { id: 'affinity-tome', name: 'Tomo de Afinidade', description: 'Escolha uma família de arma para desbloquear afinidade com ela.', cost: 150 };
/** Takes the tome's slot once it's been bought (it's once per run) or every family is already unlocked. */
const VITALITY_ELIXIR: ItemSpec = { id: 'max-health', name: 'Elixir de Vitalidade', description: '+20 de vida máxima e cura 50% da vida máxima.', cost: 25 };

export interface MerchantEvents extends Record<string, unknown> {
  'merchant-portal-opened': { x: number; y: number };
  'merchant-portal-closed': { x: number; y: number };
  'merchant-entered': Record<string, never>;
  'merchant-left': Record<string, never>;
  'merchant-purchase': { id: MerchantItemId; cost: number };
}

export interface MerchantHost {
  readonly player: PlayerState;
  readonly rng: Rng;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<MerchantEvents>, 'emit'>;
  /** Families already unlocked (the tome only offers the others). */
  affinities(): ReadonlySet<WeaponFamily>;
  /** True while the Necromancer is coming or up (no portal then). */
  encounterActive(): boolean;
}

/** What the room is near: the exit portal, an item pedestal (its index), or nothing. */
export type RoomSpot = { kind: 'exit' } | { kind: 'slot'; index: number } | null;

export class MerchantSystem {
  enabled = true;
  /** The open portal on the arena, if any. */
  portal: { x: number; y: number; remainingMs: number } | null = null;
  /** True while the hero is in the room (the arena is frozen). */
  inside = false;
  /** Offers on this visit's pedestals. */
  offers: MerchantOffer[] = [];
  /** The room's centre in game units (outside the arena). */
  readonly room: Vec2;
  private elapsedMs = 0;
  private itemsPurchased = 0;
  private tomeBought = false;
  /** Where the hero stood when stepping into the portal. */
  private returnTo: Vec2 = { x: 0, y: 0 };

  constructor(private readonly host: MerchantHost) {
    this.room = { x: host.arena.size * 2.5, y: host.arena.size / 2 };
  }

  /** The arena portal is within reach. */
  get portalInReach(): boolean {
    const { portal } = this;
    const { player } = this.host;
    return !this.inside && !!portal && Math.hypot(player.x - portal.x, player.y - portal.y) <= MERCHANT_TUNING.reach;
  }

  /** What the hero stands at inside the room. */
  get roomSpot(): RoomSpot {
    if (!this.inside) return null;
    const { player } = this.host;
    const near = (offset: Vec2) => Math.hypot(player.x - (this.room.x + offset.x), player.y - (this.room.y + offset.y)) <= MERCHANT_TUNING.reach;
    if (near(MERCHANT_ROOM.exit)) return { kind: 'exit' };
    // Pedestals stand closer together than the reach: the nearest unsold one is the one you mean.
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    MERCHANT_ROOM.slots.forEach((slot, index) => {
      if (this.offers[index]?.purchased || !near(slot)) return;
      const distance = Math.hypot(player.x - (this.room.x + slot.x), player.y - (this.room.y + slot.y));
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    return best >= 0 ? { kind: 'slot', index: best } : null;
  }

  /** Families the tome can still unlock. */
  availableFamilies(): WeaponFamily[] {
    const owned = this.host.affinities();
    return Object.values(WEAPONS).map(weaponFamily).filter((family, index, all) => all.indexOf(family) === index && !owned.has(family));
  }

  update(delta: number): void {
    if (this.inside) return;
    if (this.portal) {
      this.portal.remainingMs -= delta;
      if (this.portal.remainingMs <= 0 || !this.enabled || this.host.encounterActive()) this.closePortal();
      return;
    }
    if (!this.enabled || this.host.encounterActive()) return;
    this.elapsedMs += delta;
    if (this.elapsedMs >= MERCHANT_TUNING.intervalMs) this.openPortal();
  }

  /** Sandbox / tests: open a portal now. */
  openPortal(): void {
    this.elapsedMs = 0;
    const spot = this.pickSpot();
    this.portal = { x: spot.x, y: spot.y, remainingMs: MERCHANT_TUNING.portalOpenMs };
    this.host.events.emit('merchant-portal-opened', spot);
  }

  /** Steps through the portal: the hero lands at the room's entrance and the offers are laid out. */
  enter(): void {
    if (!this.portal || this.inside) return;
    const { player } = this.host;
    this.returnTo = { x: player.x, y: player.y };
    this.inside = true;
    this.offers = this.buildOffers();
    player.x = player.prevX = this.room.x + MERCHANT_ROOM.arrival.x;
    player.y = player.prevY = this.room.y + MERCHANT_ROOM.arrival.y;
    this.host.events.emit('merchant-entered', {});
  }

  /** Back to the arena where the hero left it; that portal closes behind them. */
  leave(): void {
    if (!this.inside) return;
    const { player } = this.host;
    this.inside = false;
    player.x = player.prevX = this.returnTo.x;
    player.y = player.prevY = this.returnTo.y;
    this.closePortal();
    this.host.events.emit('merchant-left', {});
  }

  /** Keeps the hero inside the room's walls and off the counter (in place). */
  confine(body: { x: number; y: number; radius: number }): void {
    const half = MERCHANT_ROOM.size / 2;
    body.x = Math.min(this.room.x + half - body.radius, Math.max(this.room.x - half + body.radius, body.x));
    body.y = Math.min(this.room.y + half - body.radius, Math.max(this.room.y - half + body.radius, body.y));
    const counter = MERCHANT_ROOM.counter;
    const dx = body.x - (this.room.x + counter.x);
    const dy = body.y - (this.room.y + counter.y);
    const overlapX = counter.halfWidth + body.radius - Math.abs(dx);
    const overlapY = counter.halfHeight + body.radius - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return;
    if (overlapX < overlapY) body.x += Math.sign(dx || 1) * overlapX;
    else body.y += Math.sign(dy || 1) * overlapY;
  }

  /** Buys offer `index` if affordable; returns it (the caller applies it — the tome opens a choice). */
  buy(index: number, currency: number): MerchantOffer | null {
    const offer = this.offers[index];
    if (!this.inside || !offer || offer.purchased || currency < offer.cost) return null;
    offer.purchased = true;
    this.itemsPurchased += 1;
    if (offer.id === 'affinity-tome') this.tomeBought = true;
    // Run-wide inflation: what's still on the table re-prices at once (Phaser priced each visit on entry).
    this.offers.forEach((other) => {
      if (!other.purchased) other.cost = Math.round(other.cost * MERCHANT_TUNING.priceInflation);
    });
    this.host.events.emit('merchant-purchase', { id: offer.id, cost: offer.cost });
    return offer;
  }

  private closePortal(): void {
    if (!this.portal) return;
    const { x, y } = this.portal;
    this.portal = null;
    this.elapsedMs = 0;
    this.host.events.emit('merchant-portal-closed', { x, y });
  }

  private buildOffers(): MerchantOffer[] {
    const multiplier = MERCHANT_TUNING.priceInflation ** this.itemsPurchased;
    const randomBuff = { ...pickOne(this.host.rng, RANDOM_BUFFS), cost: MERCHANT_TUNING.randomBuffCost };
    const fourth = !this.tomeBought && this.availableFamilies().length > 0 ? AFFINITY_TOME : VITALITY_ELIXIR;
    return [DIVINE_BLESSING, ARCANE_CURSE, randomBuff, fourth].map((spec) => ({ ...spec, cost: Math.round(spec.cost * multiplier), purchased: false }));
  }

  /** A walkable spot a short walk from the hero, inside the arena and off the water. */
  private pickSpot(): Vec2 {
    const { player, rng, arena } = this.host;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = floatBetween(rng, 0, Math.PI * 2);
      const distance = floatBetween(rng, MERCHANT_TUNING.minDistance, MERCHANT_TUNING.maxDistance);
      const x = player.x + Math.cos(angle) * distance;
      const y = player.y + Math.sin(angle) * distance;
      if (x < 200 || y < 200 || x > arena.size - 200 || y > arena.size - 200) continue;
      if (arena.isWalkable(x, y, 40) && arena.shoreDistance(x, y) > 60) return { x, y };
    }
    return arena.nearestWalkable(player.x + MERCHANT_TUNING.minDistance, player.y, 40);
  }
}
