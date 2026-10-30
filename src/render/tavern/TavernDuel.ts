import { CHARACTERS, CharacterId } from '../../config/characters';
import { DICE_RULE, DUELS, DUEL_HERO, DuelId, TAVERN_BATTLE } from '../../config/tavernBattle';
import { SkillNode } from '../../config/tavernSkills';
import { TurnBattle } from '../../core/tavern/TurnBattle';
import { heroName } from '../progress/heroNames';
import { npcFace, npcPortrait } from '../ui/icons';
import { BattleStage2D } from './BattleStage2D';

export interface DuelSettings { assisted: boolean; timingTrack: boolean }

/** How a duel went, for the save. */
export interface DuelOutcome { won: boolean; parries: number; /** Grimbo's bet (already paid in). */ bet: number; /** Fichas pocketed with Mão Leve. */ loot: number }

/** What the duel paid (shown on the result screen): the regular's XP, the fichas, the gift for the next run. */
export interface DuelXpResult { xp: number; level: number; levelsGained: number; fichas: number; boon: string | null }

export interface TavernDuelHooks {
  settings(): DuelSettings;
  saveSettings(settings: DuelSettings): void;
  /** The skills the dueled regular has taught the hero (learned nodes + the equipped finisher). */
  kit(duel: DuelId): SkillNode[];
  /** The duel ended: bank the regular's XP, the fichas and the gift; null if nothing was banked. */
  finished(duel: DuelId, outcome: DuelOutcome): DuelXpResult | null;
  /** Fichas in the save (Grimbo's bet). */
  fichas(): number;
  /** Pays a bet in before the duel; false if they can't. */
  stake(amount: number): boolean;
  /** The duel closed: back to the 3D tavern where it was left. */
  closed(): void;
}

/** Taverna em Turnos: the duel overlay. Owns a TurnBattle, feeds it real time and key presses (J aparar,
 *  K esquivar, 1–4 actions, Esc pause), draws it on the 2D stage and keeps the DOM HUD (turn queue, HP, Coragem,
 *  action menu, results) in step. While it's open the 3D loop is paused (Game3D skips its frame). */
export class TavernDuel {
  battle: TurnBattle | null = null;
  private readonly root: HTMLDivElement;
  private readonly frameEl: HTMLDivElement;
  private readonly stage = new BattleStage2D();
  private readonly hud: HTMLDivElement;
  private readonly pauseEl: HTMLDivElement;
  private readonly resultEl: HTMLDivElement;
  private readonly betEl: HTMLDivElement;
  /** Grimbo's duel: the fichas staked this time. */
  private bet = 0;
  private lastAt = 0;
  private paused = false;
  private duelId: DuelId = 'brom';
  private heroId: CharacterId = 'mage';
  private seed = 1;
  private hudKey = '';
  /** "Habilidade" pressed: the action menu lists the skills instead. */
  private skillMenu = false;

  constructor(container: HTMLElement, private readonly hooks: TavernDuelHooks) {
    this.root = document.createElement('div');
    this.root.className = 'duel';
    this.root.hidden = true;
    this.frameEl = document.createElement('div');
    this.frameEl.className = 'duel-frame';
    this.hud = document.createElement('div');
    this.hud.className = 'duel-hud';
    this.pauseEl = document.createElement('div');
    this.pauseEl.className = 'duel-panel duel-pause';
    this.pauseEl.hidden = true;
    this.resultEl = document.createElement('div');
    this.resultEl.className = 'duel-panel duel-result';
    this.resultEl.hidden = true;
    this.betEl = document.createElement('div');
    this.betEl.className = 'duel-panel duel-bet';
    this.betEl.hidden = true;
    this.frameEl.append(this.stage.canvas, this.hud, this.pauseEl, this.resultEl, this.betEl);
    this.root.appendChild(this.frameEl);
    container.appendChild(this.root);
    window.addEventListener('resize', () => { if (this.open) this.layout(); });
  }

  get open(): boolean { return !this.root.hidden; }

