# Venivium — music prompts

One track per moment of the game, written for an AI music generator (Suno, Udio or similar). Each entry has a short
**style** line (paste it in the style/genre field) and a **description** (paste it in the song description, or merge
both if the tool has a single prompt box). All tracks are **instrumental**.

Today the game plays a single loop for everything (`src/assets/audio/the-last-watch.wav`). With these, Claude Code
will switch music by situation: tavern, arena, the arena heating up, each guardian, the Necromancer and its second
phase, plus short stings.

## Rules for every track

- **Instrumental only.** Add "no vocals, no lyrics, no spoken words" (wordless choir is allowed only where a track
  says so).
- **Loops must loop.** For the looping tracks, ask for a steady arrangement with no intro build-up, no fade-in, no
  fade-out and no big ending: the last bar should lead back into the first. Generate 2–3 minutes and keep the most
  even stretch.
- **Same world, same palette.** Medieval dark fantasy, played on real instruments (lute, hurdy-gurdy, fiddle, frame
  drums, low brass, cello, choir). No synth leads, no EDM drops, no modern drum kits.
- **Save the download untouched** as `<name>-raw.mp3` (or `.wav`) next to the final file. Claude Code trims the loop
  point and evens out the loudness (about −14 LUFS) when wiring it in, so you don't have to.
- **Everything lands in `src/assets/audio/music/`.**

| Track | When it plays | Loop | Length to keep | File |
|---|---|---|---|---|
| Tavern | Between runs, and inside the tavern portal during a run | yes | 2:00–3:00 | `src/assets/audio/music/tavern.mp3` |
| Arena | A run's first minutes | yes | 2:00–3:00 | `src/assets/audio/music/arena.mp3` |
| Arena, heating up | Later in a run, from the third difficulty stage | yes | 2:00–3:00 | `src/assets/audio/music/arena-intense.mp3` |
| O Coveiro | Graveyard guardian fight | yes | 1:30–2:30 | `src/assets/audio/music/guardian-gravedigger.mp3` |
| Guardião do Templo | Ruins guardian fight | yes | 1:30–2:30 | `src/assets/audio/music/guardian-temple.mp3` |
| O Espírito do Lago | Lake guardian fight | yes | 1:30–2:30 | `src/assets/audio/music/guardian-lake.mp3` |
| Necromancer | Final boss, phase 1 | yes | 2:00–3:00 | `src/assets/audio/music/boss-necromancer.mp3` |
| Necromancer, enraged | Final boss, phase 2 | yes | 1:30–2:30 | `src/assets/audio/music/boss-necromancer-enraged.mp3` |
| Guardian warning | A guardian is announced | no (sting) | 3–5 s | `src/assets/audio/music/sting-guardian.mp3` |
| Boss warning | "Uma presença maligna…" before the Necromancer | no (sting) | 5–8 s | `src/assets/audio/music/sting-boss.mp3` |
| Victory | A run won | no (sting) | 6–10 s | `src/assets/audio/music/sting-victory.mp3` |
| Defeat | A run lost | no (sting) | 5–8 s | `src/assets/audio/music/sting-defeat.mp3` |

---

## 1. Tavern — `tavern.mp3`

**Style:**
```
medieval tavern folk, warm, cozy, lute, hurdy-gurdy, fiddle, frame drum, tambourine, instrumental, 104 bpm, D dorian
```

**Description:**
```
A warm, lively medieval fantasy tavern at night: crackling-hearth coziness, mugs on wooden tables, a travelling
merchant's welcome. Lead melody on lute and fiddle trading phrases, hurdy-gurdy drone underneath, light frame drum and
tambourine keeping a gentle dance pulse, a little recorder counter-melody. Cheerful but with a hint of mystery (the
tavern sits in a pocket realm outside the haunted arena). Steady and even from the first bar, no intro, no fade, no
ending — it must loop seamlessly. Instrumental, no vocals, no lyrics.
```

## 2. Arena — `arena.mp3`

**Style:**
```
dark fantasy battle folk, driving, tense, cello ostinato, frame drums, hurdy-gurdy, low brass, instrumental, 128 bpm, E minor
```

**Description:**
```
Survival in a haunted arena at night as skeletons close in: a driving cello and viola ostinato, pounding frame drums
and taiko-like low hits, a gritty hurdy-gurdy melody, low brass swells every few bars. Tense and propulsive but not
yet at full force — room to grow. Constant energy from the first bar to the last, no intro build, no fade, no big
ending, so it loops seamlessly. Medieval instruments only, no synths, no modern drum kit. Instrumental, no vocals.
```

## 3. Arena, heating up — `arena-intense.mp3`

**Style:**
```
epic dark fantasy battle, relentless, heavy frame drums, cello and bass ostinato, war horns, hurdy-gurdy, wordless male choir, instrumental, 140 bpm, E minor
```

**Description:**
```
The same haunted arena much later in the night: the horde is overwhelming. Same key and character as a driving
cello-and-drums battle theme, pushed harder: double-time frame drums, a relentless low string ostinato, war horn
calls, a wordless low male choir chanting short syllables (no words), hurdy-gurdy screaming the melody. Constant high
intensity from the first bar, no breakdown, no intro, no ending — seamless loop. Instrumental, no lyrics.
```

