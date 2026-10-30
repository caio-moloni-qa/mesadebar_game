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
