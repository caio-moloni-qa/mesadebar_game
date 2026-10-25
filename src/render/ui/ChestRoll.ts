import { GameSession } from '../../core/session/GameSession';
import { Upgrade } from '../../core/systems/UpgradeSystem';
import { fillUpgradeCard, upgradeCard } from '../ChoiceOverlay';
import { upgradeIcon } from './icons';

/** Slowing steps of the slot-machine reveal (Phaser: GameScene.playChestRollAnimation), then a short hold. */
export const CHEST_ROLL_STEPS_MS = [70, 70, 80, 90, 100, 120, 140, 170, 210, 260, 320, 400, 500];
const LANDED_HOLD_MS = 700;

/** "Baú Encontrado!": cycles one card through the rolled pool, slowing down, and lands on the upgrade the session
 *  already applied. The run holds still meanwhile (session.revealing), like the Phaser build. The shuffle order is
 *  cosmetic, so it uses Math.random — the outcome comes from the session's seeded RNG. */
export class ChestRoll {
  private readonly root: HTMLDivElement;
  private readonly card: HTMLButtonElement;
  private timer: number | undefined;
  private session: GameSession | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'chest-roll';
    this.root.hidden = true;
    const title = document.createElement('h2');
    title.textContent = 'Baú Encontrado!';
    this.card = upgradeCard({ icon: '', name: '', description: '' });
    this.card.classList.add('chest-card');
    this.root.append(title, this.card);
    container.appendChild(this.root);
  }

  play(session: GameSession, upgrade: Upgrade, pool: Upgrade[], onLanded: () => void): void {
    this.stop();
    this.session = session;
    session.revealing = true;
    this.root.hidden = false;
    this.card.classList.remove('landed');
    const sequence = [...CHEST_ROLL_STEPS_MS.map(() => pool[Math.floor(Math.random() * pool.length)]), upgrade];
    const step = (index: number) => {
      const shown = sequence[index];
      fillUpgradeCard(this.card, { icon: upgradeIcon(shown.id), name: shown.name, description: shown.description });
      this.card.classList.remove('shuffle');
      void this.card.offsetWidth; // restart the shimmer animation
      this.card.classList.add('shuffle');
      if (index < CHEST_ROLL_STEPS_MS.length) {
        this.timer = window.setTimeout(() => step(index + 1), CHEST_ROLL_STEPS_MS[index]);
        return;
      }
      this.card.classList.add('landed');
      this.timer = window.setTimeout(() => {
        this.stop();
        onLanded();
      }, LANDED_HOLD_MS);
    };
    step(0);
  }

  /** Ends the reveal early (new run, back to the menu) and releases the hold. */
  stop(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.root.hidden = true;
    if (this.session) this.session.revealing = false;
    this.session = null;
  }

  get active(): boolean {
    return !this.root.hidden;
  }
}
