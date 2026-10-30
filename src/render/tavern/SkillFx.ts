// Taverna em Turnos: how each skill looks on the duel stage. A skill isn't a stronger swing: a bolt is cast and flies,
// an arrow is loosed, a bottle is thrown, meteors fall, a roar shakes the room. The stage asks `skillFx` for the
// motion and its timing, poses the caster by it, lands the damage at `impacts`, and lets `drawSkillFx` paint the rest.

import { SkillNode } from '../../config/tavernSkills';

/** The ways a skill can play out.
 *  - melee: the lunge of a strike (`heavy` coils first, with a glow);
 *  - cast: charges in place over a magic circle, then a bolt flies to the target;
 *  - shot: an arrow (or a spit, a breath) loosed from where they stand;
 *  - throw: something from the shelf arcs onto the target;
 *  - rain: charges, then things fall from above on every target;
 *  - quake: a blow to the floor sends a crack along it, snow comes down on every target;
 *  - wave: rings (a bell's sound, a blizzard) roll out and wash over every target;
 *  - spin: the caster cuts through every enemy and comes back;
 *  - boomerang: a thrown thing goes out through every enemy and comes back;
 *  - roots: they burst from the floor under the target;
 *  - hex: a sign appears over the target (an eye, a reticle, sand);
 *  - self: a sign on the caster (a shield, a heal, a wall of light, a roar);
 *  - party: the same over every ally. */
export type SkillMotion = 'melee' | 'cast' | 'shot' | 'throw' | 'rain' | 'quake' | 'wave' | 'spin' | 'boomerang' | 'roots' | 'hex' | 'self' | 'party';
/** What flies or falls (the shot, throw, cast, rain and boomerang motions). */
export type SkillItem = 'bolt' | 'orb' | 'arrow' | 'bottle' | 'plate' | 'barrel' | 'fish' | 'dice' | 'ice' | 'meteor' | 'breath' | 'boomerang' | 'sand' | 'coin';
/** The sign of a hex, a self buff or a party buff. */
export type SkillSigil = 'shield' | 'heal' | 'wall' | 'roar' | 'eye' | 'target' | 'note' | 'barrel' | 'crystal';

export interface SkillFx {
  motion: SkillMotion;
  /** The skill's colour: the circle, the bolt, the glow, the sparks. */
  color: string;
  item?: SkillItem;
  sigil?: SkillSigil;
  /** A melee that winds up first (finishers, hammers). */
  heavy?: boolean;
}

