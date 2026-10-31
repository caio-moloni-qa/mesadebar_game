# Igloo tower battle art — 2026-10-30

Owner requested regional towers, regional artwork and playable snowfield characters. Claude delegated this art set to Codex and owns game integration, abilities, squad mechanics, scaling and browser verification.

## Contract

- Stage: `src/assets/tavern-battle/igloo-stage_v1.png`, 960×540 opaque PNG. Side-on battle composition, broad open foreground, intended fighter baseline y432. Ice dome, tundra doorway, furs, lantern and cooking hearth; no characters.
- Atlases: `src/assets/tavern-battle/{eskimo,frost-knight,ice-serpent,bellringer,ancient-yeti,winter-king}-poses_v1.png`.
- **Bellringer exception: use `bellringer-poses_v2.png`.** The undelivered v1 is preserved for provenance and must not be integrated: two detached primary-swing arcs had been assigned to idle by the nominal raw cell boundary. V2 assigns those arcs to primary attack, then recalculates the shared scale. Same generated source; see `export-bellringer-v2.ps1`.
- **Winter King exception: use `winter-king-poses_v2.png`.** Undelivered v1 preserved. V2 assigns detached ice-ray shards to primary attack instead of idle; same raw source and scale. See `export-winter-king-v2.ps1`. His long ray requires a smaller shared character scale to fit the 128px cell without clipping; renderer display-size tuning remains an integration decision.
- Each atlas: 512×256 RGBA; four columns, two rows; 128×128 cells; faces left; foot anchor (64,120), alpha content ends at local y119. Renderer mirrors for the player side and disables image smoothing.
- Cell order: 0 idle, 1 primary attack, 2 second/quick attack (also counterattack), 3 HEAVY attack, 4 defense, 5 dodge, 6 hurt, 7 KO. Cell 3 is NOT a toast in this set.

| Atlas | Primary | Quick/counter | Heavy |
| --- | --- | --- | --- |
| eskimo | Frozen fish throw | Ladle jab | Pot raised overhead |
| frost-knight | Ice sword slash | Ice sword thrust | Two-handed overhead sword |
| ice-serpent | Ice spit | Low bite/lunge | High rear and frost charge |
| bellringer (v2) | Bell swing/toll | Short forward bell/clapper strike | Bell raised overhead |
| ancient-yeti | Open-handed slap | Closed-fist punch | Both fists raised for slam |
| winter-king | Scepter ice ray | Scepter melee | Raised scepter blizzard |

## Provenance and export

Built-in image_gen; one generation per asset, genuine transparent output for sprites, no CLI/API fallback. Style references: `brom-poses_v3.png` and `tavern-stage_v1.png`. Character identity references: `art-source/3d/<id>/turnaround.png`; frost-knight uses the `frozen-knight` source folder. Original references preserved unchanged.

Exact prompts and original generated PNGs are siblings named `<asset>-generation-prompt.txt` and `<asset>-raw.png`. Stage raw is 1672×941, resized with nearest-neighbor sampling to 960×540. Atlas export uses complete-source connected components before assigning poses to cells, retaining weapons beyond the raw nominal cell boundaries. One uniform scale per character, centered horizontal content, bottom y119, maximum extent 112px; nearest-neighbor. Excludes alpha below 32 and detached components up to 24 source pixels. Generated compact effects are retained; runtime projectiles/timing remain renderer responsibilities.

Export/check helpers: `tools/discord/.state/{export-snow-atlases,check-snow-atlases}.ps1`, reusing the prior hero export/check implementation. No existing assets overwritten.

## Verification scope

Codex performs source/final visual inspection and numerical PNG checks (dimensions, alpha-zero corners, eight occupied frames, empty cell borders, bottom y119). Delivery messages distinguish these checks from in-game validation. Runtime integration, typecheck, tests, build and Chrome verification belong to Claude; no claim that Codex ran those checks.

All six raw sheets and six selected final atlases inspected. All atlas raws: 1774×887. Six selected finals passed all numerical checks (48 occupied cells); stage final inspected at 960×540 with opaque corners. QA output: `snow-atlas-checks_v1.jsonl` alongside this report.

| Character | Major source components (>1000px) | Tiny discarded source pixels | Uniform scale |
| --- | ---: | ---: | ---: |
| eskimo | 8 | 0 | 0.220472441 |
| frost-knight | 8 | 3 | 0.212121212 |
| ice-serpent | 14 | 3 | 0.228571429 |
| bellringer v2 | 9 | 49 | 0.236286920 |
| ancient-yeti | 8 | 0 | 0.234309623 |
| winter-king v2 | 11 | 130 | 0.182113821 |

Extra major components in effect-heavy sheets are intentional disconnected ice/bell effects, grouped with their poses; they do not represent extra characters.

Shared folder `C:/mesadebar_game`, branch `feature/tavern-tower`. No branch switch, worktree, game-code edits, commit, push or PR by Codex. Other agent's ongoing code changes are preserved.
