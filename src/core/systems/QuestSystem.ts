import { EventBus } from '../EventBus';
import { Rng, Vec2, floatBetween } from '../math';
import { PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';

// The tavern's regulars (the merchant's room is a fantasy bar): each one hands out a mission to do out on the arena.
// Accept it at their table, finish it out there, then come back through the portal and talk to them again to claim the
// reward. Three missions each, harder every time, then they've nothing left for you this run.

export type QuestNpcId = 'brom' | 'lyra' | 'grimbo' | 'zora';

export type QuestGoal =
  /** Walk over this many lost barrels scattered on the arena (they appear when the mission is accepted). */
  | { type: 'barrels'; count: number }
  /** Defeat this many enemies (any kind). */
  | { type: 'kills'; count: number }
  /** Go this long without taking damage (counts only out on the arena; a hit resets it). */
  | { type: 'untouched'; ms: number }
  /** Defeat this many zone guardians. */
  | { type: 'guardians'; count: number };

export type QuestReward =
  | { type: 'currency'; amount: number }
  | { type: 'max-health'; amount: number }
  | { type: 'damage'; percent: number }
  /** This many random upgrades, like opening that many chests. */
  | { type: 'upgrades'; count: number };

export interface QuestSpec {
  title: string;
  /** What the NPC says when offering it. */
  pitch: string;
  goal: QuestGoal;
  reward: QuestReward;
}

export interface QuestNpc {
  id: QuestNpcId;
  name: string;
  /** Who they are, under the name. */
  epithet: string;
  /** What they say when you claim a reward. */
  thanks: string;
  /** What they say once they've nothing left to give. */
  done: string;
  quests: QuestSpec[];
}

export const QUEST_NPCS: QuestNpc[] = [
  {
    id: 'brom',
    name: 'Brom Barbaferro',
    epithet: 'Anão cervejeiro',
    thanks: 'Pelas barbas do meu avô, meus barris! Tome, você mereceu.',
    done: 'Meus barris estão todos de volta. Uma rodada por conta da casa!',
    quests: [
      { title: 'Barris Perdidos', pitch: 'Uns esqueletos invadiram minha adega e espalharam meus barris de hidromel pela arena! Traga 3 de volta e eu te deixo mais forte que um troll.', goal: { type: 'barrels', count: 3 }, reward: { type: 'max-health', amount: 30 } },
      { title: 'A Safra Roubada', pitch: 'Roubaram a safra inteira desta vez. São 5 barris espalhados por aí. Ninguém mexe com a cerveja de um anão!', goal: { type: 'barrels', count: 5 }, reward: { type: 'max-health', amount: 50 } },
      { title: 'O Barril Ancestral', pitch: 'A reserva do meu clã, 7 barris com séculos de idade. Se você trouxer todos, juro pela forja que nunca mais vai cair fácil.', goal: { type: 'barrels', count: 7 }, reward: { type: 'max-health', amount: 80 } }
    ]
  },
  {
    id: 'lyra',
    name: 'Lyra Folhaverde',
    epithet: 'Elfa caçadora',
    thanks: 'Belo trabalho. A floresta respira um pouco melhor hoje.',
    done: 'Você caça como um dos nossos. Não tenho mais nada a te ensinar.',
    quests: [
      { title: 'Caçada', pitch: 'Os mortos-vivos estão sujando a floresta. Derrube 100 deles e eu te mostro onde mirar.', goal: { type: 'kills', count: 100 }, reward: { type: 'damage', percent: 10 } },
      { title: 'A Grande Caçada', pitch: 'Eles não param de vir. Derrube 250 e afio suas armas com uma pedra élfica.', goal: { type: 'kills', count: 250 }, reward: { type: 'damage', percent: 15 } },
      { title: 'Lenda da Caça', pitch: 'Quinhentos. É o que uma lenda faria. Prove que é uma.', goal: { type: 'kills', count: 500 }, reward: { type: 'damage', percent: 20 } }
    ]
  },
  {
    id: 'grimbo',
    name: 'Grimbo Dedoleve',
    epithet: 'Goblin apostador',
    thanks: 'Hehehe, perdi a aposta! Toma suas moedas... todas elas. Quase todas.',
    done: 'Chega, chega! Você já me depenou. Vai apostar com outro!',
    quests: [
      { title: 'Sem um Arranhão', pitch: 'Aposto 200 moedas que você não aguenta 30 segundos lá fora sem levar um arranhão. Hehe, topa?', goal: { type: 'untouched', ms: 30_000 }, reward: { type: 'currency', amount: 200 } },
      { title: 'Dobro ou Nada', pitch: 'Sorte de principiante! Dobro ou nada: 45 segundos sem um arranhão.', goal: { type: 'untouched', ms: 45_000 }, reward: { type: 'currency', amount: 400 } },
      { title: 'A Aposta Final', pitch: 'Tudo o que eu tenho: um minuto inteiro sem levar um arranhão. Ninguém consegue. Ninguém!', goal: { type: 'untouched', ms: 60_000 }, reward: { type: 'currency', amount: 800 } }
    ]
  },
  {
    id: 'zora',
    name: 'Madame Zora',
    epithet: 'Vidente',
    thanks: 'As cartas não mentem... o destino sorri para você.',
    done: 'Seu destino já está escrito, viajante. Vá cumpri-lo.',
    quests: [
      { title: 'A Profecia', pitch: 'As cartas mostram um guardião despertando na arena... Derrote-o e o destino lhe dará um presente.', goal: { type: 'guardians', count: 1 }, reward: { type: 'upgrades', count: 1 } },
      { title: 'Os Dois Guardiões', pitch: 'Vejo dois guardiões nas cartas, e dois presentes para quem os derrubar.', goal: { type: 'guardians', count: 2 }, reward: { type: 'upgrades', count: 2 } },
      { title: 'O Destino Selado', pitch: 'Três guardiões, três presentes. Depois disso, nem as cartas sabem o que vem.', goal: { type: 'guardians', count: 3 }, reward: { type: 'upgrades', count: 3 } }
    ]
  }
];

/** Every NPC's mission: on offer, under way, done and waiting to be claimed, or no more missions. */
export type QuestStatus = 'offer' | 'active' | 'ready' | 'done';

export interface QuestState {
  npc: QuestNpc;
  /** Index into npc.quests of the current mission. */
  tier: number;
  status: QuestStatus;
  /** Barrels / kills / guardians so far, or ms untouched. */
  progress: number;
}

export interface QuestEvents extends Record<string, unknown> {
  'quest-accepted': { npc: QuestNpcId; title: string };
  'quest-progress': { npc: QuestNpcId; progress: number; goal: number };
  'quest-completed': { npc: QuestNpcId; title: string };
  'quest-claimed': { npc: QuestNpcId; reward: QuestReward };
  'barrel-collected': { x: number; y: number };
}

interface QuestTrigger {
  'enemy-defeated': unknown;
  'player-damaged': unknown;
  'miniboss-defeated': unknown;
}

export interface QuestHost {
  readonly player: PlayerState;
  readonly rng: Rng;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<QuestEvents & QuestTrigger>, 'emit' | 'on'>;
}

/** Walk this close to a barrel to pick it up. */
const BARREL_REACH = 45;

export function goalAmount(goal: QuestGoal): number {
  return goal.type === 'untouched' ? goal.ms : goal.count;
}

export class QuestSystem {
  readonly quests: QuestState[] = QUEST_NPCS.map((npc) => ({ npc, tier: 0, status: 'offer', progress: 0 }));
  /** Brom's barrels still lying on the arena. */
  barrels: Vec2[] = [];

  /** `startTiers`: missions already done with each regular in earlier runs — they offer the next one (or nothing). */
  constructor(private readonly host: QuestHost, startTiers: Partial<Record<QuestNpcId, number>> = {}) {
    this.quests.forEach((quest) => {
      quest.tier = Math.min(quest.npc.quests.length, Math.max(0, Math.floor(startTiers[quest.npc.id] ?? 0)));
      if (quest.tier >= quest.npc.quests.length) quest.status = 'done';
    });
    host.events.on('enemy-defeated', () => this.advance('kills', 1));
    host.events.on('miniboss-defeated', () => this.advance('guardians', 1));
    host.events.on('player-damaged', () => {
      this.quests.forEach((quest) => {
        if (quest.status === 'active' && this.spec(quest).goal.type === 'untouched') quest.progress = 0;
      });
    });
  }

  spec(quest: QuestState): QuestSpec {
    return quest.npc.quests[Math.min(quest.tier, quest.npc.quests.length - 1)];
  }

  /** Missions under way or waiting to be claimed (the HUD's tracker). */
  get tracked(): QuestState[] {
    return this.quests.filter((quest) => quest.status === 'active' || quest.status === 'ready');
  }

  accept(index: number): boolean {
    const quest = this.quests[index];
    if (!quest || quest.status !== 'offer') return false;
    quest.status = 'active';
    quest.progress = 0;
    const spec = this.spec(quest);
    if (spec.goal.type === 'barrels') this.scatterBarrels(spec.goal.count);
    this.host.events.emit('quest-accepted', { npc: quest.npc.id, title: spec.title });
    return true;
  }

  /** Hands over a finished mission's reward (the caller applies it) and moves that NPC on to their next one. */
  claim(index: number): QuestReward | null {
    const quest = this.quests[index];
    if (!quest || quest.status !== 'ready') return null;
    const { reward } = this.spec(quest);
    quest.tier += 1;
    quest.progress = 0;
    quest.status = quest.tier >= quest.npc.quests.length ? 'done' : 'offer';
    this.host.events.emit('quest-claimed', { npc: quest.npc.id, reward });
    return reward;
  }

  /** Sandbox: finish every mission under way. */
  completeActive(): void {
    this.barrels = [];
    this.quests.forEach((quest) => {
      if (quest.status === 'active') this.addProgress(quest, goalAmount(this.spec(quest).goal));
    });
  }

  /** Out on the arena only (the session doesn't step it inside the tavern). */
  update(delta: number): void {
    this.quests.forEach((quest) => {
      if (quest.status === 'active' && this.spec(quest).goal.type === 'untouched') this.addProgress(quest, delta);
    });
    if (this.barrels.length === 0) return;
    const { player } = this.host;
    const reach = BARREL_REACH + player.radius;
    const left = this.barrels.filter((barrel) => {
      if (Math.hypot(player.x - barrel.x, player.y - barrel.y) > reach) return true;
      this.host.events.emit('barrel-collected', barrel);
      this.advance('barrels', 1);
      return false;
    });
    this.barrels = left;
  }

  private advance(type: QuestGoal['type'], amount: number): void {
    this.quests.forEach((quest) => {
      if (quest.status === 'active' && this.spec(quest).goal.type === type) this.addProgress(quest, amount);
    });
  }

  private addProgress(quest: QuestState, amount: number): void {
    const spec = this.spec(quest);
    const goal = goalAmount(spec.goal);
    const before = quest.progress;
    quest.progress = Math.min(goal, quest.progress + amount);
    // Timers report whole seconds, counters every step.
    if (spec.goal.type !== 'untouched' || Math.floor(before / 1000) !== Math.floor(quest.progress / 1000)) {
      this.host.events.emit('quest-progress', { npc: quest.npc.id, progress: quest.progress, goal });
    }
    if (quest.progress < goal) return;
    quest.status = 'ready';
    this.host.events.emit('quest-completed', { npc: quest.npc.id, title: spec.title });
  }

  /** Walkable spots well spread over the arena, away from the hero and the water. */
  private scatterBarrels(count: number): void {
    const { arena, rng, player } = this.host;
    const placed: Vec2[] = [];
    for (let attempt = 0; attempt < 400 && placed.length < count; attempt += 1) {
      const x = floatBetween(rng, 250, arena.size - 250);
      const y = floatBetween(rng, 250, arena.size - 250);
      const spread = attempt < 300 ? 500 : 250;
      if (Math.hypot(x - player.x, y - player.y) < 450) continue;
      if (placed.some((other) => Math.hypot(x - other.x, y - other.y) < spread)) continue;
      if (!arena.isWalkable(x, y, 30) || arena.shoreDistance(x, y) < 60) continue;
      placed.push({ x, y });
    }
    this.barrels.push(...placed);
    // Whatever couldn't be placed (a tiny or crowded arena) doesn't block the mission.
    const quest = this.quests.find((candidate) => candidate.status === 'active' && this.spec(candidate).goal.type === 'barrels');
    if (quest && placed.length < count) this.addProgress(quest, count - placed.length);
  }
}
