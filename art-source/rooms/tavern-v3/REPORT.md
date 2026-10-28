# Tavern v3 implementation and verification

2026-10-28. The owner asked Codex to take over while Claude was unavailable. Working directory: C:/mesadebar_game. Branch: feature/snowfield-igloo. No branch creation, commit, push or PR, as required by the brief.

## Scope

Claude's partial stage 0 already contained RoomLayout, separate TAVERN_LAYOUT/IGLOO_LAYOUT, circular island collision and character facing. Codex completed stage 0 by migrating stale layout references in MerchantSystem/Hub/QuestSystem/Igloo tests, fixing missing test imports, and correcting Sergio's interaction range. Measuring distance to sergioSpot captured the two northern table interactions; range now measures distance to the merchant himself. Added regression covering conversation with every regular from the island side of their table.

The owner's takeover request authorizes stage 0 core/test work. Art changes remain confined to the tavern branch of roomDecor.ts. roomMaterials.ts needed no changes. No new edits to MerchantRoom, RoomAmbience, Game3D, GameSession, BossUi or the igloo art branch during this session; pre-existing work was preserved.

## Stages 1 and 2: sources and textures

Built-in image_gen generated the concept and each of three textures separately. Exact raw outputs were copied into this directory; prompts and cleaned images are adjacent. concept.png is an unchanged copy of concept_raw.png. The concept shows the central ring, four diagonal tables and a clear walkway. It is a mood reference with a more frontal/detailed artistic view than the actual game; final game screenshots validate the real 45-degree yaw/pitch camera.

Texture raw sizes: 1254x1254 each. Nearest resizing to 128x128, narrow three-pixel edge reconciliation, then 12-color quantization without dithering. All finals are opaque RGB. Opposing-edge maximum difference is zero on BOTH axes for ALL three textures. See texture-validation.json and the individually inspected 2x2 checks. No text, logos or letter-like symbols observed. Existing loader supplies NearestFilter, RepeatWrapping and no mipmaps.

New game assets: tavern_island_v2.png, tavern_flagstone_v2.png, tavern_fur_v2.png. No name conflicts; no v3/v4 renames required. No existing art overwritten. First QA captures retained with _initial suffixes, not replaced. prepare-textures.py refuses to overwrite existing finals.

## Stage 3: implementation

Flagstone floor; 3.2 m wooden table platforms; round fur rugs under tables and by fireplace. Continuous closed 18-segment island ring, top at 1.1 m; brass band, external foot rail, three north-facing taps, mugs. Three-tier tower with 36 bottles, necks, corks and highlights; three small kegs behind the tower clear of Sergio. Iron/antler chandelier at 3.2 m, eight candles and one warm PointLight. Plain wall banners, shields, crossed swords and hanging herbs. Tangential benches, half timber framing, fireplace, portal, barrel stack and lectern retained. Gameplay anchors come from layout constants; architectural ornaments use local dimensions relative to their anchors. New prop colors live in TAVERN_LOOK; props are merged into existing solid/glow batches, surfaces into one mesh per texture.

## Stage 4: verification

- npx.cmd tsc --noEmit: PASS, also included in final build.
- npx.cmd vitest run --exclude 'tmp/**' --exclude '.claude/**': PASS, 473 tests in 38 files.
- Literal unfiltered vitest also discovers temporary project copies: 5217 passed, one failed in tmp/review-snowfield/src/core/world/LayoutIsolation.review.test.ts (map shoreline isolation, unrelated to this work). This failure was reported, not fixed. Official src tests pass with the exclusions above.
- npm.cmd run build: PASS. Existing warning about a JS chunk larger than 500 kB remains.
- git diff --check: PASS.
- Actual Chrome/GPU browser, hub and visit: zero console errors or uncaught exceptions.
- Island collision checked in 16 directions using actual GameSession movement: resulting radius 103 units = island 85 + hero 18, maximum error below 1e-9. Visual ring uses the same outer radius, with intentional 18-sided faceting and 0.04 m top overhang.
- Straight arrival-to-Sergio approach: PASS, stopped at room offset (0,-73), shop opened.
- All four regulars reached from the island side of their tables: PASS, correct dialogue index, no Sergio interception. Tangential benches leave these paths clear.
- Straight Sergio-to-exit approach: PASS, exit station reached.
- Four markers visible, visually checked against chandelier/banners; regulars face the island. Sergio faces his conversation point.
- preview_hub.png: actual between-run game. preview_visit.png: actual visit with shop open. preview_visit_clear.png: same visit without panel. Real camera and pipeline, no alternate frustum.
- Igloo isolated regression: no browser errors; preview_igloo_regression.png. No igloo art/layout changes this session. Igloo tests included among the 473.

