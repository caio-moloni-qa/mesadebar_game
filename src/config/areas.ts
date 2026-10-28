import type { QuestNpcId } from '../core/systems/QuestSystem';
import { CharacterId } from './characters';

/** A region of the world: its own arena, its own tavern. A regular can only be won over in their area (their
 *  missions are given there); once all of them have joined, the area's finale hero follows. Finishing an area means
 *  bringing every one of them into your roster. */
export interface AreaConfig {
  id: string;
  name: string;
  /** The tavern regulars met here (QuestNpc ids), in table order. */
  regulars: QuestNpcId[];
  /** Unlocked last, once every regular here has joined (plus a mastery total): Greenfield's is Sergio. The Campo
   *  Nevado's isn't decided yet. */
  finale?: CharacterId;
}

export const AREAS: AreaConfig[] = [
  { id: 'greenfield', name: 'Greenfield', regulars: ['brom', 'lyra', 'grimbo', 'zora'], finale: 'sergio' },
  // Met in the Esquimó's igloo, during the blizzard.
  { id: 'snowfield', name: 'Campo Nevado', regulars: ['joe', 'beast', 'voly'] }
];

/** The first area (the tavern between runs is Greenfield's). */
export const CURRENT_AREA = AREAS[0];
