// Taverna em Turnos: the regulars' skill trees (Brom in phase 2, the other four in phase 3), as data the core's
// SkillTree and TurnBattle interpret. 3 branches × 4 nodes per regular; node N needs node N−1 of its branch; node 4 is
// a finisher (one equipped at a time). The third branch is always the reaction branch.

/** What a node does. Actives are used from the duel's "Habilidade" menu for Coragem; passives are always on. */
export type SkillEffect =
  /** Hits the enemy for `ratio` × the user's attack. */
  | { type: 'damage'; ratio: number }
  /** Hits every enemy standing for `ratio` × the user's attack (the squad's sweeping finishers). */
  | { type: 'damageAll'; ratio: number }
  /** Heals every living member of the user's side a flat amount. */
  | { type: 'healAll'; amount: number }
  /** A shield of this much on every living member of the user's side. */
  | { type: 'shieldAll'; amount: number }
  /** Draws every enemy attack onto the user until their next turn; optionally weakens the next one (× ratio) and
   *  raises a shield. */
  | { type: 'taunt'; weaken?: number; shield?: number }
  /** Hits for `ratio` × attack and pushes the target's next turn back by `delay` of the initiative meter. */
  | { type: 'stun'; ratio: number; delay: number }
  /** Heals a flat amount. */
  | { type: 'heal'; amount: number }
  /** Heals this share of max HP and sobers up (tipsiness back to 0). */
  | { type: 'sober'; ratio: number }
  /** A shield that soaks this much damage before HP. */
  | { type: 'shield'; amount: number }
  /** The target's next attack hits for this share of its damage. */
  | { type: 'weaken'; ratio: number }
  /** The next attack aimed at the user is answered on its own, every hit: parried (so it ends in a counter), or
   *  dodged with `as: 'dodge'` (feints are held either way). */
  | { type: 'wall'; as?: 'parry' | 'dodge' }
  /** Hits for `ratio` × attack, then poisons: `perRound` damage at the start of each of the next `rounds` rounds. */
  | { type: 'poison'; ratio: number; perRound: number; rounds: number }
  /** Marks the target: the next `hits` blows it takes from the party hit for (1 + ratio) ×. */
  | { type: 'mark'; ratio: number; hits: number }
  /** Rolls the damage: a seeded ratio between min and max × attack. */
  | { type: 'gamble'; min: number; max: number }
  /** Hits for `ratio` × attack and pockets `fichas` (paid out after the duel, win or lose). */
  | { type: 'steal'; ratio: number; fichas: number }
  /** Passive: party blows (attacks and damage skills) crit for double with this chance. */
  | { type: 'crit'; chance: number }
  /** Passive: the dodge window grows by this many ms. */
  | { type: 'dodgeBonus'; ms: number }
  /** Passive: every perfect parry pockets this many fichas. */
  | { type: 'parryLoot'; fichas: number }
  /** Passive: feints show on the timing track and the dice show before they're thrown. */
  | { type: 'foresight' }
  /** Passive: every hit taken loses this much damage (never below 1). */
  | { type: 'armor'; amount: number }
  /** Passive: the round's drink also heals this much. */
  | { type: 'roundHeal'; amount: number }
  /** Passive: the parry window grows by this many ms. */
  | { type: 'parryBonus'; ms: number }
  /** Passive: a perfect parry (or a dodge, with `on: 'dodge'`) strikes back at once for `ratio` × the user's attack,
   *  or × the damage of the hit it answered with `of: 'hit'` (the thing thrown back). */
  | { type: 'riposte'; ratio: number; on?: 'parry' | 'dodge'; of?: 'attack' | 'hit' };

export interface SkillNode {
  id: string;
  name: string;
  /** The tree screen's description (pt-BR). */
  description: string;
  kind: 'active' | 'passive' | 'finisher';
  /** Coragem spent to use it (actives and finishers). */
  cost: number;
  effect: SkillEffect;
}

export interface SkillBranch {
  id: string;
  name: string;
  /** One line under the branch name. */
  theme: string;
  /** Four nodes, in order; the last is the finisher. */
  nodes: [SkillNode, SkillNode, SkillNode, SkillNode];
}

export interface SkillTreeSpec {
  /** The regular's id (a QuestNpcId). */
  regular: string;
  branches: [SkillBranch, SkillBranch, SkillBranch];
}