Browser movement was driven through window.__game/GameSession in ?debug=1, with actual game rendering, rather than a human keyboard session. Browser evidence: browser-validation.json. The first failed QA run (northern conversations intercepted by Sergio) is preserved in browser-validation-initial.json.

## Draw calls and budget limitation

**The 30-call budget is met ONLY in the isolated preview. The complete game pipeline is still above 30.**

| Measurement | Before | After |
|---|---:|---:|
| Historical v2 isolated preview without equivalent markers | 21 | n/a |
| Same isolated harness this session, stage 0 layout with markers | 27 | 28 |
| Actual game hub, all passes | 71 | 75 |
| Actual game visit, all passes | 85 | 89 |

Actual before results were obtained by Playwright serving a saved copy of the pre-art roomDecor through request interception, while keeping the rest of the code/camera/test sequence current. See before/browser-validation.json. Actual after: browser-validation.json. Hub after: world 43 + normals 24 + characters 7 + composite 1. Visit after: world 52 + normals 29 + characters 7 + composite 1. The historical 21 is not the total current pipeline cost. New geometry is batched, not drawn per prop. The strict global budget remains PENDING and requires review of pipeline/elements outside the permitted art scope; no invasive changes were made to hide this result.

## Follow-up and limits

- Stage 5 independent Claude review remains pending when his session returns; no publication authorized.
- CollisionOverlay.ts covers arena obstacles, not the room island. Collision was validated by actual simulation and visual inspection; no nonexistent room overlay is claimed.
- MerchantRoom class comment still describes the old west counter. Left untouched during art work.
- Existing warm ambience retained; captures expose its appearance for the lighting review.
- No branch created because the brief explicitly says to use the existing branch.

## Inventory

New artwork, sources and evidence created this session; sizes in bytes. REPORT.md is an additional new document.

| Path | Bytes | Image |
|---|---:|---|
| `art-source/rooms/tavern-v3/baseline_layout.png` | 213932 | 1280x720, RGB |
| `art-source/rooms/tavern-v3/before/browser-validation.json` | 3642 |  |
| `art-source/rooms/tavern-v3/before/preview_hub.png` | 233343 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/before/preview_visit.png` | 258977 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/before/preview_visit_clear.png` | 223429 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/browser-validation-initial.json` | 3610 |  |
| `art-source/rooms/tavern-v3/browser-validation.json` | 3642 |  |
| `art-source/rooms/tavern-v3/concept.png` | 2845515 | 1374x1145, RGB |
| `art-source/rooms/tavern-v3/concept_prompt.txt` | 1986 |  |
| `art-source/rooms/tavern-v3/concept_raw.png` | 2845515 | 1374x1145, RGB |
| `art-source/rooms/tavern-v3/flagstone.png` | 18729 | 128x128, RGB |
| `art-source/rooms/tavern-v3/flagstone_prompt.txt` | 427 |  |
| `art-source/rooms/tavern-v3/flagstone_raw.png` | 1634816 | 1254x1254, RGB |
| `art-source/rooms/tavern-v3/flagstone_tile2x2.png` | 39662 | 256x256, RGB |
| `art-source/rooms/tavern-v3/fur.png` | 16515 | 128x128, RGB |
| `art-source/rooms/tavern-v3/fur_prompt.txt` | 439 |  |
| `art-source/rooms/tavern-v3/fur_raw.png` | 1847839 | 1254x1254, RGB |
| `art-source/rooms/tavern-v3/fur_tile2x2.png` | 34700 | 256x256, RGB |
| `art-source/rooms/tavern-v3/igloo-regression.json` | 137 |  |
| `art-source/rooms/tavern-v3/island.png` | 11936 | 128x128, RGB |
| `art-source/rooms/tavern-v3/island_prompt.txt` | 453 |  |
| `art-source/rooms/tavern-v3/island_raw.png` | 1555484 | 1254x1254, RGB |
| `art-source/rooms/tavern-v3/island_tile2x2.png` | 25589 | 256x256, RGB |
| `art-source/rooms/tavern-v3/prepare-textures.py` | 2596 |  |
| `art-source/rooms/tavern-v3/preview_hub.png` | 231644 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/preview_hub_initial.png` | 237786 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/preview_igloo_regression.png` | 199319 | 1280x720, RGB |
| `art-source/rooms/tavern-v3/preview_isolated.png` | 196152 | 1280x720, RGB |
| `art-source/rooms/tavern-v3/preview_visit.png` | 259217 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/preview_visit_clear.png` | 221781 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/preview_visit_clear_initial.png` | 221585 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/preview_visit_initial.png` | 259195 | 1440x900, RGB |
| `art-source/rooms/tavern-v3/render-after.json` | 140 |  |
| `art-source/rooms/tavern-v3/render-before.json` | 139 |  |
| `art-source/rooms/tavern-v3/texture-validation.json` | 1085 |  |
| `art-source/rooms/tavern-v3/textures_tile2x2.png` | 124919 | 768x282, RGB |
| `src/assets/textures/rooms/tavern_flagstone_v2.png` | 18729 | 128x128, RGB |
| `src/assets/textures/rooms/tavern_fur_v2.png` | 16515 | 128x128, RGB |
| `src/assets/textures/rooms/tavern_island_v2.png` | 11936 | 128x128, RGB |

