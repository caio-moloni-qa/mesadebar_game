import { EventBus } from '../EventBus';
import { Rng, Vec2, floatBetween } from '../math';
import { PlayerState } from '../session/entities';
import { ArenaMap } from '../world/ArenaMap';

// The tavern's regulars (the merchant's room is a fantasy bar): each one hands out a mission to do out on the arena.
// Accept it at their table, finish it out there, then come back through the portal and talk to them again to claim the
// reward. Three missions each, harder every time, then they've nothing left for you this run. Every area has its own
// regulars: Greenfield's at the tavern, the Campo Nevado's (Joe, Beast and Voly) in the Esquimó's igloo.

export type QuestNpcId = 'brom' | 'lyra' | 'grimbo' | 'zora' | 'joe' | 'beast' | 'voly';

export type QuestGoal =
  /** Walk over this many lost barrels scattered on the arena (they appear when the mission is accepted). */
  | { type: 'barrels'; count: number }
  /** Defeat this many enemies (any kind). */
  | { type: 'kills'; count: number }
  /** Go this long without taking damage (counts only out on the arena; a hit resets it). */
  | { type: 'untouched'; ms: number }
  /** Defeat this many zone guardians. */
  | { type: 'guardians'; count: number }
  /** Walk over this many memory fragments (Joe's), scattered like the barrels. `storm`: they only shine (and can only
   *  be picked up) while a blizzard front blows. `unfrozen`: freezing solid scatters them all again, from zero. */
  | { type: 'fragments'; count: number; storm?: boolean; unfrozen?: boolean }
  /** Tame this many calm neutrals (stand by one while the mission is on); `distinct`: of that many kinds. */
  | { type: 'tame'; count: number; distinct?: boolean }
  /** Bring down this many wolf packs, every last wolf of each. */
  | { type: 'packs'; count: number }
  /** Break this many ice blocks (they rise around the map when the mission is accepted). */
  | { type: 'ice-blocks'; count: number }
  /** Ride out this long of blizzard away from the torches (warming at one starts it over). */
  | { type: 'cold-endurance'; ms: number };

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

/** The Campo Nevado's regulars, at the igloo's tables. */
export const SNOWFIELD_QUEST_NPCS: QuestNpc[] = [
  {
    id: 'joe',
    name: 'Joe',
    epithet: 'Cubo de Gelo Mágico',
    thanks: 'Ahh... lembrei! Obrigado, amigo. Toma, um pedacinho da minha mente.',
    done: 'Minha mente está inteira de novo. Clarinha como gelo.',
    quests: [
      { title: 'Pensamentos Perdidos', pitch: 'A nevasca partiu minha mente em pedacinhos... Tem 3 fragmentos de memória brilhando lá fora. Traz pra mim?', goal: { type: 'fragments', count: 3 }, reward: { type: 'upgrades', count: 1 } },
      { title: 'Memórias na Tempestade', pitch: 'Os fragmentos mais fundos só brilham quando a nevasca sopra. Traga 5, no meio da tempestade.', goal: { type: 'fragments', count: 5, storm: true }, reward: { type: 'upgrades', count: 2 } },
      { title: 'Mente Clara', pitch: 'Os últimos 7. Mas cuidado: se você congelar, eles se espalham de novo. Mente fria, corpo quente!', goal: { type: 'fragments', count: 7, unfrozen: true }, reward: { type: 'upgrades', count: 3 } }
    ]
  },
  {
    id: 'beast',
    name: 'Beast',
    epithet: 'Domadora de Feras',
    thanks: 'Isso! Os bichos já te respeitam.',
    done: 'A alcateia te chama de irmão agora. Não tenho mais nada pra te ensinar.',
    quests: [
      { title: 'A Domadora', pitch: 'Bicho calmo não morde quem chega devagar. Enquanto essa missão durar, eles não fogem de você: fique pertinho de um até ele confiar. Dome 1.', goal: { type: 'tame', count: 1 }, reward: { type: 'damage', percent: 10 } },
      { title: 'A Matilha', pitch: 'Uma matilha de Lobos do Gelo anda caçando no campo. Derrube a matilha inteira, até o último lobo.', goal: { type: 'packs', count: 1 }, reward: { type: 'damage', percent: 15 } },
      { title: 'Coração Selvagem', pitch: 'Agora três bichos diferentes, na mesma corrida. Mostre que qualquer fera te segue.', goal: { type: 'tame', count: 3, distinct: true }, reward: { type: 'damage', percent: 20 } }
    ]
  },
  {
    id: 'voly',
    name: 'Voly',
    epithet: 'Urso Polar de Armadura',
    thanks: 'Grrr... bom trabalho. Urso não esquece favor.',
    done: 'Minha dívida com você está paga. Por enquanto.',
    quests: [
      { title: 'Gelo Quebrado', pitch: 'Uns blocos de gelo brotaram pelo campo inteiro e travam o meu caminho. Quebre 10 deles.', goal: { type: 'ice-blocks', count: 10 }, reward: { type: 'max-health', amount: 30 } },
      { title: 'Dois Guardiões', pitch: 'Os guardiões deste campo me devem. Derrube 2 numa corrida só e eu te pago a parte deles.', goal: { type: 'guardians', count: 2 }, reward: { type: 'max-health', amount: 50 } },
      { title: 'A Revanche', pitch: 'Encare a nevasca de peito aberto: 60 segundos de tempestade sem chegar perto de uma tocha.', goal: { type: 'cold-endurance', ms: 60_000 }, reward: { type: 'max-health', amount: 80 } }
    ]
  }
];

