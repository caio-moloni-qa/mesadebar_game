import * as THREE from 'three';
import { CharacterId } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { PlayerState } from '../../core/session/entities';
import { HeroClipName } from '../models/clips';
import { HeroModel, createHeroModel } from '../models/heroes';
import { simToWorld, yawFromSimDirection } from '../space';

const TURN_SHARPNESS = 10;
const DAMAGE_FLASH_MS = 160;
const LOCOMOTION_FADE = 0.25;
/** Run cycle plays at 1× at this speed (game units/s) and scales with the hero's actual speed. */
const RUN_REFERENCE_SPEED = 200;

export type HeroAction = Extract<HeroClipName, 'swing' | 'cast' | 'throw' | 'pulse' | 'hit'>;

/** The animated hero: procedural rigged model + AnimationMixer. Idle/run crossfade from movement; attacks and hit
 *  reactions are additive one-shots layered on top, so they never interrupt the legs. */
export class HeroView {
  readonly root = new THREE.Group();
  private readonly model: HeroModel;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<HeroClipName, THREE.AnimationAction>;
  private locomotion: 'idle' | 'run' = 'idle';
  private dead = false;
  private yaw = 0;
  private readonly position = new THREE.Vector3();

  constructor(characterId: CharacterId, weaponId: WeaponConfig['id']) {
    this.model = createHeroModel(characterId, weaponId);
    this.root.add(this.model.root);
    this.mixer = new THREE.AnimationMixer(this.model.root);
    this.actions = Object.fromEntries(Object.entries(this.model.clips).map(([name, clip]) => [name, this.mixer.clipAction(clip)])) as Record<HeroClipName, THREE.AnimationAction>;
    (['swing', 'cast', 'throw', 'pulse', 'hit'] as const).forEach((name) => {
      this.actions[name].setLoop(THREE.LoopOnce, 1);
    });
    this.actions.death.setLoop(THREE.LoopOnce, 1);
    this.actions.death.clampWhenFinished = true;
    this.actions.idle.play();
    this.actions.run.play().setEffectiveWeight(0);
  }

  /** Fire a one-shot (restarting it if it's already playing — fast attack speeds retrigger it). */
  play(action: HeroAction): void {
    if (this.dead) return;
    this.actions[action].reset().setEffectiveWeight(1).fadeIn(0.06).play();
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    Object.values(this.actions).forEach((action) => { if (action !== this.actions.death) action.fadeOut(0.15); });
    this.actions.death.reset().setEffectiveWeight(1).fadeIn(0.1).play();
  }

  /** `deltaSeconds` drives the mixer (0 while the run is frozen, so animations pause with it). */
  update(player: PlayerState, alpha: number, nowMs: number, deltaSeconds: number): void {
    const x = player.prevX + (player.x - player.prevX) * alpha;
    const y = player.prevY + (player.y - player.prevY) * alpha;
    simToWorld(x, y, 0, this.position);
    this.root.position.copy(this.position);

    const stepDistance = Math.hypot(player.x - player.prevX, player.y - player.prevY);
    const moving = stepDistance > 0.01;
    this.setLocomotion(moving ? 'run' : 'idle');
    if (moving && deltaSeconds > 0) this.actions.run.timeScale = Math.max(0.6, (stepDistance * 60) / RUN_REFERENCE_SPEED);

    if (!this.dead) {
      const targetYaw = yawFromSimDirection(player.facingX, player.facingY);
      this.yaw += Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw)) * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      this.root.rotation.y = this.yaw;
    }

    this.mixer.update(deltaSeconds);

    const flashing = nowMs - player.lastDamagedAt < DAMAGE_FLASH_MS;
    const emissive = flashing ? 0xaa1f1f : player.isSlowed(nowMs) ? 0x1f3f8a : 0x000000;
    (this.model.material as THREE.MeshToonMaterial).emissive.setHex(emissive);
  }

  private setLocomotion(next: 'idle' | 'run'): void {
    if (next === this.locomotion || this.dead) return;
    const from = this.actions[this.locomotion];
    const to = this.actions[next];
    // A finished fade-out leaves an action with enabled = false, and a disabled action contributes weight 0 no
    // matter what setEffectiveWeight says — so after the first idle→run→idle the next run never came back and the
    // legs froze. reset() re-enables it (and restarts the cycle) before fading it back in.
    to.reset().setEffectiveWeight(1).play();
    from.crossFadeTo(to, LOCOMOTION_FADE, false);
    this.locomotion = next;
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }

  /** Frees the GPU geometry/material and the mixer's cached bindings (see threejs-skills audit). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
    this.root.removeFromParent();
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
    });
    this.model.material.dispose();
  }
}
