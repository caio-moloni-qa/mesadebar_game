import { GameSession } from '../core/session/GameSession';

export interface RenderStats { fps: number; drawCalls: number; triangles: number; pixelScale: number; }

/** Minimal DOM HUD for the vertical slice (the full themed HUD is Etapa 4). Writes to the DOM only when a value
 *  actually changes, so it costs nothing on frames where nothing moved. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly fields: Record<'health' | 'level' | 'time' | 'kills' | 'currency' | 'weapons' | 'stats' | 'banner', HTMLElement>;
  private readonly healthFill: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly last = new Map<string, string>();
  private readonly bannerBox: HTMLDivElement;

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  constructor(container: HTMLElement, onRestart: () => void, onMenu: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-bar hud-health"><div class="hud-fill"></div><span data-field="health"></span></div>
        <div class="hud-bar hud-xp"><div class="hud-fill"></div></div>
        <div class="hud-line"><span data-field="level"></span> · <span data-field="currency"></span></div>
        <div class="hud-weapons" data-field="weapons"></div>
      </div>
      <div class="hud-top-right"><span data-field="time"></span><span data-field="kills"></span></div>
      <div class="hud-stats" data-field="stats"></div>
      <div class="hud-banner" hidden><p data-field="banner"></p><div class="hud-banner-actions"><button type="button" data-action="restart">Recomeçar (R)</button><button type="button" data-action="menu">Menu (M)</button></div></div>
    `;
    container.appendChild(this.root);
    const field = (name: string) => this.root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    this.fields = { health: field('health'), level: field('level'), time: field('time'), kills: field('kills'), currency: field('currency'), weapons: field('weapons'), stats: field('stats'), banner: field('banner') };
    this.healthFill = this.root.querySelector<HTMLDivElement>('.hud-health .hud-fill')!;
    this.xpFill = this.root.querySelector<HTMLDivElement>('.hud-xp .hud-fill')!;
    this.bannerBox = this.root.querySelector<HTMLDivElement>('.hud-banner')!;
    this.root.querySelector('[data-action="restart"]')!.addEventListener('click', onRestart);
    this.root.querySelector('[data-action="menu"]')!.addEventListener('click', onMenu);
  }

  update(session: GameSession, stats: RenderStats): void {
    const { player } = session;
    const seconds = Math.floor(session.elapsedMs / 1000);
    this.set('health', `${Math.ceil(player.health)} / ${player.maxHealth}`);
    this.setWidth('healthPct', this.healthFill, player.health / player.maxHealth);
    this.setWidth('xpPct', this.xpFill, session.experience / session.experienceNeeded);
    this.set('level', `Nível ${session.level}`);
    this.set('currency', `◆ ${session.currency}`);
    this.set('time', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    this.set('kills', `☠ ${session.kills}`);
    this.set('weapons', session.weapons.weapons.map((weapon) => `${weapon.config.name} +${weapon.upgradeCount}`).join(' · '));
    this.set('stats', `${stats.fps} fps · ${stats.drawCalls} draws · ${(stats.triangles / 1000).toFixed(0)}k tris · ${session.enemies.activeCount} inimigos · ${stats.pixelScale}×`);
    const banner = session.over ? 'DERROTA' : session.paused ? 'PAUSADO — ESC para continuar' : '';
    this.set('banner', banner);
    // Restart / menu buttons live inside the box, so they show on game over and on the pause screen.
    this.bannerBox.hidden = banner === '';
  }

  private set(name: keyof Hud['fields'], text: string): void {
    if (this.last.get(name) === text) return;
    this.last.set(name, text);
    this.fields[name].textContent = text;
  }

  private setWidth(key: string, element: HTMLElement, ratio: number): void {
    const value = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    element.style.width = value;
  }
}