export const SKILL_PROGRESSION = {
  /** Total XP to reach each level (index = level). A regular starts at level 1 with 1 point; 1 point per level. */
  levelXp: [0, 0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620, 1900, 2200],
  /** Duel XP for the regular dueled: a loss still teaches something; perfect parries add a little. */
  duelWinXp: 60,
  duelLossXp: 20,
  xpPerParry: 3,
  /** Resetting a tree (all points back) costs this many Fichas. */
  resetFichas: 30
} as const;

export const SKILL_TREES: Record<string, SkillTreeSpec> = {
  brom: {
    regular: 'brom',
    branches: [
      {
        id: 'muralha',
        name: 'Muralha',
        theme: 'Aguentar o tranco',
        nodes: [
          { id: 'barril', name: 'Barril', description: 'Se esconde atrás de um barril: um escudo que segura 15 de dano.', kind: 'active', cost: 2, effect: { type: 'shield', amount: 15 } },
          { id: 'casca-grossa', name: 'Casca Grossa', description: 'Todo golpe levado tira 2 a menos (nunca menos que 1).', kind: 'passive', cost: 0, effect: { type: 'armor', amount: 2 } },
          { id: 'provocar', name: 'Provocar', description: 'Tira o oponente do sério: o próximo ataque dele bate pela metade.', kind: 'active', cost: 1, effect: { type: 'weaken', ratio: 0.5 } },
          { id: 'muralha-viva', name: 'Muralha Viva', description: 'Finalizador. O próximo ataque inteiro é aparado sozinho, e você contra-ataca.', kind: 'finisher', cost: 5, effect: { type: 'wall' } }
        ]
      },
      {
        id: 'cervejeiro',
        name: 'Cervejeiro',
        theme: 'A cerveja cura tudo',
        nodes: [
          { id: 'gole-rapido', name: 'Gole Rápido', description: 'Um gole no meio da briga: cura 15 de vida.', kind: 'active', cost: 1, effect: { type: 'heal', amount: 15 } },
          { id: 'rodada-dupla', name: 'Rodada Dupla', description: 'O brinde de cada rodada também cura 5 de vida.', kind: 'passive', cost: 0, effect: { type: 'roundHeal', amount: 5 } },
          { id: 'bafo-de-malte', name: 'Bafo de Malte', description: 'Um arroto na cara: 60% do ataque e o oponente demora mais pra agir.', kind: 'active', cost: 2, effect: { type: 'stun', ratio: 0.6, delay: 60 } },
          { id: 'barril-sem-fundo', name: 'Barril sem Fundo', description: 'Finalizador. Cura metade da vida e passa a bebedeira.', kind: 'finisher', cost: 5, effect: { type: 'sober', ratio: 0.5 } }
        ]
      },
      {
        id: 'bigorna',
        name: 'Bigorna',
        theme: 'Aparar e devolver',
        nodes: [
          { id: 'contragolpe', name: 'Contragolpe', description: 'Depois de um aparo perfeito, devolve na hora 40% do ataque.', kind: 'passive', cost: 0, effect: { type: 'riposte', ratio: 0.4 } },
          { id: 'martelada', name: 'Martelada', description: 'Uma martelada com vontade: 2× o ataque.', kind: 'active', cost: 2, effect: { type: 'damage', ratio: 2 } },
          { id: 'ritmo-da-forja', name: 'Ritmo da Forja', description: 'O ouvido de ferreiro: a janela de aparo cresce 20 ms.', kind: 'passive', cost: 0, effect: { type: 'parryBonus', ms: 20 } },
          { id: 'golpe-da-forja', name: 'Golpe da Forja', description: 'Finalizador. Desce o martelo com tudo: 4× o ataque.', kind: 'finisher', cost: 5, effect: { type: 'damage', ratio: 4 } }
        ]
      }
    ]
  },
  lyra: {
    regular: 'lyra',
    branches: [
      {
        id: 'olho-de-falcao',
        name: 'Olho de Falcão',
        theme: 'Crítico e precisão',
        nodes: [
          { id: 'mira', name: 'Mira', description: 'Golpes e habilidades de dano têm 15% de chance de crítico (dano dobrado).', kind: 'passive', cost: 0, effect: { type: 'crit', chance: 0.15 } },
          { id: 'tiro-certeiro', name: 'Tiro Certeiro', description: 'Uma flecha no ponto fraco: 1,8× o ataque.', kind: 'active', cost: 2, effect: { type: 'damage', ratio: 1.8 } },
          { id: 'olho-aberto', name: 'Olho Aberto', description: 'Mais 15% de chance de crítico.', kind: 'passive', cost: 0, effect: { type: 'crit', chance: 0.15 } },
          { id: 'flecha-fantasma', name: 'Flecha Fantasma', description: 'Finalizador. Uma flecha que ninguém vê sair: 3,5× o ataque.', kind: 'finisher', cost: 5, effect: { type: 'damage', ratio: 3.5 } }
        ]
      },
      {
        id: 'folhaverde',
        name: 'Folhaverde',
        theme: 'Veneno e raízes',
        nodes: [
          { id: 'flecha-envenenada', name: 'Flecha Envenenada', description: 'Metade do ataque e veneno: 4 de dano no começo das próximas 3 rodadas.', kind: 'active', cost: 1, effect: { type: 'poison', ratio: 0.5, perRound: 4, rounds: 3 } },
          { id: 'raizes', name: 'Raízes', description: 'Raízes prendem o oponente: 40% do ataque e ele demora mais pra agir.', kind: 'active', cost: 2, effect: { type: 'stun', ratio: 0.4, delay: 70 } },
          { id: 'seiva', name: 'Seiva', description: 'O começo de cada rodada cura 4 de vida.', kind: 'passive', cost: 0, effect: { type: 'roundHeal', amount: 4 } },
          { id: 'abraco-da-floresta', name: 'Abraço da Floresta', description: 'Finalizador. 1,5× o ataque e veneno forte: 9 por rodada, por 3 rodadas.', kind: 'finisher', cost: 5, effect: { type: 'poison', ratio: 1.5, perRound: 9, rounds: 3 } }
        ]
      },
      {
        id: 'passo-leve',
        name: 'Passo Leve',
        theme: 'Esquivar e atirar de volta',
        nodes: [
          { id: 'pes-ligeiros', name: 'Pés Ligeiros', description: 'A janela de esquiva cresce 40 ms.', kind: 'passive', cost: 0, effect: { type: 'dodgeBonus', ms: 40 } },
          { id: 'flecha-de-volta', name: 'Flecha de Volta', description: 'Toda esquiva atira uma flecha de volta: 30% do ataque.', kind: 'passive', cost: 0, effect: { type: 'riposte', ratio: 0.3, on: 'dodge' } },
          { id: 'distancia', name: 'Distância', description: 'Abre distância: o próximo ataque do oponente bate com 60% da força.', kind: 'active', cost: 1, effect: { type: 'weaken', ratio: 0.6 } },
          { id: 'danca-do-vento', name: 'Dança do Vento', description: 'Finalizador. O próximo ataque inteiro é esquivado sozinho (e com Flecha de Volta, cada esquiva atira).', kind: 'finisher', cost: 5, effect: { type: 'wall', as: 'dodge' } }
        ]
      }
    ]
  },
  grimbo: {
    regular: 'grimbo',
    branches: [
      {
        id: 'dados-viciados',
        name: 'Dados Viciados',
        theme: 'Sorte que não é sorte',
        nodes: [
          { id: 'rolar-os-dados', name: 'Rolar os Dados', description: 'O dado decide: de 0,5× a 2,5× o ataque.', kind: 'active', cost: 1, effect: { type: 'gamble', min: 0.5, max: 2.5 } },
          { id: 'dado-chumbado', name: 'Dado Chumbado', description: 'Golpes e habilidades de dano têm 20% de chance de crítico (dano dobrado).', kind: 'passive', cost: 0, effect: { type: 'crit', chance: 0.2 } },
          { id: 'dobro-ou-nada', name: 'Dobro ou Nada', description: 'Tudo ou nada: de 0× a 3,5× o ataque.', kind: 'active', cost: 2, effect: { type: 'gamble', min: 0, max: 3.5 } },
          { id: 'seis-duplo', name: 'Seis Duplo', description: 'Finalizador. Os dois dados dão seis: 4× o ataque.', kind: 'finisher', cost: 5, effect: { type: 'damage', ratio: 4 } }
        ]
      },
      {
        id: 'mao-leve',
        name: 'Mão Leve',
        theme: 'O que é seu é meu',
        nodes: [
          { id: 'batedor-de-carteira', name: 'Batedor de Carteira', description: '60% do ataque e afana 3 fichas (vêm com você no fim do duelo).', kind: 'active', cost: 1, effect: { type: 'steal', ratio: 0.6, fichas: 3 } },
          { id: 'bolso-fundo', name: 'Bolso Fundo', description: 'Todo aparo perfeito afana 1 ficha.', kind: 'passive', cost: 0, effect: { type: 'parryLoot', fichas: 1 } },
          { id: 'truque-sujo', name: 'Truque Sujo', description: 'Um pisão no pé: 50% do ataque e o oponente demora mais pra agir.', kind: 'active', cost: 2, effect: { type: 'stun', ratio: 0.5, delay: 60 } },
          { id: 'grande-golpe', name: 'O Grande Golpe', description: 'Finalizador. 2,5× o ataque e afana 15 fichas.', kind: 'finisher', cost: 5, effect: { type: 'steal', ratio: 2.5, fichas: 15 } }
        ]
      },
      {
        id: 'trapaca',
        name: 'Trapaça',
        theme: 'Desviar e devolver',
        nodes: [
          { id: 'desvio', name: 'Desvio', description: 'Uma esquiva joga o golpe de volta: o oponente leva metade do dano que viria.', kind: 'passive', cost: 0, effect: { type: 'riposte', ratio: 0.5, on: 'dodge', of: 'hit' } },
          { id: 'areia-nos-olhos', name: 'Areia nos Olhos', description: 'O próximo ataque do oponente bate pela metade.', kind: 'active', cost: 1, effect: { type: 'weaken', ratio: 0.5 } },
          { id: 'ginga', name: 'Ginga', description: 'A janela de esquiva cresce 30 ms.', kind: 'passive', cost: 0, effect: { type: 'dodgeBonus', ms: 30 } },
          { id: 'mesa-virada', name: 'Mesa Virada', description: 'Finalizador. O próximo ataque inteiro é esquivado sozinho (e com Desvio, volta tudo).', kind: 'finisher', cost: 5, effect: { type: 'wall', as: 'dodge' } }
        ]
      }
    ]
  },
  zora: {
    regular: 'zora',
    branches: [
      {
        id: 'cristal',
        name: 'Cristal',
        theme: 'Escudos e cura',
        nodes: [
          { id: 'escudo-de-cristal', name: 'Escudo de Cristal', description: 'Um escudo que segura 18 de dano.', kind: 'active', cost: 2, effect: { type: 'shield', amount: 18 } },
          { id: 'cura-cristalina', name: 'Cura Cristalina', description: 'Cura 14 de vida.', kind: 'active', cost: 1, effect: { type: 'heal', amount: 14 } },
          { id: 'pele-de-quartzo', name: 'Pele de Quartzo', description: 'Todo golpe levado tira 2 a menos (nunca menos que 1).', kind: 'passive', cost: 0, effect: { type: 'armor', amount: 2 } },
          { id: 'prisao-de-cristal', name: 'Prisão de Cristal', description: 'Finalizador. O próximo ataque inteiro bate no cristal (aparado sozinho) e você contra-ataca.', kind: 'finisher', cost: 5, effect: { type: 'wall' } }
        ]
      },
      {
        id: 'maldicao',
        name: 'Maldição',
        theme: 'Enfraquecer e marcar',
        nodes: [
          { id: 'mau-olhado', name: 'Mau-Olhado', description: 'O próximo ataque do oponente bate pela metade.', kind: 'active', cost: 1, effect: { type: 'weaken', ratio: 0.5 } },
          { id: 'marca', name: 'Marca', description: 'Marca o oponente: os próximos 3 golpes nele batem 50% mais forte.', kind: 'active', cost: 2, effect: { type: 'mark', ratio: 0.5, hits: 3 } },
          { id: 'praga', name: 'Praga', description: '30% do ataque e uma praga: 5 de dano no começo das próximas 3 rodadas.', kind: 'active', cost: 2, effect: { type: 'poison', ratio: 0.3, perRound: 5, rounds: 3 } },
          { id: 'maldicao-final', name: 'Maldição Final', description: 'Finalizador. A maldição cai de uma vez: 3,5× o ataque.', kind: 'finisher', cost: 5, effect: { type: 'damage', ratio: 3.5 } }
        ]
      },
      {
        id: 'pressagio',
        name: 'Presságio',
        theme: 'Ver o ritmo antes',
        nodes: [
          { id: 'pressentimento', name: 'Pressentimento', description: 'As fintas aparecem roxas na trilha de tempo, e os dados mostram o número antes.', kind: 'passive', cost: 0, effect: { type: 'foresight' } },
          { id: 'terceiro-olho', name: 'Terceiro Olho', description: 'A janela de aparo cresce 15 ms.', kind: 'passive', cost: 0, effect: { type: 'parryBonus', ms: 15 } },
          { id: 'destino', name: 'Destino', description: 'Depois de um aparo perfeito, devolve na hora 35% do ataque.', kind: 'passive', cost: 0, effect: { type: 'riposte', ratio: 0.35 } },
          { id: 'eclipse', name: 'Eclipse', description: 'Finalizador. 2× o ataque e o oponente perde a vez por um bom tempo.', kind: 'finisher', cost: 5, effect: { type: 'stun', ratio: 2, delay: 110 } }
        ]
      }
    ]
  },
  sergio: {
    regular: 'sergio',
    branches: [
      {
        id: 'rodada-da-casa',
        name: 'Rodada da Casa',
        theme: 'Cura pra todo mundo',
        nodes: [
          { id: 'rodada', name: 'Rodada', description: 'Uma rodada por conta da casa: cura 12 de vida.', kind: 'active', cost: 1, effect: { type: 'heal', amount: 12 } },
          { id: 'saideira', name: 'Saideira', description: 'O começo de cada rodada cura 4 de vida.', kind: 'passive', cost: 0, effect: { type: 'roundHeal', amount: 4 } },
          { id: 'pinga-boa', name: 'Pinga Boa', description: 'Cura 30% da vida máxima.', kind: 'active', cost: 2, effect: { type: 'sober', ratio: 0.3 } },
          { id: 'rodada-gratis', name: 'Rodada Grátis', description: 'Finalizador. Cura 60% da vida máxima.', kind: 'finisher', cost: 5, effect: { type: 'sober', ratio: 0.6 } }
        ]
      },
      {
        id: 'arsenal',
        name: 'Arsenal',
        theme: 'O estoque inteiro',
        nodes: [
          { id: 'garrafada', name: 'Garrafada', description: 'Uma garrafa na cabeça: 1,4× o ataque.', kind: 'active', cost: 1, effect: { type: 'damage', ratio: 1.4 } },
          { id: 'prato-voador', name: 'Prato Voador', description: 'O ataque inteiro e o oponente demora mais pra agir.', kind: 'active', cost: 2, effect: { type: 'stun', ratio: 1, delay: 50 } },
          { id: 'estoque-cheio', name: 'Estoque Cheio', description: 'Golpes e habilidades de dano têm 15% de chance de crítico (dano dobrado).', kind: 'passive', cost: 0, effect: { type: 'crit', chance: 0.15 } },
          { id: 'barril-rolante', name: 'Barril Rolante', description: 'Finalizador. Um barril cheio rolando: 4× o ataque.', kind: 'finisher', cost: 5, effect: { type: 'damage', ratio: 4 } }
        ]
      },
      {
        id: 'balcao',
        name: 'Balcão',
        theme: 'Aparar e mandar de volta',
        nodes: [
          { id: 'devolucao', name: 'Devolução', description: 'Um aparo perfeito manda de volta o que veio: o oponente leva 60% do dano do golpe.', kind: 'passive', cost: 0, effect: { type: 'riposte', ratio: 0.6, of: 'hit' } },
          { id: 'avental-de-couro', name: 'Avental de Couro', description: 'Todo golpe levado tira 2 a menos (nunca menos que 1).', kind: 'passive', cost: 0, effect: { type: 'armor', amount: 2 } },
          { id: 'mao-firme', name: 'Mão Firme', description: 'A janela de aparo cresce 20 ms.', kind: 'passive', cost: 0, effect: { type: 'parryBonus', ms: 20 } },
          { id: 'fecha-a-conta', name: 'Fecha a Conta', description: 'Finalizador. O próximo ataque inteiro é aparado sozinho e você contra-ataca.', kind: 'finisher', cost: 5, effect: { type: 'wall' } }
        ]
      }
    ]
  }
};