/** Every skill in the game, by id. A skill missing here falls back to `fallbackFx` by its effect. */
const FX: Record<string, SkillFx> = {
  // Brom.
  barril: { motion: 'self', color: '#c8843a', sigil: 'barrel' },
  provocar: { motion: 'hex', color: '#ff6a4a', sigil: 'roar' },
  'muralha-viva': { motion: 'self', color: '#ffd75a', sigil: 'wall' },
  'gole-rapido': { motion: 'self', color: '#8dffa8', sigil: 'heal' },
  'bafo-de-malte': { motion: 'shot', color: '#c8d860', item: 'breath' },
  'barril-sem-fundo': { motion: 'self', color: '#8dffa8', sigil: 'heal' },
  martelada: { motion: 'melee', color: '#ffb84a', heavy: true },
  'golpe-da-forja': { motion: 'melee', color: '#ff7a2a', heavy: true },
  // Lyra.
  'tiro-certeiro': { motion: 'shot', color: '#ffe08a', item: 'arrow' },
  'flecha-fantasma': { motion: 'shot', color: '#bff4ff', item: 'arrow' },
  'flecha-envenenada': { motion: 'shot', color: '#8de05a', item: 'arrow' },
  raizes: { motion: 'roots', color: '#6ab04a' },
  'abraco-da-floresta': { motion: 'roots', color: '#8de05a' },
  distancia: { motion: 'hex', color: '#7fdcff', sigil: 'target' },
  'danca-do-vento': { motion: 'self', color: '#bff4ff', sigil: 'wall' },
  // Grimbo.
  'rolar-os-dados': { motion: 'throw', color: '#f4f0e6', item: 'dice' },
  'dobro-ou-nada': { motion: 'throw', color: '#ffb84a', item: 'dice' },
  'seis-duplo': { motion: 'throw', color: '#ffd75a', item: 'dice' },
  'batedor-de-carteira': { motion: 'melee', color: '#ffd75a' },
  'truque-sujo': { motion: 'melee', color: '#c8a070' },
  'grande-golpe': { motion: 'melee', color: '#ffd75a', heavy: true },
  'areia-nos-olhos': { motion: 'hex', color: '#e0c88a', sigil: 'eye' },
  'mesa-virada': { motion: 'self', color: '#c8a070', sigil: 'wall' },
  // Zora.
  'escudo-de-cristal': { motion: 'self', color: '#c58bff', sigil: 'crystal' },
  'cura-cristalina': { motion: 'self', color: '#d8b8ff', sigil: 'heal' },
  'prisao-de-cristal': { motion: 'self', color: '#c58bff', sigil: 'wall' },
  'mau-olhado': { motion: 'hex', color: '#c58bff', sigil: 'eye' },
  marca: { motion: 'hex', color: '#ff5a8a', sigil: 'target' },
  praga: { motion: 'cast', color: '#8de05a', item: 'orb' },
  'maldicao-final': { motion: 'cast', color: '#a85aff', item: 'bolt' },
  eclipse: { motion: 'rain', color: '#5a2a8a', item: 'orb' },
  // Sergio.
  rodada: { motion: 'self', color: '#8dffa8', sigil: 'heal' },
  'pinga-boa': { motion: 'self', color: '#8dffa8', sigil: 'heal' },
  'rodada-gratis': { motion: 'self', color: '#8dffa8', sigil: 'heal' },
  'rodada-da-casa': { motion: 'party', color: '#8dffa8', sigil: 'heal' },
  garrafada: { motion: 'throw', color: '#3f8a4a', item: 'bottle' },
  'prato-voador': { motion: 'throw', color: '#f0ece0', item: 'plate' },
  'barril-rolante': { motion: 'throw', color: '#c8843a', item: 'barrel' },
  'fecha-a-conta': { motion: 'self', color: '#ffd75a', sigil: 'wall' },
  // The 3D game's heroes.
  investida: { motion: 'melee', color: '#ff9a5a', heavy: true },
  'grito-de-guerra': { motion: 'self', color: '#ff5a4a', sigil: 'roar' },
  furia: { motion: 'spin', color: '#ff5a4a' },
  'raio-arcano': { motion: 'cast', color: '#7fb8ff', item: 'bolt' },
  'barreira-arcana': { motion: 'party', color: '#7fb8ff', sigil: 'shield' },
  'chuva-de-meteoros': { motion: 'rain', color: '#ff8a3a', item: 'meteor' },
  'brilho-da-reliquia': { motion: 'party', color: '#ffd75a', sigil: 'heal' },
  'olho-do-cacador': { motion: 'hex', color: '#ffd75a', sigil: 'target' },
  'tesouro-antigo': { motion: 'rain', color: '#ffd75a', item: 'coin' },
  'bumerangue-runico': { motion: 'boomerang', color: '#7fdcff', item: 'boomerang' },
  banana: { motion: 'self', color: '#ffe05a', sigil: 'heal' },
  'furia-simia': { motion: 'melee', color: '#ffb84a', heavy: true },
  // The igloo.
  'peixe-congelado': { motion: 'throw', color: '#9ab8c8', item: 'fish' },
  'sopa-quentinha': { motion: 'party', color: '#ffb86a', sigil: 'heal' },
  'banquete-da-tundra': { motion: 'party', color: '#ffd75a', sigil: 'heal' },
  'corte-gelido': { motion: 'melee', color: '#bfefff', heavy: true },
  'guarda-de-gelo': { motion: 'self', color: '#8fd8ff', sigil: 'shield' },
  'muralha-congelada': { motion: 'self', color: '#bfefff', sigil: 'wall' },
  'cuspe-gelido': { motion: 'shot', color: '#bfefff', item: 'ice' },
  bote: { motion: 'melee', color: '#5fc8d8' },
  nevasca: { motion: 'wave', color: '#dff6ff', item: 'ice' },
  badalada: { motion: 'wave', color: '#ffd75a' },
  'toque-sereno': { motion: 'hex', color: '#b8e0ff', sigil: 'note' },
  'dobre-final': { motion: 'cast', color: '#ffd75a', item: 'orb' },
  pancada: { motion: 'melee', color: '#dfe8f0', heavy: true },
  rugido: { motion: 'self', color: '#ff7a5a', sigil: 'roar' },
  avalanche: { motion: 'quake', color: '#f4f8fc' }
};

