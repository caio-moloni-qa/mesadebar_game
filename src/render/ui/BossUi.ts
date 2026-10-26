import * as THREE from 'three';
import { BOSS_TUNING } from '../../core/systems/BossSystem';
import { MINI_BOSSES } from '../../core/systems/MiniBossSystem';
import { GameSession, PortalKind } from '../../core/session/GameSession';
import { simToWorld } from '../space';
import { Projector } from './FloatingTexts';

const MAX_BARS = 3;
const MAX_ARROWS = 6;
const FINAL_WARNING = 'O sobrevivente sente uma presença maligna no ar!';
/** Arrows sit this far in from the screen edge (CSS px at 720 px tall, like the Phaser 48). */
const ARROW_MARGIN = 48;

/** The boss fight's DOM layer (Phaser: BossSystem.warn / countdownText / updateArrows, GameScene portal prompts):
 *  the warning banner, a health + shield bar per boss with the main boss's arena countdown, arrows pointing at
 *  off-screen bosses and portals, and the "Pressione E" portal prompt (also tappable). */
export class BossUi {
  private readonly root: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly bars: HTMLDivElement;
  private readonly prompt: HTMLButtonElement;
  private readonly arrows: HTMLDivElement[] = [];
  private readonly last = new Map<string, string>();
  private readonly world = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };

  constructor(private readonly container: HTMLElement, onInteract: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'boss-ui';
    this.root.innerHTML = `
      <div class="boss-banner" hidden>O sobrevivente sente uma presença maligna no ar!</div>
      <div class="boss-bars"></div>
      <button type="button" class="portal-prompt" hidden></button>`;
    this.banner = this.root.querySelector('.boss-banner')!;
    this.bars = this.root.querySelector('.boss-bars')!;
    this.prompt = this.root.querySelector('.portal-prompt')!;
    this.prompt.addEventListener('click', onInteract);
    for (let index = 0; index < MAX_ARROWS; index += 1) {
      const arrow = document.createElement('div');
      arrow.className = 'offscreen-arrow';
      arrow.hidden = true;
      this.root.appendChild(arrow);
      this.arrows.push(arrow);
    }
    container.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(session: GameSession, project: Projector): void {
    const { bosses, miniBosses } = session;
    // The Necromancer's warning, or a zone guardian's ("O Coveiro desperta no cemitério!").
    const pending = miniBosses.pending ? MINI_BOSSES[miniBosses.pending.kind] : null;
    const banner = bosses.warningActive ? FINAL_WARNING : pending ? `${pending.name} desperta ${pending.where}!` : '';
    if (this.last.get('bannerText') !== banner) {
      this.last.set('bannerText', banner);
      if (banner) this.banner.textContent = banner;
      this.banner.classList.toggle('mini', !bosses.warningActive && !!pending);
    }
    this.toggle('banner', this.banner, banner !== '');
    this.updateBars(session);
    this.updatePrompt(session, project);
    this.updateArrows(session, project);
  }

  private updateBars(session: GameSession): void {
    const shown = session.bosses.bosses.slice(0, MAX_BARS);
    const guardians = session.miniBosses.bosses.slice(0, Math.max(0, MAX_BARS - shown.length));
    const guardianKey = guardians.map((boss) => `${boss.kind}:${Math.ceil(boss.enemy.health)}/${Math.ceil(boss.enemy.maxHealth)}`).join(';');
    const key = guardianKey + '#' + shown.map((boss) => {
      const countdown = boss.isMain && boss.cleanupPending ? Math.ceil(Math.max(0, BOSS_TUNING.cleanupMs - boss.cleanupElapsed) / 1000) : -1;
      return `${Math.ceil(boss.enemy.health)}/${boss.enemy.maxHealth}|${boss.shieldActive ? Math.ceil(boss.shield) : -1}/${Math.ceil(boss.maxShield)}|${countdown}`;
    }).join(';');
    if (this.last.get('bars') === key) return;
    this.last.set('bars', key);
    const guardianBars = guardians.map((boss) => {
      const bar = document.createElement('div');
      bar.className = 'boss-bar mini';
      const health = Math.max(0, boss.enemy.health / boss.enemy.maxHealth) * 100;
      bar.innerHTML = `<p class="boss-name">${MINI_BOSSES[boss.kind].name}</p><div class="boss-health"><div style="width:${health}%"></div><span>${Math.ceil(Math.max(0, boss.enemy.health))} / ${Math.ceil(boss.enemy.maxHealth)}</span></div>`;
      return bar;
    });
    this.bars.replaceChildren(...guardianBars, ...shown.map((boss) => {
      const bar = document.createElement('div');
      bar.className = 'boss-bar';
      const health = Math.max(0, boss.enemy.health / boss.enemy.maxHealth) * 100;
      const shield = boss.shieldActive && boss.maxShield > 0 ? (boss.shield / boss.maxShield) * 100 : 0;
      const countdown = boss.isMain && boss.cleanupPending ? Math.ceil(Math.max(0, BOSS_TUNING.cleanupMs - boss.cleanupElapsed) / 1000) : null;
      bar.innerHTML = `
        ${countdown !== null ? `<p class="boss-countdown">A escuridão consome a arena em ${countdown}s</p>` : ''}
        <div class="boss-health"><div style="width:${health}%"></div><span>${Math.ceil(Math.max(0, boss.enemy.health))} / ${boss.enemy.maxHealth}</span></div>
        ${boss.shieldActive ? `<div class="boss-shield"><div style="width:${shield}%"></div></div>` : ''}`;
      return bar;
    }));
  }

  private updatePrompt(session: GameSession, project: Projector): void {
    const kind = session.portalInReach;
    const portal = kind ? session.portals?.[kind] : undefined;
    if (!kind || !portal || !project(simToWorld(portal.x, portal.y, 3.6, this.world), this.screen)) {
      this.toggle('prompt', this.prompt, false);
      return;
    }
    this.toggle('prompt', this.prompt, true);
    const text = this.promptText(session, kind);
    if (this.last.get('promptText') !== text) {
      this.last.set('promptText', text);
      this.prompt.textContent = text;
    }
    this.prompt.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -100%)`;
  }

  private promptText(session: GameSession, kind: PortalKind): string {
    if (kind === 'end') return 'Pressione E para encerrar a run';
    const next = session.bossCycle + 1;
    return `Pressione E para continuar — Ciclo ${next} (${Math.round(session.phaseDurationMs(next) / 60000)}min, dificuldade ${next}x, ${next} bosses)`;
  }

  /** Arrow at the screen edge towards every boss (white) and portal (its colour) that's off screen. */
  private updateArrows(session: GameSession, project: Projector): void {
    const targets: Array<{ x: number; y: number; kind: string }> = session.bosses.bosses.map((boss) => ({ x: boss.enemy.x, y: boss.enemy.y, kind: 'boss' }));
    session.miniBosses.bosses.forEach((boss) => targets.push({ x: boss.enemy.x, y: boss.enemy.y, kind: 'miniboss' }));
    // While a guardian is announced, point at its zone.
    if (session.miniBosses.pending) targets.push({ ...MINI_BOSSES[session.miniBosses.pending.kind].anchor, kind: 'miniboss' });
    if (session.portals) targets.push({ ...session.portals.end, kind: 'end' }, { ...session.portals.continue, kind: 'continue' });
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const unit = Math.min(width / 1280, height / 720);
    const margin = ARROW_MARGIN * unit;
    this.arrows.forEach((arrow, index) => {
      const target = targets[index];
      if (!target) { arrow.hidden = true; return; }
      project(simToWorld(target.x, target.y, 1, this.world), this.screen, true);
      const onScreen = this.screen.x >= 0 && this.screen.x <= width && this.screen.y >= 0 && this.screen.y <= height;
      arrow.hidden = onScreen;
      if (onScreen) return;
      const x = Math.min(width - margin, Math.max(margin, this.screen.x));
      const y = Math.min(height - margin, Math.max(margin, this.screen.y));
      const angle = Math.atan2(this.screen.y - height / 2, this.screen.x - width / 2);
      arrow.dataset.kind = target.kind;
      arrow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad)`;
    });
  }

  private toggle(key: string, element: HTMLElement, visible: boolean): void {
    const value = String(visible);
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    element.hidden = !visible;
  }
}