  /** What the probe reads: phase, HP, Coragem, the last reaction. */
  snapshot(): Record<string, unknown> | null {
    const battle = this.battle;
    if (!battle) return null;
    return {
      phase: battle.phase, round: battle.round, now: Math.round(battle.clock.now), active: battle.active?.id ?? null,
      hp: Object.fromEntries(battle.fighters.map((fighter) => [fighter.id, fighter.hp])),
      duel: this.duelId, courage: battle.party[0].courage, tipsiness: battle.enemies[0].tipsiness, assisted: battle.assisted,
      dice: battle.attack?.dice ?? null, bet: this.bet, loot: battle.loot,
      attack: battle.attack && battle.phase === 'enemy-attack' ? battle.attack.pattern.name : null,
      lastReaction: battle.lastReaction?.result ?? null, tally: { ...battle.tally }, paused: this.paused,
      skills: battle.party[0].skills.map((skill) => skill.id), skillMenu: this.skillMenu, shield: battle.party[0].shield
    };
  }

  /** Opens a duel. Grimbo's asks for the bet first; `bet` skips the question (test URLs). */
  start(duelId: DuelId, heroId: CharacterId, seed: number, bet?: number): void {
    this.duelId = duelId;
    this.heroId = heroId;
    this.seed = seed;
    this.battle?.events.clear();
    this.battle = null;
    this.stage.detach();
    this.root.hidden = false;
    this.pauseEl.hidden = true;
    this.resultEl.hidden = true;
    this.hud.innerHTML = '';
    this.layout();
    if (DUELS[duelId].rule === 'dice' && bet === undefined) this.askBet();
    else this.begin(bet ?? 0);
  }

  /** Grimbo's table: bet fichas to see every dice roll before it's thrown; a win pays double. */
  private askBet(): void {
    const fichas = this.hooks.fichas();
    this.betEl.hidden = false;
    this.betEl.innerHTML = `
      <p class="eyebrow">Duelo com Grimbo</p>
      <h2>Vai apostar?</h2>
      <p class="duel-result-line">“Os dados decidem quantos golpes eu dou. Aposta umas fichas e eu te deixo ver o dado antes... Ganhou, leva o dobro. Perdeu, fico com elas.”</p>
      <p class="duel-xp">Você tem <b>${fichas}</b> fichas</p>
      <div class="duel-panel-actions"></div>`;
    const actions = this.betEl.querySelector('.duel-panel-actions')!;
    DICE_RULE.bets.forEach((amount, i) => {
      const button = this.button(`Apostar ${amount} fichas (${i + 1})`, i === 0 && fichas >= amount ? 'primary' : '', () => this.placeBet(amount));
      button.disabled = fichas < amount;
      if (button.disabled) button.title = 'Fichas insuficientes';
      actions.append(button);
    });
    actions.append(this.button('Sem aposta, no escuro (3)', fichas >= DICE_RULE.bets[0] ? '' : 'primary', () => this.placeBet(0)));
    actions.append(this.button('Voltar à taverna (Esc)', '', () => this.close()));
  }

  private placeBet(amount: number): void {
    if (amount > 0 && !this.hooks.stake(amount)) return;
    this.begin(amount);
  }

  private begin(bet: number): void {
    this.bet = bet;
    this.betEl.hidden = true;
    const settings = this.hooks.settings();
    this.battle = new TurnBattle({ duel: DUELS[this.duelId], hero: { ...DUEL_HERO, name: heroName(this.heroId) }, seed: this.seed, assisted: settings.assisted, kit: this.hooks.kit(this.duelId), diceRevealed: bet > 0 });
    this.stage.showTrack = settings.timingTrack;
    this.stage.attach(this.battle, CHARACTERS[this.heroId]?.accentColor ?? 0xc0502a);
    this.battle.events.on('battleEnded', () => this.showResult());
    this.paused = false;
    this.skillMenu = false;
    this.hudKey = '';
    this.lastAt = performance.now();
  }

