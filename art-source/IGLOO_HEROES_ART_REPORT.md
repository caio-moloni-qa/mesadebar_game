# Artes do Iglu / Nevado

Gerado em 2026-10-28 com image_gen nativo, a pedido do Caio e na divisao do Claude. Skills: venivium-art-pipeline e imagegen. Sem API/CLI de geracao.

## Entrega

- 4 retratos RGBA 128x128 + originais e prompts: Joe, Beast, Voly, Esquimo.
- 4 turnarounds 1536x1024 + originais e prompts; 12 vistas recortadas 1024x1024 pelo crop-turnaround.py.
- 3 icones de arma RGBA 64x64, alpha binario e paleta de ate 10 cores.
- Lanterna independente: folha de 2 vistas 1536x1024, original e prompt.
- Mosaico: igloo-art/igloo-heroes-art-mosaic_v2.png.
- Manifesto com dimensoes, tamanhos e SHA-256: igloo-art/asset-manifest.json.

## Arquivos selecionados para integrar

| Uso | Caminho |
| --- | --- |
| Retrato joe | src/assets/characters/npcs/joe-portrait.png |
| Retrato beast | src/assets/characters/npcs/beast-portrait.png |
| Retrato voly | src/assets/characters/npcs/voly-portrait.png |
| Retrato eskimo | src/assets/characters/npcs/eskimo-portrait.png |
| Arma joe | src/assets/weapons/psychic-fists-icon.png |
| Arma beast | src/assets/weapons/beast-amulet-icon_v2.png |
| Arma voly | src/assets/weapons/bear-claws-icon.png |

Usar **beast-amulet-icon_v2.png**: a primeira reducao de cores perdeu a runa azul; V2 reserva dois tons azuis. Mesmo raw original, sem nova geracao. V1 foi preservada.

## Verificacao e limites

PNG decodificados/verificados; dimensoes e alpha dos retratos e icones conferidos; 10 cores maximas nos icones escolhidos; 12 recortes produzidos sem erro. Retratos, folhas completas, recortes no mosaico e icones inspecionados visualmente. Nenhum arquivo existente sobrescrito. Copias de fonte em art-source para retratos e icones.

As folhas sao conceitos para image-to-3D: seguem a linguagem da referencia Brom, mas as vistas frontais de Beast/Voly ficam levemente em tres quartos, e o Joe ganhou um torso de gelo abaixo do cubo facial. O modelador deve conferir a orientacao e as proporcoes antes do rig. Fundo cinza tem pequena variacao tonal da geracao. Poses proximas da A-pose; maos vazias, sem armas, Esquimo sem lanterna na folha.

Assets soltos, sem alteracao de gameplay, registro de armas, carregadores, UI ou modelos GLB. Nao houve validacao em jogo nem tsc/testes/build: esta etapa entrega arte e nao conecta o produto. Conversao GLB, rig, integracao e verificacao no jogo ficam com Claude/proxima tarefa.

Criacao do worktree feature/codex-igloo-character-art bloqueada: .git/refs/...lock Permission denied. Arquivos novos salvos na raiz compartilhada, branch chore/agent-skills; nenhum commit, push ou PR. Trabalho existente preservado.

## Inventario arquivo por arquivo

