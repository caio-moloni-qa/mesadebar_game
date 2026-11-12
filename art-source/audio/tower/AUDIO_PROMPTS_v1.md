# Venivium — prompts de áudio (trilha + efeitos) para o Codex

> Gerado a partir do código em `feature/tavern-difficulty-bosses` (2026-11-11). Explicações em PT-BR; **os prompts de
> geração estão em inglês** (copie/cole o bloco ou a célula "Prompt" direto na ferramenta).
> Fontes lidas: `src/config/{characters,tavernRoster,tavernBattle,tavernSkills,tavernTowers,arenaLayout}.ts`,
> `src/core/systems/{MiniBossSystem,BossSystem}.ts`, `src/core/tavern/TurnBattle.ts`, `src/audio/{GameAudio,soundbank}.ts`,
> `art-source/MUSIC_PROMPTS.md`, manifests em `src/assets/audio/music/**`.

---

## 0. O que já existe (não duplicar)

**Música** (tocada por `src/audio/GameAudio.ts` → `TRACK_URLS`/`STING_URLS`, escolhida por `musicFor()`):

| id (TrackName) | arquivo final | situação | origem |
|---|---|---|---|
| `tavern` | `src/assets/audio/music/tavern.mp3` | menu, hub, dentro do portal do Sergio (greenfield) e **hoje também as batalhas em turnos** | sintetizado local (Web Audio) |
| `arena` | `src/assets/audio/the-last-watch.mp3` | exploração de **qualquer** arena (greenfield e snowfield!) | sintetizado local |
| `arena-intense` | `src/assets/audio/music/arena-intense.mp3` | a partir do 3º estágio de dificuldade (qualquer arena) | sintetizado |
| `guardian-gravedigger` / `guardian-temple` / `guardian-lake` (`_v2`) | `src/assets/audio/music/…` | guardiões do greenfield | sintetizado |
| `boss-necromancer` / `-enraged` | `src/assets/audio/music/…` | chefe final greenfield, fase 1/2 | sintetizado |
| `igloo` | `src/assets/audio/music/snowfield/igloo.mp3` | abrigo/loja no snowfield | sintetizado |
| `guardian-frost-knight` / `-ice-serpent` / `-bellringer` / `-ancient-yeti` | `src/assets/audio/music/snowfield/…` | guardiões do snowfield | sintetizado |
| `boss-winter-king` / `-enraged` | `src/assets/audio/music/snowfield/…` | chefe final snowfield | sintetizado |
| stings `guardian`, `boss`, `victory`, `defeat` | `src/assets/audio/music/sting-*.mp3` | avisos e fim de run | sintetizado |

Todas essas faixas foram **compostas por síntese local** ("not real instrument recordings", ver
`art-source/MUSIC_GENERATION_STATUS_v2.md`). Por isso a seção 2B traz prompts de **substituição `_v2`** (opcional, com
instrumentos "reais" via IA) — nunca sobrescrever os atuais.

**Efeitos sonoros:** **não existe nenhum arquivo de SFX.** Todos os efeitos são sintetizados em tempo real por
`src/audio/soundbank.ts` (`SoundName`: sword, whip, bolt, boomerang, aura, impact, critical, explosion, hurt, pickup,
upgrade, victory, defeat, warning, beam, shield-break, roar, dash) e disparados por eventos da sessão em
`GameAudio.bind()`. **O modo Taverna em Turnos não toca nenhum som** (nada em `src/render/tavern/**` usa áudio), embora
`TurnBattle.events` já emita tudo que precisamos (`attackAnnounced`, `hitResolved`, `strike`, `skillUsed`, `counter`,
`riposte`, `firmed`, `early`, `offBalance`, `charging`, `chargeBroken`, `poisoned`, `healed`, `looted`,
`courageLost`, `fighterDown`, `battleEnded`, `turnStarted`, `roundStarted`).

Lacunas que esta lista cobre: torres (Taverna, Iglu) sem trilha própria; snowfield sem loop de exploração próprio;
menu sem tema próprio; nenhum personagem tem voz; nenhuma habilidade tem som próprio.

---

## 1. Bíblia de estilo + especificação técnica (ler antes de gerar)

### 1.1 Clima
- **Venivium** = fantasia low-poly pixelada, isométrica, com humor de **"mesa de bar" brasileira**: taverna barulhenta,
  canecas, fichas, aposta, o dono (Sergio) que é secretário do coliseu. Perigo de verdade nas arenas, mas sempre com
  piscadela.
- Música: **instrumentos acústicos de fantasia medieval** (alaúde, rabeca/fiddle, sanfona/hurdy-gurdy, flauta doce,
  frame drum, pandeiro, cello, metais graves, coro sem palavras). **Sem synth lead, sem bateria moderna, sem EDM,
  sem vocais com letra.** Na torre da Taverna pode entrar tempero brasileiro discreto: **pandeiro, cavaquinho,
  violão de 7 cordas, cuíca leve, ritmo de choro/baião/xote** — sempre misturado ao folk medieval (nunca samba de
  escola).
- Paletas por região:
  - **Taverna / Torre da Taverna:** alaúde, cavaquinho, fiddle, sanfona, pandeiro, frame drum, tamborim leve, tuba
    cômica, flauta doce. Ré dórico / Sol mixolídio.
  - **Greenfield (arena do Necromante):** cello ostinato, frame drums, hurdy-gurdy, metais graves, coro masculino
    sem palavras. Mi menor / Ré menor.
  - **Campo Nevado / Iglu / Torre do Iglu:** harpa, celesta/glass harmonica, sinos de trenó, cordas em tremolo,
    flauta de osso, tambor de pele grave, coro feminino sem palavras, vento. Ré menor harmônico / Ré maior (iglu).
- Vozes (barks): **padrão = não-verbal** (grunhidos, risadas, suspiros, gritos de esforço). Onde marcado **[PT-BR]**,
  a fala é uma interjeição curtíssima em português brasileiro, escrita no prompt entre aspas (gere com ElevenLabs
  Voice Design/TTS com sotaque brasileiro, ou ElevenLabs SFX pedindo "Brazilian Portuguese exclamation"). Nada de
  frases longas. Gibberish só para criaturas (goblin, espíritos).

### 1.2 Especificação técnica (segue a convenção do repositório)
| | Música (loops) | Stings | SFX |
|---|---|---|---|
| Formato final | **MP3 160 kbps estéreo**, 44,1 kHz (como os atuais) | MP3 160 kbps estéreo | **MP3 128 kbps mono**, 44,1 kHz |
| Bruto | `<nome>-raw.wav` intocado ao lado (como `tavern-raw.wav`) | idem | `<nome>-raw.wav` (pode ser estéreo) |
| Loudness | **−14 LUFS integrado, −1,5 dBTP** (FFmpeg 2-pass EBU R128 — mesmo método de `snowfield/integration-loudness.json`) | −14 LUFS, −1,5 dBTP | pico **−1,5 dBTP**; momentâneo máx ≈ **−12 LUFS** (golpes/barks/finalizadores), ≈ **−18 LUFS** (UI, ticks, coragem) |
| Duração | loop 1:30–3:00, **compassos inteiros**, sem intro/fade/final, último compasso volta no primeiro | 2–10 s com decaimento natural | ver tabela (0,1–3 s); sem silêncio no começo (≤5 ms) e cauda ≤300 ms |
| Outros | tempo e tom fixos (listados) | — | sem música, sem reverb longo (o jogo mixa) |

- Geradores sugeridos: música → Suno / Udio / ElevenLabs Music / Stable Audio (sempre adicionar
  *"instrumental, no vocals, no lyrics"*); SFX → ElevenLabs Sound Effects / Stable Audio; barks [PT-BR] → ElevenLabs
  Voice Design ou TTS.
- Gere 2–4 variações por SFX e guarde a melhor; para eventos muito repetidos (attack, parry, dodge, bark-hurt) vale
  salvar até 3 variações como `attack.mp3`, `attack-2.mp3`, `attack-3.mp3` (o jogo pode sortear).

### 1.3 Pastas e nomes
- Música: `src/assets/audio/music/<track-id>.mp3` (Taverna/greenfield/menu), `src/assets/audio/music/snowfield/<track-id>.mp3`
  (Nevado/Iglu), **novo** `src/assets/audio/music/tower/<track-id>.mp3` (torres em turnos). Stings: `sting-<id>.mp3`.
- SFX (**pasta nova**): `src/assets/audio/sfx/<character-id>/<event>.mp3`, ids reais do código (`barbarian`, `mage`,
  `reliquia`, `fabri`, `brom`, `lyra`, `grimbo`, `zora`, `sergio`, `eskimo`, `frostKnight`, `iceSerpent`, `bellringer`,
  `ancientYeti`, `winterKing`, `frostSkeleton`, `frostSpirit`, `gravedigger`, `templeGuardian`, `lakeSpirit`,
  `finalBoss`). Comuns em `src/assets/audio/sfx/common/<event>.mp3`.
- Eventos: `bark-attack`, `bark-hurt`, `bark-ko`, `bark-victory`, `bark-skill`, `attack` (golpe básico/`strike`),
  `dodge`, `parry` (camada do personagem), `skill-<skill-id>` (id real do nó), `foe-<pattern-id>` (ataque do
  personagem como inimigo na torre), `arena-<attack>` (ataque no modo arena/sobrevivência).
- **Nunca sobrescrever**: se o arquivo existe, salve `<nome>_v2.mp3` (`_v3`…), igual a `guardian-lake_v2.mp3`.
- **Salve o prompt usado** ao lado: `<nome>-generation-prompt.txt` (como `src/assets/audio/music/tavern-generation-prompt.txt`),
  com ferramenta, seed/versão e data.

---

## 2. MÚSICA

### 2A. Faixas novas (não existem)

#### M1 — `menu` (tema do título)
- Arquivo: `src/assets/audio/music/menu.mp3` · 96 BPM · Ré dórico · loop 1:30–2:00
- Instrumentos: alaúde, fiddle, cavaquinho, sanfona (drone), pandeiro suave, coro baixo sem palavras.
- Clima: convite caloroso e meio épico; "a noite vai ser longa".
```
Warm, slightly epic fantasy tavern main-menu theme, 96 BPM, D dorian: lute and fiddle melody over a hurdy-gurdy drone, gentle Brazilian pandeiro and cavaquinho strumming, a soft wordless low choir swelling every 8 bars. Seamless loop, no intro, no fade, no ending; instrumental, no vocals, no lyrics.
```