  close(): void {
    this.root.hidden = true;
    this.betEl.hidden = true;
    this.stage.detach();
    this.battle?.events.clear();
    this.battle = null;
    this.hooks.closed();
  }

  /** One display frame: advance the battle by the real time since the last one, draw, refresh the HUD. */
  frame(now: number): void {
    if (!this.battle) {
      this.lastAt = now;
      this.stage.draw(0, now);
      return;
    }
    this.sync(now);
    this.stage.draw(this.battle.clock.now, now);
    this.updateHud();
  }

  /** Brings the battle clock up to `now` (also right before a key press is judged, so it's stamped when it happened,
   *  not at the last frame). */
  private sync(now: number): void {
    const elapsed = now - this.lastAt;
    this.lastAt = now;
    // A hidden tab or a long hitch doesn't fast-forward the fight.
    if (!this.paused && elapsed > 0) this.battle!.advance(Math.min(elapsed, 250));
  }

  keydown(event: KeyboardEvent): void {
    const battle = this.battle;
    const code = event.code;
    if (!battle) {
      // Grimbo's bet question.
      if (!this.open || this.betEl.hidden) return;
      event.preventDefault();
      const digit = /^(?:Digit|Numpad)([1-3])$/.exec(code)?.[1];
      if (code === 'Escape') this.close();
      else if (digit === '3') this.placeBet(0);
      else if (digit && this.hooks.fichas() >= DICE_RULE.bets[Number(digit) - 1]) this.placeBet(DICE_RULE.bets[Number(digit) - 1]);
      return;
    }
    event.preventDefault();
    if (event.repeat) return;
    if (battle.over) {
      if (code === 'KeyR') this.start(this.duelId, this.heroId, this.seed + 1);
      else if (['Escape', 'Enter', 'NumpadEnter', 'Space'].includes(code)) this.close();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1];
    if (this.skillMenu && !this.paused) {
      if (code === 'Escape' || code === 'Backspace') this.skillMenu = false;
      else if (digit) this.useSkill(battle.party[0].skills[Number(digit) - 1]);
      return;
    }
    if (code === 'Escape') {
      this.setPaused(!this.paused);
      return;
    }
    if (this.paused) return;
    this.sync(performance.now());
    if (code === 'KeyJ' || code === 'KeyK') battle.react(code === 'KeyJ' ? 'parry' : 'dodge');
    else if (digit === '1') battle.attackTarget();
    else if (digit === '2') this.openSkills();
    else if (digit === '4') battle.firm();
  }

  private openSkills(): void {
    const battle = this.battle!;
    if (battle.phase === 'player-turn' && battle.party[0].skills.length > 0) this.skillMenu = true;
  }

  private useSkill(skill: SkillNode | undefined): void {
    if (!skill || !this.battle) return;
    this.sync(performance.now());
    if (this.battle.useSkill(skill.id)) this.skillMenu = false;
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseEl.hidden = !paused;
    if (!paused) return;
    const settings = this.hooks.settings();
    this.pauseEl.innerHTML = `
      <p class="eyebrow">Duelo pausado</p>
      <h2>Taverna em Turnos</h2>
      <div class="duel-panel-actions"></div>`;
    const actions = this.pauseEl.querySelector('.duel-panel-actions')!;
    actions.append(
      this.button('Continuar (Esc)', 'primary', () => this.setPaused(false)),
      this.button(`Modo assistido: ${settings.assisted ? 'ligado' : 'desligado'}`, '', () => {
        const next = { ...this.hooks.settings(), assisted: !this.hooks.settings().assisted };
        this.hooks.saveSettings(next);
        if (this.battle) this.battle.assisted = next.assisted;
        this.setPaused(true);
      }),
      this.button(`Trilha de tempo: ${settings.timingTrack ? 'ligada' : 'desligada'}`, '', () => {
        const next = { ...this.hooks.settings(), timingTrack: !this.hooks.settings().timingTrack };
        this.hooks.saveSettings(next);
        this.stage.showTrack = next.timingTrack;
        this.setPaused(true);
      }),
      this.button('Desistir e voltar à taverna', '', () => this.close())
    );
  }