/** By effect, for a skill nobody gave a look yet. */
function fallbackFx(skill: SkillNode): SkillFx {
  switch (skill.effect.type) {
    case 'damageAll': return { motion: 'wave', color: '#ffe08a' };
    case 'heal': case 'sober': return { motion: 'self', color: '#8dffa8', sigil: 'heal' };
    case 'shield': return { motion: 'self', color: '#8fc8ff', sigil: 'shield' };
    case 'wall': return { motion: 'self', color: '#ffd75a', sigil: 'wall' };
    case 'taunt': return { motion: 'self', color: '#ff5a4a', sigil: 'roar' };
    case 'healAll': return { motion: 'party', color: '#8dffa8', sigil: 'heal' };
    case 'shieldAll': return { motion: 'party', color: '#8fc8ff', sigil: 'shield' };
    case 'weaken': return { motion: 'hex', color: '#c58bff', sigil: 'eye' };
    case 'mark': return { motion: 'hex', color: '#ff5a8a', sigil: 'target' };
    case 'poison': return { motion: 'cast', color: '#8de05a', item: 'orb' };
    case 'gamble': return { motion: 'throw', color: '#f4f0e6', item: 'dice' };
    default: return { motion: 'melee', color: '#fff3c0', heavy: skill.kind === 'finisher' };
  }
}

export function skillFx(skill: SkillNode): SkillFx {
  return FX[skill.id] ?? fallbackFx(skill);
}

/** Whether a skill has its own look (the test keeps every skill covered). */
export function hasOwnFx(skillId: string): boolean {
  return skillId in FX;
}

/** How long the caster charges (or coils) before anything leaves their hands. */
export function chargeMs(fx: SkillFx): number {
  switch (fx.motion) {
    case 'melee': return fx.heavy ? 280 : 0;
    case 'cast': case 'rain': return 420;
    case 'shot': return 260;
    case 'throw': return 220;
    case 'quake': case 'wave': return 300;
    case 'roots': return 320;
    case 'spin': return 160;
    case 'boomerang': return 200;
    default: return 260;
  }
}

/** When each target is hit, in ms after the skill is used, for targets at `distances` (stage px from the caster, in
 *  the order given). The farthest one sets how wide a sweep is. */
export function impacts(fx: SkillFx, distances: number[]): number[] {
  const charge = chargeMs(fx);
  const far = Math.max(1, ...distances);
  return distances.map((distance, i) => {
    switch (fx.motion) {
      case 'melee': return charge + 180;
      case 'cast': return charge + 260;
      case 'shot': return charge + 240;
      case 'throw': return charge + 340;
      case 'rain': return charge + 300 + i * 90;
      case 'quake': return charge + 120 + (distance / far) * 300;
      case 'wave': return charge + 80 + (distance / far) * 380;
      case 'spin': return charge + (distance / far) * 380;
      case 'boomerang': return charge + (distance / far) * 330;
      case 'roots': return charge + 200;
      default: return charge + 80;
    }
  });
}

/** One skill playing out on the stage. Positions are read each frame (the stage owns them). */
export interface ActiveFx {
  fx: SkillFx;
  at: number;
  casterId: string;
  /** The enemies it hits, or the allies it buffs, or just the caster. */
  targetIds: string[];
  /** When each of `targetIds` is hit (ms after `at`). */
  hitMs: number[];
}

/** Where things are, for one frame. */
export interface FxStage {
  ctx: CanvasRenderingContext2D;
  floorY: number;
  /** How big the fighters are drawn in this room. */
  size: number;
  /** A fighter's x right now. */
  xOf: (fighterId: string) => number;
}

/** How long an effect stays drawn after it's used. */
export const FX_LIFE_MS = 1400;

