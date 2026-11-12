/**
 * The duel's text budget (venivium-player-experience §5): which floating word shows, where and when.
 * Pure decisions, no drawing: the stage asks `admitFloat` before it shows a word and `visibleFloats` before it draws.
 *
 * - one slot per fighter: a word of the same kind within MERGE_MS merges (`-4` + `-6` = `-10`), a status and a number
 *   landing together become one unit (status on top, number under it), a stronger word takes the slot, a weaker one
 *   waits for it (dropped if it would wait longer than WAIT_MS);
 * - the centre callout is a queue of one (a stronger callout cuts the one showing);
 * - at most MAX_VISIBLE fighter slots on screen at once (the strongest win);
 * - a speech line ('speech') is dialogue, outside the budget.
 */

export interface FloatText {
  text: string;
  color: string;
  x: number;
  y: number;
  /** Battle clock (ms) the word appears. */
  at: number;
  size: number;
  life: number;
  /** 'callout' (centre of the stage), 'speech' (a line over a fighter), or the fighter id whose slot it uses. */
  lane: string;
  prio: number;
  /** Numbers that merge with the same kind in the same slot. */
  merge?: { kind: MergeKind; value: number };
}

export type MergeKind = 'damage' | 'heal' | 'poison' | 'fichas' | 'courage';

/** Priority (§5): knockout > crit / perfect > status applied > damage > heal > tick > info. */
export const PRIO = { info: 0, tick: 1, heal: 2, damage: 3, status: 4, big: 5, knockout: 6 } as const;

export const MERGE_MS = 400;
export const WAIT_MS = 600;
/** A status and a number this close together read as one unit. */
export const PAIR_MS = 200;
export const MAX_VISIBLE = 3;

export function mergedText(kind: MergeKind, value: number): string {
  switch (kind) {
    case 'damage': return `-${value}`;
    case 'heal': return `+${value}`;
    case 'poison': return `VENENO -${value}`;
    case 'fichas': return `+${value} FICHA${value === 1 ? '' : 'S'}`;
    case 'courage': return `-${value} CORAGEM`;
  }
}

const end = (float: FloatText) => float.at + float.life;

/** A replacement owns the slot immediately; crossfading two words at the same position makes both unreadable. */
const cut = (float: FloatText, at: number): FloatText => ({ ...float, life: Math.max(0, Math.min(float.life, at - float.at)) });

/** The list with `next` placed by the budget (merged, paired, queued, replacing, or dropped). */
export function admitFloat(list: FloatText[], next: FloatText): FloatText[] {
  if (next.lane === 'speech') return [...list, next];
  const live = list.filter((float) => float.lane === next.lane && end(float) > next.at);
  if (next.lane === 'callout') {
    const strongest = Math.max(-1, ...live.map((float) => float.prio));
    if (next.prio > strongest) return [...list.map((float) => (live.includes(float) ? (float.at > next.at ? null : cut(float, next.at)) : float)).filter((f): f is FloatText => f !== null), next];
    const free = Math.max(...live.map(end));
    return free - next.at > WAIT_MS ? list : [...list, { ...next, at: free }];
  }
  if (live.length === 0) return [...list, next];
  // Same kind, close together: one bigger number.
  const twin = next.merge && live.find((float) => float.merge?.kind === next.merge!.kind && Math.abs(float.at - next.at) <= MERGE_MS);
  if (twin && next.merge) {
    const value = twin.merge!.value + next.merge.value;
    return list.map((float) => (float === twin ? { ...float, merge: { kind: next.merge!.kind, value }, text: mergedText(next.merge!.kind, value), size: Math.max(float.size, next.size), prio: Math.max(float.prio, next.prio) } : float));
  }
  // A status and a number together: one unit, the status on top.
  const partner = live.length === 1 && Math.abs(live[0].at - next.at) <= PAIR_MS && !live[0].merge !== !next.merge ? live[0] : null;
  if (partner) {
    const number = partner.merge ? partner : next;
    const status = partner.merge ? next : partner;
    const placed = { ...number, y: status.y + Math.round(status.size * 1.2), at: Math.max(number.at, status.at) };
    return [...list.filter((float) => float !== partner), status, placed];
  }
  const top = live.reduce((a, b) => (b.prio > a.prio ? b : a));
  if (next.prio >= top.prio) {
    return [...list.map((float) => (live.includes(float) ? (float.at > next.at ? null : cut(float, next.at)) : float)).filter((f): f is FloatText => f !== null), next];
  }
  const free = Math.max(...live.map(end));
  return free - next.at > WAIT_MS ? list : [...list, { ...next, at: free }];
}

/** What to draw now: the live callout and speech, plus the strongest MAX_VISIBLE fighter slots. */
export function visibleFloats(list: FloatText[], now: number): FloatText[] {
  const live = list.filter((float) => float.at <= now && now < end(float));
  const slots = new Map<string, number>();
  live.forEach((float) => {
    if (float.lane === 'callout' || float.lane === 'speech') return;
    slots.set(float.lane, Math.max(slots.get(float.lane) ?? -1, float.prio * 1e7 + float.at / 1e3));
  });
  const kept = new Set([...slots.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VISIBLE).map(([lane]) => lane));
  return live.filter((float) => float.lane === 'callout' || float.lane === 'speech' || kept.has(float.lane));
}