#### M2 — `arena-snowfield` (exploração do Campo Nevado)
- Arquivo: `src/assets/audio/music/snowfield/arena-snowfield.mp3` · 120 BPM · Ré menor harmônico · loop 2:00–2:30
- Instrumentos: harpa ostinato, cordas em tremolo, frame drum grave, sinos de trenó, flauta de osso, vento.
- Clima: sobrevivência num campo gelado à noite; tensão fria, ainda com espaço para crescer.
```
Cold dark-fantasy survival theme in a frozen field at night, 120 BPM, D harmonic minor: driving harp and pizzicato ostinato, tremolo strings, deep skin frame drums, icy sleigh bells and a lonely bone-flute melody over howling wind. Constant tension, room to grow, seamless loop with no intro or ending; instrumental, no vocals.
```

#### M3 — `arena-snowfield-intense`
- Arquivo: `src/assets/audio/music/snowfield/arena-snowfield-intense.mp3` · 136 BPM · Ré menor harmônico · loop 2:00
- Mesmo tema de M2 empurrado: tambores dobrados, coro feminino sem palavras, metais graves.
```
The same frozen-field battle theme pushed to full force, 136 BPM, D harmonic minor: double-time skin drums, relentless low string ostinato, glassy celesta stabs, war horns and a wordless female choir in icy harmonies. Constant high intensity, no breakdown, seamless loop; instrumental, no lyrics.
```

#### M4 — `tower-taverna-battle` (andares em grupo da Torre da Taverna: "Mesa dos fundos", "Flecha e feitiço", "A turma toda")
- Arquivo: `src/assets/audio/music/tower/tower-taverna-battle.mp3` · 118 BPM · Sol mixolídio · loop 2:00
- Instrumentos: fiddle, cavaquinho, pandeiro, tamborim, sanfona, tuba cômica, palmas de mesa.
- Clima: briga de bar coreografada, divertida mas com ritmo de reação (pulso bem marcado para aparar/esquivar).
```
Rowdy fantasy tavern brawl in a turn-based duel, 118 BPM, G mixolydian: fast fiddle and cavaquinho riffs, Brazilian pandeiro and tamborim in a baião groove, hurdy-gurdy drone, comic tuba bass, table knocks on the backbeat. Very clear steady pulse, playful but competitive, seamless loop, no intro or ending; instrumental, no vocals.
```

#### M5 — `duel-brom` (andar 1, "Brom, o aquecimento" — duelo de bebida)
- Arquivo: `src/assets/audio/music/tower/duel-brom.mp3` · 100 BPM · Ré maior · loop 1:30
- Instrumentos: acordeão/sanfona, tuba, pandeiro, canecas batendo, alaúde; leve "balanço bêbado" (swing).
```
Jolly dwarven drinking-duel theme, 100 BPM, D major: oompah tuba and accordion, lute strums, pandeiro, clinking beer mugs and anvil taps as percussion, a swaying slightly tipsy swing feel. Cheerful and sturdy, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### M6 — `duel-lyra` (andar 2, "Lyra de longe")
- Arquivo: `src/assets/audio/music/tower/duel-lyra.mp3` · 124 BPM · Mi eólio · loop 1:30
- Instrumentos: flauta de madeira, harpa celta, violão dedilhado, bodhrán, cordas pizzicato.
```
Agile elven huntress duel, 124 BPM, E aeolian: quick wooden-flute melody, Celtic harp arpeggios, fingerpicked nylon guitar, bodhrán and light shaker, pizzicato strings like arrows in flight. Focused and nimble, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### M7 — `duel-grimbo` (andar 3, "A mesa do Grimbo" — dados e aposta)
- Arquivo: `src/assets/audio/music/tower/duel-grimbo.mp3` · 112 BPM · Lá menor (cigano) · loop 1:30
- Instrumentos: clarinete malandro, cavaquinho, contrabaixo pizzicato, cuíca leve, chocalho de dados, moedas.
```
Sneaky goblin gambler duel, 112 BPM, A minor with a gypsy-jazz twist: cheeky clarinet melody, cavaquinho chops, pizzicato double bass, a light cuíca squeak, rattling dice and coin jingles as percussion. Mischievous and swaggering, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### M8 — `duel-zora` (andar 5, "As fintas da Zora")
- Arquivo: `src/assets/audio/music/tower/duel-zora.mp3` · 92 BPM · Ré frígio dominante · loop 1:30
- Instrumentos: cimbalom, violino cigano, glass harmonica, darbuka, pausas suspensas (a música "finge" também).
```
Mysterious fortune-teller duel, 92 BPM, D phrygian dominant: cimbalom and gypsy violin, shimmering glass harmonica, darbuka, crystal-bowl swells, with sudden held pauses that feel like a feint. Hypnotic and teasing, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### M9 — `tower-taverna-champion` (andar 10, "O dono da casa" — Sergio)
- Arquivo: `src/assets/audio/music/tower/tower-taverna-champion.mp3` · 132 BPM · Dó menor → Mib maior · loop 2:00
- Instrumentos: tudo da torre + metais de fanfarra, coro de taverna "hey!" (sem palavras), surdo.
```
Grand tavern-owner boss battle, 132 BPM, C minor: full folk band with brass fanfare stabs, galloping fiddle and cavaquinho, surdo and pandeiro driving a frevo-like pulse, hurdy-gurdy lead and a rowdy wordless tavern crowd chant. Epic yet comic, the whole bar is fighting, seamless loop, no intro, no ending; instrumental, no lyrics.
```

#### M10 — `tower-taverna-rest` (andar de descanso "Balcão")
- Arquivo: `src/assets/audio/music/tower/tower-taverna-rest.mp3` · 84 BPM · Ré maior · loop 1:30
```
Calm cozy tavern counter between fights, 84 BPM, D major: slow solo nylon guitar and lute in a gentle choro feel, soft accordion pads, distant mug clinks and crackling hearth. Relaxed and warm, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### M11 — `tower-igloo-battle` (andares de horda: "Ossos na neve", "Sopro da nevasca")
- Arquivo: `src/assets/audio/music/tower/tower-igloo-battle.mp3` · 116 BPM · Ré menor · loop 2:00
```
Turn-based frozen skirmish, 116 BPM, D minor: plucked harp and pizzicato ostinato with a very clear pulse, skin frame drums, bone-rattle percussion, icy celesta motif and sleigh bells, wind gusts in the background. Tense but readable, seamless loop, no intro, no ending; instrumental, no vocals.
```
(Andares de guardião da Torre do Iglu — Cavaleiro, Serpente, Sineiro, Yeti, "Guardiões juntos" — **reutilizam** os
loops existentes `snowfield/guardian-*.mp3`; "Guardiões juntos" usa M11.)

#### M12 — `tower-igloo-rest` (descanso "Fogueira")
- Arquivo: `src/assets/audio/music/tower/tower-igloo-rest.mp3` · 72 BPM · Ré maior · loop 1:30
```
Campfire rest in the snow, 72 BPM, D major: soft harp and recorder melody, warm cello drone, crackling campfire and gentle wind, a music-box celesta twinkle like aurora light. Safe and tender, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### M13 — `tower-igloo-champion` (andar 11, "O Rei do Inverno" em turnos)
- Arquivo: `src/assets/audio/music/tower/tower-igloo-champion.mp3` · 128 BPM · Ré menor harmônico · loop 2:00
- Variação **turn-based** do tema de `boss-winter-king` (mesmo motivo, mas pulso mais claro e menos denso).
```
Regal ice-king boss duel, 128 BPM, D harmonic minor: majestic low brass motif, pipe organ, icy harpsichord ostinato, timpani and frame drums on a very clear beat, wordless female choir and shattering-glass accents. Cold, royal and menacing, seamless loop, no intro, no ending; instrumental, no lyrics.
```

#### M14 — `tower-select` (balcão do Sergio, escolha de torre / squad)
- Arquivo: `src/assets/audio/music/tower/tower-select.mp3` · 104 BPM · Sol maior · loop 1:30
```
Coliseum-in-a-tavern lobby, 104 BPM, G major: confident lute and cavaquinho strumming, pandeiro shuffle, a cheeky brass fanfare motif every 8 bars, crowd murmur under it. Anticipation before a challenge, seamless loop, no intro, no ending; instrumental, no vocals.
```

#### Stings novos (não loop)
| id | arquivo | dur | Prompt |
|---|---|---|---|
| `sting-duel-start` | `src/assets/audio/music/tower/sting-duel-start.mp3` | 2–3 s | `Short fantasy tavern duel-start sting: two beer mugs clink, a snare roll and a bright fiddle-and-brass hit, 2.5 seconds, instrumental.` |
| `sting-floor-cleared` | `src/assets/audio/music/tower/sting-floor-cleared.mp3` | 3–4 s | `Short cheerful folk victory sting for clearing a tower floor: quick cavaquinho and fiddle run, pandeiro hit, coins jingle, ends on a bright major chord, 3 seconds, instrumental.` |
| `sting-champion` | `src/assets/audio/music/tower/sting-champion.mp3` | 4–5 s | `Ominous champion-entrance sting: low brass call, big drum hit, rising strings to a held suspended chord, 4 seconds, instrumental.` |
| `sting-tower-victory` | `src/assets/audio/music/tower/sting-tower-victory.mp3` | 7–9 s | `Triumphant tower-top fanfare: brass fanfare, timpani roll, cavaquinho and fiddle flourish, a tavern crowd cheer without words, ending on a ringing major chord, 8 seconds, instrumental.` |
| `sting-tower-defeat` | `src/assets/audio/music/tower/sting-tower-defeat.mp3` | 4–6 s | `Comic-sad defeat sting: a deflating trombone wah-wah, a slow out-of-tune accordion phrase and a final empty-mug thunk, 5 seconds, instrumental.` |
| `sting-cashout` | `src/assets/audio/music/tower/sting-cashout.mp3` | 2–3 s | `Short satisfying cash-out sting: coins pouring into a leather pouch, a cheeky clarinet trill and a final pandeiro hit, 2.5 seconds, instrumental.` |

### 2B. Substituições `_v2` (opcional — as atuais são sintetizadas)
Mesmo tom/BPM das atuais para não quebrar nada; salve com `_v2` ao lado da original (no `guardian-lake` use `_v3`).