export function drawSkillFx(stage: FxStage, active: ActiveFx, now: number): void {
  const t = now - active.at;
  if (t < 0 || t > FX_LIFE_MS) return;
  const { ctx } = stage;
  const { fx } = active;
  const charge = chargeMs(fx);
  const casterX = stage.xOf(active.casterId);
  const chest = stage.floorY - 85 * stage.size;
  const hand = { x: casterX + 40 * stage.size, y: chest - 10 };
  ctx.save();
  switch (fx.motion) {
    case 'melee':
      if (fx.heavy && t < charge + 200) chargeGlow(stage, casterX, t / charge, fx.color);
      break;
    case 'cast': case 'rain': case 'quake': case 'wave': case 'roots': case 'hex':
      if (t < charge + 120) magicCircle(stage, casterX, Math.min(1, t / charge), fx.color, now);
      if (t < charge) converge(ctx, hand.x, hand.y, t / charge, fx.color);
      break;
    case 'self': case 'party':
      if (t < charge + 200) magicCircle(stage, casterX, Math.min(1, t / charge), fx.color, now);
      break;
    default:
      break;
  }
  active.targetIds.forEach((id, i) => {
    const x = stage.xOf(id);
    const hit = active.hitMs[i];
    switch (fx.motion) {
      case 'cast': fly(ctx, fx, hand, { x: x - 30, y: chest }, (t - charge) / (hit - charge), now, 0); break;
      case 'shot': fly(ctx, fx, hand, { x: x - 30, y: chest }, (t - charge) / (hit - charge), now, fx.item === 'breath' ? 10 : 0); break;
      case 'throw': fly(ctx, fx, hand, { x: x - 30, y: fx.item === 'barrel' ? stage.floorY - 28 : chest }, (t - charge) / (hit - charge), now, fx.item === 'barrel' ? 0 : 90); break;
      // Three on each target, the middle one landing on the hit.
      case 'rain': [-1, 0, 1].forEach((j) => fall(ctx, fx, x + j * 38, chest + j * 12, (t - (hit - 300 + j * 80)) / 300, now)); break;
      case 'quake': fall(ctx, fx, x, chest, (t - (hit - 260)) / 260, now); break;
      case 'roots': roots(stage, x, (t - charge) / (hit - charge), t - hit, fx.color); break;
      case 'hex': if (t >= charge) sigil(ctx, fx.sigil ?? 'eye', x, stage.floorY - 230 * stage.size, (t - charge) / 600, fx.color, now); break;
      case 'party': if (t >= charge - 100) partyGlow(stage, x, (t - charge + 100) / 700, fx, now); break;
      default: break;
    }
  });
  if (fx.motion === 'self') selfSign(stage, casterX, (t - charge + 100) / 800, fx, now);
  if (fx.motion === 'quake') crack(stage, casterX, Math.max(...active.targetIds.map(stage.xOf)), (t - charge) / (Math.max(...active.hitMs) - charge), fx.color);
  if (fx.motion === 'wave') rings(stage, hand, Math.max(...active.targetIds.map(stage.xOf)) - hand.x + 60, (t - charge) / (Math.max(...active.hitMs) - charge + 120), fx, now);
  if (fx.motion === 'spin') slashes(stage, casterX, t - charge, fx.color, now);
  if (fx.motion === 'boomerang') boomerang(stage, hand, Math.max(...active.targetIds.map(stage.xOf)) + 40, (t - charge) / 700, fx.color, now);
  ctx.restore();
}

// ── Pieces ──

function square(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
}

/** A flat ring on the floor under the caster that opens as they charge, with runes going round. */
function magicCircle(stage: FxStage, x: number, k: number, color: string, now: number): void {
  const { ctx } = stage;
  const r = (30 + 40 * k) * stage.size;
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, stage.floorY - 2, r, r * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(x, stage.floorY - 2, r * 0.7, r * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 6; i += 1) {
    const a = now / 300 + (i / 6) * Math.PI * 2;
    square(ctx, x + Math.cos(a) * r, stage.floorY - 2 + Math.sin(a) * r * 0.28, 5, color);
  }
  // The light rising off it.
  beam(ctx, x, stage.floorY - 170 * stage.size, stage.floorY, r * 0.7, color, 0.3 * k);
  ctx.globalAlpha = 1;
}

/** A soft vertical shaft of light: bright down the middle, nothing at the edges, thinning to the top. */
function beam(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number, half: number, color: string, alpha: number): void {
  if (alpha <= 0 || bottom <= top) return;
  const across = ctx.createLinearGradient(x - half, 0, x + half, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, color);
  across.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = across;
  ctx.beginPath();
  ctx.moveTo(x - half * 0.55, top);
  ctx.lineTo(x + half * 0.55, top);
  ctx.lineTo(x + half, bottom);
  ctx.lineTo(x - half, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 1.6;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x - 1.5, top, 3, bottom - top);
  ctx.restore();
}

/** A bubble of energy around the body, hexes shimmering across it. */
function bubble(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, alpha: number, now: number): void {
  if (rx <= 4 || ry <= 4 || alpha <= 0) return;
  ctx.save();
  const fill = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.3, cx, cy, Math.max(rx, ry));
  fill.addColorStop(0, 'rgba(255,255,255,0)');
  fill.addColorStop(0.75, color);
  fill.addColorStop(1, '#ffffff');
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();
  // A honeycomb drifting across the inside, lit in a band that sweeps down.
  const hex = 16;
  const sweep = ((now / 900) % 1) * ry * 2.4 - ry * 1.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (let row = -Math.ceil(ry / hex); row <= Math.ceil(ry / hex); row += 1) {
    for (let col = -Math.ceil(rx / hex); col <= Math.ceil(rx / hex); col += 1) {
      const hx = cx + col * hex * 1.5;
      const hy = cy + row * hex * 1.73 + (col % 2 ? hex * 0.87 : 0);
      const lit = 1 - Math.min(1, Math.abs(hy - cy - sweep) / (ry * 0.45));
      if (lit <= 0) continue;
      ctx.globalAlpha = alpha * 0.55 * lit;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const px = hx + Math.cos(a) * hex * 0.9, py = hy + Math.sin(a) * hex * 0.9;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
  // The rim, and a glint riding round it.
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 3, ry - 3, 0, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  const g = now / 400;
  square(ctx, cx + Math.cos(g) * rx, cy + Math.sin(g) * ry, 5, '#ffffff');
  ctx.restore();
}

/** A heater shield, point down, centred on (cx, cy). */
function shieldShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2 + w * 0.12);
  ctx.quadraticCurveTo(cx, cy - h / 2 - w * 0.12, cx + w / 2, cy - h / 2 + w * 0.12);
  ctx.lineTo(cx + w / 2, cy);
  ctx.quadraticCurveTo(cx + w / 2, cy + h * 0.32, cx, cy + h / 2);
  ctx.quadraticCurveTo(cx - w / 2, cy + h * 0.32, cx - w / 2, cy);
  ctx.closePath();
}