| Arquivo | Dimensoes / formato |
| --- | --- |
| art-source/3d/beast/turnaround-generation-prompt.txt | Prompt de geracao |
| art-source/3d/beast/turnaround-raw.png | 1536 x 1024 RGB |
| art-source/3d/beast/turnaround.png | 1536 x 1024 RGB |
| art-source/3d/beast/views/back.png | 1024 x 1024 RGB |
| art-source/3d/beast/views/front.png | 1024 x 1024 RGB |
| art-source/3d/beast/views/side.png | 1024 x 1024 RGB |
| art-source/3d/eskimo/turnaround-generation-prompt.txt | Prompt de geracao |
| art-source/3d/eskimo/turnaround-raw.png | 1536 x 1024 RGB |
| art-source/3d/eskimo/turnaround.png | 1536 x 1024 RGB |
| art-source/3d/eskimo/views/back.png | 1024 x 1024 RGB |
| art-source/3d/eskimo/views/front.png | 1024 x 1024 RGB |
| art-source/3d/eskimo/views/side.png | 1024 x 1024 RGB |
| art-source/3d/eskimo-lantern/sheet-generation-prompt.txt | Prompt de geracao |
| art-source/3d/eskimo-lantern/sheet-raw.png | 1536 x 1024 RGB |
| art-source/3d/eskimo-lantern/sheet.png | 1536 x 1024 RGB |
| art-source/3d/joe/turnaround-generation-prompt.txt | Prompt de geracao |
| art-source/3d/joe/turnaround-raw.png | 1536 x 1024 RGB |
| art-source/3d/joe/turnaround.png | 1536 x 1024 RGB |
| art-source/3d/joe/views/back.png | 1024 x 1024 RGB |
| art-source/3d/joe/views/front.png | 1024 x 1024 RGB |
| art-source/3d/joe/views/side.png | 1024 x 1024 RGB |
| art-source/3d/voly/turnaround-generation-prompt.txt | Prompt de geracao |
| art-source/3d/voly/turnaround-raw.png | 1536 x 1024 RGB |
| art-source/3d/voly/turnaround.png | 1536 x 1024 RGB |
| art-source/3d/voly/views/back.png | 1024 x 1024 RGB |
| art-source/3d/voly/views/front.png | 1024 x 1024 RGB |
| art-source/3d/voly/views/side.png | 1024 x 1024 RGB |
| art-source/characters/beast/beast-portrait-generation-prompt.txt | Prompt de geracao |
| art-source/characters/beast/beast-portrait-raw.png | 1254 x 1254 RGBA |
| art-source/characters/beast/beast-portrait.png | 128 x 128 RGBA |
| art-source/characters/eskimo/eskimo-portrait-generation-prompt.txt | Prompt de geracao |
| art-source/characters/eskimo/eskimo-portrait-raw.png | 1254 x 1254 RGBA |
| art-source/characters/eskimo/eskimo-portrait.png | 128 x 128 RGBA |
| art-source/characters/joe/joe-portrait-generation-prompt.txt | Prompt de geracao |
| art-source/characters/joe/joe-portrait-raw.png | 1254 x 1254 RGBA |
| art-source/characters/joe/joe-portrait.png | 128 x 128 RGBA |
| art-source/characters/voly/voly-portrait-generation-prompt.txt | Prompt de geracao |
| art-source/characters/voly/voly-portrait-raw.png | 1254 x 1254 RGBA |
| art-source/characters/voly/voly-portrait.png | 128 x 128 RGBA |
| art-source/igloo-art/igloo-heroes-art-mosaic_v2.png | 1600 x 1440 RGB |
| art-source/weapons/bear-claws/bear-claws-icon-generation-prompt.txt | Prompt de geracao |
| art-source/weapons/bear-claws/bear-claws-icon-raw.png | 1254 x 1254 RGBA |
| art-source/weapons/bear-claws/bear-claws-icon.png | 64 x 64 RGBA |
| art-source/weapons/beast-amulet/beast-amulet-icon-generation-prompt.txt | Prompt de geracao |
| art-source/weapons/beast-amulet/beast-amulet-icon-generation-prompt_v2.txt | Prompt de geracao |
| art-source/weapons/beast-amulet/beast-amulet-icon-raw.png | 1254 x 1254 RGBA |
| art-source/weapons/beast-amulet/beast-amulet-icon-raw_v2.png | 1254 x 1254 RGBA |
| art-source/weapons/beast-amulet/beast-amulet-icon.png | 64 x 64 RGBA |
| art-source/weapons/beast-amulet/beast-amulet-icon_v2.png | 64 x 64 RGBA |
| art-source/weapons/psychic-fists/psychic-fists-icon-generation-prompt.txt | Prompt de geracao |
| art-source/weapons/psychic-fists/psychic-fists-icon-raw.png | 1254 x 1254 RGBA |
| art-source/weapons/psychic-fists/psychic-fists-icon.png | 64 x 64 RGBA |
| src/assets/characters/npcs/beast-portrait-generation-prompt.txt | Prompt de geracao |
| src/assets/characters/npcs/beast-portrait-raw.png | 1254 x 1254 RGBA |
| src/assets/characters/npcs/beast-portrait.png | 128 x 128 RGBA |
| src/assets/characters/npcs/eskimo-portrait-generation-prompt.txt | Prompt de geracao |
| src/assets/characters/npcs/eskimo-portrait-raw.png | 1254 x 1254 RGBA |
| src/assets/characters/npcs/eskimo-portrait.png | 128 x 128 RGBA |
| src/assets/characters/npcs/joe-portrait-generation-prompt.txt | Prompt de geracao |
| src/assets/characters/npcs/joe-portrait-raw.png | 1254 x 1254 RGBA |
| src/assets/characters/npcs/joe-portrait.png | 128 x 128 RGBA |
| src/assets/characters/npcs/voly-portrait-generation-prompt.txt | Prompt de geracao |
| src/assets/characters/npcs/voly-portrait-raw.png | 1254 x 1254 RGBA |
| src/assets/characters/npcs/voly-portrait.png | 128 x 128 RGBA |
| src/assets/weapons/bear-claws-icon-generation-prompt.txt | Prompt de geracao |
| src/assets/weapons/bear-claws-icon-raw.png | 1254 x 1254 RGBA |
| src/assets/weapons/bear-claws-icon.png | 64 x 64 RGBA |
| src/assets/weapons/beast-amulet-icon-generation-prompt.txt | Prompt de geracao |
| src/assets/weapons/beast-amulet-icon-generation-prompt_v2.txt | Prompt de geracao |
| src/assets/weapons/beast-amulet-icon-raw.png | 1254 x 1254 RGBA |
| src/assets/weapons/beast-amulet-icon-raw_v2.png | 1254 x 1254 RGBA |
| src/assets/weapons/beast-amulet-icon.png | 64 x 64 RGBA |
| src/assets/weapons/beast-amulet-icon_v2.png | 64 x 64 RGBA |
| src/assets/weapons/psychic-fists-icon-generation-prompt.txt | Prompt de geracao |
| src/assets/weapons/psychic-fists-icon-raw.png | 1254 x 1254 RGBA |
| src/assets/weapons/psychic-fists-icon.png | 64 x 64 RGBA |
