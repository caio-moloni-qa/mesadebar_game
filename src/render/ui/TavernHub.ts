import { CONSUMABLES, ConsumableId, DIFFICULTY_TIERS, META_UPGRADES, MetaUpgradeId, SaveData, areaCompletion, nextPrice } from '../../core/progress/Progress';
import { CURRENT_AREA } from '../../config/areas';
import { heroName } from '../progress/heroNames';
import { merchantItemIcon, npcPortrait, storeIcon } from './icons';
import { MerchantOffer } from '../../core/systems/MerchantSystem';

export interface SergioShopActions {
  save(): SaveData;
  /** Sergio has joined the roster: offer to play as him. */
  canPlaySergio(): boolean;
  playSergio(): void;
  buy(id: MetaUpgradeId): void;
  buyConsumable(id: ConsumableId): void;
  /** During a run's visit through his portal: this visit's items, the run's coins, and buying one. Null between
   *  runs. */
  runShop(): { coins: number; offers: MerchantOffer[]; buy(index: number): void } | null;
  exportSave(): void;
  importSave(): void;
  close(): void;
}

const WELCOME = 'Bem-vindo à minha taverna! Cada partida rende Fichas. Aqui no balcão você gasta: melhorias que valem para sempre, ou provisões para a próxima saída.';
const GREETING = 'De volta, viajante? Fichas na mesa, e eu deixo você mais forte para a próxima.';
const RUN_GREETING = 'Lá fora o tempo parou, pode escolher com calma. Moedas na mesa!';

type ShopTab = 'atributos' | 'consumiveis';

const TABS: Array<{ id: ShopTab; label: string; hint: string }> = [
  { id: 'atributos', label: 'Atributos', hint: 'Melhorias permanentes, para todos os heróis.' },
  { id: 'consumiveis', label: 'Consumíveis', hint: 'Valem só para a próxima partida: saem da mochila quando ela começa. Um de cada.' }
];

/** Sergio's store, opened at his counter. Between runs: two shelves for Fichas, the permanent attributes (level
 *  pips, the next price) and the consumables for the next run (one of each in the pack), plus the save's
 *  export/import; the first visit opens with his welcome. During a run's visit: this visit's items, for the run's
 *  coins (every purchase makes what's left dearer). */
export class SergioShop {
  private readonly root: HTMLDivElement;
  private welcome = false;
  private tab: ShopTab = 'atributos';