/** Motes drawn into the hand while it charges. */
function converge(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, color: string): void {
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + i;
    const d = (1 - k) * 60 + 6;
    square(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 4, i % 2 ? '#ffffff' : color);
  }
  ctx.globalAlpha = 0.5 + 0.5 * k;
  square(ctx, x, y, 6 + 8 * k, color);
  square(ctx, x, y, 4 + 4 * k, '#ffffff');
  ctx.globalAlpha = 1;
}

/** A heavy blow coiling: a glow around the body that grows until the swing. */
function chargeGlow(stage: FxStage, x: number, k: number, color: string): void {
  const { ctx } = stage;
  const c = Math.min(1, k);
  ctx.globalAlpha = 0.25 + 0.25 * c;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  const w = (60 + 20 * c) * stage.size;
  const h = (190 + 20 * c) * stage.size;
  ctx.beginPath();
  ctx.ellipse(x, stage.floorY - h / 2, w * 0.7, h / 2 + 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 5; i += 1) {
    const rise = ((k * 400 + i * 80) % 400) / 400;
    square(ctx, x - w / 2 + (i + 0.5) * (w / 5), stage.floorY - rise * h, 5, color);
  }
}

/** Something on its way from the hand to the target; `k` 0..1 across the flight, nothing outside it. */
function fly(ctx: CanvasRenderingContext2D, fx: SkillFx, from: { x: number; y: number }, to: { x: number; y: number }, k: number, now: number, arc: number): void {
  if (k < 0 || k > 1) return;
  const x = from.x + (to.x - from.x) * k;
  const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * arc;
  // A trail behind bolts and orbs.
  if (fx.item === 'bolt' || fx.item === 'orb' || fx.item === 'ice') {
    for (let i = 1; i <= 5; i += 1) {
      const back = Math.max(0, k - i * 0.05);
      ctx.globalAlpha = 0.6 - i * 0.1;
      square(ctx, from.x + (to.x - from.x) * back, from.y + (to.y - from.y) * back - Math.sin(back * Math.PI) * arc, 12 - i, fx.color);
    }
    ctx.globalAlpha = 1;
  }
  item(ctx, fx.item ?? 'bolt', x, y, fx.color, now, (to.x - from.x) * 0.001);
}

/** Falling from above onto a target: `k` 0..1 over the fall. */
function fall(ctx: CanvasRenderingContext2D, fx: SkillFx, x: number, groundY: number, k: number, now: number): void {
  if (k < 0 || k > 1) return;
  const fromX = x - 120;
  const fromY = -40;
  const px = fromX + (x - fromX) * k;
  const py = fromY + (groundY - fromY) * k;
  // The tail it leaves.
  for (let i = 1; i <= 6; i += 1) {
    ctx.globalAlpha = 0.55 - i * 0.08;
    square(ctx, px - i * 9, py - i * 18, 14 - i, i % 2 ? '#ffe3a0' : fx.color);
  }
  ctx.globalAlpha = 1;
  if (fx.motion === 'quake') {
    // Snow: a lump and two crumbs.
    square(ctx, px, py, 26, fx.color);
    square(ctx, px - 18, py - 14, 12, '#ffffff');
    square(ctx, px + 16, py - 22, 10, '#d8e8f4');
    return;
  }
  item(ctx, fx.item ?? 'meteor', px, py, fx.color, now, 1);
}

