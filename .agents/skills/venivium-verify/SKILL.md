---
name: venivium-verify
description: "Verify a Venivium change for real: typecheck, tests, build, then open the game in headless Chrome with tools/probe/probe.mjs to drive it, read its state and take screenshots. Use after any change to gameplay, UI, visuals or audio wiring, and before saying something works or posting screenshots."
---

# Verify a change

Tests prove the logic; only the screen proves the game. Do both, then say exactly what you saw.

## 1. Static checks

```bash
npx tsc --noEmit -p .
npx vitest run          # all suites; add tests for what you changed
npm run build
```

Report failures with their output. Never call a change done with a red check.

## 2. Look at it in the game

Start the dev server (from the folder you are working in; pick a free port if 5173 is taken — another agent may be
using it):

```bash
npx vite --port 5180 --strictPort        # run it in the background
```

Then probe it:

```bash
node tools/probe/probe.mjs --port 5180 --seconds 6 --shot shot.png \
  --eval "JSON.stringify({ level: __game.session.level, hp: __game.session.player.health })" \
  --drive "const g = __game; if (g.tipDialog.open) g.tipDialog.close(); const c = g.session.pendingChoice; if (c && c.upgrades) g.session.chooseUpgrade(c.upgrades[0].id);" \
  "debug=1&hero=mage&god=1"
```

| Query param | Effect |
|---|---|
| `debug=1` | exposes `window.__game` (the `Game3D`; `__game.session` is the `GameSession`) |
| `hero=<id>` | starts a run with that hero (`mage`, `barbarian`, `reliquia`, `fabri`, `brom`, `lyra`, `grimbo`, `zora`, `sergio`) |
| `god=1` | invincible hero |
| `arena=<id>` | starts in that arena (`greenfield`, `snowfield`) |
| `at=<zone>` | puts the hero in a zone (`meadow`, `ruins`, `forest`, `lake`, `graveyard`, `camp`) |
| `zoom=<n>` | camera zoom (2 = closer) |
| `seed=<n>` | fixed seed |

Useful `--drive` snippets (they run every 300 ms; guard one-shot actions with a `window.__done` flag):

- close the first-run tip and pick cards: see the example above;
- call a guardian: `if (!window.__d) { window.__d = 1; __game.session.spawnMiniBoss('frostKnight'); }`;
- jump levels (power tiers): `__game.session.level = 12`;
- unlock every hero: `__game.allHeroesUnlocked = true`;
- open the character select: `__game.menu.showCharacters('lyra')`;
- check the area picker: it's the step after "Jogar" on the title screen.

The probe prints each `--eval` sample, the screenshot path and `problems:` (console errors and exceptions). Treat any
problem as a failure to explain. **Read the screenshot yourself** before describing it.

A fresh profile has no save: the first-run tip shows and only the starting heroes are unlocked. Account for it in the
drive script.

## 3. Report

- What you checked and how (tests, the probe's query string, what the eval showed).
- What you saw on screen, honestly — including what looks wrong or was not checked.
- In the team channel, attach the screenshots (`send --attach shot.png "..."`, see `tools/discord/README.md`).
- Stop the dev server you started.
