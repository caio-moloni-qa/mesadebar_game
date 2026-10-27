# Campo Nevado — músicas dos chefes

Seis primeiras versões instrumentais geradas localmente pelo motor de síntese da suíte existente. Os timbres lembram instrumentos acústicos; não são gravações reais nem downloads de um gerador externo. Sem vozes.

| Chefe | Arquivo | Duração | Identidade |
| --- | --- | --- | --- |
| Cavaleiro Congelado | guardian-frost-knight.wav | 120.0 s | Marcha de castelo: metais, violoncelo e cristal. |
| Serpente do Gelo | guardian-ice-serpent.wav | 137.14 s | Movimento serpenteante em 6/4: harpa, flauta e gelo. |
| O Sineiro | guardian-bellringer.wav | 120.0 s | Valsa fúnebre em 3/4: órgão e três badaladas. |
| Yeti Ancião | guardian-ancient-yeti.wav | 134.4 s | Peso tribal: tambores, pedra e metais graves. |
| Rei do Inverno | boss-winter-king.wav | 150.0 s | Realeza ameaçadora: cordas, metais e cristal. |
| Rei do Inverno - Coroa Partida | boss-winter-king-enraged.wav | 126.32 s | Mesmo motivo do Rei, mais rápido e com percussão mais densa. |

Abra `preview.html` para ouvir os WAVs completos. `snowfield-sampler.wav` reúne 12 segundos de cada faixa, na ordem da tabela (72 segundos no total). O sampler é reduzido para 22,05 kHz; os WAVs completos são estéreo PCM16 a 44,1 kHz. Os brutos float32 preservam a cauda de 4 segundos; os loops dobram essa cauda no início.

Validação técnica: cabeçalhos, duração, pico, RMS, estéreo, DC, amostras finitas, ausência de clipping e salto na emenda. Hashes e medições: `snowfield-manifest.json`. A checagem numérica não substitui revisão auditiva. Normalização por pico a -1,51 dBFS; aprovação musical dada pelo dono em 27/10/2026. LUFS ainda pendente: o Sineiro tem RMS maior que as outras faixas e precisa de ajuste de loudness na integração.

Sem alteração em GameAudio ou mecânicas. Vincular ao encontro correto quando os bosses estiverem implementados; frostKnight já existe, os demais nomes são de assets planejados.

Publicação: versionar fontes, player e relatórios. Os WAVs completos, brutos e sampler ficam locais e ignorados pelo Git; podem ser reproduzidos com os scripts abaixo. Ainda não há MP3s: gerar versões com loudness casado para a integração com GameAudio, que usa MP3.

Reproduzir da raiz: `node art-source/audio/snowfield/render-snowfield.mjs`; depois `python art-source/audio/snowfield/audit-snowfield.py`. O renderer versiona WAVs existentes; a auditoria recusa sobrescrever relatórios/sampler. Para nova rodada, use arquivos de relatório versionados.

Git: criação de branch/sincronização bloqueada nesta sessão por acesso negado a `.git/FETCH_HEAD`. Arquivos novos ficaram separados na cópia principal; nenhum commit/push/PR.
