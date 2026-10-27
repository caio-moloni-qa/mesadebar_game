---
name: venivium-guardian
description: "Add or change a zone guardian (mini-boss) in Venivium: its stats, behaviour and attacks in MiniBossSystem, the arena it belongs to, its 3D model, animations, telegraphs and effects, marker, music, bestiary, sandbox button and tests. Use whenever a new mini-boss is asked for or an existing one changes."
---

# Add or change a zone guardian

Guardians live in `src/core/systems/MiniBossSystem.ts` (the simulation) and are drawn by
`src/render/views/ZoneActorViews.ts` + `src/render/vfx/MiniBossEffects.ts`. The Cavaleiro Congelado (`frostKnight`)
is the most recent complete example: follow its trail through the files below.

## Checklist (a new guardian touches all of these)

**Core**
1. `src/config/balance.ts` → `MINI_BOSS_VARIANTS.<id>`: `maxHealth`, `movementSpeed`, `contactDamage`, `reward: 0`.
   The id becomes a `MiniBossKind` automatically.
2. `src/core/session/entities.ts` → its collision `radius` (in `activate`) and `ENEMY_DISPLAY_SIZES.<id>`.
3. `MiniBossSystem.ts`:
   - `MINI_BOSSES.<id>`: `name` (pt-BR, shown in the intro and health bar), `where` ("na fortaleza"), `zone`,
     `anchor` as a **function of the layout** (`anchor: ({ temple }) => temple.center` — always the map's own layout,
     never the module-level active one), `leashRadius`, `companion`. Make sure the anchor is open ground it can walk
     out of (the Cavaleiro first spawned inside the keep's sanctum and got stuck).
   - tuning fields in `MINI_BOSS_TUNING`, new attack names in `MiniBossAttackType`, new cooldown keys in
     `MiniBossState.cooldowns` (and their start values in `spawn`).
   - `think<Name>` (choose an attack or walk) and `update<Name>Attack` (telegraph → active → recover), dispatched in
     `update()`. Reuse the helpers: `walkTowards`, `turnTowards`, `start`, `next`, `impact`, `updateCharge`.
   - anything it leaves on the field (pillars, geysers) as a public array, cleared in `forget()`.
   - damage rules in `damageTakenMultiplier` (fronts, phases).
4. The arena: add the id to `guardians` in that arena's layout (`src/config/arenaLayout.ts`); `guardianRotation(layout)`
   calls them in that order. The area card's progress counts them too.
5. If it needs something new from the session (slow the player, push them), add it to `MiniBossHost` and implement
   it in `GameSession`'s constructor.

**Render**
6. Model: a `create<Name>Model()` in `src/render/models/zoneActors.ts` (procedural parts on `humanoidBones`, or an
   imported GLB via `imported(...)` once there is art — see **venivium-art-pipeline**). Pick it in `MiniBossView`'s
   constructor.
7. Animations per attack in `MiniBossView.update` (`slamWindup`/`slamHit`, `chargeWindup`/`charge`, `raise`,
   `stagger`...), and a tint for special states.
8. Telegraphs and effects in `MiniBossEffects.updateBoss` (danger circles via `pieces.circle`, lanes, instanced
   meshes for persistent things); impact visuals in `Game3D`'s `miniboss-impact` handler.
9. `src/render/ui/icons.ts`: a `MarkerKind` + marker face (a head cut from concept art when it exists, an SVG until
   then).
10. `src/render/models/enemies.ts` and `src/render/views/EnemyHordeView.ts`: map the id (mini-bosses reuse
    `superSkeleton` there; they're drawn by their own view).
11. `src/audio/GameAudio.ts` → `GUARDIAN_TRACK.<id>` (borrow an existing theme until it has its own).
12. Bestiary (`BESTIARY` in `src/render/ui/TavernHub.ts`) and a sandbox button (`src/render/ui/SandboxPanel.ts`).

**Tests** — a `<Name>.test.ts` in `src/core/systems/` (see `FrostKnight.test.ts`): it rises where it should and walks
out, each attack does what it says (damage, slow, walls), phase changes, things it leaves behind disappear. If it
belongs to a non-default arena, build that arena (`ArenaMap.generate(seed, SNOWFIELD)`) and also
`useArenaLayout(...)` in `beforeAll` (the renderer-side painters still read the active layout); restore `GREENFIELD`
in `afterAll`.

Then **venivium-verify**: call it from the sandbox or with a `--drive` snippet, force each attack by setting its cooldown,
and screenshot it close up (`zoom=2`).
