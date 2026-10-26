import { META_UPGRADES, MetaUpgradeId, SaveData, nextPrice } from '../../core/progress/Progress';
import { npcPortrait } from './icons';

export interface SergioShopActions {
  save(): SaveData;
  buy(id: MetaUpgradeId): void;
  exportSave(): void;
  importSave(): void;
  close(): void;
}

const WELCOME = 'Bem-vindo à minha taverna! Aqui você descansa entre as partidas. Cada partida rende Fichas: gaste comigo em melhorias que valem para sempre. Escolha um herói ali junto à parede e saia pelo portal quando estiver pronto.';
const GREETING = 'De volta, viajante? Fichas na mesa, e eu deixo você mais forte para a próxima.';

/** Sergio's counter between runs: his permanent upgrades (level pips, the next price, buy), the Fichas you hold,
 *  and the save's export/import. The first visit opens with his welcome. */
export class SergioShop {
  private readonly root: HTMLDivElement;
  private welcome = false;

  constructor(container: HTMLElement, private readonly actions: SergioShopActions) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-dialog sergio-shop';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Melhorias do Sergio');
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(welcome = false): void {
    this.welcome = welcome;
    this.root.hidden = false;
    this.render();
    this.root.querySelector<HTMLButtonElement>('.shop-buy:not(:disabled), .shop-close')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(): void {
    if (this.root.hidden) return;
    const save = this.actions.save();
    this.root.replaceChildren();
    const portrait = document.createElement('div');
    portrait.className = 'dialog-portrait';
    const image = document.createElement('img');
    image.alt = '';
    image.src = npcPortrait('sergio') ?? '';
    portrait.append(image);
    const body = document.createElement('div');
    body.className = 'dialog-body';
    const name = document.createElement('p');
    name.className = 'dialog-name';
    name.innerHTML = 'Sergio <span>Taberneiro e mercador</span>';
    const said = document.createElement('p');
    said.className = 'dialog-text';
    said.textContent = `“${this.welcome ? WELCOME : GREETING}”`;
    const balance = document.createElement('p');
    balance.className = 'shop-balance';
    balance.innerHTML = `Você tem <b>${save.fichas}</b> Fichas`;
    const list = document.createElement('ul');
    list.className = 'shop-list';
    META_UPGRADES.forEach((spec) => {
      const level = save.upgrades[spec.id] ?? 0;
      const price = nextPrice(save, spec.id);
      const row = document.createElement('li');
      const info = document.createElement('div');
      info.className = 'shop-info';
      const title = document.createElement('strong');
      title.textContent = spec.name;
      const effect = document.createElement('span');
      effect.textContent = spec.perLevel;
      const pips = document.createElement('span');
      pips.className = 'shop-pips';
      pips.setAttribute('aria-label', `Nível ${level} de ${spec.maxLevel}`);
      for (let index = 0; index < spec.maxLevel; index += 1) {
        const pip = document.createElement('i');
        if (index < level) pip.className = 'on';
        pips.append(pip);
      }
      info.append(title, effect, pips);
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'ui-button shop-buy';
      if (price === null) {
        buy.textContent = 'Máximo';
        buy.disabled = true;
      } else {
        buy.textContent = `${price} Fichas`;
        buy.disabled = save.fichas < price;
        buy.title = buy.disabled ? 'Fichas insuficientes' : `Comprar o nível ${level + 1}`;
        buy.addEventListener('click', () => {
          this.welcome = false;
          this.actions.buy(spec.id);
          this.render();
        });
      }
      row.append(info, buy);
      list.append(row);
    });
    const footer = document.createElement('div');
    footer.className = 'dialog-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ui-button primary shop-close';
    close.textContent = 'Até mais (Esc)';
    close.addEventListener('click', () => this.actions.close());
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'link-button';
    exportButton.textContent = 'Exportar progresso';
    exportButton.addEventListener('click', () => this.actions.exportSave());
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'link-button';
    importButton.textContent = 'Importar progresso';
    importButton.addEventListener('click', () => this.actions.importSave());
    footer.append(close, exportButton, importButton);
    body.append(name, said, balance, list, footer);
    this.root.append(portrait, body);
  }
}

/** The tavern's header between runs: the Fichas you hold, and what the room's stations do. */
export class TavernHeader {
  private readonly root: HTMLDivElement;
  private shown = '';

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-header';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  update(visible: boolean, save: SaveData, heroName: string): void {
    this.root.hidden = !visible;
    if (!visible) return;
    const key = `${save.fichas}|${heroName}`;
    if (key === this.shown) return;
    this.shown = key;
    this.root.innerHTML = `<p class="eyebrow">A TAVERNA</p><p class="tavern-fichas"><b>${save.fichas}</b> Fichas · jogando com <b></b></p><p class="tavern-hints">Fale com o Sergio para melhorias · troque de herói junto à parede · saia pelo portal para jogar</p>`;
    this.root.querySelectorAll('b')[1].textContent = heroName;
  }
}
