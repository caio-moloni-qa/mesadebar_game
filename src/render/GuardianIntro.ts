import * as THREE from 'three';
import { MINI_BOSSES, MiniBossKind } from '../core/systems/MiniBossSystem';
import { EnemyState } from '../core/session/entities';
import { simToWorld } from './space';

/** Seconds: the camera travels to the guardian, holds while it rises (MiniBossViews plays the intro), comes back. */
const PAN_IN = 0.9;
const HOLD = 2.6;
const PAN_OUT = 0.8;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** A guardian's entrance: the simulation holds (session.revealing) while the camera pans to it, it climbs out of the
 *  ground under a title card and the camera returns to the hero. */
export class GuardianIntro {
  private readonly bars: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private enemy: EnemyState | null = null;
  private elapsed = 0;
  private readonly bossPoint = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();

  /** `onDone`: the scene is over (the camera is back on the hero). */
  constructor(container: HTMLElement, private readonly onDone: () => void) {
    this.bars = document.createElement('div');
    this.bars.className = 'cinematic-bars';
    this.bars.hidden = true;
    this.bars.innerHTML = '<i></i><i></i>';
    this.title = document.createElement('div');
    this.title.className = 'cinematic-title';
    this.title.hidden = true;
    container.append(this.bars, this.title);
  }

  /** The camera is the scene's (the guardian should play its entrance). */
  get filming(): boolean {
    return this.enemy !== null;
  }

  start(kind: MiniBossKind, enemy: EnemyState): void {
    this.enemy = enemy;
    this.elapsed = 0;
    this.bars.hidden = false;
    this.title.innerHTML = `<strong></strong><span></span>`;
    this.title.querySelector('strong')!.textContent = MINI_BOSSES[kind].name;
    this.title.querySelector('span')!.textContent = `desperta ${MINI_BOSSES[kind].where}`;
    requestAnimationFrame(() => this.bars.classList.add('shown'));
  }

  /** Jumps to the trip back (Esc / Enter / Space). */
  skip(): void {
    if (this.enemy && this.elapsed < PAN_IN + HOLD) this.elapsed = PAN_IN + HOLD;
  }

  /** Advances the scene; returns where the camera should look (null when it's the hero's again). */
  update(deltaSeconds: number, hero: THREE.Vector3): THREE.Vector3 | null {
    if (!this.enemy) return null;
    this.elapsed += deltaSeconds;
    simToWorld(this.enemy.x, this.enemy.y, 0, this.bossPoint);
    const t = this.elapsed;
    this.title.hidden = !(t > PAN_IN * 0.6 && t < PAN_IN + HOLD);
    if (t >= PAN_IN + HOLD + PAN_OUT) {
      this.enemy = null;
      this.bars.classList.remove('shown');
      this.bars.hidden = true;
      this.title.hidden = true;
      this.onDone();
      return null;
    }
    const toward = t < PAN_IN ? smooth(t / PAN_IN) : t < PAN_IN + HOLD ? 1 : 1 - smooth((t - PAN_IN - HOLD) / PAN_OUT);
    return this.focus.copy(hero).lerp(this.bossPoint, toward);
  }

  /** A new session (restart, back to the tavern): drop whatever was playing. */
  reset(): void {
    this.enemy = null;
    this.bars.classList.remove('shown');
    this.bars.hidden = this.title.hidden = true;
  }
}
