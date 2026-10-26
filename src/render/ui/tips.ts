import { CHARACTERS, CharacterId } from '../../config/characters';
import { WEAPONS } from '../../config/weapons';
import { QuestNpcId } from '../../core/systems/QuestSystem';
import { npcPortrait } from './icons';
import { Tip } from './TipDialog';

const SERGIO = { name: 'Sergio', epithet: 'Taberneiro e mercador', portrait: npcPortrait('sergio') };

/** At the start of the first run: what the run is about. */
export const FIRST_RUN_TIP: Tip = {
  speaker: SERGIO,
  title: 'Sua primeira noite na arena',
  text: 'Sobreviva! Suas armas atacam sozinhas, você só precisa se mover. A noite vai apertando, e cada etapa termina com um chefe.',
  details: [
    ['Ficar mais forte', 'derrote inimigos e pegue os cristais: a cada nível você escolhe uma melhoria.'],
    ['Guardiões de zona', 'durante a etapa, guardiões acordam no cemitério, nas ruínas e no lago. Derrotá-los dá baús, um companheiro e enfraquece o chefe.'],
    ['O chefe', 'no fim de cada etapa chega o Necromante. Vença e escolha um portal: seguir para a próxima etapa (mais difícil, mais recompensa) ou voltar para a taverna com a vitória.'],
    ['Minha loja', 'de tempos em tempos abro um portal para a taverna no mapa: gaste suas moedas lá dentro e fale com os frequentadores, eles têm missões.'],
    ['Depois da partida', 'tudo vira Fichas e maestria. Gaste as Fichas comigo em melhorias permanentes.']
  ],
  button: 'Vamos lá'
};

/** The first time a guardian rises. */
export const GUARDIAN_TIP: Tip = {
  speaker: SERGIO,
  title: 'Dica',
  text: 'Um guardião de zona acordou! Eles são duros, mas vale a pena: enquanto ele estiver de pé, a horda diminui, então foque nele.',
  details: [
    ['Ao derrotar', 'um baú com uma melhoria e uma chuva de cristais de experiência.'],
    ['Companheiro', 'você escolhe um aliado da zona para lutar ao seu lado (ou sobe o nível de um que já tem).'],
    ['O Necromante', 'cada guardião derrotado deixa o chefe final mais fraco: menos vida e menos raios.'],
    ['No fim da partida', '+25 Fichas por guardião.'],
    ['Cuidado', 'se você o arrastar para longe da zona dele, ele volta para casa e se cura.']
  ]
};

/** Back in the tavern after `hero` was unlocked: they say so themselves (Sergio included). */
export function welcomeTip(hero: CharacterId): Tip {
  const character = CHARACTERS[hero];
  const weapon = WEAPONS[character.preferredWeaponId ?? 'staff'];
  const portrait = npcPortrait(hero as QuestNpcId | 'sergio');
  return {
    speaker: { name: character.name, epithet: 'Novo herói jogável', portrait },
    title: 'Agora é jogável!',
    text: hero === 'sergio'
      ? 'Você provou o seu valor, e eu fecho o balcão por uma noite. Leve-me para a arena: a loja vai junto!'
      : `Você cumpriu o que eu pedi e ganhou minha confiança. Na próxima vez que passar pelo portal, posso ir no seu lugar.`,
    details: [
      ['Como jogar', 'saia pelo portal da taverna e escolha o herói na tela de seleção.'],
      ['Arma de afinidade', `${weapon.name}.`],
      ['Atributos', `${character.maxHealth} de vida, ${character.movementSpeed} de movimento, ${character.armor} de armadura.`]
    ],
    button: 'Ótimo'
  };
}
