import { GameSession } from '../../core/session/GameSession';

export interface RunScreenActions {
  resume: () => void;
  restart: () => void;
  menu: () => void;
}

type Screen = 'none' | 'pause' | 'defeat' | 'victory';

/** Shared pause and result panels. Keyboard shortcuts stay in Game3D (ESC/P, R, M);
 * the buttons also support mouse and touch. */
export class RunScreens {
  private readonly pause: HTMLDivElement;
  private readonly end: HTMLDivElement;
  private readonly endStats: HTMLParagraphElement;
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
      </div>`;
    this.end = document.createElement('div');
    this.end.className = 'run-screen run-end';
    this.end.hidden = true;
    this.end.innerHTML = `
      <p class="eyebrow">O FIM DE UMA RODADA</p><h2></h2>
      <p class="run-end-stats"></p>
      <button type="button" class="ui-button primary" data-action="restart">Tentar novamente <kbd>R</kbd></button>
      <button type="button" class="ui-button" data-action="menu">Voltar ao menu <kbd>M</kbd></button>`;
    this.endStats = this.end.querySelector('.run-end-stats')!;
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
  update(session: GameSession, inMenu: boolean): void {
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
      this.endStats.textContent = `Tempo sobrevivido: ${Math.floor(session.elapsedMs / 1000)}s\nNível alcançado: ${session.level}\nEliminações: ${session.kills}`;
      this.end.querySelector<HTMLButtonElement>('[data-action="restart"]')!.focus();
    }
    if (screen === 'pause') this.pause.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus();
  }
}