| id | arquivo novo | BPM / tom | Prompt |
|---|---|---|---|
| `tavern` | `music/tavern_v2.mp3` | 104 / Ré dórico | `Warm lively fantasy tavern at night, 104 BPM, D dorian: lute and fiddle trading phrases, hurdy-gurdy drone, frame drum and Brazilian pandeiro dance pulse, recorder counter-melody, mugs and crackling hearth. Cheerful with a hint of mystery, seamless loop, no intro or ending; instrumental, no vocals.` |
| `arena` | `music/arena_v2.mp3` | 128 / Mi menor | `Survival in a haunted arena at night, 128 BPM, E minor: driving cello and viola ostinato, pounding frame drums and taiko-like hits, gritty hurdy-gurdy melody, low brass swells. Tense and propulsive with room to grow, seamless loop; instrumental, no vocals.` |
| `arena-intense` | `music/arena-intense_v2.mp3` | 140 / Mi menor | `The haunted-arena battle theme at full force, 140 BPM, E minor: double-time frame drums, relentless low strings, war horns, wordless low male choir chanting syllables, screaming hurdy-gurdy. Constant high intensity, seamless loop; instrumental, no lyrics.` |
| `guardian-gravedigger` | `music/guardian-gravedigger_v2.mp3` | 96 / Dó menor, 3/4 | `Macabre mocking graveyard waltz in 3/4, 96 BPM, C minor: wheezing pipe organ, warped music box, bowed and plucked low strings, distant church bells, bone rattles and shovel scrapes. Creepy yet danceable, seamless loop; instrumental, no vocals.` |
| `guardian-temple` | `music/guardian-temple_v2.mp3` | 110 / Ré frígio | `Ancient stone guardian awakening in temple ruins, 110 BPM, D phrygian: heavy ceremonial war drums, stone-on-stone hits, low brass and tuba unison, droning bass, stern horn melody, gong strikes. Weighty and inexorable, seamless loop; instrumental.` |
| `guardian-lake` | `music/guardian-lake_v3.mp3` | 120 / Fá# menor | `Water spirit rising from a drained lake, 120 BPM, F# minor: flowing harp arpeggios, glass-harmonica droplets, wordless female choir, tremolo strings, rolling timpani like crashing waves. Beautiful and dangerous, seamless loop; instrumental, no lyrics.` |
| `boss-necromancer` | `music/boss-necromancer_v2.mp3` | 132 / Ré menor | `Gothic final boss, a crowned lich raising the dead, 132 BPM, D minor: thundering war drums, dark pipe organ, latin-style wordless choir, heavy low-brass main motif, racing string ostinato. Majestic and evil, seamless loop; instrumental.` |
| `boss-necromancer-enraged` | `music/boss-necromancer-enraged_v2.mp3` | 150 / Ré menor | `The lich's desperate second phase, 150 BPM, D minor, same motif faster: double-time drums, frantic string runs, full wordless choir fortissimo, dissonant brass stabs, organ at full power. Relentless, seamless loop; instrumental.` |
| `igloo` | `music/snowfield/igloo_v2.mp3` | 80 / Ré maior | `Cozy igloo shelter under the aurora, 80 BPM, D major: gentle harp and recorder, warm cello drone, soft glass-harmonica shimmer, a music-box twinkle and muffled wind outside. Safe and tender, seamless loop; instrumental, no vocals.` |
| `guardian-frost-knight` | `music/snowfield/guardian-frost-knight_v2.mp3` | 112 / Ré menor | `Frozen knight guardian in an icy fortress, 112 BPM, D minor: martial snare and timpani, heavy low brass, steel-on-ice percussion, tremolo strings, a stern horn motif. Slow, armored and relentless, seamless loop; instrumental.` |
| `guardian-ice-serpent` | `music/snowfield/guardian-ice-serpent_v2.mp3` | 126 / Fá# menor | `Ice serpent bursting from a frozen lake, 126 BPM, F# minor: slithering chromatic strings, glassy celesta, hissing shakers, deep drums, cracking-ice accents. Sinuous and dangerous, seamless loop; instrumental, no vocals.` |
| `guardian-bellringer` | `music/snowfield/guardian-bellringer_v2.mp3` | 96 / Dó menor harmônico | `Haunted bell-ringer guardian in a snowy chapel, 96 BPM, C harmonic minor: massive tolling bells as rhythm, pipe organ, low male wordless choir, tubular-bell melody with deceptive off-beat accents. Eerie and ceremonial, seamless loop; instrumental.` |
| `guardian-ancient-yeti` | `music/snowfield/guardian-ancient-yeti_v2.mp3` | 100 / Mi frígio | `Ancient yeti in a pine forest, 100 BPM, E phrygian: huge tribal skin drums, stomping low brass, throat-singing-like drone without words, avalanche rumbles, wooden flute cry. Primal and crushing, seamless loop; instrumental.` |
| `boss-winter-king` | `music/snowfield/boss-winter-king_v2.mp3` | 128 / Ré menor harmônico | `Winter King final boss, 128 BPM, D harmonic minor: regal low-brass motif, pipe organ, icy harpsichord ostinato, timpani, wordless female choir, shattering-ice accents. Cold and majestic, seamless loop; instrumental, no lyrics.` |
| `boss-winter-king-enraged` | `music/snowfield/boss-winter-king-enraged_v2.mp3` | 152 / Ré menor harmônico | `The Winter King's broken-crown phase, 152 BPM, D harmonic minor, same motif faster: double-time drums, blizzard-like string runs, full choir fortissimo, dissonant brass, cracking ice. Frantic, seamless loop; instrumental.` |
| sting `guardian` | `music/sting-guardian_v2.mp3` | — | `Ominous 4-second sting as a zone guardian wakes: distant low horn call, single deep drum hit, rising string swell to a held suspended chord; instrumental.` |
| sting `boss` | `music/sting-boss_v2.mp3` | — | `Dread 6-second sting, a malign presence fills the air: tolling bell, low wordless choir swelling from nothing, timpani roll, final deep brass chord; instrumental.` |
| sting `victory` | `music/sting-victory_v2.mp3` | — | `Triumphant 8-second medieval fanfare after surviving the night: bright brass, timpani roll, lute and fiddle flourish, warm ringing major chord; instrumental.` |
| sting `defeat` | `music/sting-defeat_v2.mp3` | — | `Somber 6-second defeat sting: mournful solo cello phrase, low wordless choir sigh, a last distant bell fading to silence; instrumental.` |

(Todos os caminhos de 2B começam com `src/assets/audio/`.)

---

## 3. SFX

Camadas: o som **comum** (seção 3.1) carrega o "game feel" (clang de aparo, whoosh de esquiva, coragem). O som **do
personagem** (`parry`, `dodge`, `attack`) é a textura da arma/corpo dele e toca junto, mais baixo. Passivos sem
gatilho audível usam só o comum (anotado em cada personagem).

