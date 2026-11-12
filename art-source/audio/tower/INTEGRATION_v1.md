# Audio integration — 2026-11-11

Owner approved continuing after the procedural audio delivery.

- GameAudio now selects the new menu and snowy exploration/intensity loops.
- Game3D updates duel audio before advancing the overlay, while the 3D simulation stays paused.
- Duels select the regular's track; towers select squad/ladder, battle, rest and champion tracks.
- GameAudio shares its AudioContext, saved controls, effects/music buses and limiter with duel audio.
- TavernAudio subscribes to TurnBattle events; unsubscribes on battle replacement/overlay close.
- Reactions, attacks, skills, charges, counters, heals, poison, loot, KO and phase cues are mapped.
- Learned skills keep the originating skill's sound when another hero casts them.
- Repeated charge countdowns stay quiet. Effects are capped, rate limited, and stale decodes are discarded.
- Final MP3 choices from the delivery manifest are registered in tavernSoundUrls.ts (367 files, no missing paths).
- Preload covers common cues, current fighters and learned skills, including first audio unlock.
- Six tower cues are registered: start, floor clear, champion, victory, defeat and cashout.
- Arena SFX continue using the established synthesizer; registering a sound does not imply every arena/UI cue is wired.
- Pending spoken PT-BR barks remain excluded; no TTS was added.

Verification:
- TypeScript: passed.
- Source tests: 633 passed, 6 skipped (`vitest run --exclude 'tmp/**' --exclude '.claude/**'`).
- Unfiltered Vitest: failed on 3 unrelated temporary review/backup files under tmp/; files preserved.
- Production build: generated successfully; existing large chunk warning remains.
- Standard tools/probe/probe.mjs failed at CDP Runtime.enable (unsettled top-level await).
- Fallback: real headless Chrome using installed playwright-core; script in tmp/codex-audio-probe_v1.mjs.
- Checked menu, Brom duel, active effect voice, pause filtering/stopping effects, mute output zero,
  Iglu picker, battle, rest, Winter King champion, snowy exploration and intense track selection.
- Output signal measured via AnalyserNode; no listening review or human mix approval is claimed.
- Screenshots: tmp/codex-audio-duel_v1.png and tmp/codex-audio-igloo_v1.png.
- No balance, simulation, reaction windows or TavernDuel edits by Codex.
- No asset overwrite, branch switch, commit, push or PR.

Files: src/audio/{GameAudio.ts,TavernAudio.ts,TavernAudio.test.ts,tavernSoundUrls.ts,music.test.ts},
plus two audio connections in src/render/Game3D.ts. Other Game3D changes belong to Claude.
