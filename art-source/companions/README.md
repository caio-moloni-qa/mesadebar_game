# Companion reward portraits

Generated with the imagegen skill on 2026-10-27 for all current CompanionKind values: gravedigger, stoneGolem, waterFairy.

- Runtime assets: src/assets/ui/companions/*-portrait.png (256x256 RGBA, transparent padding).
- Sources: art-source/companions/*-raw.png and *-prompt.txt; originals preserved.
- Integration: src/render/ui/icons.ts, COMPANION_ICONS, used by ChoiceOverlay for both recruitment and strengthening.
- Validation: build passed; 389 tests passed with npm.cmd test -- --exclude 'tmp/**'.
- Browser: all three guardian defeat rewards exercised in Chrome, images decoded at 256x256, no page errors; desktop/mobile captures in tmp/companion-preview/.
- Plain npm test also discovers temporary review worktree tests: 1172 passed, one pre-existing Snowfield LayoutIsolation.review.test.ts failure in tmp/review-snowfield.
- Build retains existing portal_borderless_sheet missing-asset and large-chunk warnings.
- Git metadata is read-only in this session: fetch/branch/worktree creation denied. Files remain uncommitted in C:/mesadebar_game on chore/discord-dispatcher. No push or PR requested or performed.
