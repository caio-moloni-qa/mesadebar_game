import { GameSession, PendingChoice } from '../core/session/GameSession';

/** Placeholder upgrade picker for the vertical slice (the themed card screens are Etapa 4): renders whatever choice
 *  the session has open — starting upgrades or a level-up, with its bonus weapon card — as plain DOM cards.
 *  Click a card or press 1–5. Re-renders only when the open choice (or its remaining picks) changes. */
export class ChoiceOverlay {
  private readonly root: HTMLDivElement;
  private renderedKey = '';
  private session: GameSession | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'choice-overlay';
    this.root.hidden = true;
    container.appendChild(this.root);
    window.addEventListener('keydown', (event) => {
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0) return;
      this.root.querySelectorAll<HTMLButtonElement>('.choice-card')[index]?.click();
    });
  }

  update(session: GameSession): void {
    this.session = session;
    const choice = session.pendingChoice;
    const key = choice ? `${choice.kind}:${choice.kind === 'level-up' ? choice.level : choice.picksRemaining}:${choice.upgrades.map((upgrade) => upgrade.id).join(',')}` : '';
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.hidden = !choice;
    if (choice) this.render(choice);
  }

  private render(choice: PendingChoice): void {
    const title = choice.kind === 'starting'
      ? `Melhorias iniciais — escolha ${choice.picksRemaining} de ${choice.picksTotal}`
      : `NÍVEL ${choice.level}! Escolha uma melhoria`;
    this.root.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = title;
    const row = document.createElement('div');
    row.className = 'choice-row';
    choice.upgrades.forEach((upgrade) => row.appendChild(this.card(upgrade.name, upgrade.description, upgrade.tier === 'rare' ? 'rare' : '', () => this.session?.chooseUpgrade(upgrade.id))));
    if (choice.kind === 'level-up' && choice.extraWeapon) {
      const weapon = choice.extraWeapon;
      row.appendChild(this.card(`ARMA EXTRA: ${weapon.name}`, weapon.description, 'weapon', () => this.session?.chooseExtraWeapon()));
    }
    this.root.append(heading, row);
  }

  private card(name: string, description: string, variant: string, onPick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice-card ${variant}`.trim();
    const label = document.createElement('strong');
    label.textContent = name;
    const text = document.createElement('span');
    text.textContent = description;
    button.append(label, text);
    button.addEventListener('click', onPick);
    return button;
  }
}
