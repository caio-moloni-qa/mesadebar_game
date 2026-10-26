/** Original synthesized combat Foley/magic. Cached as AudioBuffers by GameAudio, also exportable as WAV. */
export const SOUND_NAMES = ['sword', 'whip', 'bolt', 'boomerang', 'aura', 'impact', 'critical', 'explosion', 'hurt', 'pickup', 'upgrade', 'warning', 'beam', 'shield-break', 'roar', 'dash', 'victory', 'defeat'] as const;
export type SoundName = typeof SOUND_NAMES[number];
export const SOUND_LENGTHS: Record<SoundName, number> = { sword: .25, whip: .28, bolt: .25, boomerang: .4, aura: .65, impact: .12, critical: .25, explosion: .85, hurt: .28, pickup: .16, upgrade: 1.1, warning: 1.8, beam: 1.1, 'shield-break': .85, roar: 1.6, dash: .42, victory: 2, defeat: 1.6 };

export function synthesizeSound(name: SoundName, sampleRate: number): Float32Array {
  const duration = SOUND_LENGTHS[name];
  const result = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 91237; let low = 0; let phase = 0;
  const sine = (frequency: number, t: number) => Math.sin(2 * Math.PI * frequency * t);
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate; const x = t / duration;
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += .13 * (noise - low);
    const high = noise - low;
    let value = 0;
    switch (name) {
      case 'sword': value = (high * .48 * Math.sin(Math.PI * x) + sine(950 - 1800 * t, t) * .1) * Math.exp(-12 * t); break;
      case 'whip': value = high * Math.exp(-(((t - .06) / .012) ** 2)) * .7 + low * .4 * Math.sin(Math.PI * x) * Math.exp(-7 * t); break;
      case 'bolt': phase += 2 * Math.PI * (1450 * Math.exp(-11 * t) + 180) / sampleRate; value = (Math.sin(phase) * .4 + high * .08) * Math.exp(-15 * t); break;
      case 'boomerang': value = (low * .6 + high * .1) * Math.sin(Math.PI * x) * (.65 + .35 * sine(24, t)); break;
      case 'aura': value = (sine(293.66, t) + .45 * sine(440, t) + .2 * sine(587.33, t)) * .23 * Math.sin(Math.PI * Math.min(1, t / .09) / 2) * Math.exp(-6 * t); break;
      case 'impact': value = (low * .65 + sine(130 * Math.exp(-20 * t), t) * .28) * Math.exp(-35 * t); break;
      case 'critical': value = (high * .24 + sine(1200, t) * .12 + sine(1720, t) * .08) * Math.exp(-20 * t); break;
      case 'explosion': phase += 2 * Math.PI * (40 + 110 * Math.exp(-12 * t)) / sampleRate; value = (low * .65 + Math.sin(phase) * .5 + high * .1) * Math.exp(-5.5 * t); break;
      case 'hurt': value = (sine(170 - 180 * t, t) * .35 + low * .3) * Math.exp(-13 * t); break;
      case 'pickup': value = (sine(1174.66, t) + .3 * sine(1760, t)) * .22 * Math.exp(-28 * t); break;
      case 'upgrade': case 'victory': case 'defeat': {
        const notes = name === 'defeat' ? [293.66, 261.63, 220, 146.83] : name === 'victory' ? [293.66, 369.99, 440, 587.33] : [587.33, 698.46, 880, 1174.66];
        notes.forEach((frequency, n) => { const u = t - n * (name === 'upgrade' ? .12 : .22); if (u >= 0) value += (sine(frequency, u) + .2 * sine(frequency * 2, u)) * .2 * Math.min(1, u / .015) * Math.exp(-4 * u); });
        break;
      }
      case 'warning': value = (sine(73.416, t) + .35 * sine(110, t) + .18 * sine(146.83, t) + low * .12) * .35 * Math.sin(Math.PI * x) * (.8 + .2 * sine(3, t)); break;
      case 'beam': phase += 2 * Math.PI * (220 + 900 * Math.min(1, t / .15)) / sampleRate; value = (Math.sin(phase) * .25 + sine(1120, t) * .12 + high * .17) * Math.min(1, t / .035) * Math.exp(-3 * t); break;
      case 'shield-break': value = (high * .3 + sine(1700, t) * .15 + sine(2317, t) * .12 + sine(3191, t) * .08 + low * .25) * Math.exp(-8 * t); break;
      case 'roar': phase += 2 * Math.PI * (53 + 11 * sine(2.5, t)) / sampleRate; value = (Math.sin(phase) * .5 + Math.sin(phase * 2.03) * .25 + low * .45) * Math.sin(Math.PI * x) * .7; break;
      case 'dash': value = (low * .55 + high * .18) * Math.sin(Math.PI * x) ** 2; break;
    }
    const fade = Math.min(1, t / .004, (duration - t) / .018);
    result[i] = Math.tanh(value) * Math.max(0, fade);
  }
  return result;
}
