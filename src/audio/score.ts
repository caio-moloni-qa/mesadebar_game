/** Original score: "The Last Watch". D minor, 92 BPM, 32 bars (83.478 s).
 * Offline-rendered by tools/render-audio.mjs; no instrument libraries or third-party recordings.
 */
export const SCORE_BPM = 92;
export const SCORE_SECONDS = 32 * 4 * 60 / SCORE_BPM;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function composeScore(ctx: BaseAudioContext, destination: AudioNode): void {
  const beat = 60 / SCORE_BPM;
  const bar = beat * 4;
  let seed = 0x76281;
  const random = () => { seed = Math.imul(seed ^ (seed >>> 15), 1 | seed); seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed); return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296; };
  const dry = ctx.createGain(); dry.gain.value = .72; dry.connect(destination);
  const reverb = ctx.createConvolver();
  const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 3.6), ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      smooth = smooth * .6 + (random() * 2 - 1) * .4;
      data[i] = smooth * (1 - i / data.length) ** 3 * .5;
    }
  }
  reverb.buffer = impulse;
  const wet = ctx.createGain(); wet.gain.value = .3; reverb.connect(wet).connect(destination);

  function instrument(midi: number, start: number, length: number, volume: number, kind: 'strings' | 'pluck' | 'flute' | 'bass', pan: number): void {
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.value = kind === 'strings' ? 780 : kind === 'pluck' ? 2100 : 1400;
    const stereo = ctx.createStereoPanner(); stereo.pan.value = pan;
    env.connect(filter).connect(stereo); stereo.connect(dry); stereo.connect(reverb);
    const attack = kind === 'strings' ? .6 : kind === 'flute' ? .09 : .012;
    const release = kind === 'strings' ? .9 : kind === 'pluck' ? .7 : .25;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(volume, start + attack);
    if (kind === 'pluck') env.gain.exponentialRampToValueAtTime(.0001, start + length + release);
    else {
      env.gain.setValueAtTime(volume * .7, start + Math.max(attack, length - .1));
      env.gain.linearRampToValueAtTime(0, start + length + release);
    }
    const partials = kind === 'strings' ? [1, 1.003, 2] : kind === 'pluck' ? [1, 2, 3.01, 4.02] : kind === 'flute' ? [1, 2, 3] : [1, 2];
    partials.forEach((partial, index) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = kind === 'strings' ? 'sawtooth' : 'sine';
      osc.frequency.value = hz(midi) * partial;
      gain.gain.value = kind === 'strings' ? [.32, .28, .07][index] : kind === 'pluck' ? [1, .26, .12, .05][index] : kind === 'flute' ? [1, .16, .045][index] : [1, .18][index];
      if (kind === 'flute') {
        const vibrato = ctx.createOscillator(); const depth = ctx.createGain();
        vibrato.frequency.value = 4.8; depth.gain.value = hz(midi) * partial * .0025;
        vibrato.connect(depth).connect(osc.frequency); vibrato.start(start); vibrato.stop(start + length + release);
      }
      osc.connect(gain).connect(env); osc.start(start); osc.stop(start + length + release + .02);
    });
  }

  function drum(start: number, deep: boolean, volume: number): void {
    const env = ctx.createGain(); env.gain.setValueAtTime(volume, start); env.gain.exponentialRampToValueAtTime(.0001, start + (deep ? .5 : .15));
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(deep ? 110 : 220, start); osc.frequency.exponentialRampToValueAtTime(deep ? 47 : 105, start + .15);
    osc.connect(env).connect(dry); env.connect(reverb); osc.start(start); osc.stop(start + .55);
  }
  const chords = [[50, 57, 65, 69], [46, 53, 62, 65], [41, 53, 60, 69], [48, 55, 62, 67], [50, 57, 65, 69], [43, 55, 62, 70], [46, 53, 62, 65], [45, 57, 61, 64]];
  const motif = [
    [[0, 74, 1.5], [2, 77, .75], [3, 76, 1], [4.5, 74, 1], [6, 69, 1.5]],
    [[0, 74, 2], [3, 77, 1], [4.5, 79, .75], [6, 77, 1.5]],
    [[0, 81, 1.5], [2, 79, .75], [3, 77, 1.5], [5, 76, 1], [6.5, 72, 1]],
    [[0, 74, 2], [3, 72, 1], [4.5, 69, 2]],
    [[0, 77, 1.5], [2, 76, .75], [3, 74, 1.5], [5, 69, 2]],
    [[0, 79, 1.5], [2, 77, 1], [4, 74, 2], [6.5, 70, .8]],
    [[0, 77, 2], [3, 74, 1], [5, 72, 2]],
    [[0, 73, 1.5], [2.5, 76, 1], [4, 73, 1], [6, 69, 1.2]]
  ];
  for (let b = 0; b < 32; b++) {
    const start = b * bar;
    const chordIndex = Math.floor(b / 2) % chords.length;
    const chord = chords[chordIndex];
    // Four evolving sections; the last bars thin out into the beginning of the loop.
    const energy = b < 8 ? .65 : b < 16 ? .85 : b < 28 ? 1 : .6;
    if (b % 2 === 0) chord.slice(1).forEach((note, i) => instrument(note, start + i * .035, bar * 2 - .55, .05 * energy, 'strings', (i - 1) * .35));
    instrument(chord[0] - 12, start, beat * 2.8, .09 * energy, 'bass', -.08);
    [0, 1.5, 2, 3.5].forEach((offset, i) => instrument(chord[1 + ((i + b) % 3)] + 12, start + offset * beat, .22, .044 * energy, 'pluck', i % 2 ? .42 : -.42));
    if (b >= 4 && b % 2 === 0) motif[chordIndex].forEach(([offset, note, length]) => instrument(note, start + offset * beat, length * beat * .85, b >= 16 ? .075 : .055, 'flute', .12));
    if (b >= 8 && b < 30) {
      drum(start, true, .19 * energy); drum(start + beat * 2, true, .12 * energy);
      drum(start + beat, false, .034); drum(start + beat * 3, false, .026);
      if (b % 4 === 3) drum(start + beat * 3.5, true, .07);
    }
  }
}