  constructor(container: HTMLElement, private readonly actions: SergioShopActions) {
    this.root = document.createElement('div');
    this.root.className = 'sergio-store';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Loja do Sergio');
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
    this.root.querySelector<HTMLButtonElement>('.store-buy:not(:disabled), .store-close')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(): void {
    if (this.root.hidden) return;
    const save = this.actions.save();
    const run = this.actions.runShop();
    const focused = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.focus : undefined;
    this.root.replaceChildren();
    const panel = document.createElement('div');
    panel.className = 'store-panel';

    const header = document.createElement('header');
    header.className = 'store-header';
    const portrait = document.createElement('img');
    portrait.className = 'store-portrait';
    portrait.alt = '';
    portrait.src = npcPortrait('sergio') ?? '';
    const speech = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'dialog-name';
    name.innerHTML = 'Sergio <span>Taberneiro e mercador</span>';
    const said = document.createElement('p');
    said.className = 'dialog-text';
    said.textContent = `“${run ? RUN_GREETING : this.welcome ? WELCOME : GREETING}”`;
    speech.append(name, said);
    const balance = document.createElement('p');
    balance.className = 'store-balance';
    balance.innerHTML = run ? `<small>Suas moedas</small><b>${run.coins}</b>` : `<small>Suas Fichas</small><b>${save.fichas}</b>`;
    header.append(portrait, speech, balance);

    const tabs = document.createElement('div');
    tabs.className = 'store-tabs';
    tabs.setAttribute('role', 'tablist');
    TABS.forEach((spec) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(spec.id === this.tab));
      tab.dataset.focus = `tab-${spec.id}`;
      tab.textContent = spec.id === 'consumiveis' && save.pack.length > 0 ? `${spec.label} · ${save.pack.length} na mochila` : spec.label;
      tab.addEventListener('click', () => {
        this.tab = spec.id;
        this.render();
      });
      tabs.append(tab);
    });
    const hint = document.createElement('p');
    hint.className = 'store-hint';
    hint.textContent = run ? 'Itens desta partida, pagos com moedas. Cada compra deixa o resto 3× mais caro.' : TABS.find((spec) => spec.id === this.tab)!.hint;
    if (run) {
      tabs.replaceChildren();
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'true');
      tab.textContent = 'Itens da run';
      tabs.append(tab);
    }

    const grid = document.createElement('ul');
    grid.className = 'store-grid';
    grid.setAttribute('role', 'tabpanel');
    if (run) {
      run.offers.forEach((offer, index) => {
        const tag = document.createElement('span');
        tag.className = `store-tag${offer.purchased ? ' packed' : ''}`;
        tag.textContent = offer.purchased ? 'Comprado' : offer.cost === 0 ? 'Grátis!' : 'Nesta partida';
        grid.append(this.card(offer.id, offer.name, offer.description, tag, offer.purchased ? null : { price: offer.cost, affordable: run.coins >= offer.cost, label: 'Comprar', unit: 'moedas' }, () => run.buy(index), 'Vendido', merchantItemIcon(offer.id)));
      });
    } else if (this.tab === 'atributos') {
      META_UPGRADES.forEach((spec) => {
        const level = save.upgrades[spec.id] ?? 0;
        const price = nextPrice(save, spec.id);
        const pips = document.createElement('span');
        pips.className = 'shop-pips';
        pips.setAttribute('aria-label', `Nível ${level} de ${spec.maxLevel}`);
        for (let index = 0; index < spec.maxLevel; index += 1) {
          const pip = document.createElement('i');
          if (index < level) pip.className = 'on';
          pips.append(pip);
        }
        grid.append(this.card(spec.id, spec.name, spec.perLevel, pips, price === null ? null : { price, affordable: save.fichas >= price, label: `Comprar o nível ${level + 1}` }, () => this.actions.buy(spec.id), price === null ? 'Máximo' : ''));
      });
    } else {
      CONSUMABLES.forEach((spec) => {
        const packed = save.pack.includes(spec.id);
        const tag = document.createElement('span');
        tag.className = `store-tag${packed ? ' packed' : ''}`;
        tag.textContent = packed ? 'Na mochila' : 'Próxima partida';
        grid.append(this.card(spec.id, spec.name, spec.effect, tag, packed ? null : { price: spec.price, affordable: save.fichas >= spec.price, label: 'Pôr na mochila' }, () => this.actions.buyConsumable(spec.id), packed ? 'Comprado' : ''));
      });
    }

    const footer = document.createElement('div');
    footer.className = 'dialog-actions store-footer';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ui-button primary store-close';
    close.textContent = 'Até mais (Esc)';
    close.addEventListener('click', () => this.actions.close());
    footer.append(close);
    if (!run && this.actions.canPlaySergio()) {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'ui-button';
      play.textContent = 'Jogar com o Sergio';
      play.addEventListener('click', () => this.actions.playSergio());
      footer.append(play);
    }
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
    if (!run) footer.append(exportButton, importButton);

    panel.append(header, tabs, hint, grid, footer);
    this.root.append(panel);
    if (focused) this.root.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus({ preventScroll: true });
  }

  /** One item on the shelf: art, name, what it does, its status line, and the buy button (or why there's none). */
  private card(id: string, title: string, effect: string, status: HTMLElement, offer: { price: number; affordable: boolean; label: string; unit?: string } | null, buy: () => void, done: string, art = storeIcon(id)): HTMLLIElement {
    const card = document.createElement('li');
    card.className = 'store-card';
    if (!offer) card.classList.add('owned');
    const icon = document.createElement('img');
    icon.className = 'store-icon';
    icon.alt = '';
    icon.src = art;
    const name = document.createElement('strong');
    name.textContent = title;
    const text = document.createElement('span');
    text.className = 'store-effect';
    text.textContent = effect;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-button store-buy';
    button.dataset.focus = `buy-${id}`;
    if (!offer) {
      button.textContent = done;
      button.disabled = true;
    } else {
      const unit = offer.unit ?? 'Fichas';
      button.innerHTML = offer.price === 0 ? '<b>Grátis</b>' : `<b>${offer.price}</b> ${unit}`;
      button.disabled = !offer.affordable;
      button.title = offer.affordable ? offer.label : `${unit[0].toUpperCase()}${unit.slice(1)} insuficientes`;
      button.setAttribute('aria-label', `${offer.label}: ${title}, ${offer.price} ${unit}`);
      button.addEventListener('click', () => {
        this.welcome = false;
        buy();
        this.render();
      });
    }
    card.append(icon, name, text, status, button);
    return card;
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
    const area = areaCompletion(save, CURRENT_AREA);
    const key = `${save.fichas}|${heroName}|${area.joined}`;
    if (key === this.shown) return;
    this.shown = key;
    this.root.innerHTML = `<p class="eyebrow">A TAVERNA · ${CURRENT_AREA.name.toUpperCase()}</p><p class="tavern-fichas"><b>${save.fichas}</b> Fichas · último herói: <b></b></p><p class="tavern-area">Heróis da região conquistados: <b>${area.joined}/${area.total}</b></p><p class="tavern-hints">Fale com o Sergio para a loja · ajude os frequentadores · escolha o herói ao sair pelo portal</p>`;
    this.root.querySelectorAll('b')[1].textContent = heroName;
  }
}

