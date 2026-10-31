import { CHARACTERS, CharacterId } from '../../config/characters';
import { DICE_RULE, DUELS, DuelId, TAVERN_BATTLE } from '../../config/tavernBattle';
import { ROSTER, ROSTER_ORDER, RosterId, SQUAD_TUNING, foeSpec, isRosterId } from '../../config/tavernRoster';
import { SkillNode } from '../../config/tavernSkills';
import { TOWERS, TOWER_TUNING, TowerId } from '../../config/tavernTowers';
import { TowerRun } from '../../core/tavern/TowerRun';
import { BattleAlly, Fighter, TurnBattle, TurnBattleOptions } from '../../core/tavern/TurnBattle';
import { heroName } from '../progress/heroNames';
import { npcFace, npcPortrait } from '../ui/icons';
import { BattleStage2D } from './BattleStage2D';
import { statusInfo } from './StatusBadges';

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
  /** O Coliseu do Sergio: a floor won banks the climbing hero's mastery and the tower's best floor at once. */
  towerFloor(tower: TowerId, cleared: number, masteryXp: number): TowerFloorBanked;
  /** The climb ended (walked away, lost or topped): bank the fichas it paid. */
  towerEnded(tower: TowerId, fichas: number, reachedTop: boolean): void;
  /** The regulars who have taught the hero something (the climb's "Treinado por"). */
  mentors(): DuelId[];
  /** The heroes the player has unlocked: only they (and the hero in play) can join a tower's squad. */
  roster(): CharacterId[];
  /** Sandbox: every fighter pickable, the towers' locals too. */
  allFighters(): boolean;
}

