# Balance log

One entry per lever: date, goal, lever (file, old → new), before/after on the same seeds, decision.
Batches: `node tools/balance/run.mjs <label>` → `tools/balance/out/tavern-<label>.{json,md}` (200 seeds per duel cell,
100 per tower cell; same seeds every run).

## 2026-10-30 · Taverna em Turnos · B1: the dodge is the easy answer, the parry is the one that pays

**Goal:** the dodge stays the safer, easier answer, but only the parry (and a *perfect* dodge) earns Coragem, like
Clair Obscur. Decided by the owner: narrow the dodge window instead of making it a graze.

**Levers** (`src/config/tavernBattle.ts` → `REACTION_WINDOWS`):
- `dodgeMs` 180 → 130
- new `perfectDodgeMs` 60: a dodge inside it gives +1 Coragem (the plain dodge gives nothing). Tighter than the parry
  (90) because it carries no risk; assisted mode doubles it like the others.

**Before → after** (`baseline` → `b1-dodge130`, attackOnly, no kit):

| duel | bot | taken | early presses | hpLeft |
|---|---|---|---|---|
| brom | dodgeOnly (σ 60) | 0% → 3% | 0 → 0.2 | 100% → 100% |
| brom | newcomer (σ 110) | 21% → 29% | 1.1 → 2.2 | 78% → 66% |
| lyra | newcomer | 31% → 38% | 1.3 → 2.5 | 68% → 58% |
| grimbo | newcomer | 21% → 30% | 1.6 → 3.5 | 73% → 60% |
| zora | newcomer | 40% → 45% | 1.4 → 2.8 | 48% → 44% |
| sergio | newcomer | 19% → 27% | 1.2 → 2.5 | 80% → 71% |
| any | average (σ 70) | +1–5 pts | 0.1 → ~0.4 | −1 to −4 pts |