### 3.1 Comuns — `src/assets/audio/sfx/common/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| aparo | `parry.mp3` | 0,3 s | `Sharp metal weapon parry clang with a short bright ring, punchy, video game, mono.` |
| aparo perfeito | `parry-perfect.mp3` | 0,5 s | `Perfect parry: crisp steel clang followed by a sparkling high chime and a tiny reverse whoosh, satisfying, mono.` |
| contra-ataque (combo aparado) | `counter.mp3` | 0,5 s | `Fast counter-attack: quick whoosh into a heavy satisfying hit with a bright accent, fantasy game, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Quick cloth-and-air dodge whoosh, light footstep scuff, mono.` |
| esquiva perfeita | `dodge-perfect.mp3` | 0,4 s | `Perfect dodge: sharp airy whoosh with a soft shimmering chime tail, slow-motion feel, mono.` |
| segurou a finta (`held`) | `feint-held.mp3` | 0,4 s | `Calm confident hold: a soft wooden knock and a gentle rising two-note pluck, reward feel, mono.` |
| caiu na finta (`offBalance`) | `off-balance.mp3` | 0,5 s | `Comic stumble: boots slipping on wood, a cartoon wobble and a small thud, mono.` |
| apertou cedo (`early`) | `early-lock.mp3` | 0,25 s | `Dull muted error thunk, like a wooden button jammed, short and clear, mono.` |
| golpe levado (`taken`) | `hit-taken.mp3` | 0,3 s | `Meaty body hit, cloth and leather thump, punchy, mono.` |
| firmar | `firm.mp3` | 0,5 s | `Bracing stance: boots planting on wooden floor, leather creak and a shield being raised, low thud, mono.` |
| carga começa | `charge-start.mp3` | 1,0 s | `Ominous power wind-up: deep rumbling rise with creaking strain, building tension, mono.` |
| carga tique (contagem) | `charge-tick.mp3` | 0,6 s | `Heavy tense heartbeat-like drum tick with a low rumble swell, countdown feel, mono.` |
| carga solta | `charge-release.mp3` | 1,0 s | `Massive released charged attack: huge whoosh into a crushing impact with debris and low boom, mono.` |
| carga quebrada | `charge-broken.mp3` | 0,6 s | `Interrupted wind-up: rising energy suddenly snapping and fizzling out with a glassy crack, mono.` |
| atordoar (stun) | `stun.mp3` | 0,7 s | `Dizzy stun: hollow bonk followed by cartoon tweeting birds spinning, short, mono.` |
| veneno (tique) | `poison-tick.mp3` | 0,4 s | `Small bubbling poison hiss with a sickly squelch, mono.` |
| queimadura de frio (tique) | `frost-burn-tick.mp3` | 0,4 s | `Cold frost bite: crackling ice crystals forming with a sharp hiss, mono.` |
| cura | `heal.mp3` | 0,7 s | `Gentle fantasy heal: warm rising harp shimmer with soft sparkles, mono.` |
| cura em grupo | `heal-all.mp3` | 1,0 s | `Group heal: warm choir-like swell with harp glissando and twinkling sparkles, mono.` |
| escudo sobe | `shield-up.mp3` | 0,6 s | `Magic shield forming: resonant hum rising into a glassy click, mono.` |
| escudo absorve | `shield-hit.mp3` | 0,3 s | `Hit absorbed by a magic barrier: muffled thump with a glassy ripple, mono.` |
| escudo quebra | `shield-break.mp3` | 0,6 s | `Magic barrier shattering like thick glass with sparkling debris, mono.` |
| armadura absorve | `armor-absorb.mp3` | 0,25 s | `Blow deflected by thick hide or armor: dull leather thud with a metal tick, mono.` |
| marca | `mark.mp3` | 0,5 s | `Target marked: sharp metallic ping with a short ominous drone, mono.` |
| enfraquecer | `weaken.mp3` | 0,6 s | `Debuff: descending wobbly tone with a soft deflating whoosh, mono.` |
| provocar/taunt | `taunt.mp3` | 0,6 s | `Aggro taunt: weapon banging on a shield twice with a short echo, mono.` |
| muralha pronta (wall) | `wall-ready.mp3` | 0,7 s | `Impenetrable guard readied: deep resonant metal hum locking into place with a heavy clunk, mono.` |
| crítico | `crit.mp3` | 0,4 s | `Critical hit: heavy punch with a bright metallic crack and short sparkle, mono.` |
| presságio (finta revelada) | `foresight-reveal.mp3` | 0,5 s | `Mystic insight: soft purple-feeling crystal chime with a whispery shimmer, mono.` |
| coragem +1 | `courage-gain.mp3` | 0,3 s | `Small uplifting pluck and spark, rising two notes, UI reward, mono.` |
| coragem cheia (5) | `courage-full.mp3` | 0,8 s | `Full power meter: bright ascending arpeggio with a warm brass swell, mono.` |
| coragem gasta | `courage-spend.mp3` | 0,3 s | `Energy spent: quick whoosh with a soft magical pop, mono.` |
| coragem perdida | `courage-lost.mp3` | 0,4 s | `Courage lost: short descending pluck with a dull thud, mono.` |
| intenção: golpe | `intent-golpe.mp3` | 0,3 s | `Single short warning tick: a wooden knock with a brief rising tone, mono.` |
| intenção: combo | `intent-combo.mp3` | 0,4 s | `Warning: three quick rapid wooden knocks, mono.` |
| intenção: pesado | `intent-pesado.mp3` | 0,5 s | `Heavy warning: deep low drum hit with a slow creak, mono.` |
| intenção: flecha | `intent-flecha.mp3` | 0,4 s | `Bowstring being drawn tight, short creak, mono.` |
| intenção: dados | `intent-dados.mp3` | 0,5 s | `Dice shaken in a cup, short rattle, mono.` |
| intenção: arremesso | `intent-arremesso.mp3` | 0,4 s | `Arm wind-up for a throw: cloth swish and grunt-less effort whoosh, mono.` |
| intenção: carregado | `intent-carregado.mp3` | 0,7 s | `Ominous gathering of power: low rumble and rising metallic hum, mono.` |
| projétil flecha | `proj-arrow.mp3` | 0,4 s | `Arrow release and fast whistling flight, mono.` |
| projétil caneca | `proj-mug.mp3` | 0,5 s | `Heavy wooden beer mug spinning through the air with beer sloshing, mono.` |
| projétil prato | `proj-plate.mp3` | 0,4 s | `Ceramic plate spinning through the air like a frisbee, mono.` |
| projétil garrafa | `proj-bottle.mp3` | 0,4 s | `Glass bottle tumbling through the air with liquid sloshing, mono.` |
| projétil barril | `proj-barrel.mp3` | 1,4 s | `Big wooden barrel rolling fast across wooden floorboards, rumbling, mono.` |
| projétil peixe | `proj-fish.mp3` | 0,5 s | `Frozen fish thrown, stiff whoosh with a comic wobble, mono.` |
| projétil gelo | `proj-ice.mp3` | 0,4 s | `Ice shard shot through the air, crystalline whistle, mono.` |
| projétil bola de neve | `proj-snowball.mp3` | 0,4 s | `Snowball thrown, soft whoosh, mono.` |
| impacto caneca | `impact-mug.mp3` | 0,4 s | `Wooden mug smashing on a body with a beer splash, mono.` |
| impacto prato | `impact-plate.mp3` | 0,4 s | `Ceramic plate shattering on impact, mono.` |
| impacto garrafa | `impact-bottle.mp3` | 0,4 s | `Glass bottle breaking with a liquid splash, mono.` |
| impacto barril | `impact-barrel.mp3` | 0,6 s | `Wooden barrel crashing and bursting with foam spray, mono.` |
| impacto peixe | `impact-fish.mp3` | 0,3 s | `Wet frozen fish slapping a face, comic, mono.` |
| impacto gelo | `impact-ice.mp3` | 0,4 s | `Ice shard shattering on impact with tinkling crystals, mono.` |
| impacto bola de neve | `impact-snowball.mp3` | 0,3 s | `Snowball splat on a body, soft crunchy puff, mono.` |
| impacto flecha | `impact-arrow.mp3` | 0,25 s | `Arrow thudding into leather armor, mono.` |
| início de turno | `turn-start.mp3` | 0,3 s | `Soft wooden tick and short pluck, your turn, UI, mono.` |
| início de rodada | `round-start.mp3` | 0,5 s | `Small tavern bell ding, round start, mono.` |
| início da batalha (brinde) | `battle-start.mp3` | 0,8 s | `Two beer mugs clinking in a toast with a foam splash, mono.` |
| lutador caído | `fighter-down.mp3` | 0,8 s | `Body falling onto wooden floor with a mug rolling away, mono.` |
| ficha (loot) | `fichas-coin.mp3` | 0,3 s | `Single gold coin flip and clink, bright, mono.` |
| pote cresce | `fichas-pot.mp3` | 0,8 s | `Handful of coins pouring into a wooden pot, mono.` |
| sair com o pote | `cashout.mp3` | 1,0 s | `Leather pouch of coins tied shut and patted, satisfying jingle, mono.` |
| entrar no andar | `floor-enter.mp3` | 1,0 s | `Heavy wooden door creaking open onto a noisy tavern crowd murmur, mono.` |
| descanso: comer | `rest-eat.mp3` | 1,0 s | `Hearty eating: spoon in a stew bowl, a satisfied munch, mono.` |
| descanso: respirar | `rest-breathe.mp3` | 1,2 s | `Deep calm breath in and out with a soft warm swell, mono.` |
| subir nível (árvore) | `level-up.mp3` | 0,9 s | `Level up: bright ascending lute arpeggio with coin sparkle, mono.` |
| UI selecionar | `ui-select.mp3` | 0,1 s | `Soft wooden UI click, mono.` |
| UI confirmar | `ui-confirm.mp3` | 0,25 s | `Wooden UI confirm: knock plus a short bright pluck, mono.` |
| UI voltar | `ui-back.mp3` | 0,2 s | `Wooden UI back: soft lower knock, mono.` |

### 3.2 Heróis (modo arena + squad)
Conjunto base de cada personagem (8 arquivos): `bark-attack`, `bark-hurt`, `bark-ko`, `bark-victory`, `bark-skill`,
`attack`, `dodge`, `parry`. Duração: barks 0,4–1,2 s; attack 0,3–0,5 s; dodge 0,25 s; parry 0,3 s.

#### `barbarian` — Bárbaro (espadão, resistente, "transforma dor em ritmo") — pasta `src/assets/audio/sfx/barbarian/`
Voz: homem grande, rouco, não-verbal. Passivo **Pele de Urso** → `common/armor-absorb`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,5 s | `Big burly barbarian battle grunt, short and raspy "HRAH!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Big barbarian pained grunt through gritted teeth, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Huge barbarian collapsing with a long defeated groan, mono.` |
| bark vitória | `bark-victory.mp3` | 1,2 s | `Barbarian triumphant roaring laugh, chest-thumping, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,7 s | `Barbarian fierce war shout building power, no words, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Heavy two-handed greatsword swing, deep whoosh into a meaty slash, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Heavy body sidestep, fur and leather swish, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Greatsword blade blocking a blow, thick low steel clang, mono.` |
| Investida | `skill-investida.mp3` | 0,8 s | `Charging barbarian: thundering footsteps rushing forward into a massive greatsword slash, mono.` |
| Grito de Guerra | `skill-grito-de-guerra.mp3` | 1,2 s | `Barbarian war cry, a booming wordless roar that echoes with a shield bang, mono.` |
| Fúria (finalizador) | `skill-furia.mp3` | 1,5 s | `Barbarian spinning greatsword whirlwind: rapid repeating heavy whooshes and multiple meaty slashes, ending in a roar, mono.` |

#### `mage` — Mago (cajado, veloz) — `src/assets/audio/sfx/mage/`
Voz: homem jovem/maduro, concentrado. Passivo **Concentração** → `common/crit`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Male wizard short focused exhale "hah!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Male wizard surprised pained gasp, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Wizard falling with a fading groan and staff clattering on wood, mono.` |
| bark vitória | `bark-victory.mp3` | 1,0 s | `Wizard pleased chuckle with a magical sparkle, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,8 s | `Wizard murmuring arcane gibberish incantation, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Magic staff bolt: quick zap with a bright arcane whoosh, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Robe swish with a faint magical blink, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Wooden staff blocking a blade, hard knock with a small arcane spark, mono.` |
| Raio Arcano | `skill-raio-arcano.mp3` | 0,9 s | `Arcane lightning bolt cast from a staff: crackling charge then a sharp electric blast, mono.` |
| Barreira Arcana | `skill-barreira-arcana.mp3` | 1,0 s | `Arcane barrier spreading over a group: humming dome expanding with a glassy chime, mono.` |
| Chuva de Meteoros | `skill-chuva-de-meteoros.mp3` | 2,0 s | `Meteor shower: roaring fireballs falling from the sky, several heavy explosive impacts, mono.` |

#### `reliquia` — Relíquia (caçador de relíquias sempre sorridente, aura dourada) — `src/assets/audio/sfx/reliquia/`
Voz: homem animado, risonho; **[PT-BR]** no bark de vitória. Passivo **Faro de Tesouro** → `common/fichas-coin`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Cheerful adventurer short effort shout with a grin, "hup!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Cheerful adventurer quick "ouch" grunt, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Adventurer falling with a sighing groan, golden amulet jingling, mono.` |
| bark vitória [PT-BR] | `bark-victory.mp3` | 1,0 s | `Upbeat young man in Brazilian Portuguese laughing "Achei!" ("found it!"), mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Adventurer excited "hah!" with a warm golden shimmer, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Golden aura pulse hitting: warm resonant thrum with a light impact, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Light leather-boots sidestep with amulet chain jingle, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Golden relic amulet blocking a blow, bright bell-like clang, mono.` |
| Brilho da Relíquia | `skill-brilho-da-reliquia.mp3` | 1,0 s | `Golden relic glow healing the party: warm choir-like hum and sparkling bells, mono.` |
| Olho do Caçador | `skill-olho-do-cacador.mp3` | 0,6 s | `Hunter's eye mark: sharp golden ping and focused lens-like zoom, mono.` |
| Tesouro Antigo | `skill-tesouro-antigo.mp3` | 1,5 s | `Ancient treasure strike: heavy golden blast followed by a cascade of coins spilling, mono.` |

