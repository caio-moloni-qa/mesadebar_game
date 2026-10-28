# Campo Nevado — iglu e músicas dos chefes

Seis primeiras versões instrumentais geradas localmente pelo motor de síntese da suíte existente. Os timbres lembram instrumentos acústicos; não são gravações reais nem downloads de um gerador externo. Sem vozes.

| Chefe | Arquivo | Duração | Identidade |
| --- | --- | --- | --- |
| Iglu — Abrigo sob a Aurora | igloo.mp3 | 120.0 s | Harpa, flauta, violoncelo e cristal; ré maior, 80 BPM. |
| Cavaleiro Congelado | guardian-frost-knight.wav | 120.0 s | Marcha de castelo: metais, violoncelo e cristal. |
| Serpente do Gelo | guardian-ice-serpent.wav | 137.14 s | Movimento serpenteante em 6/4: harpa, flauta e gelo. |
| O Sineiro | guardian-bellringer.wav | 120.0 s | Valsa fúnebre em 3/4: órgão e três badaladas. |
| Yeti Ancião | guardian-ancient-yeti.wav | 134.4 s | Peso tribal: tambores, pedra e metais graves. |
| Rei do Inverno | boss-winter-king.wav | 150.0 s | Realeza ameaçadora: cordas, metais e cristal. |
| Rei do Inverno - Coroa Partida | boss-winter-king-enraged.wav | 126.32 s | Mesmo motivo do Rei, mais rápido e com percussão mais densa. |

Abra `preview.html` para ouvir os WAVs completos. `snowfield-sampler.wav` reúne 12 segundos de cada faixa, na ordem da tabela (72 segundos no total). O sampler é reduzido para 22,05 kHz; os WAVs completos são estéreo PCM16 a 44,1 kHz. Os brutos float32 preservam a cauda de 4 segundos; os loops dobram essa cauda no início.

Validação técnica dos WAVs: cabeçalhos, duração, pico, RMS, estéreo, DC, amostras finitas, ausência de clipping e salto na emenda. Hashes e medições: `snowfield-manifest.json`. A checagem numérica não substitui revisão auditiva. Os seis temas dos chefes tiveram aprovação musical do dono em 27/10/2026. O tema do iglu é uma composição nova de 28/10/2026, no mesmo motor, sem revisão auditiva humana nesta sessão.

Integração de 28/10/2026: `GameAudio` seleciona o iglu na base do Nevado, dentro do abrigo e após a run. Cada um dos quatro guardiões tem sua faixa; o Rei do Inverno tem fase normal e enfurecida. O abrigo tem prioridade sobre os encontros; ao sair, volta a música do encontro. O menu inicial mantém a taverna. Pré-carregamento do chefão segue a arena, inclusive na transição de fase. Sem alteração de mecânicas.

Publicação: as sete faixas MP3 em `src/assets/audio/music/snowfield/` são carregadas sob demanda. WAVs e brutos ficam locais e ignorados pelo Git. `encode-music.py` preserva os WAVs, normaliza em duas passagens EBU R128 e grava MP3 estéreo a 160 kbps. Medição final: -14,45 a -14,51 LUFS; true peak abaixo de -1,9 dBFS (`integration-loudness.json`). Nenhum asset anterior foi sobrescrito.

Reproduzir da raiz: `node art-source/audio/snowfield/render-snowfield.mjs` (ou `igloo` para só o abrigo); depois `python art-source/audio/snowfield/encode-music.py --ffmpeg <executável>`. O renderer versiona WAVs existentes; o encoder recusa MP3s/relatórios existentes. Para nova rodada, use nomes versionados. A auditoria histórica `audit-snowfield.py` corresponde aos seis WAVs originais.

Verificação da integração: com Vite na pasta principal, `node art-source/audio/snowfield/verify-game-music.mjs 5186` exercita os quatro guardiões, ambas as fases do Rei, entrada/saída do abrigo e base. Confere faixa atual, decodificação, sinal no bus, estéreo e reprodução após a emenda dos sete MP3s. Relatório e screenshots em `tools/discord/.state/`; não é revisão auditiva.
