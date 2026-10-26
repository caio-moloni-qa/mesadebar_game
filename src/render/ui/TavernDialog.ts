import { GameSession } from '../../core/session/GameSession';
import { npcFace } from './icons';
import { goalText, progressText, rewardText } from './questText';

/** Talking to a tavern regular: their portrait and name, what they say, the mission's objective and reward, and the
 *  answer buttons — accept / claim (E) or leave (Esc). Re-renders only when who you're talking to or what they have
 *  for you changes. */
export class TavernDialog {
  private readonly root: HTMLDivElement;
  private renderedKey = '';
  private session: GameSession | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-dialog';
    this.root.setAttribute('role', 'dialog');
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  update(session: GameSession): void {
    this.session = session;
    const index = session.dialogue;
    const quest = index === null ? null : session.quests.quests[index];
    const key = quest ? `${index}:${quest.tier}:${quest.status}:${progressText(session.quests, quest)}` : '';
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.hidden = !quest;
    if (!quest) return;
    const spec = session.quests.spec(quest);
    const { npc } = quest;
    const said = quest.status === 'offer' ? spec.pitch
      : quest.status === 'active' ? 'E então? Ainda estou esperando. Volte quando terminar.'
      : quest.status === 'ready' ? npc.thanks
      : npc.done;
    const primary = quest.status === 'offer' ? 'Aceitar missão' : quest.status === 'ready' ? 'Receber recompensa' : '';
    this.root.innerHTML = `
      <div class="dialog-portrait"><img alt=""></div>
      <div class="dialog-body">
        <p class="dialog-name"></p>
        <p class="eyebrow dialog-title"></p>
        <p class="dialog-text"></p>
        <ul class="dialog-details"></ul>
        <div class="dialog-actions"></div>
      </div>`;
    this.root.querySelector('img')!.src = npcFace(npc.id);
    this.root.querySelector('.dialog-name')!.innerHTML = `${npc.name} <span>${npc.epithet}</span>`;
    this.root.querySelector('.dialog-title')!.textContent = quest.status === 'done' ? 'SEM MAIS MISSÕES' : `MISSÃO ${quest.tier + 1}/${npc.quests.length}: ${spec.title}`;
    this.root.querySelector('.dialog-text')!.textContent = `“${said}”`;
    const details = this.root.querySelector('.dialog-details')!;
    if (quest.status !== 'done') {
      const progress = quest.status === 'offer' ? '' : ` (${progressText(session.quests, quest)})`;
      details.innerHTML = `<li><b>Objetivo:</b> </li><li><b>Recompensa:</b> </li>`;
      details.children[0].append(goalText(spec.goal) + progress);
      details.children[1].append(rewardText(spec.reward));
    }
    const actions = this.root.querySelector('.dialog-actions')!;
    if (primary) actions.appendChild(this.button(`${primary} (E)`, 'primary', () => this.session?.answerDialogue()));
    actions.appendChild(this.button('Até mais (Esc)', '', () => this.session?.closeDialogue()));
    actions.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
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