#### `fabri` — Fabri (macaco guerreiro blindado, bananas, bumerangue) — `src/assets/audio/sfx/fabri/`
Voz: **macaco** (não-verbal, guinchos). Passivo **Ginga Símia** → sem som próprio.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Armored monkey warrior short aggressive screech "ook!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Monkey yelping in pain, short, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Monkey whimpering as it falls, armor clanking on wood, mono.` |
| bark vitória | `bark-victory.mp3` | 1,2 s | `Excited monkey hooting and chest-thumping in celebration, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Monkey rapid excited chatter, mono.` |
| golpe básico | `attack.mp3` | 0,5 s | `Runic boomerang thrown: whirring spin going out and back, light hit, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Agile monkey hop with light armor rattle, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Small metal bracer blocking a blow, quick clang, mono.` |
| Bumerangue Rúnico | `skill-bumerangue-runico.mp3` | 1,2 s | `Glowing runic boomerang whirring through several enemies with quick successive hits and a magical hum, mono.` |
| Banana! | `skill-banana.mp3` | 0,8 s | `Banana peeled and eaten quickly with a happy monkey munch, mono.` |
| Fúria Símia | `skill-furia-simia.mp3` | 1,6 s | `Furious gorilla chest-beating followed by a huge ground-smashing slam, mono.` |

### 3.3 Frequentadores (heróis + inimigos da Torre da Taverna)
Além do kit (sempre deles), inclui os **outros nós ativos da árvore** (o líder pode aprender), os **ataques como
inimigo** (`foe-<pattern>`) e as **habilidades do modo arena** (`arena-<…>`, HeroAbilitySystem).

#### `brom` — Brom Barbaferro (anão cervejeiro, duro como bigorna; duelo de bebida) — `src/assets/audio/sfx/brom/`
Voz: anão grave, rouco, risonho; **[PT-BR]** em vitória/habilidade ("Hah!" é o bordão dele no código).
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Stout dwarf deep gruff grunt "HUAH!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Dwarf gruff annoyed "oof", mono.` |
| bark KO | `bark-ko.mp3` | 1,2 s | `Drunk dwarf collapsing with a long groan and a final hiccup, mono.` |
| bark vitória [PT-BR] | `bark-victory.mp3` | 1,2 s | `Deep jolly dwarf voice in Brazilian Portuguese laughing "Hah! Mais uma rodada!", mono.` |
| bark habilidade [PT-BR] | `bark-skill.mp3` | 0,6 s | `Deep dwarf voice shouting "Saúde!" (cheers) in Brazilian Portuguese, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Forge hammer swing, heavy whoosh into a blunt iron thud, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Short stocky dwarf sidestep, heavy boots and chainmail jingle, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Hammer head blocking a blow, anvil-like ring, mono.` |
| brinde (regra) | `brinde.mp3` | 1,0 s | `Dwarf gulping a big mug of ale and slamming it on the table with a satisfied "ahh", mono.` |
| soluço (bêbado) | `soluco.mp3` | 0,4 s | `Comic drunk dwarf hiccup, mono.` |
| Barril | `skill-barril.mp3` | 0,8 s | `Wooden barrel dragged and slammed down as cover, hollow thunk, mono.` |
| Gole Rápido | `skill-gole-rapido.mp3` | 0,8 s | `Quick big gulp of beer and a refreshed exhale, mono.` |
| Contragolpe (passivo) | `skill-contragolpe.mp3` | 0,4 s | `Instant hammer riposte after a parry: quick snap whoosh and iron thud, mono.` |
| Golpe da Forja | `skill-golpe-da-forja.mp3` | 1,5 s | `Massive forge hammer smash: rising grunt, huge anvil-like impact with sparks and ground shake, mono.` |
| Provocar (árvore) | `skill-provocar.mp3` | 0,8 s | `Dwarf mocking raspberry and belly slap, comic taunt, mono.` |
| Muralha Viva (árvore) | `skill-muralha-viva.mp3` | 1,0 s | `Dwarf planting into an unbreakable stance, deep metal hum and a stone-like thud, mono.` |
| Bafo de Malte (árvore) | `skill-bafo-de-malte.mp3` | 1,0 s | `Huge comic dwarf burp blasting someone in the face, mono.` |
| Barril sem Fundo (árvore) | `skill-barril-sem-fundo.mp3` | 1,5 s | `Endless chugging from a barrel tap, glug-glug, then a sober refreshed "ahh", mono.` |
| Martelada (árvore) | `skill-martelada.mp3` | 0,8 s | `Hard overhead hammer blow with a heavy metallic crunch, mono.` |
| inimigo: Golpe de Caneca | `foe-caneca.mp3` | 0,4 s | `Beer mug swung into a face, wooden clonk with beer splash, mono.` |
| inimigo: Rodada de Socos | `foe-socos.mp3` | 1,0 s | `Three quick dwarf punches, rhythmic meaty thuds, mono.` |
| inimigo: Martelada Pesada | `foe-martelada.mp3` | 1,0 s | `Slow heavy hammer wind-up creak then a crushing blow, mono.` |
| inimigo: Barril nas Costas | `foe-barril-costas.mp3` | 1,2 s | `Dwarf heaving a full barrel overhead with a strained grunt and smashing it down, mono.` |
| arena: Hidromel | `arena-hidromel.mp3` | 1,0 s | `Mead horn drinking, warm healing glow and satisfied dwarf sigh, mono.` |
| arena: Barril Rolante | `arena-barril-rolante.mp3` | 1,5 s | `Barrel rolling fast then exploding into a burst of beer foam, mono.` |

#### `lyra` — Lyra Folhaverde (elfa caçadora, nunca erra; sarcástica) — `src/assets/audio/sfx/lyra/`
Voz: mulher jovem, seca, confiante; **[PT-BR]** curto na vitória. Passivos **Mira/Olho Aberto** → `common/crit`; **Pés Ligeiros** → nenhum.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,3 s | `Young elf woman short sharp exhale "tsh!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,3 s | `Young woman sharp pained gasp, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Elf huntress falling with a soft defeated sigh, bow dropping, mono.` |
| bark vitória [PT-BR] | `bark-victory.mp3` | 0,8 s | `Confident young woman in Brazilian Portuguese, smug: "Na mosca.", mono.` |
| bark habilidade | `bark-skill.mp3` | 0,5 s | `Elf woman focused breath held then released, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Elven bow: string pull, release twang and arrow hit, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Light agile leap with leaves rustling, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Short dagger deflecting a blade, thin bright clink, mono.` |
| Tiro Certeiro | `skill-tiro-certeiro.mp3` | 0,8 s | `Long bow draw creak, powerful release and a piercing arrow hit, mono.` |
| Flecha Envenenada | `skill-flecha-envenenada.mp3` | 0,8 s | `Arrow release and hit with a sickly green poison hiss, mono.` |
| Flecha Fantasma | `skill-flecha-fantasma.mp3` | 1,2 s | `Ghostly invisible arrow: eerie reversed whisper then a sudden devastating piercing impact, mono.` |
| Raízes (árvore) | `skill-raizes.mp3` | 1,0 s | `Roots bursting from the ground and wrapping tight, creaking wood, mono.` |
| Abraço da Floresta (árvore) | `skill-abraco-da-floresta.mp3` | 1,5 s | `Forest embrace: vines and branches crushing, leaves rustling, toxic bubbling, mono.` |
| Distância (árvore) | `skill-distancia.mp3` | 0,5 s | `Quick backflip leap away, cloth snap and soft landing, mono.` |
| Dança do Vento (árvore) | `skill-danca-do-vento.mp3` | 1,0 s | `Swirling gust of wind with leaves, airy and elegant, mono.` |
| Flecha de Volta (passivo) | `skill-flecha-de-volta.mp3` | 0,4 s | `Quick snap shot arrow fired mid-dodge, mono.` |
| inimigo: Flecha Rápida | `foe-flecha.mp3` | 0,5 s | `Fast arrow shot from distance, quick twang and whistle, mono.` |
| inimigo: Saraivada | `foe-saraivada.mp3` | 1,0 s | `Volley of four rapid arrows twanging in sequence, mono.` |
| inimigo: Dança da Adaga | `foe-adaga.mp3` | 0,6 s | `Two quick dagger slashes, light and sharp, mono.` |
| inimigo: Tiro à Queima-Roupa | `foe-queima-roupa.mp3` | 0,8 s | `Point-blank heavy arrow shot, deep twang and brutal close impact, mono.` |
| arena: Chuva de Flechas | `arena-chuva-de-flechas.mp3` | 1,5 s | `Rain of arrows: many arrows whistling down and thudding into the ground, mono.` |

#### `grimbo` — Grimbo Dedoleve (goblin apostador, trapaceiro) — `src/assets/audio/sfx/grimbo/`
Voz: goblin agudo, gibberish e risadinha; **[PT-BR]** na vitória ("a casa sempre ganha" no código). Passivo **Dado Chumbado** → `common/crit`; **Bolso Fundo** → `common/fichas-coin`; **Ginga** → nenhum.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,3 s | `Small goblin squeaky gleeful "hee!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,3 s | `Goblin squealing in pain, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Goblin falling with a whiny groan and coins scattering, mono.` |
| bark vitória [PT-BR] | `bark-victory.mp3` | 1,0 s | `Squeaky goblin voice in Brazilian Portuguese cackling "A casa sempre ganha!", mono.` |
| bark habilidade | `bark-skill.mp3` | 0,5 s | `Goblin sneaky snickering gibberish, mono.` |
| golpe básico | `attack.mp3` | 0,3 s | `Loaded coin flicked hard, metallic ping hitting a forehead, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Tiny goblin scurry with coin jingle, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Small dagger or coin purse deflecting a blow, quick clink, mono.` |
| aposta (regra) | `aposta.mp3` | 0,6 s | `Stack of gambling chips pushed across a wooden table, mono.` |
| Rolar os Dados | `skill-rolar-os-dados.mp3` | 1,0 s | `Two dice rolled across a wooden table, then a hit, mono.` |
| Batedor de Carteira | `skill-batedor-de-carteira.mp3` | 0,7 s | `Quick pickpocket: cloth swipe and coins jingling into a pouch, mono.` |
| Seis Duplo | `skill-seis-duplo.mp3` | 1,5 s | `Dice landing on double six with a jackpot chime, then a big hit and coin explosion, mono.` |
| Dobro ou Nada (árvore) | `skill-dobro-ou-nada.mp3` | 1,2 s | `Tense dice roll with a drumroll and an all-or-nothing hit, mono.` |
| Truque Sujo (árvore) | `skill-truque-sujo.mp3` | 0,5 s | `Sneaky foot stomp on toes and a yelp, comic, mono.` |
| O Grande Golpe (árvore) | `skill-grande-golpe.mp3` | 1,5 s | `Big heist: heavy hit then a long cascade of coins into a sack, mono.` |
| Areia nos Olhos (árvore) | `skill-areia-nos-olhos.mp3` | 0,6 s | `Handful of sand thrown in the face, gritty spray and a cough, mono.` |
| Mesa Virada (árvore) | `skill-mesa-virada.mp3` | 1,0 s | `Wooden table flipped over with mugs and coins crashing, mono.` |
| Desvio (passivo) | `skill-desvio.mp3` | 0,4 s | `Sly deflection: quick swish and a blow bounced back, mono.` |
| inimigo: Moeda na Testa | `foe-moeda.mp3` | 0,4 s | `Coin flicked onto a forehead, sharp ping, mono.` |
| inimigo: Dados Rolando | `foe-dados.mp3` | 1,0 s | `Dice rattling and tumbling, followed by quick small hits, mono.` |
| inimigo: Mesa Virada | `foe-mesa.mp3` | 1,0 s | `Goblin heaving a heavy table onto someone, wood crash, mono.` |
| arena: Tudo ou Nada | `arena-tudo-ou-nada.mp3` | 1,0 s | `Single big die rolling and landing with a jackpot ding, mono.` |