  private showResult(): void {
    const battle = this.battle!;
    const won = battle.phase === 'won';
    const enemy = battle.enemies[0];
    const { tally } = battle;
    this.skillMenu = false;
    const learned = this.hooks.finished(this.duelId, { won, parries: tally.parry, bet: this.bet, loot: battle.loot });
    const duel = DUELS[this.duelId];
    const paid: string[] = [];
    if (learned) {
      paid.push(`${enemy.name} +${learned.xp} XP${learned.levelsGained > 0 ? ` · <b>nível ${learned.level}!</b> Ponto novo em Habilidades` : ''}`);
      if (learned.fichas > 0) paid.push(`+${learned.fichas} fichas${this.bet > 0 && won ? ' (aposta em dobro)' : ''}`);
      else if (this.bet > 0 && !won) paid.push(`Aposta de ${this.bet} fichas perdida`);
      if (learned.boon) paid.push(`Pra próxima partida: <b>${learned.boon}</b>`);
    }
    this.resultEl.hidden = false;
    this.resultEl.className = `duel-panel duel-result ${won ? 'won' : 'lost'}`;
    this.resultEl.innerHTML = `
      <p class="eyebrow">Duelo com ${enemy.name}</p>
      <h2>${won ? 'Vitória!' : 'Derrota'}</h2>
      <p class="duel-result-line"></p>
      <ul class="duel-tally">
        <li><b>${tally.parry}</b> aparos perfeitos</li>
        <li><b>${tally.dodge}</b> esquivas</li>
        <li><b>${tally.taken}</b> golpes levados</li>
        <li><b>${tally.early}</b> apertos adiantados</li>
        ${duel.rule === 'feints' ? `<li><b>${tally.held}</b> fintas seguradas</li>` : ''}
      </ul>
      ${paid.map((line) => `<p class="duel-xp">${line}</p>`).join('')}
      <div class="duel-panel-actions"></div>`;
    this.resultEl.querySelector('.duel-result-line')!.textContent = `“${won ? duel.lines.won : duel.lines.lost}”`;
    const actions = this.resultEl.querySelector('.duel-panel-actions')!;
    actions.append(
      this.button('Voltar à taverna (Enter)', 'primary', () => this.close()),
      this.button('Revanche (R)', '', () => this.start(this.duelId, this.heroId, this.seed + 1))
    );
  }

  private layout(): void {
    const fit = this.stage.resize(this.root.clientWidth || window.innerWidth, this.root.clientHeight || window.innerHeight);
    this.frameEl.style.width = `${fit.width}px`;
    this.frameEl.style.height = `${fit.height}px`;
    this.frameEl.style.setProperty('--duel-scale', String(fit.scale));
  }

