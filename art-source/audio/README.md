# Venivium audio

Original procedural composition and sound design. No external songs, samples, voices or sound libraries.

## Music — The Last Watch

An 83.478-second stereo instrumental loop in D minor at 92 BPM. Detuned synthesized strings,
plucked dulcimer-like overtones, a flute-like melody, bass and frame-drum/tom-style percussion.
The 32-bar arrangement opens sparsely, builds through the middle, and thins before returning to the beginning.
Reverb and held-note tails are folded into the beginning of the exported loop.

- Composition: `src/audio/score.ts`.
- Playable music file: `src/assets/audio/the-last-watch.wav` (32 kHz, 16-bit stereo PCM).
- Render measurements: `render-metrics.json`.

## Combat cues

Eighteen synthesized effects cover sword, whip, magic bolt, boomerang, aura, ordinary/critical impacts,
explosions, player damage, crystal pickup, upgrade, boss warning, beam, shield break, roar, dash,
victory and defeat. Auditionable mono WAVs are in `effects/`.
The game caches the same signals directly in Web Audio buffers, avoiding separate effect downloads.
Sound design lives in `src/audio/soundbank.ts`.

## Integration and reproduction

`src/audio/GameAudio.ts` subscribes to session events and watches boss animation phases.
It owns distance attenuation, stereo placement, event rate limits, a 20-voice limit, master compression,
saved music/effect volume settings and browser user-gesture activation. Music becomes quieter on menus
and filtered/ducked while paused. Hidden tabs suspend audio; a new run clears the old effect voices.

Run Vite, then `node tools/render-audio.mjs [path-to-playwright-core]` to render the track and WAV effects.
Playwright is a development tool only; the game has no audio library dependency.
