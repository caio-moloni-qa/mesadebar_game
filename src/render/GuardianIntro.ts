import * as THREE from 'three';
import { MINI_BOSSES, MiniBossKind } from '../core/systems/MiniBossSystem';
import { EnemyState } from '../core/session/entities';
import { npcPortrait } from './ui/icons';
import { simToWorld } from './space';

/** Seconds: the camera travels to the guardian, holds while it rises (MiniBossViews plays the intro), comes back. */
const PAN_IN = 0.9;
const HOLD = 2.6;
const PAN_OUT = 0.8;

/** What Sergio tells a first-timer about guardians (shown once per save). */
const TIP = {
  text: 'Um guardião de zona acordou! Eles são duros, mas vale a pena: enquanto ele estiver de pé, a horda diminui, então foque nele.',
  details: [
    ['Ao derrotar', 'um baú com uma melhoria e uma chuva de cristais de experiência.'],
    ['Companheiro', 'você escolhe um aliado da zona para lutar ao seu lado (ou sobe o nível de um que já tem).'],
    ['O Necromante', 'cada guardião derrotado deixa o chefe final mais fraco: menos vida e menos raios.'],
    ['No fim da partida', '+25 Fichas por guardião.'],
    ['Cuidado', 'se você o arrastar para longe da zona dele, ele volta para casa e se cura.']
  ]
} as const;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** A guardian's entrance: the simulation holds (session.revealing) while the camera pans to it, it climbs out of the
 *  ground under a title card and the camera returns to the hero. The first time in a save, Sergio then explains what
 *  a guardian is worth; play resumes when that's dismissed. */
export class GuardianIntro {
  private readonly bars: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly tip: HTMLDivElement;
  private enemy: EnemyState | null = null;
  private elapsed = 0;
  private tipOpen = false;
  private readonly bossPoint = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();

  /** `onDone(tipRead)`: the scene is over and play may resume; `tipRead` when Sergio's tip was shown and dismissed. */
  constructor(container: HTMLElement, private readonly onDone: (tipRead: boolean) => void) {
    this.bars = document.createElement('div');
    this.bars.className = 'cinematic-bars';
    this.bars.hidden = true;
    this.bars.innerHTML = '<i></i><i></i>';
    this.title = document.createElement('div');
    this.title.className = 'cinematic-title';
    this.title.hidden = true;
    this.tip = document.createElement('div');
    this.tip.className = 'tavern-dialog guardian-tip';
    this.tip.hidden = true;
    this.tip.setAttribute('role', 'dialog');
    this.tip.setAttribute('aria-label', 'Dica do Sergio');
    container.append(this.bars, this.title, this.tip);
  }

  /** The scene (or Sergio's tip) is holding the game. */
  get active(): boolean {
    return this.enemy !== null || this.tipOpen;
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
  update(deltaSeconds: number, hero: THREE.Vector3, showTip: boolean): THREE.Vector3 | null {
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
      if (showTip) this.openTip();
      else this.onDone(false);
      return null;
    }
    const toward = t < PAN_IN ? smooth(t / PAN_IN) : t < PAN_IN + HOLD ? 1 : 1 - smooth((t - PAN_IN - HOLD) / PAN_OUT);
    return this.focus.copy(hero).lerp(this.bossPoint, toward);
  }

  private openTip(): void {
    this.tipOpen = true;
    this.tip.innerHTML = `
      <div class="dialog-portrait"><img alt=""></div>
      <div class="dialog-body">
        <p class="dialog-name">Sergio <span>Taberneiro e mercador</span></p>
        <p class="eyebrow dialog-title">Dica</p>
        <p class="dialog-text"></p>
        <ul class="dialog-details"></ul>
        <div class="dialog-actions"><button type="button" class="ui-button primary">Entendi (Enter)</button></div>
      </div>`;
    this.tip.querySelector('img')!.src = npcPortrait('sergio') ?? '';
    this.tip.querySelector('.dialog-text')!.textContent = `“${TIP.text}”`;
    const details = this.tip.querySelector('.dialog-details')!;
    TIP.details.forEach(([label, text]) => {
      const item = document.createElement('li');
      const bold = document.createElement('b');
      bold.textContent = `${label}: `;
      item.append(bold, text);
      details.append(item);
    });
    const button = this.tip.querySelector('button')!;
    button.addEventListener('click', () => this.closeTip());
    this.tip.hidden = false;
    button.focus({ preventScroll: true });
  }

  closeTip(): void {
    if (!this.tipOpen) return;
    this.tipOpen = false;
    this.tip.hidden = true;
    this.onDone(true);
  }

  /** A new session (restart, back to the tavern): drop whatever was playing. */
  reset(): void {
    this.enemy = null;
    this.tipOpen = false;
    this.bars.classList.remove('shown');
    this.bars.hidden = this.title.hidden = this.tip.hidden = true;
  }
}