/** The thing itself, centred on (x, y). `spin` is how fast it tumbles. */
function item(ctx: CanvasRenderingContext2D, kind: SkillItem, x: number, y: number, color: string, now: number, spin: number): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  switch (kind) {
    case 'bolt':
      square(ctx, 0, 0, 22, color);
      square(ctx, 0, 0, 12, '#ffffff');
      ctx.fillStyle = color;
      ctx.fillRect(-34, -3, 24, 6);
      break;
    case 'orb':
      square(ctx, 0, 0, 26, color);
      square(ctx, -3, -3, 12, Math.floor(now / 90) % 2 ? '#ffffff' : shadeLight(color));
      break;
    case 'meteor':
      square(ctx, 0, 0, 30, '#8a3a1a');
      square(ctx, -2, -2, 22, color);
      square(ctx, -4, -4, 10, '#ffe08a');
      break;
    case 'coin':
      ctx.rotate(now / 80);
      ctx.fillStyle = color;
      ctx.fillRect(-12, -12, 24, 24);
      ctx.fillStyle = '#a8801a';
      ctx.fillRect(-4, -8, 8, 16);
      break;
    case 'arrow':
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(-26, -2, 40, 4);
      ctx.fillStyle = '#d8dde6';
      ctx.fillRect(14, -5, 8, 10);
      ctx.fillStyle = color;
      ctx.fillRect(-30, -6, 10, 12);
      // A glowing streak behind it.
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-90, -2, 60, 4);
      ctx.globalAlpha = 1;
      break;
    case 'ice':
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-12, -6, 24, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-8, -3, 10, 4);
      break;
    case 'breath':
      for (let i = 0; i < 5; i += 1) {
        ctx.globalAlpha = 0.65;
        square(ctx, -i * 14, Math.sin(now / 60 + i) * 8, 26 - i * 3, color);
      }
      ctx.globalAlpha = 1;
      break;
    case 'bottle':
      ctx.rotate(now * spin * 8);
      ctx.fillStyle = color;
      ctx.fillRect(-5, -13, 10, 26);
      ctx.fillRect(-2, -21, 4, 8);
      ctx.fillStyle = '#ffffff60';
      ctx.fillRect(-3, -10, 2, 18);
      break;
    case 'plate':
      ctx.rotate(now / 40);
      ctx.fillStyle = color;
      ctx.fillRect(-15, -5, 30, 10);
      ctx.fillStyle = '#c8b8a0';
      ctx.fillRect(-8, -2, 16, 4);
      break;
    case 'barrel':
      ctx.rotate(now / 70);
      ctx.fillStyle = color;
      ctx.fillRect(-28, -28, 56, 56);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(-28, -18, 56, 5);
      ctx.fillRect(-28, 13, 56, 5);
      break;
    case 'fish':
      ctx.rotate(now / 90);
      ctx.fillStyle = color;
      ctx.fillRect(-16, -6, 26, 12);
      ctx.fillRect(10, -10, 8, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-12, -3, 3, 3);
      break;
    case 'dice':
      [-12, 12].forEach((dx, i) => {
        ctx.save();
        ctx.translate(dx, i * 6);
        ctx.rotate(now / (60 + i * 25));
        ctx.fillStyle = color;
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(-6, -6, 4, 4);
        ctx.fillRect(2, 2, 4, 4);
        ctx.restore();
      });
      break;
    case 'sand':
      for (let i = 0; i < 9; i += 1) square(ctx, Math.cos(i * 2.4) * 14, Math.sin(i * 1.7) * 10, 4, color);
      break;
    case 'boomerang':
      ctx.rotate(now / 45);
      ctx.fillStyle = color;
      ctx.fillRect(-18, -4, 22, 8);
      ctx.fillRect(-4, -4, 8, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -2, 4, 4);
      break;
  }
  ctx.restore();
}

/** Vines out of the floor under the target: up over `k` 0..1, then a beat held, then gone. */
function roots(stage: FxStage, x: number, k: number, after: number, color: string): void {
  if (k < 0 || after > 450) return;
  const { ctx } = stage;
  const grow = Math.min(1, k);
  ctx.globalAlpha = after > 250 ? 1 - (after - 250) / 200 : 1;
  [-40, -14, 12, 38].forEach((dx, i) => {
    const h = (90 + (i % 2) * 50) * grow * stage.size;
    ctx.fillStyle = i % 2 ? '#3f7a3a' : color;
    ctx.fillRect(x + dx - 4, stage.floorY - h, 8, h);
    // Thorns.
    for (let y = 16; y < h; y += 24) ctx.fillRect(x + dx + (i % 2 ? 4 : -10), stage.floorY - y, 6, 4);
  });
  ctx.globalAlpha = 1;
}

