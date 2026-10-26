/** A tip someone in the tavern gives, centred over the game: portrait, name, a line in quotes, a few labelled details
 *  and one button. The caller holds the game still while it's open. */
export interface Tip {
  speaker: { name: string; epithet: string; portrait?: string };
  title: string;
  text: string;
  details: ReadonlyArray<readonly [string, string]>;
  button?: string;
}

export class TipDialog {
  private readonly root: HTMLDivElement;
  private onClose: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-dialog tip-dialog';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    container.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(tip: Tip, onClose: () => void): void {
    this.onClose = onClose;
    this.root.setAttribute('aria-label', tip.title);
    this.root.innerHTML = `
      <div class="dialog-portrait"><img alt=""></div>
      <div class="dialog-body">
        <p class="dialog-name"><b></b> <span></span></p>
        <p class="eyebrow dialog-title"></p>
        <p class="dialog-text"></p>
        <ul class="dialog-details"></ul>
        <div class="dialog-actions"><button type="button" class="ui-button primary"></button></div>
      </div>`;
    this.root.querySelector('img')!.src = tip.speaker.portrait ?? '';
    this.root.querySelector('.dialog-name b')!.textContent = tip.speaker.name;
    this.root.querySelector('.dialog-name span')!.textContent = tip.speaker.epithet;
    this.root.querySelector('.dialog-title')!.textContent = tip.title;
    this.root.querySelector('.dialog-text')!.textContent = `“${tip.text}”`;
    const details = this.root.querySelector('.dialog-details')!;
    tip.details.forEach(([label, text]) => {
      const item = document.createElement('li');
      const bold = document.createElement('b');
      bold.textContent = `${label}: `;
      item.append(bold, text);
      details.append(item);
    });
    const button = this.root.querySelector('button')!;
    button.textContent = `${tip.button ?? 'Entendi'} (Enter)`;
    button.addEventListener('click', () => this.close());
    this.root.hidden = false;
    button.focus({ preventScroll: true });
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.();
  }

  /** Dropped without running its callback (a new session). */
  reset(): void {
    this.root.hidden = true;
    this.onClose = null;
  }
}
