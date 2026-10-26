import { describe, expect, it } from 'vitest';
import { SOUND_LENGTHS, SOUND_NAMES, synthesizeSound } from './soundbank';

describe('combat audio signals', () => {
  it.each(SOUND_NAMES)('%s has audible, finite, unclipped samples and quiet edges at browser sample rates', name => {
    for (const rate of [22050, 48000]) {
      const samples = synthesizeSound(name, rate);
      let peak = 0, power = 0;
      for (const value of samples) {
        if (!Number.isFinite(value)) throw Error(`${name}: non-finite sample`);
        peak = Math.max(peak, Math.abs(value)); power += value * value;
      }
      expect(samples.length / rate).toBeCloseTo(SOUND_LENGTHS[name], 3);
      expect(peak).toBeLessThan(1);
      expect(Math.sqrt(power / samples.length)).toBeGreaterThan(.005);
      expect(samples[0]).toBe(0);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(.002);
    }
  });

  it('reproduces the exported effects from the same synthesis source', () => {
    expect(synthesizeSound('sword', 22050)).toEqual(synthesizeSound('sword', 22050));
    expect(synthesizeSound('explosion', 22050)).toEqual(synthesizeSound('explosion', 22050));
  });
});