/** The hex over a target's head: pops in, pulses, fades; motes fall from it onto them. */
function sigil(ctx: CanvasRenderingContext2D, kind: SkillSigil, x: number, y: number, k: number, color: string, now: number): void {
  if (k > 1.4) return;
  const pop = k < 0.15 ? k / 0.15 : 1;
  ctx.globalAlpha = k > 1 ? Math.max(0, 1.4 - k) / 0.4 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop * 1.4, pop * 1.4);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  if (kind === 'eye') {
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    square(ctx, 0, 0, 8, Math.floor(now / 120) % 2 ? '#ffffff' : color);
  } else if (kind === 'target') {
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(-20, -1, 10, 3);
    ctx.fillRect(10, -1, 10, 3);
    ctx.fillRect(-1, -20, 3, 10);
    ctx.fillRect(-1, 10, 3, 10);
  } else if (kind === 'note') {
    ctx.fillRect(-6, 4, 10, 8);
    ctx.fillRect(2, -14, 3, 22);
    ctx.fillRect(2, -14, 10, 4);
  } else if (kind === 'roar') {
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('!!', 0, 10);
  }
  ctx.restore();
  for (let i = 0; i < 4; i += 1) {
    const fallK = ((k * 2 + i * 0.25) % 1);
    square(ctx, x - 24 + i * 16, y + 20 + fallK * 90, 4, color);
  }
  ctx.globalAlpha = 1;
}

