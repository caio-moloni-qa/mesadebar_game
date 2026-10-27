---
name: mesa-architecture
description: "How the Mesa de Bar 3D game is built and where things go: the engine-free simulation in src/core, the Three.js renderer in src/render, config, events, the Host pattern, tests. Use before any gameplay, UI or rendering change in this repo, or when you need to find where something lives."
---

# Mesa de Bar: architecture

A survivors-like in Three.js (`play3d.html`, entry `src/main3d.ts`). TypeScript, Vite, Vitest. The game logic is a
deterministic simulation with no rendering in it; the renderer only reads it and reacts to its events.

## The layers

| Folder | What lives there | Rules |
|---|---|---|
| `src/config/` | Data: `balance.ts` (enemies, mini-boss stats), `characters.ts`, `weapons.ts`, `arenaLayout.ts` (arenas), `areas.ts`, `powerTiers.ts`, `world.ts` | Plain data and types. Tuning numbers go here or in a system's `*_TUNING` block, never inline |
| `src/core/` | The simulation: `session/GameSession.ts` (the run), `session/entities.ts` (player, enemies, projectiles, pickups), `systems/*` (weapons, bosses, mini-bosses, companions, merchant, quests, powers, spawns), `world/ArenaMap.ts` (obstacles, walkability), `progress/` (save, Fichas, mastery) | **Enforced by `src/core/architecture.test.ts`:** no `three` imports, no `Math.random` (use the injected `Rng`), imports only from `src/core` and `src/config` |
| `src/render/` | `Game3D.ts` (wires everything: scene, session, input, UI, event effects), `views/` (heroes, horde, bosses, projectiles), `vfx/` (effects), `world/` (ground, grass, water, props, arena theme), `ui/` (HUD panels, menus, store, tips), `models/` (procedural and imported rigs, clips) | Reads session state each frame; reacts to session events |
| `src/audio/` | `GameAudio.ts` (music tracks per situation, stings, SFX bound to session events) | |

## Patterns to follow

- **Fixed step.** `GameSession.step(STEP_MS)` runs at 60 Hz on its own `SimClock`. Timers use `clock.delayedCall`,
  never `setTimeout`. The clock freezes while a choice, a tip or a cutscene is open (`session.revealing`).
- **Systems get a narrow Host.** Each system (`WeaponSystem`, `MiniBossSystem`, `PowerTierSystem`...) declares a
  `...Host` interface with only what it needs; `GameSession` builds it. Add to the host, don't reach into the session.
- **Events, not calls, to the renderer.** Systems `emit` typed events (`SessionEvents` in `GameSession.ts` extends
  each system's event map). `Game3D.bindSessionEffects` / `bindPowerEffects` turn them into particles, floating text
  and camera shake; `GameAudio.bind` into sounds.
- **State for views is public and plain.** Views read arrays/fields every frame (e.g. `miniBosses.icePillars`,
  `powers.hurricanes`) and interpolate with `prevX/prevY` and `alpha`.
- **Pools.** Enemies, projectiles and pickups come from `Pool`s; reset every field you add in the entity's
  `activate`/reset path.
- **Text in the game is Portuguese (pt-BR);** code, comments and commit messages are English.
- **Comment the why, not the what,** in the house style: short JSDoc on exports and tuning fields.

## Where to change what

| I want to... | Go to |
|---|---|
| Change a number (damage, cooldown, health) | `src/config/balance.ts`, or the system's `*_TUNING` block |
| Add a hero ability / power | `src/core/systems/HeroAbilitySystem.ts` or `PowerTierSystem.ts`, its view/effects in `src/render/views/` + `Game3D` |
| Add or change a zone guardian | use the **mesa-guardian** skill |
| Add or change an arena | use the **mesa-arena** skill |
| Add a menu/panel | `src/render/ui/` + styles in `src/play3d.css` (CSS tokens in `:root`) |
| Bring in 3D or 2D art | use the **mesa-art-pipeline** skill |

## Checks

- `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`. Then look at it: the **mesa-verify** skill.
- Tests live next to the code (`*.test.ts`) and drive a real `GameSession` with
  `skipStartingUpgrades: true`, an open arena (`ArenaMap.open(WORLD_SIZE)`) and spawns off — see
  `src/core/systems/PowerTiers.test.ts` for the shape.