/** At the portal once a harder tier is open: pick the difficulty for the run (1–5 or click). */
export class TierPicker {
  private readonly root: HTMLDivElement;

  constructor(container: HTMLElement, private readonly onPick: (tier: number) => void, private readonly onClose: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-dialog tier-picker';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Escolha a dificuldade');
    this.root.hidden = true;
    container.appendChild(this.root);
    window.addEventListener('keydown', (event) => {
      if (this.root.hidden) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0) this.root.querySelectorAll<HTMLButtonElement>('.tier-option:not(:disabled)')[index]?.click();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(save: SaveData, current: number): void {
    this.root.hidden = false;
    const body = document.createElement('div');
    body.className = 'dialog-body';
    const title = document.createElement('p');
    title.className = 'dialog-name';
    title.textContent = 'Escolha a dificuldade';
    const hint = document.createElement('p');
    hint.className = 'dialog-text';
    hint.textContent = 'Cada vitória abre a próxima. Inimigos mais fortes, mais Fichas e mais maestria.';
    const list = document.createElement('div');
    list.className = 'tier-list';
    DIFFICULTY_TIERS.forEach((tier) => {
      const open = tier.tier <= save.tierUnlocked;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'tier-option';
      option.disabled = !open;
      option.setAttribute('aria-pressed', String(tier.tier === current));
      const name = document.createElement('strong');
      name.textContent = `${tier.tier}. ${tier.name}`;
      const detail = document.createElement('span');
      detail.textContent = open
        ? tier.tier === 1 ? 'Inimigos normais' : `Vida dos inimigos ×${tier.enemyHealth.toLocaleString('pt-BR')} · dano ×${tier.enemyDamage.toLocaleString('pt-BR')} · recompensas +${Math.round((tier.reward - 1) * 100)}%`
        : 'Vença uma partida na dificuldade anterior';
      option.append(name, detail);
      option.addEventListener('click', () => this.onPick(tier.tier));
      list.append(option);
    });
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ui-button';
    back.textContent = 'Ainda não (Esc)';
    back.addEventListener('click', () => this.onClose());
    actions.append(back);
    body.append(title, hint, list, actions);
    this.root.replaceChildren(body);
    this.root.querySelector<HTMLButtonElement>('.tier-option[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }
}

/** Every enemy and guardian the bestiary knows, in the order it lists them. */
const BESTIARY: Array<{ id: string; name: string; kind: 'horda' | 'guardião' | 'chefe' }> = [
  { id: 'skeleton', name: 'Esqueleto', kind: 'horda' },
  { id: 'apparitionWraith', name: 'Aparição', kind: 'horda' },
  { id: 'necromancerWraith', name: 'Necromante Espectral', kind: 'horda' },
  { id: 'superSkeleton', name: 'Super Esqueleto', kind: 'horda' },
  { id: 'gravedigger', name: 'O Coveiro', kind: 'guardião' },
  { id: 'templeGuardian', name: 'Guardião do Templo', kind: 'guardião' },
  { id: 'lakeSpirit', name: 'O Espírito do Lago', kind: 'guardião' },
  { id: 'finalBoss', name: 'O Necromante', kind: 'chefe' }
];

/** The record book on the lectern: totals and bests, the bestiary (kills per enemy; unseen ones stay ???), and the
 *  last runs. */
export class RecordBook {
  private readonly root: HTMLDivElement;

  constructor(container: HTMLElement, private readonly onClose: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'tavern-dialog record-book';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Livro de recordes');
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(save: SaveData): void {
    this.root.hidden = false;
    const r = save.records;
    const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    const body = document.createElement('div');
    body.className = 'dialog-body';
    body.innerHTML = `
      <p class="dialog-name">Livro de recordes</p>
      <dl class="record-totals">
        <div><dt>Partidas</dt><dd>${r.runs}</dd></div>
        <div><dt>Vitórias</dt><dd>${r.wins}</dd></div>
        <div><dt>Mais tempo vivo</dt><dd>${time(r.bestTimeMs)}</dd></div>
        <div><dt>Ciclo mais fundo</dt><dd>${r.deepestCycle}</dd></div>
        <div><dt>Fichas ganhas</dt><dd>${save.fichasEarned}</dd></div>
        <div><dt>Dificuldade aberta</dt><dd>${DIFFICULTY_TIERS[save.tierUnlocked - 1].name}</dd></div>
      </dl>
      <p class="eyebrow">Bestiário</p>
      <ul class="bestiary"></ul>
      <p class="eyebrow">Últimas partidas</p>
      <ul class="run-history"></ul>
      <div class="dialog-actions"></div>`;
    const bestiary = body.querySelector('.bestiary')!;
    BESTIARY.forEach((entry) => {
      const kills = (r.kills[entry.id] ?? 0) || (r.guardians[entry.id] ?? 0);
      const row = document.createElement('li');
      row.classList.toggle('unseen', kills === 0);
      const name = document.createElement('span');
      name.textContent = kills ? entry.name : '???';
      const kind = document.createElement('small');
      kind.textContent = entry.kind;
      const count = document.createElement('b');
      count.textContent = String(kills);
      row.append(name, kind, count);
      bestiary.append(row);
    });
    const history = body.querySelector('.run-history')!;
    if (!save.history.length) history.append(Object.assign(document.createElement('li'), { textContent: 'Nenhuma partida ainda.' }));
    save.history.forEach((run) => {
      const row = document.createElement('li');
      const tier = DIFFICULTY_TIERS[(run.tier ?? 1) - 1]?.name ?? 'Normal';
      row.textContent = `${run.victory ? 'Vitória' : 'Derrota'} · ${heroName(run.heroId)} · ${tier} · ${time(run.elapsedMs)} · ${run.kills} abates · +${run.fichas} Fichas`;
      row.classList.toggle('won', run.victory);
      history.append(row);
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ui-button primary';
    close.textContent = 'Fechar (Esc)';
    close.addEventListener('click', () => this.onClose());
    body.querySelector('.dialog-actions')!.append(close);
    this.root.replaceChildren(body);
    close.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }
}
