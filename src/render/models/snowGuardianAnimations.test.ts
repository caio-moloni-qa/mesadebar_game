import { describe, expect, it } from 'vitest';
import { GameSession, STEP_MS } from '../../core/session/GameSession';
import { MiniBossAttack, MiniBossState } from '../../core/systems/MiniBossSystem';
import { ArenaMap } from '../../core/world/ArenaMap';
import { WORLD_SIZE } from '../../config/world';
import { createFrostKnightModel } from './zoneActors';
import { createSnowGuardianModel } from './snowBosses';
import { SnowGuardianAnimator, SnowGuardianKind, snowGuardianClips } from './snowGuardianAnimations';
import { MiniBossViews } from '../views/ZoneActorViews';

function fixture(kind: SnowGuardianKind) {
  const run = new GameSession({ characterId: 'mage', seed: 2, skipStartingUpgrades: true, arena: ArenaMap.open(WORLD_SIZE) });
  run.skeletonSpawnEnabled = run.variantSpawnEnabled = false;
  run.player.invincible = true;
  run.spawnMiniBoss(kind);
  for (let ms = 0; ms < 2300; ms += STEP_MS) run.step(STEP_MS);
  const state = run.miniBosses.bosses[0];
  state.attack = null;
  const model = kind === 'frostKnight' ? createFrostKnightModel() : createSnowGuardianModel(kind);
  const animator = new SnowGuardianAnimator(model, kind);
  return { state, model, animator };
}

function attack(state: MiniBossState, type: MiniBossAttack['type'], phase: MiniBossAttack['phase'], elapsedMs: number) {
  state.attack = { type, phase, elapsedMs, x: 0, y: 0, dirX: 1, dirY: 0, hit: false, count: 0 };
}

describe('snow guardian combat animation', () => {
  it.each(['frostKnight', 'iceSerpent', 'bellringer', 'ancientYeti'] as const)('%s has valid curves and freezes its pose while paused', kind => {
    const { state, model, animator } = fixture(kind);
    Object.values(snowGuardianClips(kind, [0, model.bones.hips.position.y, 0])).forEach(clip => expect(clip.validate()).toBe(true));
    animator.update(state, true, 0.5);
    const before = Object.values(model.bones).map(bone => bone.quaternion.toArray());
    animator.update(state, true, 0);
    expect(Object.values(model.bones).map(bone => bone.quaternion.toArray())).toEqual(before);
    animator.dispose();
  });

  it('the knight cuts across the body exactly when damage lands, despite its phase timer resetting', () => {
    const { state, model, animator } = fixture('frostKnight');
    attack(state, 'iceSlash', 'telegraph', 600);
    animator.update(state, false, 0.2);
    expect(model.bones.chest.rotation.y).toBeLessThan(-0.5);
    attack(state, 'iceSlash', 'recover', 0);
    animator.update(state, false, 1 / 60);
    expect(model.bones.chest.rotation.y).toBeGreaterThan(0.5);
    animator.dispose();
  });

  it.each([['ancientYeti', 'leap', 1100], ['iceSerpent', 'eruption', 1200]] as const)('%s returns to ground on impact using the cumulative snow attack timer', (kind, type, warning) => {
    const { state, animator } = fixture(kind);
    attack(state, type, 'telegraph', warning * 0.65);
    expect(Math.abs(animator.update(state, false, 0.2))).toBeGreaterThan(0.4);
    attack(state, type, 'active', warning);
    expect(animator.update(state, false, 1 / 60)).toBe(0);
    animator.dispose();
  });

  it('hands control back to the death clip after combat instead of continuing to animate a dead guardian', () => {
    const { state } = fixture('ancientYeti');
    const views = new MiniBossViews();
    views.update([state], 1, 3000, 0.2);
    state.enemy.health = 0;
    state.enemy.phase = 'dying';
    views.update([state], 1, 3100, 0.2);
    expect(views.viewFor(state.enemy)?.actor.clip).toBe('death');
    views.update([], 1, 6100, 3);
    expect(views.viewFor(state.enemy)).toBeUndefined();
    views.clear();
  });
});
