import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../config/characters';
import { PlayerState } from '../../core/session/entities';
import { HeroView } from './HeroView';

/** Drives a HeroView frame by frame with a scripted walk pattern and records how much the left thigh swings. */
function simulate(script: (frame: number) => { walking: boolean; action?: 'cast' | 'swing' | 'throw' | 'hit' }, frames: number) {
  const view = new HeroView('barbarian', 'sword');
  const player = new PlayerState(CHARACTERS.barbarian);
  const thigh = (view as unknown as { model: { bones: Record<string, THREE.Bone> } }).model.bones.thighL;
  const angles: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const { walking, action } = script(frame);
    player.prevX = player.x;
    if (walking) player.x += 3;
    if (action) view.play(action);
    view.update(player, 1, frame * 16, 1 / 60);
    angles.push(thigh.rotation.x);
  }
  const swing = (from: number, to: number) => {
    const window = angles.slice(from, to);
    return Math.max(...window) - Math.min(...window);
  };
  return { swing };
}

describe('HeroView locomotion', () => {
  it('swings the legs while walking', () => {
    const { swing } = simulate(() => ({ walking: true }), 90);
    expect(swing(30, 90)).toBeGreaterThan(0.5);
  });

  it('keeps the legs moving after stopping and walking again (regression: run stayed disabled after a fade-out)', () => {
    const { swing } = simulate((frame) => ({ walking: frame < 40 || frame >= 80 }), 160);
    expect(swing(100, 160)).toBeGreaterThan(0.5);
  });

  it('survives many stop/start cycles with attacks fired in between', () => {
    const attacks = ['cast', 'swing', 'throw', 'hit'] as const;
    const { swing } = simulate((frame) => ({
      walking: Math.floor(frame / 25) % 2 === 0,
      action: frame % 17 === 0 ? attacks[(frame / 17) % attacks.length] : undefined
    }), 400);
    // Frames 400-ish land in a walking stretch (frames 350..374 walk); check the last walking window.
    expect(swing(352, 374)).toBeGreaterThan(0.3);
  });

  it('settles the legs back to rest when standing still', () => {
    const { swing } = simulate((frame) => ({ walking: frame < 40 }), 140);
    expect(swing(100, 140)).toBeLessThan(0.05);
  });
});
