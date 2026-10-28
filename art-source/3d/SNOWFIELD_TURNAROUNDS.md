# Referências dos bosses do Campo Nevado

Referências para modelagem dos quatro guardiões e do boss final. Cada pasta contém o conceito frontal original (`front.png`) e uma folha com três vistas (`turnaround.png`), além das vistas separadas em `views/front.png`, `views/side.png` e `views/back.png` (1024 × 1024).

| Personagem | Pasta | Identificador no jogo |
| --- | --- | --- |
| Cavaleiro Congelado | `frozen-knight` | `frostKnight` |
| Serpente do Gelo | `ice-serpent` | `iceSerpent` |
| Sineiro | `bellringer` | `bellringer` |
| Yeti Ancião | `ancient-yeti` | `ancientYeti` |
| Rei do Inverno | `winter-king` | `winterKing` (encontro `finalBoss` com `winter`) |

Ordem das folhas: frente, perfil voltado à direita e costas. Fundo cinza claro, corpo inteiro e mãos vazias nos humanoides. A serpente mantém o corpo enrolado. O conceito `front.png` continua preservado; a vista frontal da folha está em `views/front.png`.

As folhas foram geradas com a ferramenta imagegen, usando o `front.png` de cada boss como referência de identidade. A estrutura de entrega segue o Joe. `turnaround-raw.png` preserva a geração selecionada; o prompt está em `turnaround-generation-prompt.txt`. As vistas são recortes com proporção preservada e margens, sem redesenho. `turnaround-validation.json` registra dimensões, recortes e hashes das vistas exportadas.

São referências de arte para criar os GLBs. A geração infere os detalhes de perfil e costas; ajustes de topologia e rig ficam para a modelagem. Os modelos e ataques poligonais do jogo permanecem na implementação publicada em #88.
