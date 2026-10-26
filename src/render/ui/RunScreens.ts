import { GameSession } from '../../core/session/GameSession';
import { MAX_MASTERY, RunOutcome, masteryLevel, masteryProgress } from '../../core/progress/Progress';
import { heroName } from '../progress/heroNames';

/** What the end screen shows about progress: the banked run, or why it wasn't banked. */
export interface RunResult {
  outcome: RunOutcome | null;
  note?: string;
}

export interface RunScreenActions {
  resume: () => void;
  restart: () => void;
  menu: () => void;
  exportSave: () => void;
  importSave: () => void;
  tavern: () => void;
}

type Screen = 'none' | 'pause' | 'defeat' | 'victory';

/** Shared pause and result panels. Keyboard shortcuts stay in Game3D (ESC/P, R, M);
 * the buttons also support mouse and touch. */
export class RunScreens {
  private readonly pause: HTMLDivElement;
  private readonly end: HTMLDivElement;
  private readonly endStats: HTMLParagraphElement;
  private readonly endProgress: HTMLDivElement;
  private shown: Screen = 'none';

  constructor(container: HTMLElement, actions: RunScreenActions) {
    this.pause = document.createElement('div');
    this.pause.className = 'run-screen run-pause';
    this.pause.hidden = true;
    this.pause.innerHTML = `
      <div class="run-pause-scroll">
        <p class="eyebrow">UM INSTANTE DE RESPIRO</p>
        <h2>A batalha espera.</h2>
        <p class="screen-caption">Sua jornada continua quando você estiver pronto.</p>
        <button type="button" class="ui-button primary" data-action="resume">Continuar <kbd>Esc</kbd></button>
        <button type="button" class="ui-button" data-action="menu">Voltar ao menu</button>
        <div class="save-actions">
          <button type="button" class="link-button" data-action="exportSave">Exportar progresso</button>
          <button type="button" class="link-button" data-action="importSave">Importar progresso</button>
        </div>
      </div>`;
    this.end = document.createElement('div');
    this.end.className = 'run-screen run-end';
    this.end.hidden = true;
    this.end.innerHTML = `
      <p class="eyebrow">O FIM DE UMA RODADA</p><h2></h2>
      <p class="run-end-stats"></p>
      <div class="run-end-progress"></div>
      <button type="button" class="ui-button primary" data-action="tavern">Ir para a taverna <kbd>T</kbd></button>
      <button type="button" class="ui-button" data-action="restart">Tentar novamente <kbd>R</kbd></button>
      <button type="button" class="ui-button" data-action="menu">Voltar ao menu <kbd>M</kbd></button>`;
    this.endStats = this.end.querySelector('.run-end-stats')!;
    this.endProgress = this.end.querySelector('.run-end-progress')!;
    container.append(this.pause, this.end);
    [this.pause, this.end].forEach((screen) => {
      screen.setAttribute('role', 'dialog');
      screen.setAttribute('aria-modal', 'true');
      screen.setAttribute('aria-label', screen === this.pause ? 'Jogo pausado' : 'Resultado da rodada');
    });
    [this.pause, this.end].forEach((screen) => screen.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action as keyof RunScreenActions | undefined;
      if (action) actions[action]();
    }));
  }

  /** Shows whichever screen the session's state calls for; cheap to call every frame. */
  update(session: GameSession, inMenu: boolean, result: RunResult = { outcome: null }): void {
    const screen: Screen = inMenu ? 'none' : session.over ? (session.victory ? 'victory' : 'defeat') : session.paused ? 'pause' : 'none';
    if (screen === this.shown) return;
    this.shown = screen;
    this.pause.hidden = screen !== 'pause';
    this.end.hidden = screen !== 'defeat' && screen !== 'victory';
    if (screen === 'defeat' || screen === 'victory') {
      const title = this.end.querySelector('h2')!;
      title.textContent = screen === 'victory' ? 'Você sobreviveu.' : 'A noite venceu.';
      title.classList.toggle('victory', screen === 'victory');
      this.end.querySelector('[data-action="restart"]')!.firstChild!.textContent = screen === 'victory' ? 'Jogar novamente ' : 'Tentar novamente ';
      const seconds = Math.floor(session.elapsedMs / 1000);
      this.endStats.textContent = `Tempo ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · Nível ${session.level} · ${session.kills} eliminações`;
      this.renderProgress(result);
      this.end.querySelector<HTMLButtonElement>('[data-action="tavern"]')!.focus();
    }
    if (screen === 'pause') this.pause.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus();
  }

  /** Fichas line by line, the hero's mastery bar (with the levels this run reached), rewards and newcomers. */
  private renderProgress({ outcome, note }: RunResult): void {
    this.endProgress.replaceChildren();
    if (!outcome) {
      if (note) this.endProgress.append(textNode('p', note, 'run-end-note'));
      return;
    }
    const fichas = document.createElement('section');
    fichas.className = 'payout';
    fichas.append(textNode('h3', 'Fichas'));
    const list = document.createElement('ul');
    outcome.payout.fichas.forEach((line) => {
      const row = document.createElement('li');
      row.append(textNode('span', line.label), textNode('span', line.detail, 'detail'), textNode('b', `+${line.amount}`));
      list.append(row);
    });
    fichas.append(list);
    const total = document.createElement('p');
    total.className = 'payout-total';
    total.append(textNode('b', `+${outcome.payout.fichasTotal} Fichas`), textNode('span', ` · você tem ${outcome.save.fichas}`));
    fichas.append(total);

    const mastery = document.createElement('section');
    mastery.className = 'payout mastery';
    const before = masteryLevel(outcome.xpBefore);
    const after = masteryLevel(outcome.xpAfter);
    mastery.append(textNode('h3', `Maestria · ${heroName(outcome.heroId)}`));
    const level = document.createElement('p');
    level.className = 'mastery-level';
    level.textContent = after > before ? `Nível ${before} → ${after}!` : `Nível ${after}${after >= MAX_MASTERY ? ' (máximo)' : ''}`;
    level.classList.toggle('up', after > before);
    const bar = document.createElement('div');
    bar.className = 'mastery-bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(masteryProgress(outcome.xpAfter) * 100)}%`;
    bar.append(fill);
    mastery.append(level, bar, textNode('p', `+${outcome.payout.xpTotal} XP`, 'detail'));
    outcome.rewards.forEach((reward) => mastery.append(textNode('p', `Desbloqueado: ${reward.name}`, 'reward')));

    this.endProgress.append(fichas, mastery);
    outcome.joined.forEach((hero) => this.endProgress.append(textNode('p', `${heroName(hero)} agora é jogável!`, 'run-end-joined')));
  }
}

function textNode(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}