/** A self buff around the caster: `k` 0..1 builds it, then it fades to the lasting aura the stage draws. */
function selfSign(stage: FxStage, x: number, k: number, fx: SkillFx, now: number): void {
  if (k < 0 || k > 1.3) return;
  const { ctx } = stage;
  const s = stage.size;
  const fade = k > 1 ? (1.3 - k) / 0.3 : 1;
  ctx.globalAlpha = fade;
  switch (fx.sigil) {
    case 'heal':
      // Plus signs rising off them.
      for (let i = 0; i < 6; i += 1) {
        const rise = ((k + i * 0.17) % 1);
        const px = x - 40 * s + (i * 17 % 80) * s;
        const py = stage.floorY - (40 + rise * 180) * s;
        ctx.fillStyle = fx.color;
        ctx.fillRect(px - 8, py - 2, 16, 5);
        ctx.fillRect(px - 2, py - 8, 5, 16);
      }
      break;
    case 'roar': {
      // Rings out of the mouth, and the floor shakes red.
      for (let i = 0; i < 3; i += 1) {
        const r = ((k * 1.5 + i * 0.33) % 1) * 160 * s;
        ctx.globalAlpha = fade * (1 - r / (160 * s));
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(x + 20 * s, stage.floorY - 150 * s, r, r * 0.6, 0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
      break;
    }
    case 'wall': {
      // A curved barrier of light rising out of the floor in front, with motes climbing it.
      const rise = Math.min(1, k * 2);
      const cx = x + 62 * s, h = 210 * s * rise, base = stage.floorY;
      if (h > 2) {
        const up = ctx.createLinearGradient(0, base, 0, base - h);
        up.addColorStop(0, fx.color);
        up.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = fade * 0.8;
        ctx.fillStyle = up;
        ctx.beginPath();
        ctx.ellipse(cx, base, 44 * s, h, 0, Math.PI, Math.PI * 2);
        ctx.ellipse(cx - 20 * s, base, 22 * s, h * 0.85, 0, Math.PI * 2, Math.PI, true);
        ctx.fill();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, base, 44 * s, h, 0, Math.PI * 1.5, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 5; i += 1) {
          const climb = ((k * 1.4 + i * 0.2) % 1);
          square(ctx, cx + 8 * s - (i % 2) * 14 * s, base - climb * h, 4, i % 2 ? '#ffffff' : fx.color);
        }
      }
      // Its foot glowing on the floor.
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.ellipse(cx, base - 2, 40 * s * rise, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'barrel': {
      // A barrel drops in front of him.
      const drop = Math.min(1, k * 2.5);
      ctx.save();
      ctx.translate(x + 50 * s, stage.floorY - 40 * s - (1 - drop) * 200);
      ctx.fillStyle = fx.color;
      ctx.fillRect(-24 * s, -40 * s, 48 * s, 80 * s);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(-24 * s, -28 * s, 48 * s, 6 * s);
      ctx.fillRect(-24 * s, 22 * s, 48 * s, 6 * s);
      ctx.restore();
      break;
    }
    case 'crystal': {
      // A crystal facet raised in front.
      const grow = Math.min(1, k * 2.5);
      const w = 40 * s * grow, h = 120 * s * grow;
      const cx = x + 52 * s, cy = stage.floorY - 100 * s;
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = fade * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - w / 2, cy);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (Math.floor(now / 100) % 2) square(ctx, cx - w / 4, cy - h / 4, 6, '#ffffff');
      break;
    }
    default: {
      // A bubble of energy closing round them, and the shield's emblem flashing up in front.
      const grow = Math.min(1, k * 2.2);
      const ease = 1 - (1 - grow) * (1 - grow);
      bubble(ctx, x, stage.floorY - 92 * s, 74 * s * ease, 98 * s * ease, fx.color, fade, now);
      const pop = Math.min(1, k * 3);
      if (pop > 0) {
        const ew = 34 * s * pop, eh = 42 * s * pop;
        const ex = x + 48 * s, ey = stage.floorY - 108 * s;
        ctx.globalAlpha = fade * 0.85;
        const face = ctx.createLinearGradient(ex - ew / 2, ey - eh / 2, ex + ew / 2, ey + eh / 2);
        face.addColorStop(0, '#ffffff');
        face.addColorStop(0.4, fx.color);
        face.addColorStop(1, fx.color);
        ctx.fillStyle = face;
        shieldShape(ctx, ex, ey, ew, eh);
        ctx.fill();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex, ey - eh * 0.32); ctx.lineTo(ex, ey + eh * 0.3);
        ctx.moveTo(ex - ew * 0.3, ey - eh * 0.06); ctx.lineTo(ex + ew * 0.3, ey - eh * 0.06);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** A column of light on an ally with the buff's sign: plus signs (heal) or a shield. */
function partyGlow(stage: FxStage, x: number, k: number, fx: SkillFx, now: number): void {
  if (k < 0 || k > 1.2) return;
  const { ctx } = stage;
  const s = stage.size;
  const fade = k > 0.9 ? Math.max(0, 1.2 - k) / 0.3 : 1;
  const drop = Math.min(1, k * 3);
  beam(ctx, x, 0, stage.floorY * drop, 46 * s, fx.color, fade * 0.45);
  ctx.globalAlpha = fade;
  selfSign(stage, x, k, fx.sigil === 'heal' ? fx : { ...fx, sigil: 'shield' }, now);
  ctx.globalAlpha = 1;
}

/** The crack the Avalanche sends along the floor, from the caster out to the farthest foe. */
function crack(stage: FxStage, fromX: number, toX: number, k: number, color: string): void {
  if (k < 0 || k > 1.3) return;
  const { ctx } = stage;
  const reach = fromX + (toX - fromX) * Math.min(1, k);
  ctx.globalAlpha = k > 1 ? (1.3 - k) / 0.3 : 1;
  for (let x = fromX + 30; x < reach; x += 18) {
    const up = ((x * 7) % 23) - 11;
    ctx.fillStyle = '#5a6a7a';
    ctx.fillRect(x, stage.floorY - 4 + up * 0.3, 14, 4);
    square(ctx, x + 6, stage.floorY - 14 - Math.abs(up), 8, color);
  }
  ctx.globalAlpha = 1;
}

/** Rings rolling out of the hand: a bell's sound, a blizzard (with ice in it). */
function rings(stage: FxStage, from: { x: number; y: number }, reach: number, k: number, fx: SkillFx, now: number): void {
  if (k < 0 || k > 1.2) return;
  const { ctx } = stage;
  ctx.strokeStyle = fx.color;
  ctx.lineWidth = 6;
  for (let i = 0; i < 3; i += 1) {
    const r = Math.max(4, (k - i * 0.12) * reach);
    if (k - i * 0.12 < 0) continue;
    ctx.globalAlpha = Math.max(0, 0.9 - (r / reach) * 0.6);
    ctx.beginPath();
    ctx.ellipse(from.x, from.y, r, r * 0.55, 0, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
  }
  if (fx.item === 'ice') {
    // Shards and snow blown along with it.
    for (let i = 0; i < 14; i += 1) {
      const d = ((k + i * 0.07) % 1) * reach;
      const y = from.y + Math.sin(i * 1.9 + now / 120) * 50;
      ctx.globalAlpha = 0.85;
      square(ctx, from.x + d, y, i % 3 ? 6 : 10, i % 2 ? '#ffffff' : fx.color);
    }
  }
  ctx.globalAlpha = 1;
}

/** Slash arcs around the caster while they cut through the line. */
function slashes(stage: FxStage, x: number, t: number, color: string, now: number): void {
  if (t < 0 || t > 600) return;
  const { ctx } = stage;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  for (let i = 0; i < 2; i += 1) {
    const a = now / 50 + i * Math.PI;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(x, stage.floorY - 90 * stage.size, 80 * stage.size, 34 * stage.size, 0, a, a + 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Out through every enemy and back: `k` 0..1 the round trip. */
function boomerang(stage: FxStage, from: { x: number; y: number }, farX: number, k: number, color: string, now: number): void {
  if (k < 0 || k > 1) return;
  const out = k < 0.5 ? k * 2 : 2 - k * 2;
  const x = from.x + (farX - from.x) * Math.sin((out * Math.PI) / 2);
  const y = from.y - Math.sin(k * Math.PI * 2) * 30;
  item(stage.ctx, 'boomerang', x, y, color, now, 1);
}

function shadeLight(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const up = (c: number) => Math.round(c + (255 - c) * 0.5);
  return `rgb(${up((v >> 16) & 0xff)}, ${up((v >> 8) & 0xff)}, ${up(v & 0xff)})`;
}
