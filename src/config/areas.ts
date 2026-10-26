import { CharacterId } from './characters';

/** A region of the world: its own arena, its own tavern. A regular can only be won over in their area (their
 *  missions are given there); once all of them have joined, the area's finale hero follows. Finishing an area means
 *  bringing every one of them into your roster. */
export interface AreaConfig {
  id: string;
  name: string;
  /** The tavern regulars met here (QUEST_NPCS ids), in table order. */
  regulars: CharacterId[];
  /** Unlocked last, once every regular here has joined (plus a mastery total): Greenfield's is Sergio. */
  finale: CharacterId;
}

export const AREAS: AreaConfig[] = [
  { id: 'greenfield', name: 'Greenfield', regulars: ['brom', 'lyra', 'grimbo', 'zora'], finale: 'sergio' }
];

/** The only area so far: every run is played here. */
export const CURRENT_AREA = AREAS[0];