## 4. O Coveiro (graveyard guardian) — `guardian-gravedigger.mp3`

**Style:**
```
macabre graveyard waltz, dark fantasy, pipe organ, out-of-tune music box, low strings, church bells, rattling percussion, instrumental, 3/4, 96 bpm, C minor
```

**Description:**
```
A skeletal gravedigger rises from the cemetery with a shovel and a green lantern. A sinister, slightly mocking 3/4
waltz: wheezing pipe organ, a warped music-box melody, plucked and bowed low strings, distant tolling church bells,
bone-like wooden rattles and a shovel-scrape percussion texture. Creepy and danceable at once, steady energy, no
intro, no fade, seamless loop. Instrumental, no vocals.
```

## 5. Guardião do Templo (ruins guardian) — `guardian-temple.mp3`

**Style:**
```
ancient temple war, epic, heavy war drums, stone percussion, low brass, didgeridoo-like drone, ritual chant feel, instrumental, 110 bpm, D phrygian
```

**Description:**
```
A carved stone guardian awakens among temple ruins, cyan runes glowing. Massive and slow-footed but crushing: heavy
ceremonial war drums, deep stone-on-stone percussion hits, low brass and tuba in unison, an ancient droning bass, a
stern horn melody in a Phrygian mode, occasional metallic gong strikes. Weighty and inexorable, steady from the first
bar, no intro, no fade, seamless loop. Instrumental, no vocals.
```

## 6. O Espírito do Lago (lake guardian) — `guardian-lake.mp3`

**Style:**
```
ethereal water fantasy turning stormy, harp arpeggios, female wordless choir, glass harmonica, tremolo strings, timpani rolls, instrumental, 120 bpm, F# minor
```

**Description:**
```
A water spirit drains the lake and rises as a towering monster of light-blue water. Flowing harp arpeggios and
glassy bell tones like water droplets, a haunting wordless female choir (no words), shimmering tremolo strings, then
rolling timpani and surging low strings like crashing waves — beautiful and dangerous at once. Keep the energy even
throughout (no quiet intro, no fade, no ending) so it loops seamlessly. Instrumental, no lyrics.
```

## 7. Necromancer, phase 1 — `boss-necromancer.mp3`

**Style:**
```
epic dark fantasy boss battle, orchestral, gothic, full orchestra, pipe organ, latin-style wordless choir, war drums, low brass, instrumental, 132 bpm, D minor
```

**Description:**
```
The final boss: an ancient crowned lich in tattered runed robes, green soul-fire in his ribcage, summoning the dead.
A grand gothic boss theme: thundering war drums, a dark pipe organ, a wordless choir chanting menacing syllables (no
real words), heavy low brass statements of a sinister main motif, racing string ostinatos, cymbal swells. Majestic and
evil, steady high energy from the first bar, no intro, no fade, no ending — seamless loop. Instrumental.
```

## 8. Necromancer, enraged — `boss-necromancer-enraged.mp3`

**Style:**
```
desperate final boss phase, frantic orchestral, gothic, pounding drums, screaming strings, full choir, pipe organ, dissonant brass, instrumental, 150 bpm, D minor
```

**Description:**
```
The lich's second phase: he roars, his fire turns violent, the arena is crumbling. Same main motif as the first
phase, now faster and more desperate: pounding double-time drums, frantic high string runs, the full wordless choir
at fortissimo (no real words), dissonant brass stabs, the organ at full power. Relentless from the first bar, no
breakdown, no fade, seamless loop. Instrumental.
```

## 9. Guardian warning — `sting-guardian.mp3`

**Style:**
```
short ominous fantasy sting, low horn call, single drum hit, rising string swell, 4 seconds
```

**Description:**
```
A 3–5 second warning that a zone guardian is waking up: a distant low horn call, a single deep drum hit, a short
rising string swell that ends on a held suspended chord. No melody development, no loop. Instrumental.
```

## 10. Boss warning — `sting-boss.mp3`

**Style:**
```
ominous dark fantasy sting, deep choir swell, tolling bell, low brass, timpani roll, 6 seconds
```

**Description:**
```
A 5–8 second dread sting as "a malign presence fills the air": a tolling bell, a low wordless choir swelling from
nothing, a timpani roll and a final deep brass chord that leaves the air tense. No melody, no loop. Instrumental.
```

## 11. Victory — `sting-victory.mp3`

**Style:**
```
triumphant medieval fanfare, brass, timpani, lute flourish, bright, 8 seconds
```

**Description:**
```
A 6–10 second triumphant fanfare after surviving the night: bright brass fanfare, a timpani roll, a lute and fiddle
flourish answering, ending on a warm major chord that rings out. Instrumental.
```

## 12. Defeat — `sting-defeat.mp3`

**Style:**
```
somber dark fantasy sting, solo cello, low choir, fading bell, 6 seconds
```

**Description:**
```
A 5–8 second defeat sting as the night wins: a mournful solo cello phrase, a low wordless choir sighing underneath, a
last distant bell fading out into silence. Instrumental.
```