#### `zora` — Madame Zora (vidente misteriosa, fintas) — `src/assets/audio/sfx/zora/`
Voz: mulher madura, misteriosa, risada baixa; **[PT-BR]** na vitória. Passivos **Pressentimento** → `common/foresight-reveal`; **Terceiro Olho** → nenhum.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Mysterious mature woman sharp whispered "hah", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Mature woman offended pained gasp, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Fortune teller falling with a sighing moan, crystal ball rolling, mono.` |
| bark vitória [PT-BR] | `bark-victory.mp3` | 1,0 s | `Mysterious woman in Brazilian Portuguese, low knowing tone: "Eu já sabia...", mono.` |
| bark habilidade | `bark-skill.mp3` | 0,7 s | `Fortune teller mystical humming gibberish incantation, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Crystal ball flash: glassy zap with a short shimmer, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Silk scarves and bangles swishing, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Crystal deflecting a blow, glassy ring, mono.` |
| Escudo de Cristal | `skill-escudo-de-cristal.mp3` | 0,8 s | `Crystal shield forming with resonant glass harmonics, mono.` |
| Mau-Olhado | `skill-mau-olhado.mp3` | 0,8 s | `Evil eye curse: eerie whisper and a descending dissonant chime, mono.` |
| Eclipse | `skill-eclipse.mp3` | 1,8 s | `Eclipse: deep cosmic drone, light swallowed, a heavy stunning blast with ringing silence, mono.` |
| Cura Cristalina (árvore) | `skill-cura-cristalina.mp3` | 0,8 s | `Crystal healing chime, soft and pure, mono.` |
| Prisão de Cristal (árvore) | `skill-prisao-de-cristal.mp3` | 1,0 s | `Crystal prison forming around a body, cracking glass growth, mono.` |
| Marca (árvore) | `skill-marca.mp3` | 0,6 s | `Arcane mark burned onto a target, sizzling sigil sound, mono.` |
| Praga (árvore) | `skill-praga.mp3` | 0,8 s | `Curse plague: buzzing flies and sickly whisper, mono.` |
| Maldição Final (árvore) | `skill-maldicao-final.mp3` | 1,5 s | `Final curse: chorus of ghostly whispers converging into a heavy dark impact, mono.` |
| Destino (passivo) | `skill-destino.mp3` | 0,4 s | `Fate riposte: quick tarot card flick and a sharp mystic hit, mono.` |
| inimigo: Raio de Cristal | `foe-cristal.mp3` | 0,5 s | `Crystal beam zap, bright glassy blast, mono.` |
| inimigo: Dança das Sombras | `foe-sombras.mp3` | 1,0 s | `Shadow dance: whooshing dark swirls and two quick strikes, mono.` |
| inimigo: Olhar Maldito | `foe-olhar.mp3` | 1,0 s | `Cursed gaze: eerie hum, then strikes with a deceptive pause, mono.` |
| inimigo: Finta do Corvo | `foe-corvo.mp3` | 1,0 s | `Raven caw and wingbeat feint followed by a heavy dark strike, mono.` |
| arena: Destino Selado | `arena-destino-selado.mp3` | 1,2 s | `Fate sealed: three tarot cards slapped down and a doom bell toll, mono.` |

#### `sergio` — Sergio (o taberneiro, a loja inteira nas costas; campeão da Torre da Taverna) — `src/assets/audio/sfx/sergio/`
Voz: homem de meia-idade, bonachão, comerciante; **[PT-BR]** em vitória/habilidade ("freguês" é dele). Passivo **Estoque Cheio** → `common/crit`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Middle-aged burly innkeeper effort grunt "hup!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Innkeeper indignant "ai!" grunt, mono.` |
| bark KO | `bark-ko.mp3` | 1,2 s | `Innkeeper collapsing onto a pile of pots and bottles, groan and clatter, mono.` |
| bark vitória [PT-BR] | `bark-victory.mp3` | 1,2 s | `Jovial Brazilian innkeeper laughing "Volta sempre, freguês!", mono.` |
| bark habilidade [PT-BR] | `bark-skill.mp3` | 0,6 s | `Jovial Brazilian innkeeper shouting "Por conta da casa!", mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Backpack full of junk swung, rattling pots and a blunt clunk, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Heavy man sidestep with a jangling backpack of pans, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Frying pan blocking a blow, loud pan clang, mono.` |
| Garrafada | `skill-garrafada.mp3` | 0,6 s | `Glass bottle smashed over a head, glass shatter and dull thud, mono.` |
| Rodada da Casa | `skill-rodada-da-casa.mp3` | 1,0 s | `Round on the house: several mugs filled from a tap and clinked together, mono.` |
| Devolução (passivo) | `skill-devolucao.mp3` | 0,5 s | `Thrown item caught and hurled straight back, quick whoosh and impact, mono.` |
| Barril Rolante | `skill-barril-rolante.mp3` | 1,8 s | `Full barrel rolling fast across wooden floor and crashing hard, mono.` |
| Rodada (árvore) | `skill-rodada.mp3` | 0,7 s | `Single drink poured and gulped, mono.` |
| Pinga Boa (árvore) | `skill-pinga-boa.mp3` | 0,8 s | `Cachaça poured into a small glass, a sip and a satisfied "ahh", mono.` |
| Rodada Grátis (árvore) | `skill-rodada-gratis.mp3` | 1,2 s | `Generous pour from a big bottle with cheering tavern crowd, mono.` |
| Prato Voador (árvore) | `skill-prato-voador.mp3` | 0,6 s | `Plate thrown like a frisbee, whirring then shattering on a head, mono.` |
| Fecha a Conta (árvore) | `skill-fecha-a-conta.mp3` | 0,8 s | `Old cash register ka-ching with a heavy ledger slam, mono.` |
| inimigo: Caneca Arremessada | `foe-caneca.mp3` | 0,6 s | `Mug hurled across the tavern with a grunt, mono.` |
| inimigo: Chuva de Pratos | `foe-pratos.mp3` | 1,2 s | `Four plates thrown in quick irregular rhythm, whirring, mono.` |
| inimigo: Garrafas de Rolha | `foe-garrafas.mp3` | 0,6 s | `Three corks popping and bottles flung, mono.` |
| inimigo: Barril Rolando | `foe-barril.mp3` | 1,5 s | `Barrel kicked off and rolling toward the player, rumbling, mono.` |
| inimigo: Fecha a Conta (carregado) | `foe-fecha-conta.mp3` | 1,5 s | `Ominous cash-register ka-ching, ledger slam and a massive charged smash, mono.` |
| arena: Loja Portátil | `arena-loja-portatil.mp3` | 1,0 s | `Shop door bell jingle and a wooden counter unfolding, mono.` |
| arena: Liquidação | `arena-liquidacao.mp3` | 0,8 s | `Clearance sale: cash register ka-ching and a cheerful bell, mono.` |

### 3.4 Pessoal do Iglu (squad + inimigos da Torre do Iglu + guardiões do Campo Nevado)

#### `eskimo` — Esquimó (cozinheiro bonachão; panela, concha, peixe) — `src/assets/audio/sfx/eskimo/`
Voz: homem gordinho, alegre, não-verbal (risadinha, "hm-hm!"). Passivo **Agasalho** → `common/armor-absorb`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Chubby cheerful cook effort grunt "hoh!", mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Chubby man muffled "oof" through thick furs, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Cook falling into the snow with a sigh, pots clanging, mono.` |
| bark vitória | `bark-victory.mp3` | 1,0 s | `Jolly cook belly laugh, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Cook humming happily "mm-hmm!", mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Ladle smacking a head, metallic bonk, mono.` |
| esquiva | `dodge.mp3` | 0,25 s | `Heavy furs swishing with a crunchy snow step, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Cooking pot lid blocking a blow, tinny clang, mono.` |
| Peixe Congelado | `skill-peixe-congelado.mp3` | 0,6 s | `Frozen fish slapped hard, icy crack and comic stun bonk, mono.` |
| Sopa Quentinha | `skill-sopa-quentinha.mp3` | 1,0 s | `Hot soup ladled into bowls, steamy bubbling and happy slurps, mono.` |
| Banquete da Tundra | `skill-banquete-da-tundra.mp3` | 1,6 s | `Big cauldron feast: bubbling pot, many ladles serving, warm cheering, mono.` |
| inimigo: Peixe Congelado | `foe-peixe.mp3` | 0,6 s | `Frozen fish hurled with a cook's grunt, mono.` |
| inimigo: Conchada | `foe-concha.mp3` | 0,6 s | `Two quick metal ladle bonks, mono.` |
| inimigo: Panelada | `foe-panela.mp3` | 1,0 s | `Big iron pot swung slowly and smashed down, loud clang, mono.` |

