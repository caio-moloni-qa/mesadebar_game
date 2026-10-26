import { CHARACTERS, CharacterId } from '../../config/characters';
import { HeroId } from '../../core/progress/Progress';
import { QUEST_NPCS } from '../../core/systems/QuestSystem';

/** Display name for any hero on the roster: the four starting ones, the regulars, Sergio. */
export function heroName(id: HeroId): string {
  if (id in CHARACTERS) return CHARACTERS[id as CharacterId].name;
  if (id === 'sergio') return 'Sergio';
  return QUEST_NPCS.find((npc) => npc.id === id)?.name ?? id;
}
