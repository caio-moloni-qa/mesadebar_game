import { CharacterId } from './characters';

/** In-run power tiers: every hero grows three powers stronger during a run, at these hero levels. (Proposed at
 *  5/12/20; a simulated run reaches level 10 at about four minutes and 12 only past eight, so 20 never came — the
 *  thresholds follow a real run's pace instead.) */
export const POWER_TIER_LEVELS = [5, 10, 15] as const;

export interface PowerTierInfo {
  name: string;
  text: string;
}

/** Name and one-line description of each tier, by hero (shown when it switches on, and in the hero's details). */
export const POWER_TIERS: Record<CharacterId, [PowerTierInfo, PowerTierInfo, PowerTierInfo]> = {
  mage: [
    { name: 'Faísca Arcana', text: 'Cada projétil do cajado solta um raio que salta para mais 2 inimigos.' },
    { name: 'Tempestade', text: 'A cada 6 s um raio cai no inimigo mais forte por perto e o atordoa.' },
    { name: 'Furacão Arcano', text: 'A cada 15 s um furacão atravessa a horda, levanta os inimigos e espalha raios.' }
  ],
  barbarian: [
    { name: 'Golpe Sangrento', text: 'Os cortes da espada fazem o inimigo sangrar por 3 s.' },
    { name: 'Grito de Guerra', text: 'Abaixo de 50% da vida, um grito empurra a horda e a faz fugir (recarga 20 s).' },
    { name: 'Fúria Imortal', text: 'Um golpe fatal deixa 5 s sem morrer, com dano dobrado e cura a cada abate. Uma vez por etapa.' }
  ],
  reliquia: [
    { name: 'Escudo Refletor', text: 'Com escudo, quem toca o Relíquia leva de volta 50% do dano.' },
    { name: 'Pulso Sagrado', text: 'A cada 5 pulsos da aura, um anel de luz se expande até o dobro do raio.' },
    { name: 'Santuário', text: 'O escudo cheio, ao quebrar, explode em luz e deixa uma área de cura por 5 s.' }
  ],
  fabri: [
    { name: 'Bumerangue Duplo', text: 'Cada lançamento manda um segundo bumerangue na direção oposta.' },
    { name: 'Cascas no Caminho', text: 'A cada 4 s caem cascas de banana ao redor; quem escorrega leva dano.' },
    { name: 'Macaco Furioso', text: 'A cada 12 s os bumerangues orbitam em volta do Fabri por 4 s, como uma serra.' }
  ],
  brom: [
    { name: 'Chão Rachado', text: 'A onda do martelo racha o chão: inimigos 30% mais lentos por 2 s.' },
    { name: 'Golpe da Bigorna', text: 'A cada 3 marteladas, uma é dupla: onda 50% maior que atordoa.' },
    { name: 'Forja Viva', text: 'A cada 15 s um meteoro de forja cai sobre o Brom e deixa o chão em brasa por 4 s.' }
  ],
  lyra: [
    { name: 'Flecha Viva', text: 'As flechas atravessam mais 2 inimigos e ricocheteiam uma vez ao parar.' },
    { name: 'Leque de Flechas', text: 'Cada disparo solta 3 flechas em leque.' },
    { name: 'Espírito da Floresta', text: 'Um falcão espectral mergulha nos mais fortes; a Chuva de Flechas prende a horda com raízes.' }
  ],
  grimbo: [
    { name: 'Moeda de Ouro', text: 'Uma em cada 5 moedas é de ouro e explode ao acertar.' },
    { name: 'Lucro Rápido', text: 'Inimigos derrubados por moedas podem soltar moedas extras que voam até o Grimbo.' },
    { name: 'Chuva de Ouro', text: 'A cada 15 s chove ouro numa área grande; alguns inimigos viram estátua de ouro.' }
  ],
  zora: [
    { name: 'Rastro Astral', text: 'As esferas deixam um rastro brilhante que deixa os inimigos lentos.' },
    { name: 'Visão do Futuro', text: 'A cada 10 s a Zora prevê o próximo golpe: o primeiro dano é anulado.' },
    { name: 'Eclipse', text: 'A cada 20 s uma bola escura puxa a horda para o centro por 3 s e explode.' }
  ],
  sergio: [
    { name: 'Combo do Mercador', text: 'Os itens saem em sequência: frigideira, garrafa e poção.' },
    { name: 'Caixote Surpresa', text: 'A cada 12 s um caixote explode em moedas e deixa um item no chão.' },
    { name: 'Liquidação Total', text: 'A cada 20 s a mochila se esvazia: chuva de 15 itens ao redor.' }
  ]
};
