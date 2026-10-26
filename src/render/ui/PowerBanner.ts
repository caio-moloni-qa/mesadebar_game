/** How long the card holds before the run resumes on its own. */
const HOLD_MS = 3200;

export interface PowerUnlock {
  level: number;
  tier: number;
  name: string;
  text: string;
}

/** "Novo poder!": a power tier switching on mid-run. The run holds while a card rises in the middle of the screen
 *  (light rays behind it, a short fanfare); it closes by itself or on Enter / Space / Esc / a click. Several at once
 *  (a sandbox jump of levels) play one after another. `onShow` fires as each card appears, `onDone` once the last
 *  one is gone. */
export class PowerBanner {
  private readonly root = document.createElement('div');
  private readonly queue: PowerUnlock[] = [];
  private closeTimer = 0;
  private onDone: () => void = () => {};

  constructor(container: HTMLElement, private readonly onShow: () => void) {
    this.root.className = 'power-fanfare';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-live', 'assertive');
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.next());
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(unlock: PowerUnlock, onDone: () => void): void {
    this.onDone = onDone;
    this.queue.push(unlock);
    if (!this.open) this.next();
  }

  /** Closes the current card (and shows the next one queued, if any). */
  next(): void {
    window.clearTimeout(this.closeTimer);
    const unlock = this.queue.shift();
    if (!unlock) {
      this.root.hidden = true;
      this.root.classList.remove('showing');
      this.onDone();
      return;
    }
    this.root.replaceChildren();
    const rays = document.createElement('div');
    rays.className = 'power-fanfare-rays';
    const card = document.createElement('div');
    card.className = 'power-fanfare-card';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'power-fanfare-eyebrow';
    eyebrow.textContent = 'Novo poder!';
    const level = document.createElement('p');
    level.className = 'power-fanfare-level';
    level.textContent = `Nível ${unlock.level} · Poder ${'I'.repeat(unlock.tier)}`;
    const name = document.createElement('h2');
    name.textContent = unlock.name;
    const text = document.createElement('p');
    text.className = 'power-fanfare-text';
    text.textContent = unlock.text;
    const hint = document.createElement('p');
    hint.className = 'power-fanfare-hint';
    hint.textContent = 'Enter para continuar';
    card.append(eyebrow, level, name, text, hint);
    this.root.append(rays, card);
    this.root.hidden = false;
    // Restart the entrance animation.
    this.root.classList.remove('showing');
    void this.root.offsetWidth;
    this.root.classList.add('showing');
    this.onShow();
    this.closeTimer = window.setTimeout(() => this.next(), HOLD_MS);
  }

  /** Drops everything without resuming anything (the run is being thrown away). */
  reset(): void {
    window.clearTimeout(this.closeTimer);
    this.queue.length = 0;
    this.root.hidden = true;
    this.root.classList.remove('showing');
  }
}