#### `frostKnight` — Cavaleiro Congelado (armadura pesada de gelo, lento) — `src/assets/audio/sfx/frostKnight/`
Voz: grave, abafada pelo elmo, não-verbal. Passivo **Postura Firme** → nenhum.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,5 s | `Armored knight deep grunt echoing inside a frozen helmet, mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Muffled knight grunt with cracking ice armor, mono.` |
| bark KO | `bark-ko.mp3` | 1,5 s | `Frozen knight collapsing, ice armor shattering, final hollow exhale, mono.` |
| bark vitória | `bark-victory.mp3` | 1,0 s | `Knight's cold low exhale and sword planted in ice, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Knight resolute deep breath through helmet, mono.` |
| golpe básico | `attack.mp3` | 0,5 s | `Ice longsword heavy slash, crystalline whoosh and cold impact, mono.` |
| esquiva | `dodge.mp3` | 0,3 s | `Heavy armored step back, plate armor and ice crunch, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Ice shield blocking, deep icy clang, mono.` |
| Corte Gélido | `skill-corte-gelido.mp3` | 0,8 s | `Freezing sword slash leaving frost: icy whoosh and crackle, mono.` |
| Guarda de Gelo | `skill-guarda-de-gelo.mp3` | 0,8 s | `Ice shield raised with crystals forming, mono.` |
| Muralha Congelada | `skill-muralha-congelada.mp3` | 1,2 s | `Wall of ice erupting around a knight, deep cracking and humming, mono.` |
| inimigo: Corte Gélido | `foe-corte.mp3` | 0,6 s | `Slow heavy icy sword slash, mono.` |
| inimigo: Estocadas | `foe-estocadas.mp3` | 1,0 s | `Three measured sword thrusts with icy hisses, mono.` |
| inimigo: Lâmina do Inverno | `foe-lamina.mp3` | 1,5 s | `Long ominous blade wind-up with frost forming, then a crushing icy strike, mono.` |
| arena: Corte de Gelo | `arena-iceSlash.mp3` | 0,6 s | `Wide icy sword arc, freezing whoosh, mono.` |
| arena: Muralha de Gelo | `arena-iceWall.mp3` | 1,2 s | `Row of ice pillars erupting from the ground, crashing and cracking, mono.` |
| arena: Investida | `arena-charge.mp3` | 1,0 s | `Armored knight charging on ice, heavy clanking footsteps into a crash, mono.` |

#### `iceSerpent` — Serpente do Gelo — `src/assets/audio/sfx/iceSerpent/`
Voz: sibilos e chiados (não-verbal). Passivo **Escamas Lisas** → nenhum.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Giant serpent sharp aggressive hiss, mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Serpent pained screeching hiss, mono.` |
| bark KO | `bark-ko.mp3` | 1,5 s | `Huge serpent collapsing onto ice with a long fading hiss and cracking ice, mono.` |
| bark vitória | `bark-victory.mp3` | 1,0 s | `Serpent satisfied rattling hiss, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Serpent inhaling cold air with a menacing hiss, mono.` |
| golpe básico | `attack.mp3` | 0,4 s | `Serpent fangs snapping, quick bite with icy crunch, mono.` |
| esquiva | `dodge.mp3` | 0,3 s | `Scales slithering quickly on ice, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Hard icy scales deflecting a blade, mono.` |
| Cuspe Gélido | `skill-cuspe-gelido.mp3` | 0,7 s | `Serpent spitting freezing venom, wet hiss and ice crystallizing, mono.` |
| Bote | `skill-bote.mp3` | 0,6 s | `Lightning-fast serpent strike, whip whoosh and heavy bite, mono.` |
| Nevasca | `skill-nevasca.mp3` | 1,6 s | `Serpent breathing a blizzard: roaring icy wind and pelting ice, mono.` |
| inimigo: Cuspe de Gelo | `foe-cuspe.mp3` | 0,6 s | `Ice spit launched from afar, mono.` |
| inimigo: Rajada Gélida | `foe-rajada.mp3` | 1,0 s | `Three rapid ice spits in a row, mono.` |
| inimigo: Bote | `foe-bote.mp3` | 0,7 s | `Two fast serpent strikes, snapping jaws, mono.` |
| arena: Erupção | `arena-eruption.mp3` | 1,2 s | `Ice erupting from under a frozen lake, heavy crack and spray, mono.` |
| arena: Sopro | `arena-breath.mp3` | 1,5 s | `Long cone of freezing breath, roaring frost wind, mono.` |
| arena: Constrição | `arena-constrict.mp3` | 1,2 s | `Giant serpent coiling and squeezing, creaking scales, mono.` |
| arena: Estilhaço | `arena-shard.mp3` | 0,6 s | `Ice shards fired in a spread, mono.` |

#### `bellringer` — O Sineiro (sino gigante, fintas) — `src/assets/audio/sfx/bellringer/`
Voz: velho corcunda, risada rouca/cacarejo, não-verbal. Passivo **Ouvido de Sino** → `common/foresight-reveal`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Hunched old bell-ringer raspy grunt, mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Old man wheezing pained groan, mono.` |
| bark KO | `bark-ko.mp3` | 1,5 s | `Old bell-ringer collapsing, a cracked bell giving one last dull clang, mono.` |
| bark vitória | `bark-victory.mp3` | 1,0 s | `Creepy old man cackling laugh with a small bell jingle, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Old man whispering gibberish chant, mono.` |
| golpe básico | `attack.mp3` | 0,5 s | `Hand bell swung as a weapon, heavy bronze clong, mono.` |
| esquiva | `dodge.mp3` | 0,3 s | `Robe shuffle with a tiny bell tinkle, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Bronze bell blocking a blade, loud ringing clang, mono.` |
| Badalada | `skill-badalada.mp3` | 1,5 s | `Huge church bell toll with a shockwave rumble, mono.` |
| Toque Sereno | `skill-toque-sereno.mp3` | 1,0 s | `Soft gentle bell chime, calming and fading, mono.` |
| Dobre Final | `skill-dobre-final.mp3` | 2,0 s | `Final death knell: deep massive bell toll with a heavy hit and long stunned ring, mono.` |
| inimigo: Badalada | `foe-badalada.mp3` | 0,8 s | `Bell swung down onto a target, heavy clang, mono.` |
| inimigo: Dobre Falso | `foe-dobre.mp3` | 1,2 s | `Bell lifted as a fake-out with a held breath, then two real clangs, mono.` |
| inimigo: Sino Grande | `foe-sino-grande.mp3` | 1,5 s | `Giant bell raised with a creak, false pause, then a crushing bell slam, mono.` |
| arena: Onda do Sino | `arena-bellWave.mp3` | 1,5 s | `Expanding sonic ring from a giant bell, booming toll and rushing air, mono.` |
| arena: Sino | `arena-bell.mp3` | 0,8 s | `Bell dropped from above, bronze crash, mono.` |
| arena: Ressonância | `arena-resonance.mp3` | 1,5 s | `Ringing resonance building in pitch, vibrating metal, mono.` |
| arena: Rugido | `arena-roar.mp3` | 1,0 s | `Eerie howling shout echoing through a chapel, mono.` |

#### `ancientYeti` — Yeti Ancião (lento, esmaga) — `src/assets/audio/sfx/ancientYeti/`
Voz: fera gigante, rugidos graves. Passivo **Pelagem Grossa** → `common/armor-absorb`.
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,5 s | `Giant yeti short deep grunt, mono.` |
| bark dano | `bark-hurt.mp3` | 0,5 s | `Yeti angry pained snarl, mono.` |
| bark KO | `bark-ko.mp3` | 1,8 s | `Massive yeti collapsing into snow with a long fading groan and ground thud, mono.` |
| bark vitória | `bark-victory.mp3` | 1,2 s | `Yeti triumphant chest-pounding howl, mono.` |
| bark habilidade | `bark-skill.mp3` | 0,6 s | `Yeti deep huffing breath building rage, mono.` |
| golpe básico | `attack.mp3` | 0,5 s | `Huge furry fist punch, heavy thump, mono.` |
| esquiva | `dodge.mp3` | 0,3 s | `Huge body shifting in deep snow, mono.` |
| aparo | `parry.mp3` | 0,3 s | `Massive forearm block, thick fur thud, mono.` |
| Pancada | `skill-pancada.mp3` | 0,8 s | `Two giant fists slamming down together, crushing thud, mono.` |
| Rugido | `skill-rugido.mp3` | 1,5 s | `Ancient yeti thunderous roar echoing across mountains, mono.` |
| Avalanche | `skill-avalanche.mp3` | 2,0 s | `Fist pounding the ground triggering an avalanche, rumbling snow torrent, mono.` |
| inimigo: Tapão | `foe-tapa.mp3` | 0,5 s | `Giant open-palm slap, heavy smack, mono.` |
| inimigo: Socos de Avalanche | `foe-socos.mp3` | 1,4 s | `Four heavy irregular punches, mono.` |
| inimigo: Pancada no Chão | `foe-terremoto.mp3` | 2,0 s | `Slow heavy wind-up growl then ground-shaking slam with quake rumble, mono.` |
| inimigo: Avalanche (carregado) | `foe-avalanche.mp3` | 2,0 s | `Yeti charging a huge attack, rumble building into a massive snow avalanche impact, mono.` |
| arena: Bola de Neve | `arena-snowball.mp3` | 0,8 s | `Giant snowball hurled and exploding into powder, mono.` |
| arena: Salto | `arena-leap.mp3` | 1,2 s | `Yeti leaping high with a grunt and landing with a heavy ground quake, mono.` |
| arena: Avalanche | `arena-avalanche.mp3` | 2,0 s | `Avalanche of snow and ice rushing down, mono.` |
| arena: Rugido | `arena-roar.mp3` | 1,5 s | `Enraged yeti roar, mono.` |

### 3.5 Só inimigos da Torre do Iglu

#### `winterKing` — Rei do Inverno (campeão da Torre do Iglu e chefe final do Campo Nevado) — `src/assets/audio/sfx/winterKing/`
Voz: rei frio, grave, eco gélido; risada contida (não-verbal). No modo arena usa o BossSystem (mesmos eventos do Necromante).
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,5 s | `Cold regal king deep grunt with an icy echo, mono.` |
| bark dano | `bark-hurt.mp3` | 0,5 s | `Ice king angry pained growl with cracking ice, mono.` |
| bark KO | `bark-ko.mp3` | 2,0 s | `Ice king's crown shattering, a long fading echoing moan and collapsing ice, mono.` |
| bark vitória | `bark-victory.mp3` | 1,5 s | `Cold majestic low laugh echoing in a frozen hall, mono.` |
| bark entrada/taunt | `bark-skill.mp3` | 1,0 s | `Ice king menacing low hum with wind and frost, mono.` |
| inimigo: Raio do Cetro | `foe-raio.mp3` | 0,6 s | `Icy scepter beam fired, crystalline zap, mono.` |
| inimigo: Dança da Coroa | `foe-coroa.mp3` | 1,4 s | `Four regal strikes with a deceptive pause and icy swishes, mono.` |
| inimigo: Nevasca Real | `foe-nevasca.mp3` | 1,8 s | `Royal blizzard feint followed by a massive icy blow, mono.` |
| inimigo: Granizo | `foe-granizo.mp3` | 1,2 s | `Hail of snowballs pelting in a rhythm, mono.` |
| inimigo: Inverno Eterno (carregado) | `foe-inverno-eterno.mp3` | 2,0 s | `Eternal winter: deep freezing wind-up, then an enormous shattering ice explosion, mono.` |
| arena: raio | `arena-beam.mp3` | 1,5 s | `Sustained icy energy beam, crackling and humming, mono.` |
| arena: varredura | `arena-sweep.mp3` | 0,8 s | `Wide scepter sweep, heavy icy whoosh, mono.` |
| arena: investida | `arena-dash.mp3` | 0,7 s | `King dashing across ice, frosty rush, mono.` |
| arena: canalizar | `arena-channel.mp3` | 2,0 s | `Channeling dark frost magic, building ominous drone, mono.` |
| arena: escudo (contagem) | `arena-shield-countdown.mp3` | 0,5 s | `Ice shield countdown pulse, deep icy tick, mono.` |
| arena: escudo quebra | `arena-shield-break.mp3` | 1,0 s | `Thick ice shield shattering, mono.` |
| arena: fase 2 (Coroa Partida) | `arena-phase-two.mp3` | 2,0 s | `Ice king's crown cracking and a furious echoing roar, blizzard surging, mono.` |