/** What a tower floor banked, for the floor's result panel. */
export interface TowerFloorBanked { level: number; levelsGained: number; joined: string[] }

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
  /** O Coliseu do Sergio: the climb in progress (null in a plain duel). */
  private climb: TowerRun | null = null;
  /** Whose tree the hero climbs with. */
  private mentor: DuelId | null = null;
  /** The enemy to strike in a group fight (index among the living; Tab cycles). */
  private targetIndex = 0;
  /** The floor being fought (1-based; the climb moves on as soon as it's won). */
  private floorNumber = 1;
  private readonly towerEl: HTMLDivElement;
  /** The tower's squad, picked before the first floor: the leader first (roster ids). */
  private squad: RosterId[] = [];
  /** The squad picker is up (before a climb). */
  private picking: TowerId | null = null;
  /** What a buff or debuff over a head does, while the mouse is on it. */
  private readonly statusTip: HTMLDivElement;
  private pointer: { x: number; y: number } | null = null;
  private tipKey = '';

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
    this.towerEl = document.createElement('div');
    this.towerEl.className = 'duel-panel duel-tower';
    this.towerEl.hidden = true;
    this.statusTip = document.createElement('div');
    this.statusTip.className = 'duel-status-tip';
    this.statusTip.hidden = true;
    this.frameEl.append(this.stage.canvas, this.hud, this.pauseEl, this.resultEl, this.betEl, this.towerEl);
    this.root.append(this.frameEl, this.statusTip);
    this.frameEl.addEventListener('pointermove', (event) => { this.pointer = { x: event.clientX, y: event.clientY }; });
    this.frameEl.addEventListener('pointerleave', () => { this.pointer = null; });
    // A group fight: clicking a foe's plate makes it the target.
    this.frameEl.addEventListener('click', (event) => {
      const foe = this.paused ? null : this.stage.plateUnder(event.clientX, event.clientY);
      if (!foe || foe.side !== 'enemy' || foe.hp <= 0) return;
      const index = this.battle?.enemies.filter((enemy) => enemy.hp > 0).indexOf(foe) ?? -1;
      if (index >= 0) this.targetIndex = index;
    });
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
      skills: (this.actor() ?? battle.party[0]).skills.map((skill) => skill.id), skillMenu: this.skillMenu, shield: battle.party[0].shield,
      target: this.target()?.id ?? null, enemies: battle.enemies.map((enemy) => enemy.id),
      party: battle.party.map((member) => ({ id: member.id, look: member.look, hp: member.hp, courage: member.courage, taunting: member.taunting })),
      tower: this.climb ? { id: this.climb.tower.id, floor: this.climb.floor, pot: this.climb.pot, heroHp: this.climb.heroHp, ended: this.climb.ended } : null
    };
  }

  /** O Coliseu do Sergio: a climb up a tower, floor by floor. First the squad (the heroes the player has unlocked), then the ladder screen. `squad` skips the picker (test URLs). */
  startTower(tower: TowerId, heroId: CharacterId, seed: number, squad?: RosterId[]): void {
    this.reset(heroId, seed);
    this.climb = null;
    this.stage.setBackdrop(TOWERS[tower].stage);
    this.mentor = this.hooks.mentors()[0] ?? null;
    this.squad = [heroId];
    if (squad && squad.length > 0) this.beginClimb(tower, squad);
    else this.showSquadPicker(tower);
  }

  /** Who can join a tower's squad: the heroes the player has unlocked (the region's people first), or everyone with
   *  the sandbox toggle. */
  private available(tower: TowerId): RosterId[] {
    const local = TOWERS[tower].roster;
    const owned = new Set<string>([...this.hooks.roster(), this.heroId]);
    const everyone = this.hooks.allFighters();
    return ROSTER_ORDER.filter((id) => everyone || owned.has(id))
      .sort((a, b) => Number(local.includes(b)) - Number(local.includes(a)));
  }

  /** The region's people not unlocked yet: shown in the picker behind a padlock. */
  private locked(tower: TowerId): RosterId[] {
    const open = this.available(tower);
    return TOWERS[tower].roster.filter((id) => !open.includes(id));
  }

  /** The squad picker: the leader plus up to SQUAD_TUNING.maxAllies, each with their kit on show. */
  private showSquadPicker(tower: TowerId): void {
    this.picking = tower;
    const spec = TOWERS[tower];
    const options = this.available(tower);
    const max = 1 + SQUAD_TUNING.maxAllies;
    this.towerEl.hidden = false;
    this.towerEl.innerHTML = `
      <p class="eyebrow">O Coliseu do Sergio · ${spec.region}</p>
      <h2>${spec.name}: monte o grupo</h2>
      <p class="duel-xp">Até <b>${max}</b> lutadores, cada um com suas habilidades e seu turno. O primeiro é o líder. Quanto maior o grupo, mais fortes os inimigos.</p>
      <ol class="squad-grid">${options.map((id, i) => {
        const fighter = ROSTER[id];
        const place = this.squad.indexOf(id);
        return `<li><button type="button" class="squad-card${place >= 0 ? ' picked' : ''}" data-pick="${id}" style="--chip:${hex(fighter.color)}">
          <b>${i < 9 ? `<kbd>${i + 1}</kbd> ` : ''}${fighter.name}${place === 0 ? ' <em>líder</em>' : place > 0 ? ' <em>no grupo</em>' : ''}${spec.roster.includes(id) ? ' <span class="local">da região</span>' : ''}</b>
          <span class="squad-stats">Vida ${fighter.stats.maxHp} · Ataque ${fighter.stats.attack} · Velocidade ${fighter.stats.speed}</span>
          <span class="squad-kit">${fighter.kit.map((skill) => `<i class="${skill.kind}" title="${skill.description}">${skill.name}</i>`).join('')}</span>
        </button></li>`;
      }).join('')}${this.locked(tower).map((id) => `<li><button type="button" class="squad-card locked" disabled style="--chip:${hex(ROSTER[id].color)}">
          <b>🔒 ${ROSTER[id].name} <span class="local">da região</span></b>
          <span class="squad-stats">Ainda não desbloqueado</span>
        </button></li>`).join('')}</ol>
      <div class="duel-panel-actions"></div>`;
    this.towerEl.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((button) => button.addEventListener('click', () => this.togglePick(button.dataset.pick as RosterId)));
    const actions = this.towerEl.querySelector('.duel-panel-actions')!;
    const go = this.button(`Subir com ${this.squad.length} (Enter)`, 'primary', () => this.beginClimb(tower, this.squad));
    go.disabled = this.squad.length === 0;
    actions.append(go, this.button('Voltar (Esc)', '', () => this.close()));
  }

  private togglePick(id: RosterId): void {
    const tower = this.picking;
    if (!tower) return;
    if (this.squad.includes(id)) this.squad = this.squad.filter((other) => other !== id);
    else if (this.squad.length < 1 + SQUAD_TUNING.maxAllies) this.squad = [...this.squad, id];
    this.showSquadPicker(tower);
  }

  private beginClimb(tower: TowerId, squad: RosterId[]): void {
    this.picking = null;
    this.squad = squad.filter(isRosterId).slice(0, 1 + SQUAD_TUNING.maxAllies);
    if (this.squad.length === 0) this.squad = [this.heroId];
    const [leader, ...allies] = this.squad;
    this.climb = new TowerRun(TOWERS[tower], ROSTER[leader].stats, allies.map((id): BattleAlly => ({ id: `ally-${id}`, look: id, spec: ROSTER[id].stats, kit: ROSTER[id].kit })));
    this.showLadder();
  }

  /** The leader's stats and kit: their own four skills plus what the chosen regular taught. */
  private leader(look: RosterId, mentor: DuelId | null): { hero: TurnBattleOptions['hero']; kit: SkillNode[]; heroLook: string } {
    const fighter = ROSTER[look];
    const taught = mentor ? this.hooks.kit(mentor) : [];
    const kit = [...fighter.kit, ...taught.filter((skill) => !fighter.kit.some((own) => own.id === skill.id))];
    return { hero: { ...fighter.stats, name: look === this.heroId ? heroName(this.heroId) : fighter.name }, kit, heroLook: look };
  }

  /** What the probe reads between floors. */
  towerSnapshot(): Record<string, unknown> | null {
    const climb = this.climb;
    return climb ? { tower: climb.tower.id, floor: climb.floor, pot: climb.pot, heroHp: climb.heroHp, courage: climb.courage, ended: climb.ended, masteryXp: climb.masteryXp, mentor: this.mentor, ladder: !this.towerEl.hidden } : null;
  }

  private reset(heroId: CharacterId, seed: number): void {
    this.heroId = heroId;
    this.seed = seed;
    this.battle?.events.clear();
    this.battle = null;
    this.stage.detach();
    this.root.hidden = false;
    this.pauseEl.hidden = true;
    this.resultEl.hidden = true;
    this.betEl.hidden = true;
    this.towerEl.hidden = true;
    this.hud.innerHTML = '';
    this.layout();
  }

  /** Between floors: the tower's ladder, the hero's HP, the pot, and what to do next. */
  private showLadder(): void {
    const climb = this.climb!;
    const floor = climb.current!;
    this.battle?.events.clear();
    this.battle = null;
    this.stage.detach();
    this.hud.innerHTML = '';
    this.resultEl.hidden = true;
    this.towerEl.hidden = false;
    const number = climb.floor + 1;
    const squadLine = [`${ROSTER[this.squad[0]]?.name ?? 'Você'} ${climb.heroHp}/${climb.heroMaxHp}`, ...climb.allies.map(({ ally, hp }) => `${ROSTER[ally.look as RosterId]?.name ?? ally.look} ${hp}/${ally.spec.maxHp}`)].join(' · ');
    const rungs = climb.tower.floors.map((spec, i) => {
      const state = i < climb.floor ? 'done' : i === climb.floor ? 'current' : '';
      const prize = spec.kind === 'fight' ? `<span>+${spec.fichas} fichas</span>` : '<span>descanso</span>';
      return `<li class="${state} ${spec.kind === 'fight' && spec.champion ? 'champion' : ''}"><b>${i + 1}</b> ${spec.name} ${prize}</li>`;
    }).reverse().join('');
    const mentorName = this.mentor ? DUELS[this.mentor].enemy.name : null;
    this.towerEl.innerHTML = `
      <p class="eyebrow">O Coliseu do Sergio · ${climb.tower.region}</p>
      <h2>${climb.tower.name}</h2>
      <p class="duel-xp">${climb.allies.length > 0 ? `Grupo: <b>${squadLine}</b>` : `Vida <b>${climb.heroHp}/${climb.heroMaxHp}</b>`} · Pote <b>${climb.pot} fichas</b>${climb.masteryXp > 0 ? ` · Maestria <b>+${climb.masteryXp} XP</b>` : ''}${climb.courage > 0 ? ` · Coragem <b>${climb.courage}</b>` : ''}</p>
      <ol class="tower-ladder">${rungs}</ol>
      <p class="duel-result-line">${floor.kind === 'rest' ? `Andar ${number}: o balcão. Um respiro antes de subir.` : `Andar ${number}: ${floor.name}${floor.foes.length > 1 ? ` (${floor.foes.map((foe) => foeSpec(foe.duel).enemy.name).join(' + ')})` : ''}`}</p>
      <div class="duel-panel-actions"></div>`;
    // The ladder is drawn top-down: bring the floor you're on into view.
    this.towerEl.querySelector('.tower-ladder li.current')?.scrollIntoView({ block: 'center' });
    const actions = this.towerEl.querySelector('.duel-panel-actions')!;
    if (floor.kind === 'rest') {
      actions.append(
        this.button(`Comer algo: +${Math.round(TOWER_TUNING.restHeal * 100)}% de vida (1)`, 'primary', () => this.rest('heal')),
        this.button(`Respirar fundo: começa o próximo com ${TOWER_TUNING.restCourage} de Coragem (2)`, '', () => this.rest('courage'))
      );
    } else {
      actions.append(this.button(`Lutar: andar ${number} (Enter)`, 'primary', () => this.beginFloor()));
      if (this.hooks.mentors().length > 0) actions.append(this.button(`Treinado por: ${mentorName ?? 'ninguém'} (T)`, '', () => this.cycleMentor()));
    }
    actions.append(this.button(climb.pot > 0 ? `Sair com ${climb.pot} fichas (Esc)` : 'Voltar à taverna (Esc)', '', () => this.leaveTower()));
  }

  private cycleMentor(): void {
    const mentors: Array<DuelId | null> = [...this.hooks.mentors(), null];
    this.mentor = mentors[(mentors.indexOf(this.mentor) + 1) % mentors.length];
    this.showLadder();
  }

  private rest(choice: 'heal' | 'courage'): void {
    const climb = this.climb!;
    climb.rest(choice);
    if (climb.ended) this.finishClimb();
    else this.showLadder();
  }

  private beginFloor(): void {
    const climb = this.climb!;
    const settings = this.hooks.settings();
    const options = climb.battleOptions({ ...this.leader(this.squad[0], this.mentor), seed: this.seed + climb.floor * 7919, assisted: settings.assisted });
    if (!options) return;
    this.towerEl.hidden = true;
    this.bet = 0;
    this.floorNumber = climb.floor + 1;
    this.launch(options);
  }

  /** "Sair com o prêmio" (or giving up between floors): the whole pot. */
  private leaveTower(): void {
    const climb = this.climb;
    if (climb && !climb.ended) this.hooks.towerEnded(climb.tower.id, climb.leave(), false);
    this.close();
  }

  /** The top was reached (the champion beaten, or a rest on the last floor): the whole pot. */
  private finishClimb(): void {
    const climb = this.climb!;
    this.hooks.towerEnded(climb.tower.id, climb.payout, true);
    this.towerEl.hidden = false;
    this.towerEl.innerHTML = `
      <p class="eyebrow">O Coliseu do Sergio</p>
      <h2>Topo da ${climb.tower.name}!</h2>
      <p class="duel-result-line">“Ninguém sobe essa escada inteira. Ninguém... até agora.” — Sergio</p>
      <p class="duel-xp">+${climb.payout} fichas · Maestria +${climb.masteryXp} XP</p>
      <div class="duel-panel-actions"></div>`;
    this.towerEl.querySelector('.duel-panel-actions')!.append(this.button('Voltar à taverna (Enter)', 'primary', () => this.close()));
  }

  /** A floor's fight ended: bank it and offer the next floor (or the way down). */
  private showFloorResult(): void {
    const climb = this.climb!;
    const battle = this.battle!;
    const won = battle.phase === 'won';
    const number = climb.floor + 1;
    const floor = climb.current;
    const name = floor?.name ?? '';
    const lines: string[] = [];
    let title: string;
    this.resultEl.hidden = false;
    this.resultEl.className = `duel-panel duel-result ${won ? 'won' : 'lost'}`;
    const actions: HTMLButtonElement[] = [];
    if (won) {
      const prize = climb.won(battle.party[0].hp, Object.fromEntries(battle.party.slice(1).map((member) => [member.id, member.hp])));
      const banked = this.hooks.towerFloor(climb.tower.id, climb.cleared, prize.masteryXp);
      title = `Andar ${number} vencido!`;
      lines.push(`+${prize.fichas} fichas no pote (agora <b>${climb.pot}</b>)`);
      lines.push(`Maestria +${prize.masteryXp} XP${banked.levelsGained > 0 ? ` · <b>nível ${banked.level}!</b>` : ''}`);
      banked.joined.forEach((hero) => lines.push(`<b>${hero}</b> entrou pro seu elenco!`));
      if (climb.ended) {
        actions.push(this.button('Ver o prêmio (Enter)', 'primary', () => { this.resultEl.hidden = true; this.battle?.events.clear(); this.battle = null; this.stage.detach(); this.hud.innerHTML = ''; this.finishClimb(); }));
      } else {
        actions.push(
          this.button('Próximo andar (Enter)', 'primary', () => this.showLadder()),
          this.button(`Sair com ${climb.pot} fichas (Esc)`, '', () => this.leaveTower())
        );
      }
    } else {
      const pot = climb.pot;
      const kept = climb.lost();
      this.hooks.towerEnded(climb.tower.id, kept, false);
      title = `Caiu no andar ${number}`;
      lines.push(pot > 0 ? `Você leva <b>${kept}</b> das ${pot} fichas do pote` : 'O pote estava vazio');
      if (climb.masteryXp > 0) lines.push(`A maestria fica: +${climb.masteryXp} XP nessa subida`);
      actions.push(this.button('Voltar à taverna (Enter)', 'primary', () => this.close()));
    }
    const { tally } = battle;
    this.resultEl.innerHTML = `
      <p class="eyebrow">${climb.tower.name} · ${name}</p>
      <h2>${title}</h2>
      <ul class="duel-tally">
        <li><b>${tally.parry}</b> aparos perfeitos</li>
        <li><b>${tally.dodge}</b> esquivas${tally.perfectDodge > 0 ? ` (${tally.perfectDodge} perfeitas)` : ''}</li>
        <li><b>${tally.taken}</b> golpes levados</li>
        <li><b>${battle.party.reduce((sum, member) => sum + member.hp, 0)}</b> de vida sobrando${battle.party.length > 1 ? ' no grupo' : ''}</li>
      </ul>
      ${lines.map((line) => `<p class="duel-xp">${line}</p>`).join('')}
      <div class="duel-panel-actions"></div>`;
    this.resultEl.querySelector('.duel-panel-actions')!.append(...actions);
  }

  /** The living enemy the hero strikes (group fights pick with Tab). */
  private target(): Fighter | null {
    const living = this.battle?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
    if (living.length === 0) return null;
    return living[this.targetIndex % living.length];
  }

  private cycleTarget(step = 1): void {
    const living = this.battle?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
    if (living.length > 1) this.targetIndex = (this.targetIndex + step + living.length) % living.length;
  }

  /** Opens a duel. Grimbo's asks for the bet first; `bet` skips the question (test URLs). */
  start(duelId: DuelId, heroId: CharacterId, seed: number, bet?: number): void {
    this.duelId = duelId;
    this.climb = null;
    this.picking = null;
    this.reset(heroId, seed);
    this.stage.setBackdrop('tavern');
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
    this.launch({ duel: DUELS[this.duelId], ...this.leader(this.heroId, this.duelId), seed: this.seed, assisted: settings.assisted, diceRevealed: bet > 0 });
  }

  private launch(options: TurnBattleOptions): void {
    const settings = this.hooks.settings();
    this.battle = new TurnBattle(options);
    this.targetIndex = 0;
    this.stage.showTrack = settings.timingTrack;
    this.stage.attach(this.battle, (look) => ROSTER[look as RosterId]?.color ?? CHARACTERS[this.heroId]?.accentColor ?? 0xc0502a);
    this.battle.events.on('battleEnded', () => this.showResult());
    this.paused = false;
    this.skillMenu = false;
    this.hudKey = '';
    this.lastAt = performance.now();
  }

  close(): void {
    // Giving up mid-fight in a tower is a fall: the share of the pot a defeat keeps.
    const climb = this.climb;
    if (climb && !climb.ended) this.hooks.towerEnded(climb.tower.id, this.battle && !this.battle.over ? climb.lost() : climb.leave(), false);
    this.climb = null;
    this.picking = null;
    this.root.hidden = true;
    this.betEl.hidden = true;
    this.towerEl.hidden = true;
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
    this.updateStatusTip();
  }

  /** Re-checked every frame, so the tip follows a fighter that moves and goes when the status wears off. */
  private updateStatusTip(): void {
    const hit = this.pointer && !this.paused ? this.stage.statusUnder(this.pointer.x, this.pointer.y) : null;
    if (!hit) {
      this.statusTip.hidden = true;
      this.tipKey = '';
      return;
    }
    const info = statusInfo(hit.fighter, hit.badge);
    const key = `${hit.fighter.id}:${info.title}:${info.text}`;
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.statusTip.classList.toggle('bad', !info.good);
      this.statusTip.innerHTML = `<strong>${info.title}</strong><span>${info.text}</span><em>${hit.fighter.name}</em>`;
    }
    this.statusTip.hidden = false;
    // Above the badge, kept on screen; below it when there's no room up top.
    const width = this.statusTip.offsetWidth;
    const height = this.statusTip.offsetHeight;
    const left = Math.max(6, Math.min(window.innerWidth - width - 6, hit.left - width / 2));
    const top = hit.top - height - 8 >= 6 ? hit.top - height - 8 : hit.bottom + 8;
    this.statusTip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  /** Brings the battle clock up to `now` (also right before a key press is judged, so it's stamped when it happened,
   *  not at the last frame). */
  private sync(now: number): void {
    const elapsed = now - this.lastAt;
    this.lastAt = now;
    // A hidden tab or a long hitch doesn't fast-forward the fight.
    if (!this.paused && elapsed > 0 && this.stage.artReady) this.battle!.advance(Math.min(elapsed, 250));
  }

  keydown(event: KeyboardEvent): void {
    const battle = this.battle;
    const code = event.code;
    if (!battle && this.open && this.picking) {
      event.preventDefault();
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1];
      const options = this.available(this.picking);
      if (code === 'Escape') this.close();
      else if ((code === 'Enter' || code === 'NumpadEnter') && this.squad.length > 0) this.beginClimb(this.picking, this.squad);
      else if (digit && options[Number(digit) - 1]) this.togglePick(options[Number(digit) - 1]);
      return;
    }
    if (!battle && this.open && !this.towerEl.hidden) {
      event.preventDefault();
      const floor = this.climb?.current;
      if (!this.climb || this.climb.ended || !floor) {
        if (['Escape', 'Enter', 'NumpadEnter', 'Space'].includes(code)) this.close();
      } else if (code === 'Escape') this.leaveTower();
      else if (floor.kind === 'rest') {
        if (code === 'Digit1' || code === 'Numpad1') this.rest('heal');
        else if (code === 'Digit2' || code === 'Numpad2') this.rest('courage');
      } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.beginFloor();
      else if (code === 'KeyT' && this.hooks.mentors().length > 0) this.cycleMentor();
      return;
    }
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
    if (battle.over && this.climb) {
      // The floor's result panel: its first button is the way on (Enter), Esc walks away with the pot.
      if (this.resultEl.hidden) return;
      if (['Enter', 'NumpadEnter', 'Space'].includes(code)) this.resultEl.querySelector<HTMLButtonElement>('.duel-panel-actions button')?.click();
      else if (code === 'Escape') {
        if (this.climb.ended) this.close();
        else this.leaveTower();
      }
      return;
    }
    if (battle.over) {
      if (code === 'KeyR') this.start(this.duelId, this.heroId, this.seed + 1);
      else if (['Escape', 'Enter', 'NumpadEnter', 'Space'].includes(code)) this.close();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1];
    if (this.skillMenu && !this.paused) {
      if (code === 'Escape' || code === 'Backspace') this.skillMenu = false;
      else if (digit) this.useSkill(this.actor()?.skills[Number(digit) - 1]);
      return;
    }
    if (code === 'Escape') {
      this.setPaused(!this.paused);
      return;
    }
    if (this.paused) return;
    this.sync(performance.now());
    if (code === 'KeyJ' || code === 'KeyK') battle.react(code === 'KeyJ' ? 'parry' : 'dodge');
    else if (code === 'Tab' || code === 'ArrowRight' || code === 'ArrowLeft') this.cycleTarget(code === 'ArrowLeft' ? -1 : 1);
    else if (digit === '1') battle.attackTarget(this.target()?.id);
    else if (digit === '2') this.openSkills();
    else if (digit === '4') battle.firm();
  }

  /** The squad member whose turn it is (null outside the party's turns). */
  private actor(): Fighter | null {
    const battle = this.battle;
    return battle && battle.phase === 'player-turn' && battle.active?.side === 'party' ? battle.active : null;
  }

  private openSkills(): void {
    if ((this.actor()?.skills.length ?? 0) > 0) this.skillMenu = true;
  }

  private useSkill(skill: SkillNode | undefined): void {
    if (!skill || !this.battle) return;
    this.sync(performance.now());
    if (this.battle.useSkill(skill.id, this.target()?.id)) this.skillMenu = false;
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
      this.button(this.climb ? `Desistir (leva ${Math.floor(this.climb.pot * TOWER_TUNING.keepOnLoss)} das ${this.climb.pot} fichas)` : 'Desistir e voltar à taverna', '', () => this.close())
    );
  }

  private showResult(): void {
    if (this.climb) {
      this.skillMenu = false;
      this.showFloorResult();
      return;
    }
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
        <li><b>${tally.dodge}</b> esquivas${tally.perfectDodge > 0 ? ` (${tally.perfectDodge} perfeitas)` : ''}</li>
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
    const leader = battle.party[0];
    const actor = this.actor();
    // The skills and Coragem on the menu are whoever's turn it is.
    const hero = actor ?? leader;
    const enemy = battle.enemies[0];
    const group = battle.enemies.length > 1;
    const squad = battle.party.length > 1;
    const target = this.target();
    this.stage.targetId = group ? target?.id ?? null : null;
    const queue = battle.over ? [] : battle.upcoming();
    const playerTurn = battle.phase === 'player-turn';
    const defending = battle.phase === 'enemy-attack';
    if (!playerTurn) this.skillMenu = false;
    const state = (fighter: Fighter) => [fighter.hp, fighter.courage, fighter.tipsiness, fighter.firm, fighter.shield, fighter.wall, fighter.taunting, fighter.poison?.rounds, fighter.mark?.hits, fighter.stunned].join(':');
    const key = [battle.phase, battle.active?.id, battle.fighters.map(state).join(','), target?.id, queue.join(','), battle.assisted, this.skillMenu, battle.loot].join('|');
    if (key === this.hudKey) return;
    this.hudKey = key;
    const face = (id: string) => {
      const fighter = battle.fighter(id);
      const look = fighter?.look ?? this.duelId;
      const regular = look in DUELS && fighter?.side === 'enemy';
      if (regular) return `<span class="duel-chip enemy"><img alt="" src="${look === 'sergio' ? npcPortrait('sergio') ?? '' : npcFace(look as Exclude<DuelId, 'sergio'>)}"></span>`;
      const color = ROSTER[look as RosterId]?.color ?? CHARACTERS[this.heroId]?.accentColor ?? 0x5a6a7a;
      return `<span class="duel-chip ${fighter?.side === 'party' ? 'hero' : 'enemy'}" style="--chip:${hex(color)}">${initials(fighter?.name ?? '?')}</span>`;
    };
    // Names, HP and Coragem are on the plates over each head (the stage draws them); the top keeps the turn queue.
    this.stage.actingId = squad ? actor?.id ?? null : null;
    // Who the incoming attack is aimed at, so the player knows whose skin is on the line.
    const aimed = defending && squad ? battle.fighter(battle.attack?.hits[0]?.targetId ?? '') : null;
    this.hud.classList.toggle('squad', squad);
    this.hud.innerHTML = `
      <div class="duel-top">
        <div class="duel-queue"><p class="eyebrow">Próximos turnos</p><div>${queue.map(face).join('')}</div></div>
      </div>
      <p class="duel-legend">${this.climb ? `<b>${this.climb.tower.name} · andar ${this.floorNumber}</b> · Pote ${this.climb.pot} · ` : ''}${battle.assisted ? '<b>Modo assistido</b> · ' : ''}${this.bet > 0 ? `<b>Aposta ${this.bet}</b> · ` : ''}${battle.loot > 0 ? `<b>+${battle.loot} fichas</b> afanadas · ` : ''}${battle.duel.legend} <kbd>Esc</kbd> pausa</p>
      <div class="duel-bottom">
        <div class="duel-actions" ${playerTurn && !this.skillMenu ? '' : 'hidden'}>
          <p class="eyebrow">${squad ? `Vez de ${hero.name}` : 'Sua vez'}</p>
          <button type="button" data-action="attack"><kbd>1</kbd> Atacar</button>
          <button type="button" data-action="skills" ${hero.skills.length > 0 ? '' : `disabled title="Aprenda com ${enemy.name} em Habilidades, na taverna"`}><kbd>2</kbd> Habilidade</button>
          <button type="button" disabled title="Em breve"><kbd>3</kbd> Item do bar</button>
          <button type="button" data-action="firm"><kbd>4</kbd> Firmar</button>
        </div>
        <div class="duel-actions duel-skills" ${playerTurn && this.skillMenu ? '' : 'hidden'}>
          <p class="eyebrow">Habilidades${squad ? ` de ${hero.name}` : ''} · <kbd>Esc</kbd> volta</p>
          ${hero.skills.map((skill, i) => `<button type="button" data-skill="${i}" class="${skill.kind}" ${hero.courage >= skill.cost ? '' : 'disabled'} title="${skill.description}"><kbd>${i + 1}</kbd> ${skill.name} ${pips(skill.cost, skill.cost)}</button>`).join('')}
        </div>
        <p class="duel-hint" ${defending ? '' : 'hidden'}>${aimed ? `Defendendo <b>${aimed.name}</b> · ` : ''}<kbd>J</kbd> aparar &nbsp;·&nbsp; <kbd>K</kbd> esquivar</p>
      </div>`;
    this.hud.querySelector('[data-action="attack"]')?.addEventListener('click', () => battle.attackTarget(this.target()?.id));
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
