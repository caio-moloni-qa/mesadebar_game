# Entrega de áudio procedural — 2026-11-11

14 loops novos + 6 vinhetas + 367 SFX, para 21 personagens e eventos comuns.
Método autorizado pelo dono: mesmo motor Web Audio das músicas existentes (osciladores, ruído, envelopes e IR).
Timbres acústicos e vozes não verbais são aproximações sintéticas. Não são gravações nem vozes naturais.
Os 19 replacements opcionais dos prompts não foram necessários: as trilhas existentes continuam disponíveis.

## Arquivos para integração

- `music-delivery_v1.json`: 20 escolhas finais, WAV/bruto, prompt, seed, hash, LUFS e pico após MP3.
- `sfx-delivery_v1.json`: 367 escolhas finais e 8 falas pendentes. Respeitar `file`; algumas escolhas usam `_v2`.
- `preview_v1.html`: player para revisão auditiva, aberto diretamente no navegador.
- `AUDIO_PROMPTS_v1.md`: cópia permanente do pacote original de prompts.

## Música

| ID | MP3 final | LUFS | dBTP |
|---|---|---|---|
| arena-snowfield-intense | src/assets/audio/music/snowfield/arena-snowfield-intense.mp3 | -14.46 | -2.92 |
| arena-snowfield | src/assets/audio/music/snowfield/arena-snowfield.mp3 | -14.46 | -2.93 |
| duel-brom | src/assets/audio/music/tower/duel-brom.mp3 | -14.46 | -2.75 |
| duel-grimbo | src/assets/audio/music/tower/duel-grimbo.mp3 | -14.46 | -2.87 |
| duel-lyra | src/assets/audio/music/tower/duel-lyra.mp3 | -14.46 | -2.82 |
| duel-zora | src/assets/audio/music/tower/duel-zora.mp3 | -14.49 | -2.90 |
| menu | src/assets/audio/music/menu.mp3 | -14.55 | -2.64 |
| sting-cashout | src/assets/audio/music/tower/sting-cashout.mp3 | -14.46 | -3.30 |
| sting-champion | src/assets/audio/music/tower/sting-champion.mp3 | -14.44 | -5.43 |
| sting-duel-start | src/assets/audio/music/tower/sting-duel-start.mp3 | -14.46 | -3.68 |
| sting-floor-cleared | src/assets/audio/music/tower/sting-floor-cleared.mp3 | -14.51 | -2.97 |
| sting-tower-defeat | src/assets/audio/music/tower/sting-tower-defeat.mp3 | -14.40 | -2.94 |
| sting-tower-victory | src/assets/audio/music/tower/sting-tower-victory_v3.mp3 | -14.00 | -1.87 |
| tower-igloo-battle | src/assets/audio/music/tower/tower-igloo-battle.mp3 | -14.50 | -2.92 |
| tower-igloo-champion | src/assets/audio/music/tower/tower-igloo-champion.mp3 | -14.46 | -2.92 |
| tower-igloo-rest | src/assets/audio/music/tower/tower-igloo-rest.mp3 | -14.44 | -2.95 |
| tower-select | src/assets/audio/music/tower/tower-select_v2.mp3 | -13.99 | -1.87 |
| tower-taverna-battle | src/assets/audio/music/tower/tower-taverna-battle.mp3 | -14.54 | -2.60 |
| tower-taverna-champion | src/assets/audio/music/tower/tower-taverna-champion.mp3 | -14.46 | -2.83 |
| tower-taverna-rest | src/assets/audio/music/tower/tower-taverna-rest_v2.mp3 | -14.00 | -2.20 |

## Falas pendentes (TTS/voz necessário)

- reliquia/bark-victory: Upbeat young man in Brazilian Portuguese laughing "Achei!" ("found it!"), mono.
- brom/bark-victory: Deep jolly dwarf voice in Brazilian Portuguese laughing "Hah! Mais uma rodada!", mono.
- brom/bark-skill: Deep dwarf voice shouting "Saúde!" (cheers) in Brazilian Portuguese, mono.
- lyra/bark-victory: Confident young woman in Brazilian Portuguese, smug: "Na mosca.", mono.
- grimbo/bark-victory: Squeaky goblin voice in Brazilian Portuguese cackling "A casa sempre ganha!", mono.
- zora/bark-victory: Mysterious woman in Brazilian Portuguese, low knowing tone: "Eu já sabia...", mono.
- sergio/bark-victory: Jovial Brazilian innkeeper laughing "Volta sempre, freguês!", mono.
- sergio/bark-skill: Jovial Brazilian innkeeper shouting "Por conta da casa!", mono.

## Verificação e limites

20 MP3s de música decodificados em estéreo/44,1 kHz, com número de amostras exato (metadados gapless preservados).
Loops com compassos inteiros e caudas dobradas no início; delta entre amostras da emenda < 0,04 no WAV.
Música medida após compressão: aproximadamente −14 LUFS; true peak abaixo de −1,5 dBTP.
367 MP3s SFX decodificados em mono/44,1 kHz, com duração exata, sinal finito, sem clipping e true peak ≤ −1,5 dBTP.
Identidades de SFX têm seeds e arquivos distintos; uma variação por evento. Não houve seleção entre 2–4 takes por escuta.
Brutos e primeiros encodes preservados. O manifesto final escolhe versões corrigidas; não integrar por glob de pasta.
QA numérico aprovado; revisão auditiva e mixagem no jogo ainda pendentes. Não houve mudança no código ou no roteamento de áudio do jogo.
SAPI/TTS local foi consultado, mas GetInstalledVoices falhou nesta sessão; nenhuma fala fabricada ou silenciosa foi entregue.
Sem commit/push/PR. Pasta principal e branch compartilhada feature/tavern-difficulty-bosses preservadas.

## Reprodução

1. `node art-source/audio/tower/render-tower.mjs --remaining` (Chrome + playwright-core, caminhos no renderer).
2. `python art-source/audio/tower/render-character-sfx.py` (stdlib + FFmpeg no caminho declarado).
3. `python art-source/audio/tower/export-music.py`.
4. `python art-source/audio/tower/audit-sfx.py` e `python art-source/audio/tower/prepare-handoff.py`.
As saídas são exclusivas: reexecuções precisam de nomes novos para os relatórios; nenhum asset é sobrescrito.
Guardiões e chefes das arenas mantêm os loops existentes conforme a seção 0 dos prompts; Claude cuida da integração.