Win rates did not move (newcomer still 99–100% first try: M1 is still open, it's a HP/damage job). With kits, the
perfect dodge feeds Coragem into dodge kits (Lyra's Passo Leve skills/turn up, longer fights for skillGreedy).

**Reading:** a player with good timing who only dodges still wins clean (97% avoided): that is now by design, the
price is Coragem (only the ~68% of their dodges inside ±60 pay, and no counter-attack). The narrowing hurts the
sloppy newcomer more than the dodge spammer.

**Not measured:** how 130 ms feels by hand (input lag, the stage's hit frame); human playtest pending.

**Decision:** kept. The owner played it: "130ms é de boa".

## 2026-10-30 · Taverna em Turnos · M3: the wall on floor 7 of the Torre da Taverna

**Goal:** no floor but the champion ends more than 35% of the climbs; floor 7 (Lyra + Zora) ended 33–87% of solo climbs.

**Lever** (`src/config/tavernTowers.ts` → taverna floor 7 "Flecha e feitiço"): both foes `hpScale` 0.7 → 0.6.

**Before → after** (`b1-dodge130` → `m3-floor7`, sensible policy, 100 tower seeds; share of climbs that end on floor 7):

| squad | bot | floor 7 ends | reaches the top |
|---|---|---|---|
| mage | average | 34% → 29% | 34% → 38% |
| mage | newcomerAssisted | 39% → 28% | 55% → 67% |
| reliquia | average | 42% → 39% | 34% → 38% |
| fabri | newcomer | 59% → 46% | 27% → 34% |
| barbarian | newcomerAssisted | 24% → 11% | 73% → 85% |
| lyra | average | 57% → 44% | 11% → 16% |
| zora | average | 58% → 56% | 6% → 6% |
| mage+lyra | newcomer | 60% → 48% | 9% → 11% |

**Reading:** the wall is lower for the heroes in the middle of the pack. What still dies on floor 7 is mostly Lyra and
Zora as solo heroes, which is the roster gap (M5), not the floor. Skilled bots unchanged (100% top). Fichas/min of the
average bot +1–2 (economy, m3, still to be measured with human time).

**Decision:** kept. Revisit after M5.

## 2026-10-30 · Taverna em Turnos · M4a: a squad of three trivialised the towers (foe HP)

**Goal:** bringing friends helps, but three fighters must not carry a newcomer to the top (85–97% before; solo 0–35%).

**Lever** (`src/config/tavernTowers.ts` → `TOWER_TUNING.hpPerAlly`): 0.35 → 0.55.

**Before → after** (`m3-floor7` → `m4-hpally`, sensible policy, 100 tower seeds; reaches the top):

| tower | squad | newcomer | average | fichas/min (average) |
|---|---|---|---|---|
| taverna | barbarian+mage+zora | 90% → 70% | 100% → 100% | 33.8 → 28.2 |
| taverna | brom+sergio+grimbo | 97% → 93% | 100% → 100% | 32.7 → 27.2 |
| taverna | mage+lyra | 11% → 1% | 96% → 95% | 36.9 → 32.5 |
| snowfield | eskimo+frostKnight+iceSerpent | 85% → 69% | 100% → 100% | 22.4 → 18.2 |
| snowfield | barbarian+bellringer+ancientYeti | 14% → 0% | 100% → 95% | 28.0 → 22.5 |
| snowfield | mage+lyra | 0% → 0% | 61% → 39% | 25.5 → 18.6 |

**Reading:** the trio still carries the newcomer most of the time, so the hit damage (M4b) comes next. Fights are
longer (+0.5–1 min per climb), which also pulls fichas/min down (good for the economy rule). Two-fighter squads in
the Iglu took the biggest hit; watch them after M5. Solo climbs untouched.

**Decision:** kept.

## 2026-10-30 · Taverna em Turnos · M4b: a squad of three trivialised the towers (foe damage)

**Goal:** same as M4a: the trio helps a newcomer, it doesn't carry them.

**Lever** (`src/config/tavernTowers.ts` → `TOWER_TUNING.damagePerAlly`): 0.1 → 0.18.

**Before → after** (`m4-hpally` → `m4-dmgally`; reaches the top):

| tower | squad | newcomer | average |
|---|---|---|---|
| taverna | barbarian+mage+zora | 70% → 34% | 100% → 100% |
| taverna | brom+sergio+grimbo | 93% → 80% | 100% → 100% |
| taverna | mage+lyra | 1% → 0% | 95% → 90% |
| snowfield | eskimo+frostKnight+iceSerpent | 69% → 48% | 100% → 100% |
| snowfield | barbarian+bellringer+ancientYeti | 0% → 0% | 95% → 85% |
| snowfield | mage+lyra | 0% → 0% | 39% → 28% (69% end on the champion) |

**Reading:** with M4a + M4b the trio takes a newcomer to the top 34–80% of the time (was 85–97%), an average player
still 85–100%, the assisted newcomer 93–100%. Bringing friends is still the easy road, not a free one. The combined
effect on the newcomer is bigger than either lever alone; the average player barely notices.

**Decision:** kept.

## 2026-10-30 · Taverna em Turnos · m1: Sergio's volleys were too tight to read

**Goal (fairness):** two hits of one combo never land closer than 180 ms (2× the parry window), so every hit can be
answered on its own.

**Lever** (`src/config/tavernBattle.ts` → Sergio's patterns, hit `offsetMs`):
- Chuva de Pratos: 0/300/450/900 → 0/300/500/900 (tightest gap 150 → 200)
- Garrafas de Rolha: 0/170/340 → 0/190/380 (170 → 190)

**Before → after** (`m4-dmgally` → `m1-sergio-gaps`): the static table has no `GAP<180` flag left. The Sergio duel
barely moves (newcomer hits taken 27% → 28%, average 14% → 15%): the bots press on their own timing noise, so they
can't feel a cramped rhythm; a human can.

**Decision:** kept (fairness, not strength).

## 2026-10-30 · Taverna em Turnos · M1a: the duels were over before they got tense

**Goal:** a first duel should be a fight you feel (2–5 min with thinking time, first win in 1–3 tries). The newcomer
bot won 99–100% first try in ~25 s of combat.

**Lever** (`src/config/tavernBattle.ts` → `DUEL_HERO.attack`): 12 → 10. Duels only (the towers use the roster's
stats; tower table identical). Tests that check skill math now pin a 12-attack hero of their own.

**Before → after** (`m1-sergio-gaps` → `m1-heroatk10`, attackOnly, no kit, 200 seeds):

| duel | newcomer win | newcomer t50 (s) | newcomer hpLeft | comebacks (<25% HP) | average hpLeft |
|---|---|---|---|---|---|
| brom | 100% → 100% | 26 → 31 | 66% → 60% | 1% → 5% | 88% → 82% |
| lyra | 100% → 100% | 25 → 29 | 58% → 53% | 4% → 9% | 91% → 89% |
| grimbo | 99% → 99% | 29 → 32 | 60% → 56% | 6% → 9% | 85% → 83% |
| zora | 99% → 93% | 27 → 32 | 44% → 36% | 16% → 29% | 69% → 64% |
| sergio | 100% → 99% | 25 → 29 | 70% → 62% | 1% → 3% | 86% → 85% |

**Reading:** +15–20% longer fights and twice the close calls, but the newcomer bot still wins almost always. To make
it lose often, the regulars' hits would need roughly +40–50%, and those same numbers drive every tower floor. Not
done on bots alone: the newcomer bot (σ 110 ms, knows the keys) is likely better than a real first-timer. Next step
is a human first try on Lyra/Grimbo/Zora/Sergio before touching enemy damage.

**Decision:** kept. M1b (enemy damage) waits for a human first-try playtest.

## 2026-10-30 · Taverna em Turnos · M2: do the house rules teach? (measured, no lever)

**Goal:** biting Zora's feints and parrying Lyra's arrows must cost enough to be noticed.

**Measurement:** the baseline only compared win rates (97% vs 100%), which looked like "the mistake costs nothing".
The lesson table now also shows the HP left on the wins (p50), batch `m2-before` (after M1a):

| lesson | bot | win a / b | HP left a / b |
|---|---|---|---|
| Zora: bite every feint / hold | average | 92% / 100% | 31% / 86% |
| Zora: bite every feint / hold | skilled | 100% / 100% | 44% / 100% |
| Lyra: parry arrows / dodge them | average | 95% / 100% | 52% / 89% |
| Lyra: parry arrows / dodge them | skilled | 98% / 100% | 66% / 100% |

**Reading:** the wrong answer costs 35–55 points of HP: the player ends the duel hanging by a thread and feels it. On
its own it rarely loses the duel, because the duels are still short of the newcomer target (M1). Raising feint damage
now would only make the rule a coin flip for a newcomer who hasn't read it yet.

**Decision:** no lever. Re-check after M1b.

## 2026-10-30 · Taverna em Turnos · M5a: Zora as a fighter was too weak to climb

**Goal:** every fighter wins somewhere; solo, an average player with any taverna regular reaches the top of the Torre
da Taverna roughly as often as the middle of the pack (Mago, Relíquia, Grimbo: 36–38%).

**Lever** (`src/config/tavernRoster.ts` → `ROSTER.zora.stats`): attack 10 → 12 on the player's side only (her duel
as a foe keeps 10).

**Before → after** (`m2-before` → `m5-zora12`, Torre da Taverna, solo; reaches the top):

| bot | top | floor 7 ends | fichas/min |
|---|---|---|---|
| newcomerAssisted | 9% → 30% | 86% → 59% | 11.0 → 17.9 |
| average | 5% → 18% | 56% → 45% | 10.5 → 15.7 |
| skilled | 100% → 100% | – | 32.1 → 37.7 |

**Reading:** better, still the weakest of the taverna. Her kit (shield, curse, foresight) pays off with Coragem she
rarely has solo. Next step, if needed, is her kit, not more attack.

**Decision:** kept.

## 2026-10-30 · Taverna em Turnos · M5b: Lyra as a fighter was too weak to climb

**Goal:** same as M5a.

**Lever** (`src/config/tavernRoster.ts` → `ROSTER.lyra.stats`): attack 9 → 11 on the player's side only.

**Before → after** (`m5-zora12` → `m5-lyra11`; reaches the top):

| tower | squad | bot | top |
|---|---|---|---|
| taverna | lyra | newcomerAssisted | 42% → 53% |
| taverna | lyra | average | 16% → 34% (floor 7 ends 44% → 32%) |
| taverna | mage+lyra | average | 90% → 96% |
| snowfield | mage+lyra | average | 28% → 46% |

**Reading:** Lyra now sits in the middle of the pack (Mago/Relíquia/Grimbo 36–38%).

**Decision:** kept.

## 2026-10-30 · Taverna em Turnos · m2: leaving the tower was never the right call for a good player

**Goal:** in the middle floors, "take the pot and go" vs "climb on" is a real choice: climbing should only pay when
the player is likely to make it.

**Lever** (`src/config/tavernTowers.ts` → `TOWER_TUNING.keepOnLoss`): 0.5 → 0.35. The Coliseu hint in the hub now
reads the share from config ("se cair, leva 35% do pote").

**Before → after** (`m5-lyra11` → `m2-keep35`, Torre da Taverna, solo; expected fichas per climb):

| hero | bot | always climb | leave after 3 | leave after 6 |
|---|---|---|---|---|
| mage | average | 70.6 → 64.1 | 24 | 50 |
| reliquia | average | 67.6 → 62.0 | 24 | 49.7 |
| grimbo | average | 68.4 → 61.8 | 24 | 50.2 |
| lyra | average | 65.9 → 59.3 | 24 | 49.8 |
| zora | average | 48.0 → 40.4 | 24 | 48.7 |
| barbarian | average | 111.1 → 108.7 | 24 | 51 |
| any | newcomer | 13–19 → 9–13 | 17–23 | 10–23 |
| any | skilled | 131 | 24 | 51 |

**Reading:** for the middle of the pack, climbing on now pays only ~25% more than leaving after floor 6 (was ~40%),
for the weakest hero leaving is the better bet, and for a newcomer leaving early is clearly right. A skilled player
still climbs (and should). Fichas/min of the average bot −1–3 (economy, m3).

**Decision:** kept.

## 2026-10-31 · Towers: the skilled bot at ~70% (owner target) · measurement + two tries, no game change

**Goal (owner, 2026-10-30):** the best bot (`skilled`) reaches the top of a tower ~70% of the time (today 100%).

**Measurement change** (`tools/balance/tavernBots.ts` → `TEMPO_PRESSURE`, kept): the bots timed a 150 ms flurry as
well as a lone swing, so a faster rhythm was invisible to the batches. Now a hit that follows the previous one closer
than 400 ms is timed with a wider spread (× 1.5 at a 200 ms gap, up to × 2 at 0 ms). An assumption, not a
measurement: calibrate it with a human playtest. Game unchanged; new baseline `tempo-model`.

| tower · solo | average, before → after the model | skilled |
|---|---|---|
| taverna, middle of the roster | 34–38% → 18–27% | 100% |
| taverna, zora | 18% → 7% | 100% |
| taverna, fabri / brom | 98 / 97% → 93 / 93% | 100% |
| snowfield, eskimo | 98% → 94% | 100% |

**Try 1 (reverted):** the upper floors fight faster: from floor 6 up, the gaps between hits shrink 10% per floor
(never below 150 ms). `t1-tempo10`: skilled 99–100% in the tavern, 86–100% in the igloo; average 5–15 points lower
(lyra 18 → 11%, barbarian 61 → 46%).

**Try 2 (reverted):** the same at 25% per floor (the top floors all at 150 ms). `x-tempo25`: skilled still 99–100% in
the tavern (73–100% in the igloo); average lyra 7%, zora 2%, the igloo 0% for most.

**Reading:** the skilled bot misses 2–7% of hits, the average bot 15–29%; their climbs don't overlap. Speed hurts the
skilled bot relatively more (its misses × 4 vs × 2), but the tavern's damage comes mostly from lone swings, which
speed doesn't touch. Any lever that brings skilled to ~70% leaves average near 0% except Fabri/Brom (see also
`x-dmg12`). Either the towers become a mastery-only mountain, or the `skilled` bot (sigma 40 ms, parries 90%) is
sharper than a real good player and the target should be read against a human-calibrated profile.

**Decision:** the tempo model is kept (measurement); both game levers reverted, pending the owner's call. The lever's
patch: `tmp/claude-b1/tempo-lever.patch` (not committed).

## 2026-10-31 · Towers: the target moves to the `average` bot (owner)

**Owner:** "the skilled bot clearing everything is expected; move the rule to the average bot." New contract
(`venivium-balance` §2): the `average` bot, solo, reaches the top **~70%** with each hero; `skilled` ~100% is fine.
The skilled-70% tries above are dropped.

**Gap today** (`tempo-model`, average bot, solo, top %):

| tower | above 70 | near (55–85) | below |
|---|---|---|---|
| taverna | fabri 93, brom 93 | sergio 82, barbarian 61 | mage 27, reliquia 27, grimbo 24, lyra 18, zora 7 |
| snowfield | eskimo 94 | — | ancientYeti 19, barbarian 2, mage 1, iceSerpent 1, frostKnight 0, bellringer 0 |

Most climbs of the weak heroes end on taverna floor 7 (Lyra + Zora duo, 34–57% of climbs) and on snowfield floors
6–10. So the work is mostly lifting the middle of the roster and softening the floor-7 cliff, with a small trim on
fabri / brom / eskimo; it is no longer about making the top harder.

## 2026-10-31 · Tavern: lifting the weak heroes (average bot, solo)

**Goal:** each hero's `average` bot reaches the taverna top ~70% solo. Order set by the balance advisor (sub agent).
Same seeds; one lever per commit; each batch compared with the one before it.

| commit | lever | batch | average solo, top % | floor 7 share of falls |
|---|---|---|---|---|
| `8800f89` | `tavernRoster.ts` zora `maxHp` 105 → 120 (player side) | `z-hp120` vs `advisor-base` | zora 7 → 17 | zora 57 → 38% |
| `097639b` | `tavernTowers.ts` floor "Flecha e feitiço" lyra/zora `hpScale` 0.6 → 0.5 | `f7-hp50` vs `z-hp120` | lyra 18→25, zora 17→23, reliquia 27→33, mage 27→31, barbarian 61→66, sergio 82→87, grimbo 24, fabri/brom ~93 | weak 34–42 → 27–34% |
| `ef6f7f9` | `tavernRoster.ts` lyra `maxHp` 100 → 115 (player side) | `l-hp115` vs `f7-hp50` | lyra 25 → 43 (worst floor moves to 10) | lyra 27% |

Skilled stays 100% everywhere. Side effect: `newcomerAssisted` rises (weak heroes 43–55 → 50–85%), which feeds the
open M1b question (the newcomer wins too early); only a playtest settles it.

**Decision:** all three kept. **Now (average, solo):** fabri 94, brom 92, sergio 87, barbarian 66, lyra 43,
reliquia 33, mage 31, zora 23, grimbo 24. Next: grimbo, zora, mage, reliquia one number at a time; then trim
fabri/brom; then the snowfield.

## 2026-10-31 · Tavern + igloo: the rest of the roster to ~70% (average bot, solo)

**Owner:** "do it for all the rest, no approval needed." Same seeds (200 / tower 100), one lever per commit, each batch
compared with the one before it (`tmp/claude-b1/cmp-<label>.txt`). All stats are the **player's side**
(`tavernRoster.ts`); the regulars as foes are untouched.

**Taverna** (from `l-hp115`):

| commit | lever | top %, average solo |
|---|---|---|
| `b8b42aa` | grimbo `maxHp` 110 → 125 | grimbo 24 → 44 |
| `1b65586` | mage `maxHp` 90 → 105 | mage 31 → 53 |
| `1a8331e` | reliquia `maxHp` 100 → 115 | reliquia 33 → 55 |
| `bfb295e` | zora `maxHp` 120 → 135 | zora 23 → 34 (worst floor moves to 10) |
| `3ee91be` | zora `attack` 12 → 14 | zora 34 → 53 |
| `cb89a2b` | grimbo `attack` 10 → 12 | grimbo 44 → 61 |
| `49ba1fb` | lyra `attack` 11 → 13 | lyra 43 → 64 |
| `5980c3b` | mage `attack` 13 → 15 | mage 53 → 67 |
| `3ff10fe` | reliquia `attack` 11 → 13 | reliquia 55 → 73 |
| `9ab8110` | zora `maxHp` 135 → 150 | zora 53 → 73 |
| `c182b5e` | grimbo `maxHp` 125 → 135 | grimbo 61 → 74 |
| `0258d40` | lyra `maxHp` 115 → 125 | lyra 64 → 75 |
| `31362a7` | barbarian `maxHp` 115 → 125 | barbarian 66 → 79 |
| `4553a16` | mage `maxHp` 105 → 112 | mage 67 → 75 |
| — | fabri `maxHp` 95 → 85 / brom 120 → 108 | 94 → 91 / 92 → 90: too weak a lever, **reverted** (their edge is the kit: heal, dodge, counter) |

**Igloo** (from `m-hp112`):

| commit | lever | top %, average solo |
|---|---|---|
| `7bdf395` `11255c3` `7e50a5b` | frostKnight 120 → 150, iceSerpent 95 → 120, bellringer 105 → 130 `maxHp` | +0–2 each on their own (they matter later, see the advisor's check) |
| `b308ebb` → `50c69af` | ancientYeti `maxHp` 135 → 165, later back to 135 | 19 → 47; after the campfire it overshot (96), back to 135 → 76 |
| `cf345dc` | `tavernTowers.ts` Winter King `hpScale` 1.2 → 1.0 | +2–7 |
| `0ee4e81` | Winter King `damageScale` 1.1 → 0.95 | eskimo 94 → 98, yeti 54 → 67, rest +1–4 |
| `053605a` | iceSerpent `attack` 12 → 15 | 7 → 34 |
| `a2d4a99` | frostKnight `attack` 12 → 15 | 2 → 24 |
| `61769fe` | bellringer `attack` 10 → 13 | 0 → 2 |
| `ced8a97` | **new "Fogueira" rest between "Guardiões juntos" and the King** (igloo now 12 floors) | knight 24→56, serpent 34→66, bellringer 2→35, yeti 67→96, mage 18→53, barbarian 9→44 |
| `73b8af7` | "Guardiões juntos" `hpScale` 0.7 → 0.55 | knight 56→74, bellringer 35→41, mage 53→58, barbarian 44→53 |
| `692da06` | bellringer `attack` 13 → 16 | 41 → 67 |
| — | eskimo soup `healAll` 12 → 9 | 98 → 98: no effect, **reverted** |

The advisor (sub agent) found the igloo cliff was **attrition, not the King**: at full HP the average bot beats the
King 83–99% with every hero, but it arrived with 24–62% HP after the guardians floor (no rest between them). Hence the
campfire. It also checked that the three small HP raises now carry weight (reverting them drops knight/serpent/
bellringer to ~30%), and that the bot seems never to use the Bellringer's Badalada (worth a look in `tavernBots.ts`).

**Now (average, solo, top %):** taverna barbarian 79, mage 75, reliquia 73, fabri 94, brom 92, lyra 75, grimbo 74,
zora 73, sergio 87 · igloo eskimo 98, frostKnight 74, iceSerpent 68, bellringer 67, ancientYeti 76; tavern heroes in
the igloo mage 58, barbarian 53. `skilled` 100% everywhere. tsc ok, 612 tests pass.

**Not solved / risks:** fabri, brom and eskimo sit 14–21 points above the rest (out of the ±10 band); HP trims don't
move them, it would take a kit number. `newcomerAssisted` and the squads got much easier (taverna weak heroes 81–97%,
newcomer squads 50–92%, igloo squads 100%), which leans on M1b (the newcomer wins too early). Simulation only: the
campfire and the stronger player stats need a human playtest, and the new igloo floor was not looked at in the game.