  /** The DOM HUD: rebuilt only when something it shows changes. */
  private updateHud(): void {
    const battle = this.battle!;
    const hero = battle.party[0];
    const enemy = battle.enemies[0];
    const queue = battle.over ? [] : battle.upcoming();
    const playerTurn = battle.phase === 'player-turn';
    const defending = battle.phase === 'enemy-attack';
    if (!playerTurn) this.skillMenu = false;
    const key = [battle.phase, battle.active?.id, hero.hp, enemy.hp, hero.courage, hero.tipsiness, enemy.tipsiness, hero.firm, hero.shield, hero.wall, queue.join(','), battle.assisted, this.skillMenu, enemy.poison?.rounds, enemy.mark?.hits, battle.loot].join('|');
    if (key === this.hudKey) return;
    this.hudKey = key;
    const face = (id: string) => (id === 'hero'
      ? `<span class="duel-chip hero" style="--chip:${hex(CHARACTERS[this.heroId]?.accentColor ?? 0xc0502a)}">${initials(hero.name)}</span>`
      : `<span class="duel-chip enemy"><img alt="" src="${this.duelId === 'sergio' ? npcPortrait('sergio') ?? '' : npcFace(this.duelId)}"></span>`);
    const bar = (fighter: typeof hero, side: 'left' | 'right') => `
      <div class="duel-fighter ${side}">
        <p class="duel-name">${fighter.name}${fighter.firm ? ' <em>firme</em>' : ''}${fighter.wall ? ` <em>${fighter.wallAs === 'dodge' ? 'esquiva certa' : 'aparo certo'}</em>` : ''}${fighter.shield > 0 ? ` <em class="shield">barril ${fighter.shield}</em>` : ''}</p>
        <div class="duel-hp"><i style="width:${(fighter.hp / fighter.maxHp) * 100}%"></i><span>${fighter.hp}/${fighter.maxHp}</span></div>
        <p class="duel-meta">${side === 'left' ? `Coragem ${pips(fighter.courage, TAVERN_BATTLE.courageMax)}` : ''}<span class="duel-mugs" title="Embriaguez">${'🍺'.repeat(fighter.tipsiness)}</span>${fighter.poison ? ` <em class="poison">veneno ${fighter.poison.rounds}</em>` : ''}${fighter.mark ? ` <em class="mark">marca ${fighter.mark.hits}</em>` : ''}</p>
      </div>`;
    this.hud.innerHTML = `
      <div class="duel-top">
        ${bar(hero, 'left')}
        <div class="duel-queue"><p class="eyebrow">Próximos turnos</p><div>${queue.map(face).join('')}</div></div>
        ${bar(enemy, 'right')}
      </div>
      <p class="duel-legend">${battle.assisted ? '<b>Modo assistido</b> · ' : ''}${this.bet > 0 ? `<b>Aposta ${this.bet}</b> · ` : ''}${battle.loot > 0 ? `<b>+${battle.loot} fichas</b> afanadas · ` : ''}${battle.duel.legend} <kbd>Esc</kbd> pausa</p>
      <div class="duel-bottom">
        <div class="duel-actions" ${playerTurn && !this.skillMenu ? '' : 'hidden'}>
          <p class="eyebrow">Sua vez</p>
          <button type="button" data-action="attack"><kbd>1</kbd> Atacar</button>
          <button type="button" data-action="skills" ${hero.skills.length > 0 ? '' : `disabled title="Aprenda com ${enemy.name} em Habilidades, na taverna"`}><kbd>2</kbd> Habilidade</button>
          <button type="button" disabled title="Em breve"><kbd>3</kbd> Item do bar</button>
          <button type="button" data-action="firm"><kbd>4</kbd> Firmar</button>
        </div>
        <div class="duel-actions duel-skills" ${playerTurn && this.skillMenu ? '' : 'hidden'}>
          <p class="eyebrow">Habilidades · <kbd>Esc</kbd> volta</p>
          ${hero.skills.map((skill, i) => `<button type="button" data-skill="${i}" class="${skill.kind}" ${hero.courage >= skill.cost ? '' : 'disabled'} title="${skill.description}"><kbd>${i + 1}</kbd> ${skill.name} ${pips(skill.cost, skill.cost)}</button>`).join('')}
        </div>
        <p class="duel-hint" ${defending ? '' : 'hidden'}><kbd>J</kbd> aparar &nbsp;·&nbsp; <kbd>K</kbd> esquivar</p>
      </div>`;
    this.hud.querySelector('[data-action="attack"]')?.addEventListener('click', () => battle.attackTarget());
    this.hud.querySelector('[data-action="firm"]')?.addEventListener('click', () => battle.firm());
    this.hud.querySelector('[data-action="skills"]')?.addEventListener('click', () => this.openSkills());
    this.hud.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((button) => {
      button.addEventListener('click', () => this.useSkill(hero.skills[Number(button.dataset.skill)]));
    });
  }

  private button(label: string, variant: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui-button ${variant}`;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}

function pips(value: number, max: number): string {
  return `<span class="duel-pips">${Array.from({ length: max }, (_, i) => `<i class="${i < value ? 'on' : ''}"></i>`).join('')}</span>`;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function initials(name: string): string {
  return name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
}
