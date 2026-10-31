# Playable hero duel poses — 2026-10-30

Owner requested art for the playable duel heroes. Claude delegated the four base heroes to Codex and owns renderer integration and in-game verification. Existing frequentador atlases are reused mirrored by Claude.

## Runtime assets

`src/assets/tavern-battle/{barbarian,mage,reliquia,fabri}-hero-poses_v1.png`

Every file: 512×256 RGBA, 4 columns × 2 rows, 128×128 cells, facing left, anchor (64,120), content bottom y119. Mirror in the renderer for the player side. Disable image smoothing. Eight static poses; timing/motion/projectiles are renderer responsibilities.

| Index | Pose | Barbarian | Mage | Reliquia | Fabri |
| --- | --- | --- | --- | --- | --- |
| 0 | Idle | Sword ready | Crystal staff ready | Golden relic ready | Runic boomerang ready |
| 1 | Primary attack | Sword slash | Staff aim | Relic extension | Boomerang forward windup |
| 2 | Counterattack | Sword thrust | Palm cast | Palm strike | Boomerang melee swipe |
| 3 | Toast | Raised tankard | Raised tankard | Raised tankard | Raised tankard |
| 4 | Parry | Sword guard | Staff guard | Bracer guard | Armored forearms |
| 5 | Dodge | Backward lean | Backward lean | Low backward lean | Low dodge |
| 6 | Hurt | Recoil | Recoil | Recoil | Recoil |
| 7 | KO | Lying down | Lying down | Lying down | Lying down |

Index 3 is a drinking/toast pose for all four, never a heavy attack or feint.

## Provenance

Built-in image_gen, one call per hero, transparent background, no CLI/API fallback. Used Brom v3 as the pixel-style/layout reference. Barbarian identity: `art-source/3d/barbarian/views/front.png`; Fabri: `art-source/3d/fabri/turnaround_v2.png`.

Mage and Reliquia have no turnaround PNG in their 3D source folders. `tools/asset-pipeline/preview.mjs` rendered their actual runtime GLBs to reference images preserved here as `{mage,reliquia}-model-reference_v1.png`. Mage preserves the blue/gold hood, hidden face/cyan eyes and purple sash; Reliquia preserves the brown vest, cream shirt, wine sash and smiling dark-haired face. Fabri preserves silver/gold armor, blue tabard, monkey tail, hip bananas and boomerang.

Original generated sheets (all 1774×887) and exact prompts: `{id}-hero-poses_v1-raw.png` and `{id}-hero-poses_v1-generation-prompt.txt` alongside this report. No previous assets overwritten.

## Export and verification

`tools/discord/.state/export-hero-atlases.ps1` segments connected silhouettes on the complete source, then assigns them to the 4×2 layout. This retains weapon tips crossing nominal raw cell boundaries. Every raw has exactly eight major connected components. Alpha below 32 and tiny detached source components up to 24 pixels are excluded: Barbarian 2 pixels, Mage 0, Reliquia 20, Fabri 1. Each hero uses one uniform scale across its eight poses, nearest-neighbor sampling, centered horizontal bounds and bottom y119. Maximum silhouette extent is 112px, leaving padding.

All four raw and final sheets inspected visually. `check-hero-atlases.ps1` verified dimensions, alpha-zero corners, 32 occupied cells, all cell borders empty and every content bottom at y119. `git diff --check` passed. No code changed by Codex, no branch switch/commit/push/PR. Shared branch at delivery: `feature/tavern-tower`.

These are source/asset checks only. Typecheck, tests, build and Chrome evidence with player art are still Claude's integration step; Codex has not claimed in-game validation.