export const ALL_QUEST_NPCS: QuestNpc[] = [...QUEST_NPCS, ...SNOWFIELD_QUEST_NPCS];

/** The regulars of the area an arena belongs to (Greenfield's tavern for anything else). */
export function questNpcsFor(arenaId: string): QuestNpc[] {
  return arenaId === 'snowfield' ? SNOWFIELD_QUEST_NPCS : QUEST_NPCS;
}

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
  'fragment-collected': { x: number; y: number };
}

interface QuestTrigger {
  'enemy-defeated': { variantId: string };
  'player-damaged': unknown;
  'miniboss-defeated': unknown;
  'player-frozen': unknown;
  'neutral-tamed': { variant: string };
  'wolf-pack-defeated': unknown;
}

export interface QuestHost {
  readonly player: PlayerState;
  readonly rng: Rng;
  readonly arena: ArenaMap;
  readonly events: Pick<EventBus<QuestEvents & QuestTrigger>, 'emit' | 'on'>;
  /** The Nevasca, where there is one: a front blowing now, and the hero warming at a torch. */
  readonly weather?: { storm(): boolean; warmed(): boolean };
  /** Voly's mission: raise this many ice blocks around the map; returns how many it could place. */
  raiseIceBlocks?(count: number): number;
}

/** Walk this close to a barrel (or a memory fragment) to pick it up. */
const BARREL_REACH = 45;
/** Ice blocks are breakable scenery, not a kill. */
const ICE_BLOCK = 'iceBlock';

/** Goals counted in milliseconds (the tracker shows seconds). */
export const isTimedGoal = (goal: QuestGoal): goal is Extract<QuestGoal, { ms: number }> => goal.type === 'untouched' || goal.type === 'cold-endurance';

export function goalAmount(goal: QuestGoal): number {
  return isTimedGoal(goal) ? goal.ms : goal.count;
}

export class QuestSystem {
  readonly quests: QuestState[];
  /** Brom's barrels still lying on the arena. */
  barrels: Vec2[] = [];
  /** Joe's memory fragments still lying on the arena. */
  fragments: Vec2[] = [];
  /** Kinds tamed for the mission under way (a `distinct` one counts each kind once). */
  private readonly tamedKinds = new Set<string>();