Code edited this session: src/render/world/roomDecor.ts, src/core/systems/MerchantSystem.ts, and MerchantSystem.test.ts/Hub.test.ts/QuestSystem.test.ts/Igloo.test.ts in src/core/systems.

New helper files under tmp/: tavern-v3-preview.html, tavern-v3-baseline.mjs, tavern-v3-check.mjs, tavern-v3-game-qa.mjs, tavern-v3-before-game-qa.mjs, tavern-v3-igloo-check.mjs, roomDecor-before-v3.txt, roomDecor-baseline-v3.ts. Playwright uses C:/training-playwright/node_modules/playwright-core. Vite used 127.0.0.1:5173. The Vite server started for this session was stopped after QA. All browser processes closed.

## Ajuste de enquadramento — 2026-10-28
- Zoom da taverna 1,65x, aplicado também no hub; arena/iglu mantêm 1x. Grade de texels acompanha o zoom e o resize.
- Câmera acompanha parcialmente o jogador, aproximando-se dele conforme necessário em telas estreitas para mantê-lo visível.
- Paredes ao fundo: 5,2 m (antes 1,6 m); primeiro plano em corte a 2,2 m para permitir leitura dos personagens. Vigas acompanham as alturas.
- Fundo da taverna: marrom escuro #352c24. Na entrada, a sala preenche a tela; nos extremos ainda podem aparecer áreas externas, agora harmonizadas com a paleta.
- QA: framing-qa.mjs + framing-validation.json; entrada, quatro extremos, 390x844, resize, visita e saída. Sem erros de página; zoom volta a 1 na arena.
- Build/tsc e git diff --check passaram. Vitest com os arquivos de src: 423 arquivos / 5218 testes passaram. A execução ampla por filtro src também incluiu tmp/review-snowfield e encontrou uma falha de isolamento de layout nesse teste temporário, fora dos arquivos modificados nesta tarefa.
- Prints preview_framing_*.png. Sem commit/push/PR; branch feature/snowfield-igloo, pasta principal.

## Publicacao — 2026-10-28

O dono autorizou organizar, commitar, publicar e abrir PRs nesta sessao posterior. Os avisos anteriores de "sem commit/push/PR" descrevem as etapas de producao, nao o estado atual da entrega.

Build e 473 testes em 38 arquivos do projeto passaram novamente com exclusao de tmp/** e .claude/**. A revisao independente e o limite global de 30 draw calls continuam pendentes; a publicacao da sala e DRAFT.
