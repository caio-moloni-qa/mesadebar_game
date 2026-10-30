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
