import { GameSession, PendingChoice } from '../core/session/GameSession';
import { upgradeIcon, weaponIcon } from './ui/icons';

/** Upgrade picker: whatever choice the session has open — starting upgrades or a level-up, with its bonus weapon
 *  card — as the Phaser build's framed wood cards (upgrade_card_panel art, icon, gold name, cream description).
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
      if (this.root.hidden) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0) return;
      this.root.querySelectorAll<HTMLButtonElement>('.upgrade-card')[index]?.click();
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
    choice.upgrades.forEach((upgrade, index) => row.appendChild(upgradeCard({ icon: upgradeIcon(upgrade.id), name: upgrade.name, description: upgrade.description, variant: upgrade.tier === 'rare' ? 'rare' : '', hotkey: index + 1 }, () => this.session?.chooseUpgrade(upgrade.id))));
    if (choice.kind === 'level-up' && choice.extraWeapon) {
      const weapon = choice.extraWeapon;
      row.appendChild(upgradeCard({ icon: weaponIcon(weapon.id), name: `ARMA EXTRA: ${weapon.name}`, description: weapon.description, variant: 'weapon', hotkey: choice.upgrades.length + 1 }, () => this.session?.chooseExtraWeapon()));
    }
    this.root.append(heading, row);
    row.querySelector<HTMLButtonElement>('.upgrade-card')?.focus({ preventScroll: true });
  }
}

export interface UpgradeCardContent {
  icon: string;
  name: string;
  description: string;
  variant?: '' | 'rare' | 'weapon';
  hotkey?: number;
}

/** One framed card. A <button> so it's focusable and works with keyboard and touch. */
export function upgradeCard(content: UpgradeCardContent, onPick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `upgrade-card ${content.variant ?? ''}`.trim();
  button.innerHTML = '<img alt=""><strong></strong><span></span>';
  fillUpgradeCard(button, content);
  if (content.hotkey) button.dataset.hotkey = String(content.hotkey);
  if (onPick) button.addEventListener('click', onPick);
  else button.disabled = true;
  return button;
}

export function fillUpgradeCard(card: HTMLElement, { icon, name, description }: UpgradeCardContent): void {
  card.querySelector('img')!.src = icon;
  card.querySelector('strong')!.textContent = name;
  card.querySelector('span')!.textContent = description;
}
