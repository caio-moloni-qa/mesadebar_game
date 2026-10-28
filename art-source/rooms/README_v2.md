# Room art v2

Generated directly with the built-in image_gen tool (7 assets, one generation each).
Raw PNGs and per-asset prompts: tavern/ and igloo/.
Game-ready PNGs: ../../src/assets/textures/rooms/*_v2.png (128x128).
No original assets overwritten.

prepare-textures_v2.py measures the actual source dimensions (1254x1254),
resizes with nearest-neighbor, reconciles a narrow four-pixel wrap boundary,
and saves 2x2 checks. texture-validation_v2.json contains before/after metrics.
textures_tile2x2_v2.png is the combined visual check.
All seven final textures have identical opposing boundary pixels on both axes.

Integration:
- roomDecor.ts contains room construction, original palette fallbacks and props.
- roomMaterials.ts loads sRGB textures with RepeatWrapping and NearestFilter.
- Colored geometry is batched; textured geometry is merged by surface material.
- MERCHANT_ROOM coordinates, NPCs, portal and collision data are unchanged.
- Igloo is an open-roof cutaway with inward-leaning courses and rounded corners.
- RoomAmbience.ts belongs to Claude; no changes or integration made here.

Validation: npm run build; 469 tests; tsc; browser preview with zero errors.
Render checks use MerchantRoom with fixture systems and procedural characters,
at the game's 45-degree camera pitch/yaw, outside the gameplay pixel pipeline.
interior_preview_v2.png in each room directory is an art preview, before ambience.
render-validation_v2.json records counts: tavern 21 calls, igloo 19 calls.

Branch creation was denied by the filesystem sandbox (.git is read-only).
Changes remain uncommitted on feature/snowfield-igloo. No push or PR.
