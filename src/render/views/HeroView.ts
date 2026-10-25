import * as THREE from 'three';
import { CharacterId } from '../../config/characters';
import { WeaponConfig } from '../../config/weapons';
import { PlayerState } from '../../core/session/entities';
import { HAND_ATTACKS, HandAttack, HeroClipName } from '../models/clips';
import { HeroModel, attachWeapons, createHeroModel } from '../models/heroes';
import { WeaponModelId } from '../models/weapons';
import { simToWorld, yawFromSimDirection } from '../space';
import { RelicGlow } from '../vfx/RelicGlow';

const TURN_SHARPNESS = 10;
const DAMAGE_FLASH_MS = 160;
const LOCOMOTION_FADE = 0.25;
/** Run cycle plays at 1× at this speed (game units/s) and scales with the hero's actual speed. */
const RUN_REFERENCE_SPEED = 200;

export type HeroAction = HandAttack | 'hit';
/** Weapon slot → hand: the first weapon is right-handed, the second left-handed. */
export type Hand = 'R' | 'L';

/** How long the upper body keeps facing an attack's target, and how far the spine may twist from the legs before
 *  the whole body turns with it. */
const AIM_HOLD_SECONDS = 0.45;
const MAX_TWIST = THREE.MathUtils.degToRad(70);
const TWIST_SHARPNESS = 18;

/** The animated hero: procedural rigged model + AnimationMixer. Idle/run crossfade from movement; attacks and hit
 *  reactions are additive one-shots layered on top, so they never interrupt the legs. */
export class HeroView {
  readonly root = new THREE.Group();
  /** Effects that follow the hero but render with the world, not in the character pass (Game3D adds it to the scene). */
  readonly effects = new THREE.Group();
  private readonly relicGlow = new RelicGlow();
  private readonly model: HeroModel;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<HeroClipName, THREE.AnimationAction>;
  private locomotion: 'idle' | 'run' = 'idle';
  private dead = false;
  private yaw = 0;
  private readonly position = new THREE.Vector3();
  private aimYaw = 0;
  private aimSeconds = 0;
  private twist = 0;

  constructor(characterId: CharacterId, weaponId: WeaponConfig['id']) {
    this.model = createHeroModel(characterId, weaponId);
    this.root.add(this.model.root);
    this.effects.add(this.relicGlow.root);
    this.mixer = new THREE.AnimationMixer(this.model.root);
    this.actions = Object.fromEntries(Object.entries(this.model.clips).map(([name, clip]) => [name, this.mixer.clipAction(clip)])) as Record<HeroClipName, THREE.AnimationAction>;
    ([...HAND_ATTACKS, ...HAND_ATTACKS.map((name) => `${name}L` as const), 'hit'] as const).forEach((name) => {
      this.actions[name].setLoop(THREE.LoopOnce, 1);
    });
    this.actions.death.setLoop(THREE.LoopOnce, 1);
    this.actions.death.clampWhenFinished = true;
    this.actions.idle.play();
    this.actions.run.play().setEffectiveWeight(0);
  }

  /** Face an attack's direction (sim coordinates) for a moment: the spine twists toward it while the legs keep
   *  running, and the whole body turns only for the part beyond MAX_TWIST. */
  aim(dirX: number, dirY: number): void {
    if (this.dead || (dirX === 0 && dirY === 0)) return;
    this.aimYaw = yawFromSimDirection(dirX, dirY);
    this.aimSeconds = AIM_HOLD_SECONDS;
  }

  /** Re-equips the hands (a second weapon arrived, or the boomerang turned into the banana). */
  setWeapons(ids: WeaponModelId[]): void {
    attachWeapons(this.model, ids);
  }

  setWeaponVisible(slot: number, visible: boolean): void {
    const weapon = this.model.held[slot];
    if (weapon) weapon.visible = visible;
  }

  /** Fire a one-shot (restarting it if it's already playing — fast attack speeds retrigger it). */
  play(action: HeroAction, hand: Hand = 'R'): void {
    if (this.dead) return;
    const name: HeroClipName = action === 'hit' || hand === 'R' ? action : `${action}L`;
    this.actions[name].reset().setEffectiveWeight(1).fadeIn(0.06).play();
    // The hand gripping the relic glows with the tick.
    if (action === 'pulse') this.relicGlow.flash(hand === 'L' ? this.model.bones.handL : this.model.bones.handR);
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

    const aiming = !this.dead && this.aimSeconds > 0;
    if (!this.dead) {
      let targetYaw = yawFromSimDirection(player.facingX, player.facingY);
      if (aiming) {
        const beyond = wrapAngle(this.aimYaw - targetYaw);
        if (Math.abs(beyond) > MAX_TWIST) targetYaw = this.aimYaw - Math.sign(beyond) * MAX_TWIST;
      }
      this.yaw += wrapAngle(targetYaw - this.yaw) * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      this.root.rotation.y = this.yaw;
    }
    this.aimSeconds = Math.max(0, this.aimSeconds - deltaSeconds);

    this.mixer.update(deltaSeconds);
    // The clips never key the spine, so the twist is written straight onto it after the mixer.
    const twistTarget = aiming ? THREE.MathUtils.clamp(wrapAngle(this.aimYaw - this.yaw), -MAX_TWIST, MAX_TWIST) : 0;
    this.twist += (twistTarget - this.twist) * (1 - Math.exp(-TWIST_SHARPNESS * deltaSeconds));
    if (this.model.bones.spine) this.model.bones.spine.rotation.y = this.twist;
    this.model.root.updateMatrixWorld();
    this.relicGlow.update(deltaSeconds);

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
    this.relicGlow.dispose();
    this.effects.removeFromParent();
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
    });
    this.model.material.dispose();
  }
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
