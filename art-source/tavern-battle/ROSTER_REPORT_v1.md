# Tavern roster poses — 2026-10-30

Owner authorized generating the other four duel fighters. Codex owns these image files; Claude owns integration, tower/gameplay code and in-game verification. Shared main folder; no branch switch, commit or publication by Codex.

## Final runtime assets

`src/assets/tavern-battle/{lyra,grimbo,zora,sergio}-poses_v2.png`

Each is 512×256 RGBA, 4 columns × 2 rows, 128×128 cells, native facing left, anchor (64,120). Disable image smoothing. Source rectangle `(index % 4 * 128, floor(index / 4) * 128, 128, 128)`; destination `(x-64*s,y-120*s,128*s,128*s)`. These are eight static poses, not animation cycles; the renderer controls timing, movement and flying projectiles. Keep Brom's existing v3 atlas.

| Index | Lyra | Grimbo | Zora | Sergio |
| --- | --- | --- | --- | --- |
| 0 | idle bow | idle coin | idle crystal | idle mug |
| 1 | drawn bow | coin flick | crystal cast | mug throw |
| 2 | dagger thrust | dice in hand | palm strike | plate throw |
| 3 | heavy bow windup | table overhead | raised palm FEINT | barrel push |
| 4 | dagger guard | crossed guard | crystal guard | forearm guard |
| 5 | dodge | dodge | dodge | dodge |
| 6 | hurt | hurt | hurt | hurt |
| 7 | knockout | knockout | knockout | knockout |

Sergio is full body without a counter, suitable for clipping/layering at his existing counter. Bottle throws reuse the throwing pose; no separate bottle pose was commissioned. Select Zora index 3 for a feint and hold it through the false hit; indices 1/2 are genuine attacks.

## Provenance and exports

Built-in image_gen, one generation per character, using Brom's atlas as style reference and each existing NPC portrait as identity reference. All raw sheets are 1774×887. Exact prompts are beside the raw files. Grimbo raw v1 accidentally held a tankard in pose 2; built-in edit produced raw v2 with two dice, preserving the sheet. No API fallback.

`tools/discord/.state/export-tavern-roster.ps1` applies a uniform scale per character, nearest-neighbour sampling, horizontally centers each static silhouette and aligns its bottom to local y119 (anchor y120). Raw alpha<32 and detached components <=24 source pixels are removed. `clean-tavern-roster.ps1` additionally removes detached components <=24 output pixels: Lyra 6, Sergio 3, Grimbo/Zora 0. Runtime v2 is final; intermediate normalized v1 sheets are preserved here, not used by the game. No existing assets overwritten.

## Verification and limits

All raw and final sheets inspected visually. Final dimensions, alpha-zero corners, occupied cells and empty cell borders checked programmatically. Costume/identity, pose order, silhouette and grid containment checked. `git diff --check` executed. No gameplay/render code changed; game integration, typecheck/tests/build and Chrome screenshots with these assets remain with Claude. No claim of in-game verification by Codex.
