import { GameSession } from '../core/session/GameSession';
import { COMPANIONS } from '../core/systems/CompanionSystem';
import { SNOWFIELD_QUEST_NPCS } from '../core/systems/QuestSystem';
import { HUD_ART, LIFE_STEAL_ICON, companionIcon, upgradeIcon, weaponIcon } from './ui/icons';
import { progressText } from './ui/questText';

export interface RenderStats { fps: number; drawCalls: number; triangles: number; pixelScale: number; geometries: number; textures: number; }

/** Compact run HUD: vitals, centered timer, counters, build tray and experience rail.
 * Writes to the DOM only when a value actually changes. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly fields: Record<'health' | 'level' | 'time' | 'kills' | 'currency' | 'stats', HTMLElement>;
  private readonly healthFill: HTMLDivElement;
  private readonly shieldFill: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly build: HTMLDivElement;
  private readonly rotten: HTMLDivElement;
  private readonly cold: HTMLDivElement;
  private readonly coldFill: HTMLDivElement;
  private readonly frostVignette: HTMLDivElement;
  /** The storm's whiteout thickening over the field while it blows. */
  private readonly blizzardHaze: HTMLDivElement;
  private readonly questList: HTMLUListElement;
  private readonly last = new Map<string, string>();

  /** `showStats` shows the renderer counters (fps, draws, tris); they're always written, so tools can read them. */
  constructor(container: HTMLElement, showStats = false, onPause?: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-hero-name">VITALIDADE <span data-field="level"></span></div>
        <div class="hud-health">
          <img class="hud-health-icon" src="${HUD_ART.hpIcon}" alt="">
          <div class="hud-health-bar"><div class="hud-fill"></div><div class="hud-shield-fill"></div><span data-field="health"></span></div>
        </div>
        <div class="hud-rotten" hidden><img src="${LIFE_STEAL_ICON}" alt=""><span>Aura podre · cura reduzida</span></div>
        <div class="hud-cold" hidden title="Frio: perto de uma tocha ele baixa"><span>FRIO</span><div class="hud-cold-bar"><div class="hud-fill"></div></div></div>
        <ul class="hud-quests" hidden></ul>
      </div>
      <div class="hud-timer"><span class="eyebrow">SOBREVIVA</span><strong data-field="time"></strong></div>
      <div class="hud-top-right"><div class="hud-counters"><span data-field="kills"></span><span class="hud-currency"><img src="${HUD_ART.gem}" alt="Cristais"><span data-field="currency"></span></span></div><button type="button" class="hud-pause" aria-label="Pausar jogo" title="Pausar (Esc)">Ⅱ</button></div>
      <div class="hud-loadout"><div class="hud-build"></div></div>
      <div class="hud-xp" role="progressbar" aria-label="Experiência" aria-valuemin="0" aria-valuemax="100"><div class="hud-xp-track"><div class="hud-fill"></div></div></div>
      <div class="hud-stats" data-field="stats"${showStats ? '' : ' hidden'}></div>
    `;
    // Under the HUD panels: the ice closes in on the play field, not on the readouts.
    this.frostVignette = document.createElement('div');
    this.frostVignette.className = 'frost-vignette';
    this.frostVignette.hidden = true;
    this.blizzardHaze = document.createElement('div');
    this.blizzardHaze.className = 'blizzard-haze';
    this.root.prepend(this.blizzardHaze, this.frostVignette);
    container.appendChild(this.root);
    const field = (name: string) => this.root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    this.fields = { health: field('health'), level: field('level'), time: field('time'), kills: field('kills'), currency: field('currency'), stats: field('stats') };
    this.healthFill = this.root.querySelector<HTMLDivElement>('.hud-health-bar .hud-fill')!;
    this.shieldFill = this.root.querySelector<HTMLDivElement>('.hud-shield-fill')!;
    this.xpFill = this.root.querySelector<HTMLDivElement>('.hud-xp .hud-fill')!;
    this.build = this.root.querySelector<HTMLDivElement>('.hud-build')!;
    this.rotten = this.root.querySelector<HTMLDivElement>('.hud-rotten')!;
    this.cold = this.root.querySelector<HTMLDivElement>('.hud-cold')!;
    this.coldFill = this.root.querySelector<HTMLDivElement>('.hud-cold-bar .hud-fill')!;
    this.questList = this.root.querySelector<HTMLUListElement>('.hud-quests')!;
    this.root.querySelector('.hud-pause')!.addEventListener('click', () => onPause?.());
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(session: GameSession, stats: RenderStats): void {
    const { player } = session;
    const seconds = Math.floor(session.elapsedMs / 1000);
    // Shield (Relíquia's hit shield, the sandbox buffer) rides over the bar from the left and adds "+N" to the count.
    const shield = Math.floor(player.damageBuffer);
    this.set('health', `${Math.ceil(player.health)} / ${player.maxHealth}${shield > 0 ? ` +${shield}` : ''}`);
    this.setWidth('healthPct', this.healthFill, player.health / player.maxHealth);
    this.setWidth('shieldPct', this.shieldFill, Math.min(1, player.damageBuffer / player.maxHealth));
    this.setWidth('xpPct', this.xpFill, session.experience / session.experienceNeeded);
    this.set('level', `NV. ${session.level}`);
    this.set('currency', `${session.currency}`);
    this.set('time', `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    this.set('kills', `${session.kills} eliminações`);
    this.set('stats', `${stats.fps} fps · ${stats.drawCalls} draws · ${(stats.triangles / 1000).toFixed(0)}k tris · ${session.enemies.activeCount} inimigos · ${stats.pixelScale}× · ${stats.geometries} geo · ${stats.textures} tex`);
    const rotten = player.isRotten(session.clock.now);
    if (this.last.get('rotten') !== String(rotten)) {
      this.last.set('rotten', String(rotten));
      this.rotten.hidden = !rotten;
    }
    this.updateCold(session);
    this.updateBuild(session);
    this.updateQuests(session);
  }

  /** The Nevasca's thermometer, and the ice creeping in from the screen's edges as the cold climbs (at full cold
   *  only a hole in the middle is left). */
  private updateCold(session: GameSession): void {
    const { blizzard } = session;
    const active = String(blizzard.active);
    if (this.last.get('coldActive') !== active) {
      this.last.set('coldActive', active);
      this.cold.hidden = !blizzard.active;
      if (!blizzard.active) this.frostVignette.hidden = true;
    }
    // Capped below full white: the field (and the counters with no panel behind them) must stay readable.
    const haze = String(Math.round(blizzard.intensity * 14) / 20);
    if (this.last.get('haze') !== haze) {
      this.last.set('haze', haze);
      this.blizzardHaze.style.opacity = haze;
    }
    if (!blizzard.active) return;
    const cold = blizzard.cold / 100;
    this.setWidth('coldPct', this.coldFill, cold);
    // In 2% steps, so the style is only rewritten when the look changes.
    const step = String(Math.round(cold * 50));
    if (this.last.get('coldStep') === step) return;
    this.last.set('coldStep', step);
    this.cold.classList.toggle('danger', cold >= 0.75);
    this.frostVignette.hidden = cold < 0.12;
    this.frostVignette.style.setProperty('--clear', `${Math.round(80 - cold * 66)}%`);
    this.frostVignette.style.opacity = String(Math.min(1, (cold - 0.08) * 1.8));
  }

  /** The tavern missions under way ("Barris Perdidos 1/3"), and the finished ones waiting at the tavern. */
  private updateQuests(session: GameSession): void {
    const { quests } = session;
    const items = quests.tracked.map((quest) => ({
      ready: quest.status === 'ready',
      text: `${quests.spec(quest).title} — ${quest.status === 'ready' ? (SNOWFIELD_QUEST_NPCS.includes(quest.npc) ? 'ache o Esquimó na nevasca' : 'volte à taverna') : progressText(quests, quest)}`
    }));
    const key = items.map((item) => item.text).join('|');
    if (this.last.get('quests') === key) return;
    this.last.set('quests', key);
    this.questList.hidden = items.length === 0;
    this.questList.replaceChildren(...items.map(({ ready, text }) => {
      const row = document.createElement('li');
      row.classList.toggle('ready', ready);
      row.textContent = text;
      return row;
    }));
  }

  /** Weapons first (the banana icon once Fabri's boomerang transforms), then each picked upgrade with a ×N counter. */
  private updateBuild(session: GameSession): void {
    const weapons = session.weapons.weapons.map((weapon) => ({ icon: weaponIcon(session.weapons.isBananaTransformActive(weapon) ? 'banana' : weapon.config.id), count: 1, title: weapon.config.name }));
    const upgrades = [...session.selectedUpgradeCounts.entries()].map(([id, count]) => ({ icon: upgradeIcon(id), count, title: id }));
    const companions = session.companions.companions.map((companion) => ({ icon: companionIcon(companion.kind), count: 0, title: `${COMPANIONS[companion.kind].name} — nível ${companion.level}`, level: companion.level, down: companion.downUntil > 0 }));
    const items: Array<{ icon: string; count: number; title: string; level?: number; down?: boolean }> = [...weapons, ...upgrades, ...companions];
    const key = items.map((item) => `${item.icon}×${item.count}:${item.level ?? ''}${item.down ? 'd' : ''}`).join('|');
    if (this.last.get('build') === key) return;
    this.last.set('build', key);
    this.build.replaceChildren(...items.map(({ icon, count, title, level, down }) => {
      const slot = document.createElement('div');
      slot.className = `hud-build-slot${level ? ' companion' : ''}${down ? ' down' : ''}`;
      slot.title = title;
      slot.innerHTML = `<img src="${icon}" alt="">${count > 1 ? `<span>×${count}</span>` : ''}${level ? `<span>Nv${level}</span>` : ''}`;
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
    if (key === 'xpPct') element.closest('[role="progressbar"]')?.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(1, ratio)) * 100)));
  }
}
