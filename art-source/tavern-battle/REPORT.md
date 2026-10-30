# Tavern battle prototype art — v1

Owner assigned Codex the art on 2026-10-28. Claude owns all game code, integration, gameplay verification and recordings. Branch: `feature/tavern-duel-prototype`, shared main folder.

These are phase 1 prototype assets. The final 31-frame animation sheets, other regulars, hero roster, layered stage and UI icon set remain behind the manual phase gate in `TAVERNA_EM_TURNOS_TEMP.md`.

## Runtime files

| File | Dimensions | Contract |
| --- | --- | --- |
| `src/assets/tavern-battle/brom-poses_v3.png` | 512×256 RGBA | 4 columns × 2 rows; 128×128 cells; left-facing Brom; bottom-centre pivot (64,120) |
| `src/assets/tavern-battle/tavern-stage_v1.png` | 960×540 opaque | Flattened side-view tavern; fighter baseline y=420; open floor, muted upper band for HUD |

Atlas indices, row-major: 0 idle, 1 tankard strike, 2 punch, 3 heavy hammer, 4 parry, 5 dodge, 6 hurt, 7 knockout. These are eight static state poses, not eight animation cycles. Pose 3 is the overhead anticipation for the heavy attack; the renderer supplies motion and hit effects. Do not use the discarded v1/v2 previews as runtime assets.

Draw using integer source rectangles `(index % 4 * 128, floor(index / 4) * 128, 128, 128)` and disable image smoothing. For scale `s` and a fighter anchor `(x,y)`, destination is `(x-64*s,y-120*s,128*s,128*s)`. Enemy faces left natively; horizontal flipping is optional for other uses. Runtime attack timing always comes from the simulation.

## Sources and provenance

- Built-in `image_gen` generated both images. No API fallback or credentials used.
- `brom-poses_v1-raw.png`: untouched 1774×887 generation; existing `src/assets/characters/npcs/brom-portrait.png` supplied as identity reference. Orange braided beard, iron helmet, brown leather and tankard preserved.
- `tavern-stage_v1-raw.png`: untouched 1672×941 generation.
- Full prompts: `brom-poses_v1-generation-prompt.txt`, `brom-poses_v3-generation-prompt.txt`, `tavern-stage_v1-generation-prompt.txt`.
- Deterministic nearest-neighbour export via System.Drawing, uniform sprite scale and cell padding, per-frame foot baseline adjustment. See `atlas-normalization_v1.json`.
- Cleanup discarded faint alpha noise (<32) and detached components of at most 24 pixels; no redrawing. v1 normalized and v2 intermediate previews preserved here. Final v3 inspected after cleanup.
- Reproduction utilities: `tools/discord/.state/prepare-tavern-art.ps1` and `clean-tavern-atlas.ps1` (local tooling, not runtime code).

## Validation and handoff

Read both final PNGs visually. Measured atlas 512×256, transparent corner alpha=0 and empty cell boundaries; stage 960×540, corner alpha=255. Checked consistent costume, frame containment, clear attack silhouettes and open floor. `git diff --check` passed for current tracked changes.

No game code edited by Codex, no commit/push/PR. Runtime integration and tests were not performed by Codex; Claude received the exact paths/contract in Discord and owns the gameplay videos and verification. The selected hero remains the prototype representation chosen by Claude until final art is authorized.
