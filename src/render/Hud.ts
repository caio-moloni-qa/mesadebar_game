import { GameSession } from '../core/session/GameSession';
import { HUD_ART, LIFE_STEAL_ICON, upgradeIcon, weaponIcon } from './ui/icons';

export interface RenderStats { fps: number; drawCalls: number; triangles: number; pixelScale: number; geometries: number; textures: number; }

/** The run HUD, laid out like the Phaser build's GameHud (1280×720 coordinates scaled by --ui-unit): build icons over
 *  the HP bar with its art border, level, crystals and the Aura Podre status row top-left; kills and survival time
 *  top-right; the XP bar across the bottom. Writes to the DOM only when a value actually changes. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly fields: Record<'health' | 'level' | 'time' | 'kills' | 'currency' | 'stats', HTMLElement>;
  private readonly healthFill: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly build: HTMLDivElement;
  private readonly rotten: HTMLDivElement;
  private readonly last = new Map<string, string>();

  /** `showStats` shows the renderer counters (fps, draws, tris); they're always written, so tools can read them. */
  constructor(container: HTMLElement, showStats = false) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-build"></div>
        <div class="hud-health">
          <img class="hud-health-icon" src="${HUD_ART.hpIcon}" alt="">
          <div class="hud-health-bar"><div class="hud-fill"></div><img src="${HUD_ART.hpBarBorder}" alt=""><span data-field="health"></span></div>
        </div>
        <div class="hud-level" data-field="level"></div>
        <div class="hud-currency">
          <img src="${HUD_ART.gem}" alt=""><span data-field="currency"></span>
          <div class="hud-rotten" hidden><img src="${LIFE_STEAL_ICON}" alt="Cura reduzida"><b>↓</b><span>HP</span><b>↓</b></div>
        </div>
      </div>
      <div class="hud-top-right"><span data-field="kills"></span><span data-field="time"></span></div>
      <div class="hud-xp"><div class="hud-xp-track"><div class="hud-fill"></div></div><img src="${HUD_ART.expBarBorder}" alt=""></div>
      <div class="hud-stats" data-field="stats"${showStats ? '' : ' hidden'}></div>
    `;
    container.appendChild(this.root);
    const field = (name: string) => this.root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    this.fields = { health: field('health'), level: field('level'), time: field('time'), kills: field('kills'), currency: field('currency'), stats: field('stats') };
    this.healthFill = this.root.querySelector<HTMLDivElement>('.hud-health-bar .hud-fill')!;
    this.xpFill = this.root.querySelector<HTMLDivElement>('.hud-xp .hud-fill')!;
    this.build = this.root.querySelector<HTMLDivElement>('.hud-build')!;
    this.rotten = this.root.querySelector<HTMLDivElement>('.hud-rotten')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(session: GameSession, stats: RenderStats): void {
    const { player } = session;
    const seconds = Math.floor(session.elapsedMs / 1000);
    this.set('health', `${Math.ceil(player.health)} / ${player.maxHealth}`);
    this.setWidth('healthPct', this.healthFill, player.health / player.maxHealth);
    this.setWidth('xpPct', this.xpFill, session.experience / session.experienceNeeded);
    this.set('level', `Nível ${session.level}`);
    this.set('currency', `${session.currency}`);
    this.set('time', `Sobreviva: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    this.set('kills', `Eliminações: ${session.kills}`);
    this.set('stats', `${stats.fps} fps · ${stats.drawCalls} draws · ${(stats.triangles / 1000).toFixed(0)}k tris · ${session.enemies.activeCount} inimigos · ${stats.pixelScale}× · ${stats.geometries} geo · ${stats.textures} tex`);
    const rotten = player.isRotten(session.clock.now);
    if (this.last.get('rotten') !== String(rotten)) {
      this.last.set('rotten', String(rotten));
      this.rotten.hidden = !rotten;
    }
    this.updateBuild(session);
  }

  /** Weapons first (the banana icon once Fabri's boomerang transforms), then each picked upgrade with a ×N counter. */
  private updateBuild(session: GameSession): void {
    const weapons = session.weapons.weapons.map((weapon) => ({ icon: weaponIcon(session.weapons.isBananaTransformActive(weapon) ? 'banana' : weapon.config.id), count: 1, title: weapon.config.name }));
    const upgrades = [...session.selectedUpgradeCounts.entries()].map(([id, count]) => ({ icon: upgradeIcon(id), count, title: id }));
    const items = [...weapons, ...upgrades];
    const key = items.map((item) => `${item.icon}×${item.count}`).join('|');
    if (this.last.get('build') === key) return;
    this.last.set('build', key);
    this.build.replaceChildren(...items.map(({ icon, count, title }) => {
      const slot = document.createElement('div');
      slot.className = 'hud-build-slot';
      slot.title = title;
      slot.innerHTML = `<img src="${icon}" alt="">${count > 1 ? `<span>×${count}</span>` : ''}`;
      return slot;
    }));
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
