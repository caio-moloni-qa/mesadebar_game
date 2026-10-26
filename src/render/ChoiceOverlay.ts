import { GameSession, PendingChoice } from '../core/session/GameSession';
import { COMPANIONS } from '../core/systems/CompanionSystem';
import { FAMILY_LABELS, WEAPONS, weaponFamily } from '../config/weapons';
import { MINI_BOSSES } from '../core/systems/MiniBossSystem';
import { companionIcon, upgradeIcon, weaponIcon } from './ui/icons';

/** Upgrade picker: whatever choice the session has open — starting upgrades or a level-up, with its bonus weapon
 *  card — using the shared dark panels, rarity colors, icons and keyboard hints.
 *  Click a card or press 1–5. Re-renders only when the open choice (or its remaining picks) changes. */
export class ChoiceOverlay {
  private readonly root: HTMLDivElement;
  private renderedKey = '';
  private session: GameSession | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'choice-overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Escolha uma melhoria');
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
    const key = !choice ? ''
      : choice.kind === 'companion' ? `companion:${choice.from}:${choice.offers.map((offer) => `${offer.companion}${offer.level}`).join(',')}`
      : choice.kind === 'affinity' ? `affinity:${choice.families.join(',')}`
      : `${choice.kind}:${choice.kind === 'level-up' ? choice.level : choice.picksRemaining}:${choice.upgrades.map((upgrade) => upgrade.id).join(',')}`;
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.hidden = !choice;
    if (choice) this.render(choice);
  }

  private render(choice: PendingChoice): void {
    if (choice.kind === 'companion') {
      this.renderCompanions(choice);
      return;
    }
    if (choice.kind === 'affinity') {
      this.renderAffinity(choice);
      return;
    }
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
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = choice.kind === 'starting' ? 'SEU PRIMEIRO PODER' : 'A JORNADA TE FORTALECE';
    const hint = document.createElement('p');
    hint.className = 'choice-hint';
    hint.textContent = 'Clique para escolher ou use as teclas 1–5';
    this.root.append(eyebrow, heading, row, hint);
    row.querySelector<HTMLButtonElement>('.upgrade-card')?.focus({ preventScroll: true });
  }

  /** The merchant's Tomo de Afinidade: one card per weapon family not yet unlocked. */
  private renderAffinity(choice: Extract<PendingChoice, { kind: 'affinity' }>): void {
    this.root.replaceChildren();
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'TOMO DE AFINIDADE';
    const heading = document.createElement('h2');
    heading.textContent = 'Escolha a família de arma';
    const row = document.createElement('div');
    row.className = 'choice-row';
    choice.families.forEach((family, index) => {
      const label = FAMILY_LABELS[family];
      const representative = Object.values(WEAPONS).find((weapon) => weaponFamily(weapon) === family)!;
      const card = upgradeCard({ icon: weaponIcon(representative.id), name: `Afinidade ${label.toLowerCase()}`, description: `Desbloqueia as melhorias de armas ${label.toLowerCase()} que você já possui ou vier a possuir.`, variant: 'rare', hotkey: index + 1 }, () => this.session?.chooseAffinity(family));
      card.querySelector('.card-tier')!.textContent = label;
      row.appendChild(card);
    });
    this.root.append(eyebrow, heading, row);
    row.querySelector<HTMLButtonElement>('.upgrade-card')?.focus({ preventScroll: true });
  }

  /** A zone guardian fell: pick its companion, or strengthen one already following you. */
  private renderCompanions(choice: Extract<PendingChoice, { kind: 'companion' }>): void {
    this.root.replaceChildren();
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = `${MINI_BOSSES[choice.from].name.toUpperCase()} CAIU`;
    const heading = document.createElement('h2');
    heading.textContent = 'Escolha um companheiro';
    const row = document.createElement('div');
    row.className = 'choice-row';
    choice.offers.forEach((offer, index) => {
      const spec = COMPANIONS[offer.companion];
      const card = upgradeCard({
        icon: companionIcon(offer.companion),
        name: offer.level > 1 ? `${spec.name} — nível ${offer.level}` : spec.name,
        description: offer.level > 1 ? `Fortalece seu companheiro: mais dano${offer.companion === 'stoneGolem' ? ' e vida' : ' e cadência'}.` : spec.description,
        variant: offer.level > 1 ? '' : 'rare',
        hotkey: index + 1
      }, () => this.session?.chooseCompanion(index));
      card.querySelector('.card-tier')!.textContent = offer.level > 1 ? 'FORTALECER' : 'NOVO COMPANHEIRO';
      row.appendChild(card);
    });
    const hint = document.createElement('p');
    hint.className = 'choice-hint';
    hint.textContent = 'Clique para escolher ou use as teclas 1–3';
    this.root.append(eyebrow, heading, row, hint);
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

/** One power card. A <button> so it's focusable and works with keyboard and touch. */
export function upgradeCard(content: UpgradeCardContent, onPick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `upgrade-card ${content.variant ?? ''}`.trim();
  button.innerHTML = '<small class="card-tier"></small><img alt=""><strong></strong><span></span>';
  fillUpgradeCard(button, content);
  if (content.hotkey) button.dataset.hotkey = String(content.hotkey);
  button.querySelector('.card-tier')!.textContent = content.variant === 'rare' ? 'RARA' : content.variant === 'weapon' ? 'NOVA ARMA' : 'MELHORIA';
  if (onPick) button.addEventListener('click', onPick);
  else button.disabled = true;
  return button;
}

export function fillUpgradeCard(card: HTMLElement, { icon, name, description }: UpgradeCardContent): void {
  card.querySelector('img')!.src = icon;
  card.querySelector('strong')!.textContent = name;
  card.querySelector('span')!.textContent = description;
}
