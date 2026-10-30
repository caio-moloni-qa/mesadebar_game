// Taverna em Turnos: the buffs and debuffs a fighter carries, as a row of badges over their head (the turn-based RPG
// way): a green frame for what helps, a red one for what hurts, a counter where the status has one.

import { Fighter } from '../../core/tavern/TurnBattle';

export type StatusId = 'shield' | 'firm' | 'wall' | 'taunt' | 'poison' | 'mark' | 'weak' | 'stun';

export interface StatusBadge {
  id: StatusId;
  /** Helps its bearer (green frame) or hurts them (red). */
  good: boolean;
  /** Shield points, rounds of poison, marked hits; nothing for the ones that just last a turn. */
  count?: number;
}

/** What a fighter carries right now, buffs first. */
export function fighterStatuses(fighter: Fighter): StatusBadge[] {
  const out: StatusBadge[] = [];
  if (fighter.shield > 0) out.push({ id: 'shield', good: true, count: fighter.shield });
  if (fighter.firm) out.push({ id: 'firm', good: true });
  if (fighter.wall) out.push({ id: 'wall', good: true });
  if (fighter.taunting) out.push({ id: 'taunt', good: true });
  if (fighter.poison) out.push({ id: 'poison', good: false, count: fighter.poison.rounds });
  if (fighter.mark) out.push({ id: 'mark', good: false, count: fighter.mark.hits });
  if (fighter.weakened < 1) out.push({ id: 'weak', good: false });
  if (fighter.stunned) out.push({ id: 'stun', good: false });
  return out;
}

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** The hover tooltip of a badge: its name and what it does, with the bearer's numbers. */
export function statusInfo(fighter: Fighter, badge: StatusBadge): { title: string; text: string; good: boolean } {
  const info = (title: string, text: string) => ({ title, text, good: badge.good });
  switch (badge.id) {
    case 'shield': return info(`Escudo ${fighter.shield}`, `Absorve os próximos ${fighter.shield} de dano antes de chegar na vida.`);
    case 'firm': return info('Firme', 'Janela de aparar e de esquivar maior até o próximo turno.');
    case 'wall': return info('Muralha', fighter.wallAs === 'dodge'
      ? 'O próximo ataque contra ele é esquivado sozinho, sem precisar apertar nada.'
      : 'O próximo ataque contra ele é aparado sozinho (e ainda devolve o contra-ataque).');
    case 'taunt': return info('Provocando', 'Os inimigos são obrigados a atacar ele até o próximo turno.');
    case 'poison': {
      const rounds = fighter.poison?.rounds ?? 0;
      return info('Veneno', `Perde ${fighter.poison?.perRound ?? 0} de vida a cada rodada, por mais ${rounds} ${rounds === 1 ? 'rodada' : 'rodadas'}.`);
    }
    case 'mark': {
      const hits = fighter.mark?.hits ?? 0;
      return info('Marcado', `${hits === 1 ? 'O próximo golpe' : `Os próximos ${hits} golpes`} nele ${hits === 1 ? 'causa' : 'causam'} +${percent(fighter.mark?.ratio ?? 0)} de dano.`);
    }
    case 'weak': return info('Enfraquecido', `O próximo ataque dele causa só ${percent(fighter.weakened)} do dano.`);
    case 'stun': return info('Atordoado', 'Foi empurrado pra trás na fila de turnos: vai agir mais tarde.');
  }
}

/** A badge is drawn in a 24 px box, scaled up to read at a glance. */
const SIZE = 24;
const SCALE = 1.4;
const GAP = 5;

/** Where each of `count` badges sits (left edge, box side), centred on `x` — shared by the drawing and the hover. */
export function badgeLefts(x: number, count: number): { lefts: number[]; side: number } {
  const side = SIZE * SCALE;
  const left = Math.round(x - (count * side + (count - 1) * GAP) / 2);
  return { lefts: Array.from({ length: count }, (_, i) => left + i * (side + GAP)), side };
}
const COLOR: Record<StatusId, string> = {
  shield: '#e0a05a', firm: '#8fc8ff', wall: '#ffd75a', taunt: '#ff5a4a',
  poison: '#8de05a', mark: '#ff5a8a', weak: '#c58bff', stun: '#ffe066'
};

/** The badges, centred on `x` with their bottom at `bottom`; `popOf` scales one that just appeared (1 = settled). */
export function drawStatusBadges(ctx: CanvasRenderingContext2D, x: number, bottom: number, badges: StatusBadge[], popOf: (id: StatusId) => number): void {
  const { lefts, side } = badgeLefts(x, badges.length);
  badges.forEach((badge, i) => {
    const pop = popOf(badge.id);
    if (pop > 0) drawBadge(ctx, lefts[i] + side / 2, bottom - side / 2, badge, pop * SCALE);
  });
}

function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, badge: StatusBadge, pop: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  const half = SIZE / 2;
  ctx.fillStyle = '#140c08e8';
  ctx.fillRect(-half, -half, SIZE, SIZE);
  ctx.strokeStyle = badge.good ? '#5ad27a' : '#e0463a';
  ctx.lineWidth = 2;
  ctx.strokeRect(-half + 1, -half + 1, SIZE - 2, SIZE - 2);
  const color = COLOR[badge.id];
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  glyph(ctx, badge.id);
  if (badge.count !== undefined) {
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(String(badge.count), half + 2, half + 3);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(badge.count), half + 1, half + 2);
  }
  ctx.restore();
}

/** Each status's sign, drawn in the badge's ±8 px. */
function glyph(ctx: CanvasRenderingContext2D, id: StatusId): void {
  ctx.beginPath();
  switch (id) {
    case 'shield':
      ctx.moveTo(-7, -7); ctx.lineTo(7, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath();
      ctx.fill();
      break;
    case 'firm':
      // Two blades crossed: the parry held ready.
      ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7);
      ctx.stroke();
      ctx.fillRect(-8, 3, 4, 4);
      ctx.fillRect(4, 3, 4, 4);
      break;
    case 'wall':
      ctx.fillRect(-8, -7, 7, 4); ctx.fillRect(1, -7, 7, 4);
      ctx.fillRect(-4, -2, 8, 4); ctx.fillRect(-8, -2, 3, 4); ctx.fillRect(5, -2, 3, 4);
      ctx.fillRect(-8, 3, 7, 4); ctx.fillRect(1, 3, 7, 4);
      break;
    case 'taunt':
      ctx.fillRect(-2, -8, 4, 11);
      ctx.fillRect(-2, 5, 4, 3);
      break;
    case 'poison':
      ctx.moveTo(0, -8); ctx.quadraticCurveTo(7, 1, 0, 7); ctx.quadraticCurveTo(-7, 1, 0, -8);
      ctx.fill();
      break;
    case 'mark':
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.moveTo(0, -9); ctx.lineTo(0, -3); ctx.moveTo(0, 3); ctx.lineTo(0, 9);
      ctx.moveTo(-9, 0); ctx.lineTo(-3, 0); ctx.moveTo(3, 0); ctx.lineTo(9, 0);
      ctx.stroke();
      break;
    case 'weak':
      // Attack down: a blade with an arrow pointing down.
      ctx.moveTo(-2, -8); ctx.lineTo(2, -8); ctx.lineTo(2, 1); ctx.lineTo(6, 1); ctx.lineTo(0, 8); ctx.lineTo(-6, 1); ctx.lineTo(-2, 1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'stun':
      star(ctx, -3, -3, 5);
      star(ctx, 4, 4, 4);
      ctx.fill();
      break;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.3, y + r * 0.3);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3);
  ctx.closePath();
}
