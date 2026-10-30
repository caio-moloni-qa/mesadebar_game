# Frost horde pose atlases

Owner task: playable snow-region cast in the igloo tower; Claude requested the two remaining horde atlases.

Final assets in `src/assets/tavern-battle/`:
- `frost-skeleton-poses_v1.png`
- `frost-spirit-poses_v2.png` (use v2; v1 retained for provenance)

Contract: 512x256 RGBA, 4x2 cells of 128px, facing left. Pivot (64,120), content baseline y119. Row-major: idle, main attack, quick/counter attack, HEAVY windup, defend, dodge, hurt, grounded KO.

Identity references: `src/render/models/enemies.ts`, skeletonParts(false,true), FROST_BONE, frostSpiritParts and FROST_SPIRIT. Skeleton has pale blue exposed bones, ice shards, cyan sockets and sword. Spirit has a white hooded robe, glacier-blue trim, dark face, cyan eyes, ice crown/hem and two hand crystals. Style reference inspected: eskimo-poses_v1.png.

Generated with built-in image_gen, one call per character, transparent background, no CLI fallback. Exact prompts in sibling *-generation-prompt.txt files; untouched 1774x887 outputs in *-poses_v1-raw.png.

Export reused tools/discord/.state/export-snow-atlases.ps1: connected-component assignment, shared scale across eight poses per character, nearest-neighbour sampling, centered silhouette and bottom registration. Tiny isolated source specks removed (15 skeleton pixels, 34 spirit pixels). Spirit v2 reassigns disconnected breath shards from idle to main attack and registers the rendered hem to y119 after sampling; same generated source, no regeneration. Script: export-frost-spirit-v2.ps1.

QA: visually inspected both raws and both selected finals. Sixteen nonempty cells, transparent corners, no occupied cell-edge pixels, baseline y119. Machine results: frost-horde-atlas-checks_v2.jsonl; script: check-frost-horde.ps1. git diff --check passed.

Art handoff only: no gameplay/renderer edits, no tsc/tests/build/browser validation by Codex. Claude owns integration and game verification. Shared branch feature/tavern-tower in C:/mesadebar_game; no branch changes, commits, pushes or PRs.
