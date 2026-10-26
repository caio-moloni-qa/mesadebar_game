# Mesa de Bar - locally composed music suite

Completed all 12 tracks using the same Web Audio approach as The Last Watch. This supersedes the earlier pending external-generator status. No external provider or plugin was used. These sounds are synthesized acoustic-inspired approximations, not real instrument recordings. No lyrics, spoken words or voice recordings. Wordless choir-like synthesis is restricted to the tracks permitting it.

Final WAV files are 44.1kHz, 16-bit stereo. Raw WAVs preserve the untouched OfflineAudioContext float32 output, including four seconds of release/reverb tail. Loop exports fold that tail into the start and retain whole bars; stings retain a defined natural decay and a final short silence taper. Final peak is -1.51 dBFS; LUFS matching is deferred as requested.

| Track | Duration | Tempo / key | Loop | Final | Untouched render |
| --- | --- | --- | --- | --- | --- |
| tavern | 2:27.69 | 104 / D dorian | yes | src/assets/audio/music/tavern.wav | src/assets/audio/music/tavern-raw.wav |
| arena | 2:30.00 | 128 / E minor | yes | src/assets/audio/music/arena.wav | src/assets/audio/music/arena-raw.wav |
| arena-intense | 2:17.14 | 140 / E minor | yes | src/assets/audio/music/arena-intense.wav | src/assets/audio/music/arena-intense-raw.wav |
| guardian-gravedigger | 2:00.00 | 96 / C minor | yes | src/assets/audio/music/guardian-gravedigger.wav | src/assets/audio/music/guardian-gravedigger-raw.wav |
| guardian-temple | 2:02.18 | 110 / D phrygian | yes | src/assets/audio/music/guardian-temple.wav | src/assets/audio/music/guardian-temple-raw.wav |
| guardian-lake | 2:08.00 | 120 / F# minor | yes | src/assets/audio/music/guardian-lake.wav | src/assets/audio/music/guardian-lake-raw.wav |
| boss-necromancer | 2:25.45 | 132 / D minor | yes | src/assets/audio/music/boss-necromancer.wav | src/assets/audio/music/boss-necromancer-raw.wav |
| boss-necromancer-enraged | 2:08.00 | 150 / D minor | yes | src/assets/audio/music/boss-necromancer-enraged.wav | src/assets/audio/music/boss-necromancer-enraged-raw.wav |
| sting-guardian | 0:04.00 | - / - | no | src/assets/audio/music/sting-guardian.wav | src/assets/audio/music/sting-guardian-raw.wav |
| sting-boss | 0:06.00 | - / - | no | src/assets/audio/music/sting-boss.wav | src/assets/audio/music/sting-boss-raw.wav |
| sting-victory | 0:08.00 | - / - | no | src/assets/audio/music/sting-victory.wav | src/assets/audio/music/sting-victory-raw.wav |
| sting-defeat | 0:06.00 | - / - | no | src/assets/audio/music/sting-defeat.wav | src/assets/audio/music/sting-defeat-raw.wav |

Arena and arena-intense share the E-minor theme, with 128/140 BPM and denser strings, percussion and choir in the intense arrangement. Both Necromancer phases share the D-minor motif at 132/150 BPM; phase two adds faster string figures, heavier percussion and dissonant brass.

Validation passed for durations, WAV headers/sample format, non-silent openings, stereo content, finite raw samples, no final clipping, DC offset, loop boundary deltas and silent final sting samples. Raw/final SHA256 values and per-track measurements are in src/assets/audio/music/music-suite-manifest.json. Numerical checks do not substitute for a listening pass.

The game's existing audio playback and music switching were not changed. These files are ready for audition and subsequent integration.

Reproduce with `node art-source/audio/render-music-suite.mjs`; use `--remaining` to skip previously rendered base filenames. Existing audio is never overwritten; rerenders receive _v2, _v3, etc.
