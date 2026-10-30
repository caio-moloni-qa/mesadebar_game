import { ReactionWindowsConfig } from '../../config/tavernBattle';

/** What the player pressed when a hit came: J aparar, K esquivar. */
export type ReactionKind = 'parry' | 'dodge';
/** How a hit resolved: parried, dodged, taken (damage), an early press (input locked, the hit still coming), or a
 *  feint held (nobody bit: Zora's arm never came down). */
export type ReactionResult = 'parry' | 'dodge' | 'taken' | 'early' | 'held';

export interface ReactionWindows { parryMs: number; dodgeMs: number; earlyLockMs: number }

/** The windows in play for a defender: Firmar and skills (`parryBonusMs`) widen the parry window, assisted mode scales
 *  both. */
export function reactionWindows(config: ReactionWindowsConfig, options: { firm?: boolean; assisted?: boolean; parryBonusMs?: number; dodgeBonusMs?: number } = {}): ReactionWindows {
  const scale = options.assisted ? config.assistedScale : 1;
  return {
    parryMs: (config.parryMs + (options.firm ? config.firmBonusMs : 0) + (options.parryBonusMs ?? 0)) * scale,
    dodgeMs: (config.dodgeMs + (options.dodgeBonusMs ?? 0)) * scale,
    earlyLockMs: config.earlyLockMs
  };
}

/** The timing judgement, the heart of the mode. `hitAt` / `pressedAt` are SimClock times. |offset| <= parryMs with
 *  'parry' → parry; a parry outside that but inside dodgeMs → taken (the risk of going for the perfect answer);
 *  'dodge' inside dodgeMs → dodge; anything outside dodgeMs → early (the caller locks input earlyLockMs). */
export function judgeReaction(kind: ReactionKind, hitAt: number, pressedAt: number, windows: ReactionWindows): ReactionResult {
  const offset = Math.abs(pressedAt - hitAt);
  if (offset > windows.dodgeMs) return 'early';
  if (kind === 'dodge') return 'dodge';
  return offset <= windows.parryMs ? 'parry' : 'taken';
}
