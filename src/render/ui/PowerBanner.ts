const SHOW_MS = 3600;

/** "Nível 10 · Tempestade": the announcement when a power tier switches on mid-run — a banner across the top of the
 *  screen that slides in, holds, and fades (a newer one replaces it). */
export class PowerBanner {
  private readonly root = document.createElement('div');
  private hideTimer = 0;

  constructor(container: HTMLElement) {
    this.root.className = 'power-banner';
    this.root.setAttribute('role', 'status');
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  show(level: number, tier: number, name: string, text: string): void {
    this.root.replaceChildren();
    const eyebrow = document.createElement('span');
    eyebrow.className = 'power-banner-eyebrow';
    eyebrow.textContent = `Nível ${level} · Poder ${'I'.repeat(tier)}`;
    const title = document.createElement('strong');
    title.textContent = name;
    const body = document.createElement('p');
    body.textContent = text;
    this.root.append(eyebrow, title, body);
    this.root.hidden = false;
    // Restart the entrance animation.
    this.root.classList.remove('showing');
    void this.root.offsetWidth;
    this.root.classList.add('showing');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), SHOW_MS);
  }

  hide(): void {
    window.clearTimeout(this.hideTimer);
    this.root.classList.remove('showing');
    this.root.hidden = true;
  }
}