#### `frostSkeleton` — Esqueleto Gélido — `src/assets/audio/sfx/frostSkeleton/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,3 s | `Skeleton jaw clacking with a raspy hiss, mono.` |
| bark dano | `bark-hurt.mp3` | 0,3 s | `Frozen bones cracking, mono.` |
| bark KO | `bark-ko.mp3` | 0,8 s | `Frozen skeleton collapsing into a pile of icy bones, mono.` |
| inimigo: Ossada | `foe-osso.mp3` | 0,4 s | `Bone club strike, dry crack, mono.` |
| inimigo: Chacoalhada | `foe-chacoalhar.mp3` | 0,7 s | `Rattling bones and two quick hits, mono.` |

#### `frostSpirit` — Espírito Gélido — `src/assets/audio/sfx/frostSpirit/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark ataque | `bark-attack.mp3` | 0,4 s | `Ghostly icy whisper, breathy and cold, mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Ghost shrieking briefly, mono.` |
| bark KO | `bark-ko.mp3` | 1,0 s | `Frost spirit dissipating into wind with a fading wail, mono.` |
| inimigo: Sopro Gelado | `foe-sopro.mp3` | 0,6 s | `Icy breath projectile, frosty whoosh, mono.` |
| inimigo: Toque Frio | `foe-toque.mp3` | 0,5 s | `Cold ghostly touch, freezing hiss, mono.` |

### 3.6 Guardiões e chefe do greenfield (modo arena)

#### `gravedigger` — O Coveiro (esqueleto, pá, lanterna verde) — `src/assets/audio/sfx/gravedigger/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark despertar | `bark-skill.mp3` | 1,2 s | `Skeletal gravedigger rising from a grave, raspy cackle and dirt falling, mono.` |
| bark ataque | `bark-attack.mp3` | 0,4 s | `Raspy skeletal grunt, mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Bones rattling with an angry hiss, mono.` |
| bark KO | `bark-ko.mp3` | 1,5 s | `Gravedigger collapsing into bones, shovel clanging, lantern glass breaking, mono.` |
| arena: Pazada | `arena-slam.mp3` | 0,8 s | `Heavy shovel slammed into the ground, dirt and clang, mono.` |
| arena: Enterrar | `arena-burrow.mp3` | 1,2 s | `Digging rapidly underground, dirt shoveling and rumble, mono.` |
| arena: Erguer mortos | `arena-raise.mp3` | 1,5 s | `Skeletons clawing out of graves, eerie green-magic hum, mono.` |

#### `templeGuardian` — Guardião do Templo (golem de pedra, runas ciano; voz = pedra, sem fala) — `src/assets/audio/sfx/templeGuardian/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark despertar | `bark-skill.mp3` | 1,5 s | `Stone golem awakening, grinding rock and a rising magical rune hum, mono.` |
| bark ataque | `bark-attack.mp3` | 0,5 s | `Deep stone grinding growl, mono.` |
| bark dano | `bark-hurt.mp3` | 0,4 s | `Rock cracking with a rune hum flicker, mono.` |
| bark KO | `bark-ko.mp3` | 2,0 s | `Stone guardian crumbling into rubble, mono.` |
| arena: Onda de choque | `arena-shockwave.mp3` | 1,2 s | `Stone fists pounding ground, expanding shockwave boom, mono.` |
| arena: Investida | `arena-charge.mp3` | 1,2 s | `Massive stone body charging, heavy rumbling footsteps, mono.` |
| arena: atordoado (bateu) | `arena-stunned.mp3` | 1,0 s | `Stone golem crashing into a wall and grinding to a halt, dazed hum, mono.` |

#### `lakeSpirit` — O Espírito do Lago (monstro de água) — `src/assets/audio/sfx/lakeSpirit/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark despertar | `bark-skill.mp3` | 1,5 s | `Water spirit rising from a lake, surging water and an ethereal female wail, mono.` |
| bark ataque | `bark-attack.mp3` | 0,4 s | `Ethereal watery hiss, mono.` |
| bark dano | `bark-hurt.mp3` | 0,5 s | `Watery splash with a pained ghostly cry, mono.` |
| bark KO | `bark-ko.mp3` | 2,0 s | `Water spirit collapsing into a huge splash and dissipating, mono.` |
| arena: Drenar | `arena-drain.mp3` | 2,0 s | `Lake draining, huge swirling suction of water, mono.` |
| arena: Redemoinho | `arena-whirlpool.mp3` | 1,5 s | `Whirlpool spinning, rushing water, mono.` |
| arena: Onda | `arena-wave.mp3` | 1,2 s | `Big water wave crashing, mono.` |
| arena: Gêiser | `arena-geyser.mp3` | 1,0 s | `Water geyser bursting up from the ground, mono.` |

#### `finalBoss` — O Necromante (lich coroado, fogo de alma verde) — `src/assets/audio/sfx/finalBoss/`
| evento | arquivo | dur | Prompt |
|---|---|---|---|
| bark chegada | `bark-skill.mp3` | 2,0 s | `Ancient lich's deep echoing evil laugh, mono.` |
| bark ataque | `bark-attack.mp3` | 0,5 s | `Lich raspy hiss with a ghostly echo, mono.` |
| bark dano | `bark-hurt.mp3` | 0,5 s | `Lich angry ghostly screech, mono.` |
| bark KO | `bark-ko.mp3` | 2,5 s | `Lich dissolving with a long echoing scream and soul-fire fading, mono.` |
| arena: fase 2 | `arena-phase-two.mp3` | 2,0 s | `Lich furious roar as green soul-fire flares violently, mono.` |
| arena: raio | `arena-beam.mp3` | 1,5 s | `Sustained necrotic green beam, crackling and humming, mono.` |
| arena: varredura | `arena-sweep.mp3` | 0,8 s | `Scythe-like sweep with ghostly whoosh, mono.` |
| arena: investida | `arena-dash.mp3` | 0,7 s | `Lich dashing, rushing ghostly wind, mono.` |
| arena: canalizar | `arena-channel.mp3` | 2,0 s | `Channeling necromantic magic, whispering voices building, mono.` |
| arena: escudo (contagem) | `arena-shield-countdown.mp3` | 0,5 s | `Necrotic shield countdown pulse, mono.` |
| arena: escudo quebra | `arena-shield-break.mp3` | 1,0 s | `Bone-and-soul shield shattering, mono.` |
| arena: onda de choque | `arena-shockwave.mp3` | 1,2 s | `Necrotic shockwave blast, deep boom with ghostly wail, mono.` |

---

## 4. Ordem de produção (prioridade)

- [ ] **P1 — Torre da Taverna (foco atual):** `common/*` de reação/coragem/intenção/projéteis/fluxo (≈70) →
  barks + `attack/dodge/parry` + `foe-*` de `brom`, `lyra`, `grimbo`, `zora`, `sergio` → música M4–M10, M14 e stings
  `sting-duel-start`, `sting-floor-cleared`, `sting-champion`, `sting-tower-victory`, `sting-tower-defeat`, `sting-cashout`.
- [ ] **P2 — Squad da taverna:** `barbarian`, `mage`, `reliquia`, `fabri` + `skill-*` do kit dos frequentadores.
- [ ] **P3 — Torre do Iglu:** `eskimo`, `frostKnight`, `iceSerpent`, `bellringer`, `ancientYeti`, `winterKing`,
  `frostSkeleton`, `frostSpirit` (barks, kit, `foe-*`) + M11–M13.
- [ ] **P4 — Árvores:** `skill-*` marcados "(árvore)".
- [ ] **P5 — Modo arena:** `arena-*` de guardiões/chefes/heróis + M1–M3.
- [ ] **P6 — Opcional:** substituições `_v2` da seção 2B.
- [ ] Para cada arquivo: `-raw.wav` + `.mp3` normalizado + `-generation-prompt.txt`; registrar loudness num
  `integration-loudness.json` na pasta (como em `music/snowfield/`).

### Como ligar (para o Claude Code depois; o Codex só gera os arquivos)
- **Música:** adicionar as faixas em `TRACK_URLS`/`STING_URLS` de `src/audio/GameAudio.ts` (uma `new URL(...)` literal
  por arquivo, por causa do Vite) e estender `musicFor()`: hoje snowfield toca `arena`, e as batalhas em turnos tocam
  `tavern` (o menu). Precisa de um sinal de "torre/andar/campeão/descanso" vindo da UI da torre
  (`src/render/tavern/TavernDuel.ts` / `TavernHub`).
- **SFX:** hoje `GameAudio.play()` só toca sons sintetizados (`soundbank.ts`). Precisa de um caminho de samples
  (mapa `SFX_URLS`, carregar com o mesmo `load()`, cair no sintetizado se falhar) e de um `bindBattle(battle)` que
  escute `TurnBattle.events` (`attackAnnounced` → `intent-*` + `foe-*`; `hitResolved` → `parry`/`dodge`/`feint-held`/
  `hit-taken` + `-perfect`; `strike` → `<id>/attack` + `bark-attack`; `skillUsed` → `<id>/skill-<skill.id>` +
  `bark-skill`; `counter`, `riposte`, `firmed`, `early`, `offBalance`, `charging`, `chargeBroken`, `poisoned`,
  `healed`, `looted`, `courageLost`, `fighterDown` → `bark-ko`, `battleEnded` → `bark-victory` + sting).
- Os ids das pastas batem com `RosterId`/`FoeId` (`src/config/tavernRoster.ts`) e `MiniBossKind`, então o lookup é
  direto: `sfx/${fighter.id}/${event}.mp3`.