  /** `startTiers`: missions already done with each regular in earlier runs — they offer the next one (or nothing).
   *  `npcs`: the area's regulars (Greenfield's by default). */
  constructor(private readonly host: QuestHost, startTiers: Partial<Record<QuestNpcId, number>> = {}, npcs: QuestNpc[] = QUEST_NPCS) {
    this.quests = npcs.map((npc) => ({ npc, tier: 0, status: 'offer', progress: 0 }));
    this.quests.forEach((quest) => {
      quest.tier = Math.min(quest.npc.quests.length, Math.max(0, Math.floor(startTiers[quest.npc.id] ?? 0)));
      if (quest.tier >= quest.npc.quests.length) quest.status = 'done';
    });
    host.events.on('enemy-defeated', ({ variantId }) => this.advance(variantId === ICE_BLOCK ? 'ice-blocks' : 'kills', 1));
    host.events.on('miniboss-defeated', () => this.advance('guardians', 1));
    host.events.on('wolf-pack-defeated', () => this.advance('packs', 1));
    host.events.on('neutral-tamed', ({ variant }) => {
      const quest = this.activeWith('tame');
      const goal = quest && this.spec(quest).goal;
      if (!quest || goal?.type !== 'tame' || (goal.distinct && this.tamedKinds.has(variant))) return;
      this.tamedKinds.add(variant);
      this.addProgress(quest, 1);
    });
    host.events.on('player-damaged', () => {
      this.quests.forEach((quest) => {
        if (quest.status === 'active' && this.spec(quest).goal.type === 'untouched') quest.progress = 0;
      });
    });
    // Mente Clara: frozen solid, the memories scatter all over again.
    host.events.on('player-frozen', () => {
      const quest = this.activeWith('fragments');
      const goal = quest && this.spec(quest).goal;
      if (!quest || goal?.type !== 'fragments' || !goal.unfrozen) return;
      quest.progress = 0;
      this.fragments = [];
      this.scatter(goal.count, 'fragments');
      this.host.events.emit('quest-progress', { npc: quest.npc.id, progress: 0, goal: goal.count });
    });
  }

  /** The mission under way with this kind of goal, if any. */
  activeWith(type: QuestGoal['type']): QuestState | null {
    return this.quests.find((quest) => quest.status === 'active' && this.spec(quest).goal.type === type) ?? null;
  }

  /** Joe's fragments shine now (a storm-only mission's only while a front blows). */
  get fragmentsShowing(): boolean {
    const quest = this.activeWith('fragments');
    const goal = quest && this.spec(quest).goal;
    return this.fragments.length > 0 && !(goal?.type === 'fragments' && goal.storm && !this.host.weather?.storm());
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
    if (spec.goal.type === 'barrels') this.scatter(spec.goal.count, 'barrels');
    if (spec.goal.type === 'fragments') this.scatter(spec.goal.count, 'fragments');
    if (spec.goal.type === 'tame') this.tamedKinds.clear();
    if (spec.goal.type === 'ice-blocks') {
      // Whatever couldn't be raised (a crowded map) doesn't block the mission.
      const raised = this.host.raiseIceBlocks?.(spec.goal.count) ?? 0;
      if (raised < spec.goal.count) this.addProgress(quest, spec.goal.count - raised);
    }
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
    this.fragments = [];
    this.quests.forEach((quest) => {
      if (quest.status === 'active') this.addProgress(quest, goalAmount(this.spec(quest).goal));
    });
  }

  /** Out on the arena only (the session doesn't step it inside the tavern). */
  update(delta: number): void {
    this.quests.forEach((quest) => {
      if (quest.status === 'active' && this.spec(quest).goal.type === 'untouched') this.addProgress(quest, delta);
    });
    const enduring = this.activeWith('cold-endurance');
    const weather = this.host.weather;
    if (enduring && weather?.storm()) {
      // A torch's warmth starts it over; out in the cold, it counts.
      if (weather.warmed()) enduring.progress = 0;
      else this.addProgress(enduring, delta);
    }
    const { player } = this.host;
    const reach = BARREL_REACH + player.radius;
    const pickUp = (spots: Vec2[], type: 'barrels' | 'fragments') => spots.filter((spot) => {
      if (Math.hypot(player.x - spot.x, player.y - spot.y) > reach) return true;
      this.host.events.emit(type === 'barrels' ? 'barrel-collected' : 'fragment-collected', spot);
      this.advance(type, 1);
      return false;
    });
    if (this.barrels.length > 0) this.barrels = pickUp(this.barrels, 'barrels');
    if (this.fragmentsShowing) this.fragments = pickUp(this.fragments, 'fragments');
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
    if (!isTimedGoal(spec.goal) || Math.floor(before / 1000) !== Math.floor(quest.progress / 1000)) {
      this.host.events.emit('quest-progress', { npc: quest.npc.id, progress: quest.progress, goal });
    }
    if (quest.progress < goal) return;
    quest.status = 'ready';
    this.host.events.emit('quest-completed', { npc: quest.npc.id, title: spec.title });
  }

  /** Walkable spots well spread over the arena, away from the hero and the water: Brom's barrels, Joe's fragments. */
  private scatter(count: number, type: 'barrels' | 'fragments'): void {
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
    this[type].push(...placed);
    // Whatever couldn't be placed (a tiny or crowded arena) doesn't block the mission.
    const quest = this.activeWith(type);
    if (quest && placed.length < count) this.addProgress(quest, count - placed.length);
  }
}
