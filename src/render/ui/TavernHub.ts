import { DIFFICULTY_TIERS, META_UPGRADES, MetaUpgradeId, SaveData, nextPrice } from '../../core/progress/Progress';
import { heroName } from '../progress/heroNames';
import { npcPortrait } from './icons';

export interface SergioShopActions {
  save(): SaveData;
  /** Sergio has joined the roster: offer to play as him. */
  canPlaySergio(): boolean;
  playSergio(): void;
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
    footer.append(close);
    if (this.actions.canPlaySergio()) {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'ui-button';
      play.textContent = 'Jogar com o Sergio';
      play.addEventListener('click', () => this.actions.playSergio());
      footer.append(play);
    }
    footer.append(exportButton, importButton);
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
