import { SKILL_PROGRESSION, SkillNode, SkillTreeSpec } from '../../config/tavernSkills';
import { TavernRegularSave } from '../../core/progress/Progress';
import { NodeStatus, equipFinisher, findNode, learn, nextLevelProgress, nodeStatus, pointsLeft } from '../../core/tavern/SkillTree';
import { npcFace } from '../ui/icons';

export interface SkillTreeHooks {
  /** The regular's saved state and the Fichas on hand, fresh each time it's drawn. */
  state(regular: string): { regular: TavernRegularSave; fichas: number };
  /** Learning or equipping: write the new state to the save. */
  save(regular: string, state: TavernRegularSave): void;
  /** "Resetar": true if it was paid for and done. */
  reset(regular: string): boolean;
  closed(): void;
}

const KIND_LABEL: Record<SkillNode['kind'], string> = { active: 'Ativa', passive: 'Passiva', finisher: 'Finalizador' };
const STATUS_LABEL: Record<NodeStatus, string> = { learned: 'Aprendida', available: 'Disponível', locked: 'Bloqueada' };

/** "Habilidades" in a regular's dialogue: their tree (mock 3) — three branch columns top to bottom, node states
 *  (learned, available, locked; the finisher is a diamond), a detail panel with "Aprender", and the points left. */
export class SkillTreeScreen {
  private readonly root: HTMLDivElement;
  private tree: SkillTreeSpec | null = null;
  private regularName = '';
  private selected = '';

  constructor(container: HTMLElement, private readonly hooks: SkillTreeHooks) {
    this.root = document.createElement('div');
    this.root.className = 'skill-tree';
    this.root.setAttribute('role', 'dialog');
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get open(): boolean { return !this.root.hidden; }

  show(tree: SkillTreeSpec, regularName: string): void {
    this.tree = tree;
    this.regularName = regularName;
    const { regular } = this.hooks.state(tree.regular);
    // Start on something worth reading: the first node they can learn, else the first one.
    const nodes = tree.branches.flatMap((branch) => branch.nodes);
    this.selected = (nodes.find((node) => nodeStatus(tree, regular, node.id) === 'available') ?? nodes[0]).id;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.hooks.closed();
  }

  keydown(event: KeyboardEvent): void {
    event.preventDefault();
    if (event.code === 'Escape') this.close();
    else if (event.code === 'Enter' || event.code === 'NumpadEnter') this.primary();
  }

  /** The detail panel's main button: learn the node, or equip the finisher. */
  private primary(): void {
    const tree = this.tree!;
    const { regular } = this.hooks.state(tree.regular);
    const next = learn(tree, regular, this.selected) ?? equipFinisher(tree, regular, this.selected);
    if (!next || next.finisher === regular.finisher && next.learned.length === regular.learned.length) return;
    this.hooks.save(tree.regular, next);
    this.render();
  }

  private render(): void {
    const tree = this.tree!;
    const { regular, fichas } = this.hooks.state(tree.regular);
    const points = pointsLeft(regular);
    const progress = nextLevelProgress(regular);
    const columns = tree.branches.map((branch) => `
      <section class="skill-branch">
        <h3>${branch.name}</h3>
        <p class="skill-theme">${branch.theme}</p>
        <ol>${branch.nodes.map((node) => {
          const status = nodeStatus(tree, regular, node.id);
          const equipped = regular.finisher === node.id;
          return `<li><button type="button" data-node="${node.id}" class="skill-node ${status} ${node.kind}${node.id === this.selected ? ' selected' : ''}${equipped ? ' equipped' : ''}" title="${node.name}">
            <span class="skill-gem"></span><span class="skill-node-name">${node.name}</span></button></li>`;
        }).join('')}</ol>
      </section>`).join('');
    const { node } = findNode(tree, this.selected)!;
    const status = nodeStatus(tree, regular, node.id);
    const learned = status === 'learned';
    const equipped = regular.finisher === node.id;
    const action = !learned
      ? `<button type="button" class="ui-button primary" data-primary ${status === 'available' ? '' : 'disabled'}>Aprender (1 ponto)</button>`
      : node.kind === 'finisher' && !equipped
        ? `<button type="button" class="ui-button primary" data-primary>Equipar finalizador</button>`
        : '';
    const resetCost = SKILL_PROGRESSION.resetFichas;
    this.root.innerHTML = `
      <div class="skill-tree-panel">
        <header class="skill-tree-head">
          <img class="skill-face" alt="" src="${npcFace(tree.regular as Parameters<typeof npcFace>[0])}">
          <div>
            <p class="eyebrow">Habilidades · o que se aprende no duelo</p>
            <h2>${this.regularName} <span>nível ${regular.level}</span></h2>
            <div class="skill-xp"><i style="width:${progress ? Math.min(100, (progress.into / progress.span) * 100) : 100}%"></i>
              <span>${progress ? `${progress.into}/${progress.span} XP` : 'nível máximo'}</span></div>
          </div>
          <p class="skill-points"><b>${points}</b> ${points === 1 ? 'ponto' : 'pontos'}</p>
        </header>
        <div class="skill-tree-body">
          <div class="skill-columns">${columns}</div>
          <aside class="skill-detail">
            <p class="eyebrow">${KIND_LABEL[node.kind]} · ${STATUS_LABEL[status]}${equipped ? ' · equipado' : ''}</p>
            <h3>${node.name}</h3>
            <p>${node.description}</p>
            ${node.cost > 0 ? `<p class="skill-cost">Custa ${node.cost} de Coragem</p>` : '<p class="skill-cost">Sempre ligada</p>'}
            ${status === 'locked' && !learned ? `<p class="skill-why">${points <= 0 ? 'Sem pontos: duele com ele pra ganhar XP.' : 'Aprenda a anterior deste galho primeiro.'}</p>` : ''}
            ${node.kind === 'finisher' ? '<p class="skill-why">Só um finalizador fica equipado por vez.</p>' : ''}
            <div class="skill-detail-actions">${action}</div>
          </aside>
        </div>
        <footer class="skill-tree-foot">
          <button type="button" class="ui-button" data-reset ${regular.learned.length > 0 && fichas >= resetCost ? '' : 'disabled'}>Resetar árvore (${resetCost} Fichas)</button>
          <span>Duelar com ${this.regularName} dá XP: vitória vale mais, cada aparo perfeito soma.</span>
          <button type="button" class="ui-button" data-close>Voltar (Esc)</button>
        </footer>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-node]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selected = button.dataset.node!;
        this.render();
      });
    });
    this.root.querySelector('[data-primary]')?.addEventListener('click', () => this.primary());
    this.root.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    this.root.querySelector('[data-reset]')?.addEventListener('click', () => {
      if (this.hooks.reset(tree.regular)) this.render();
    });
  }
}
