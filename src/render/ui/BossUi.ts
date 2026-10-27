import * as THREE from 'three';
import { BOSS_TUNING } from '../../core/systems/BossSystem';
import { MERCHANT_ROOM, MERCHANT_TUNING } from '../../core/systems/MerchantSystem';
import { MINI_BOSSES } from '../../core/systems/MiniBossSystem';
import { GameSession, PortalKind } from '../../core/session/GameSession';
import { WORLD_SCALE, simToWorld } from '../space';
import { MarkerKind, markerFace, npcPortrait } from './icons';
import { Projector } from './FloatingTexts';

const MAX_BARS = 3;
const MAX_ARROWS = 12;
const FINAL_WARNING = 'O sobrevivente sente uma presença maligna no ar!';
const MERCHANT_NEWS = 'Um portal para a taverna surgiu na arena!';
/** Markers stay this far in from the screen edges (CSS px at 720 px tall), clear of the HUD: the vitals and timer
 *  along the top, the build tray and XP rail along the bottom. */
const MARKER_MARGIN = { side: 70, top: 140, bottom: 120 };

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
      // A portrait of whoever it points to, in a ring, with the arrow riding the ring's rim, and the distance.
      const marker = document.createElement('div');
      marker.className = 'offscreen-marker';
      marker.hidden = true;
      marker.innerHTML = '<div class="marker-pointer"><span></span></div><div class="marker-ring"><img alt=""></div><b class="marker-distance"></b>';
      this.root.appendChild(marker);
      this.arrows.push(marker);
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
    // A freshly opened merchant portal gets a few seconds of banner too.
    const portal = session.merchant.portal;
    const portalNews = !!portal && !session.merchant.inside && portal.remainingMs > MERCHANT_TUNING.portalOpenMs - 3500;
    const banner = bosses.warningActive ? FINAL_WARNING : pending ? `${pending.name} desperta ${pending.where}!` : portalNews ? MERCHANT_NEWS : '';
    if (this.last.get('bannerText') !== banner) {
      this.last.set('bannerText', banner);
      if (banner) this.banner.textContent = banner;
      // Sergio himself announces his tavern.
      const sergio = npcPortrait('sergio');
      if (banner === MERCHANT_NEWS && sergio) {
        const face = document.createElement('img');
        face.className = 'banner-portrait';
        face.src = sergio;
        face.alt = '';
        this.banner.prepend(face);
      }
      this.banner.classList.toggle('mini', !bosses.warningActive && !!pending);
      this.banner.classList.toggle('merchant', banner === MERCHANT_NEWS);
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
    const merchant = this.merchantPrompt(session);
    if (merchant) {
      const shown = project(simToWorld(merchant.x, merchant.y, 3.2, this.world), this.screen);
      this.toggle('prompt', this.prompt, shown);
      if (!shown) return;
      if (this.last.get('promptText') !== merchant.text) {
        this.last.set('promptText', merchant.text);
        this.prompt.textContent = merchant.text;
      }
      this.prompt.classList.toggle('poor', merchant.poor);
      this.prompt.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -100%)`;
      return;
    }
    this.prompt.classList.remove('poor');
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

  /** The merchant's prompts: his arena portal, Sergio's store, a regular, or the way back. */
  private merchantPrompt(session: GameSession): { x: number; y: number; text: string; poor: boolean } | null {
    const { merchant } = session;
    if (merchant.portalInReach && merchant.portal) return { ...merchant.portal, text: 'Pressione E para entrar no portal', poor: false };
    const spot = merchant.roomSpot;
    if (!spot) return null;
    if (spot.kind === 'exit') return { x: merchant.room.x + MERCHANT_ROOM.exit.x, y: merchant.room.y + MERCHANT_ROOM.exit.y, text: merchant.hub ? 'Pressione E para escolher o herói e partir' : 'Pressione E para voltar à arena', poor: false };
    if (spot.kind === 'records') {
      return { x: merchant.room.x + MERCHANT_ROOM.records.x, y: merchant.room.y + MERCHANT_ROOM.records.y, text: 'Pressione E para ler o livro de recordes', poor: false };
    }
    if (spot.kind === 'sergio') {
      if (session.dialogue !== null) return null;
      return { x: merchant.room.x + MERCHANT_ROOM.merchant.x, y: merchant.room.y + MERCHANT_ROOM.merchant.y, text: 'Pressione E para ver a loja do Sergio', poor: false };
    }
    if (spot.kind === 'npc') {
      if (session.dialogue !== null) return null;
      const npc = MERCHANT_ROOM.npcs[spot.index];
      return { x: merchant.room.x + npc.x, y: merchant.room.y + npc.y, text: `Pressione E para falar com ${session.quests.quests[spot.index].npc.name}`, poor: false };
    }
    return null;
  }

  private promptText(session: GameSession, kind: PortalKind): string {
    if (kind === 'end') return 'Pressione E para encerrar a run';
    const next = session.bossCycle + 1;
    return `Pressione E para continuar — Ciclo ${next} (${Math.round(session.phaseDurationMs(next) / 60000)}min, dificuldade ${next}x, ${next} bosses)`;
  }

  /** A marker at the screen edge for every boss, guardian (or the zone of one being announced) and portal that's
   *  off screen: their face in a ring, an arrow on the rim pointing the way, and how far it is. */
  private updateArrows(session: GameSession, project: Projector): void {
    // Nothing out there to point at from the merchant's room.
    const targets: Array<{ x: number; y: number; kind: MarkerKind; tier: string }> = session.merchant.inside ? [] : session.bosses.bosses.map((boss) => ({ x: boss.enemy.x, y: boss.enemy.y, kind: 'boss' as const, tier: 'boss' }));
    session.miniBosses.bosses.forEach((boss) => targets.push({ x: boss.enemy.x, y: boss.enemy.y, kind: boss.kind, tier: 'miniboss' }));
    // While a guardian is announced, point at its zone.
    if (session.miniBosses.pending) targets.push({ ...MINI_BOSSES[session.miniBosses.pending.kind].anchor, kind: session.miniBosses.pending.kind, tier: 'miniboss' });
    if (session.portals) targets.push({ ...session.portals.end, kind: 'end', tier: 'end' }, { ...session.portals.continue, kind: 'continue', tier: 'continue' });
    if (session.merchant.portal && !session.merchant.inside) targets.push({ x: session.merchant.portal.x, y: session.merchant.portal.y, kind: 'merchant', tier: 'merchant' });
    const prophecy = session.merchant.inside ? null : session.prophecy();
    if (prophecy) targets.push({ x: prophecy.x, y: prophecy.y, kind: prophecy.kind, tier: 'prophecy' });
    if (!session.merchant.inside) session.quests.barrels.forEach((barrel) => targets.push({ ...barrel, kind: 'barrel', tier: 'quest' }));
    const { player } = session;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const unit = Math.min(width / 1280, height / 720);
    const margin = { side: MARKER_MARGIN.side * unit, top: MARKER_MARGIN.top * unit, bottom: MARKER_MARGIN.bottom * unit };
    this.arrows.forEach((arrow, index) => {
      const target = targets[index];
      if (!target) { arrow.hidden = true; return; }
      project(simToWorld(target.x, target.y, 1, this.world), this.screen, true);
      const onScreen = this.screen.x >= 0 && this.screen.x <= width && this.screen.y >= 0 && this.screen.y <= height;
      arrow.hidden = onScreen;
      if (onScreen) return;
      const x = Math.min(width - margin.side, Math.max(margin.side, this.screen.x));
      const y = Math.min(height - margin.bottom, Math.max(margin.top, this.screen.y));
      const angle = Math.atan2(this.screen.y - height / 2, this.screen.x - width / 2);
      if (arrow.dataset.kind !== target.kind) {
        arrow.dataset.kind = target.kind;
        arrow.dataset.tier = target.tier;
        arrow.querySelector('img')!.src = markerFace(target.kind);
      }
      const meters = `${Math.round(Math.hypot(target.x - player.x, target.y - player.y) * WORLD_SCALE)} m`;
      const distance = arrow.querySelector<HTMLElement>('.marker-distance')!;
      if (distance.textContent !== meters) distance.textContent = meters;
      arrow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      arrow.querySelector<HTMLElement>('.marker-pointer')!.style.transform = `rotate(${angle}rad)`;
    });
  }

  private toggle(key: string, element: HTMLElement, visible: boolean): void {
    const value = String(visible);
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    element.hidden = !visible;
  }
}
