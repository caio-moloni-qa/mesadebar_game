import { GameSession } from '../../core/session/GameSession';
import { MISSIONS_PER_REGULAR, REGULAR_UNLOCKS, SaveData, masteryLevel, rosterFor } from '../../core/progress/Progress';
import { heroName } from '../progress/heroNames';
import { CharacterId } from '../../config/characters';
import { DUELS, DuelId } from '../../config/tavernBattle';
import { SKILL_TREES } from '../../config/tavernSkills';
import { npcFace } from './icons';
import { goalText, progressText, rewardText } from './questText';

/** Talking to a tavern regular: their portrait and name, what they say, the mission's objective and reward, and the
 *  answer buttons — accept / claim (E) or leave (Esc). Re-renders only when who you're talking to or what they have
 *  for you changes. */
export class TavernDialog {
  private readonly root: HTMLDivElement;
  private renderedKey = '';
  private session: GameSession | null = null;

  /** `onPlay`: between runs, an unlocked regular's "Jogar com …" opens their hero card. */
  /** `onDuel`: between runs, "Desafiar" opens a Taverna em Turnos duel with the regulars who have one;
   *  `onSkills`: "Habilidades" opens their skill tree. */
  constructor(container: HTMLElement, private readonly onPlay: (hero: CharacterId) => void = () => {}, private readonly onDuel: (duel: DuelId) => void = () => {}, private readonly onSkills: (regular: string) => void = () => {}) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-dialog';
    this.root.setAttribute('role', 'dialog');
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  /** `save`: between runs the regulars talk about your progress with them (missions done over all runs, and what
   *  it takes for them to join you) instead of handing out a mission. */
  update(session: GameSession, save?: SaveData): void {
    this.session = session;
    const index = session.dialogue;
    const quest = index === null ? null : session.quests.quests[index];
    const hub = session.merchant.hub && save ? save : null;
    const key = quest ? `${hub ? 'hub:' : ''}${index}:${quest.tier}:${quest.status}:${progressText(session.quests, quest)}` : '';
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.hidden = !quest;
    if (!quest) return;
    const spec = session.quests.spec(quest);
    const { npc } = quest;
    if (hub && quest.npc.id in REGULAR_UNLOCKS) {
      this.renderProgress(quest.npc.id as keyof typeof REGULAR_UNLOCKS, hub);
      return;
    }
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

  /** Between runs: missions done with this regular over all runs, the next one, and the road to playing them. */
  private renderProgress(id: keyof typeof REGULAR_UNLOCKS, save: SaveData): void {
    const quest = this.session!.quests.quests.find((candidate) => candidate.npc.id === id)!;
    const { npc } = quest;
    const done = Math.min(MISSIONS_PER_REGULAR, save.regularMissions[id] ?? 0);
    const rule = REGULAR_UNLOCKS[id];
    const level = masteryLevel(save.mastery[rule.hero] ?? 0);
    const joined = rosterFor(save).includes(id);
    const said = joined ? 'Estou pronto para lutar ao seu lado. É só me chamar para a próxima partida!'
      : done >= MISSIONS_PER_REGULAR ? `Você fez tudo o que eu pedi. Agora me mostre do que é capaz com ${heroName(rule.hero)}, e eu vou com você.`
      : done === 0 ? 'Tenho um trabalho para você, mas só lá fora, na arena. Me procure quando o portal da taverna abrir durante a partida.'
      : 'Bom trabalho até aqui. Ainda tenho mais para você, lá na arena.';
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
    this.root.querySelector('.dialog-title')!.textContent = `MISSÕES COMPLETAS: ${done}/${MISSIONS_PER_REGULAR}`;
    this.root.querySelector('.dialog-text')!.textContent = `“${said}”`;
    const details = this.root.querySelector('.dialog-details')!;
    const next = done < MISSIONS_PER_REGULAR ? npc.quests[done].title : 'todas completas';
    details.innerHTML = '<li><b>Próxima missão:</b> </li><li><b>Para jogar com ' + npc.name + ':</b> </li>';
    details.children[0].append(next);
    details.children[1].append(joined ? 'liberado!' : `as ${MISSIONS_PER_REGULAR} missões (${done}/${MISSIONS_PER_REGULAR}) e maestria ${rule.level} com ${heroName(rule.hero)} (nível ${level})`);
    const actions = this.root.querySelector('.dialog-actions')!;
    if (joined) {
      actions.appendChild(this.button(`Jogar com ${npc.name}`, 'primary', () => {
        this.session?.closeDialogue();
        this.onPlay(id);
      }));
    }
    if (id in DUELS) actions.appendChild(this.button('Desafiar para um duelo', joined ? '' : 'primary', () => this.onDuel(id as DuelId)));
    if (id in SKILL_TREES) actions.appendChild(this.button('Habilidades', '', () => this.onSkills(id)));
    actions.appendChild(this.button('Até mais (Esc)', joined || id in DUELS ? '' : 'primary', () => this.session?.closeDialogue()));
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
