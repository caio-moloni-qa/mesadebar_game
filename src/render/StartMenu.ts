import { POWER_TIERS, POWER_TIER_LEVELS } from '../config/powerTiers';
import { weaponIcon } from './ui/icons';
import { DIFFICULTY_TIERS, MASTERY_REWARDS, MASTERY_THRESHOLDS, MAX_MASTERY, SaveData, SkinId, arenaProgress, masteryFrame, masteryLevel, masteryProgress, masteryTitle, unlockSteps, unlockedSkins } from '../core/progress/Progress';
import { SKINS, SKIN_ORDER } from './models/skins';
import { CHARACTERS, CharacterConfig, CharacterId } from '../config/characters';
import { WEAPONS, WeaponConfig } from '../config/weapons';
import { ARENA_LAYOUTS } from '../config/arenaLayout';
import { MINI_BOSSES, MiniBossKind } from '../core/systems/MiniBossSystem';
import { HeroPreview } from './HeroPreview';

export interface RunChoice {
  characterId: CharacterId;
  weaponId: WeaponConfig['id'];
}


const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const HERO_ROLES: Record<CharacterId, { title: string; trait: string }> = {
  barbarian: { title: 'A força da última linha', trait: 'RESISTÊNCIA · CORPO A CORPO' },
  mage: { title: 'O poder do arcano', trait: 'MAGIA · MOBILIDADE' },
  reliquia: { title: 'Guardião do poder ancestral', trait: 'AURA · ALCANCE' },
  fabri: { title: 'Instinto e precisão', trait: 'AGILIDADE · CONTROLE' },
  brom: { title: 'A muralha da taverna', trait: 'TANQUE · CORPO A CORPO' },
  lyra: { title: 'A flecha que não erra', trait: 'ALCANCE · CRÍTICO' },
  grimbo: { title: 'A sorte vira ouro', trait: 'SORTE · MOEDAS' },
  zora: { title: 'O destino nas mãos', trait: 'MAGIA · PREVISÃO' },
  sergio: { title: 'A loja vai junto', trait: 'MERCADOR · VERSÁTIL' }
};

/** What the area picker says of each arena (ARENA_LAYOUTS ids, in the order they're listed). */
const AREA_TEXT: Record<string, string> = {
  greenfield: 'Campos verdes, o templo em ruínas, o lago e o cemitério.',
  snowfield: 'Neve e ruínas medievais: o castelo, o lago congelado e a capela.'
};

/** Arenas still being built: listed in the area picker, but they can't be played yet. */
const AREAS_IN_DEVELOPMENT = new Set<string>();

type MenuScreen = 'title' | 'areas' | 'characters' | 'weapons' | 'controls' | 'credits';

/** Title and loadout screens over the idle 3D arena. */
/** What the menu reads from and writes to the progress save. */
export interface MenuProgress {
  save(): SaveData;
  setSkin(hero: CharacterId, skin: SkinId): void;
  /** An area picked after "Jogar": its arena is loaded and the player walks into the tavern. */
  play(arenaId: string): void;
  /** The arena last played (preselected in the area picker). */
  arena(): string;
  /** Hero selection opened from the tavern was closed without choosing. */
  closeToTavern(): void;
  /** The heroes that may be picked (the regulars join as they're unlocked). */
  roster(): CharacterId[];
}

type DetailTab = 'habilidades' | 'poderes' | 'maestria';
const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'poderes', label: 'Poderes na run' },
  { id: 'maestria', label: 'Maestria' }
];

export class StartMenu {
  /** The hero details' open tab (kept while browsing heroes). */
  private detailTab: DetailTab = 'habilidades';
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private screen: MenuScreen = 'title';
  /** Hero selection opened from the tavern: backing out returns there instead of to the title. */
  private fromTavern = false;
  private selected: CharacterConfig | null = null;
  private preview: HeroPreview | null = null;

  constructor(container: HTMLElement, private readonly onStart: (choice: RunChoice) => void, private readonly progress: MenuProgress) {
    this.root = document.createElement('div');
    this.root.className = 'start-menu';
    this.root.hidden = true;
    this.content = document.createElement('div');
    this.content.className = 'menu-content';
    this.root.append(this.content);
    container.appendChild(this.root);
    window.addEventListener('keydown', (event) => {
      if (this.root.hidden || event.repeat) return;
      if (event.code === 'Escape' && this.screen !== 'title') {
        event.preventDefault();
        if (this.fromTavern && this.screen === 'characters') this.progress.closeToTavern();
        else this.navigate(this.screen === 'weapons' ? 'characters' : 'title');
      }
      if (this.screen === 'characters' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
        event.preventDefault();
        const heroes = Object.values(CHARACTERS);
        const index = heroes.findIndex(hero => hero.id === this.selected?.id);
        const next = event.code === 'Home' ? 0 : event.code === 'End' ? heroes.length - 1 : (index + (event.code === 'ArrowRight' ? 1 : -1) + heroes.length) % heroes.length;
        this.selected = heroes[next]; this.render();
      }
    });
  }

  show(): void {
    this.selected = null;
    this.fromTavern = false;
    this.screen = 'title';
    this.root.hidden = false;
    this.render();
  }

  /** From the tavern: straight to hero selection with `hero` picked. */
  showCharacters(hero: CharacterId): void {
    this.selected = CHARACTERS[hero];
    this.fromTavern = true;
    this.screen = 'characters';
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
    this.preview?.unmount();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  update(deltaSeconds: number): void {
    if (this.visible) this.preview?.update(deltaSeconds);
  }

  private navigate(screen: MenuScreen): void {
    this.screen = screen;
    this.render();
  }

  private render(): void {
    if (this.screen !== 'characters' && this.screen !== 'weapons') this.preview?.unmount();
    this.root.dataset.screen = this.screen;
    const step = this.screen === 'title' ? this.titleStep()
      : this.screen === 'areas' ? this.areaStep()
      : this.screen === 'characters' ? this.characterStep()
      : this.screen === 'weapons' && this.selected ? this.weaponStep(this.selected)
      : this.infoStep(this.screen === 'credits');
    this.content.replaceChildren(step);
    this.root.scrollTop = 0;
    const focus = this.screen === 'characters' ? step.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      : this.screen === 'weapons' ? step.querySelector<HTMLButtonElement>('.weapon-row.preferred')
      : this.screen === 'areas' ? step.querySelector<HTMLButtonElement>('.area-card[aria-current="true"] button')
      : step.querySelector<HTMLButtonElement>('button');
    focus?.focus({ preventScroll: true });
  }

  private titleStep(): HTMLElement {
    const step = document.createElement('section');
    step.className = 'title-step';
    step.innerHTML = `
      <div class="title-brand">
        <h1 class="game-wordmark" aria-label="Venivium"><span aria-hidden="true">VENIVIUM</span></h1>
        <div class="brand-rule" aria-hidden="true"><i></i><b>◆</b><i></i></div>
        <p class="title-tagline">A última rodada é pela sobrevivência.</p></div>
      <nav class="title-nav" aria-label="Menu principal">
        <button type="button" class="title-play" data-screen="areas"><span>Jogar</span><span aria-hidden="true">↗</span></button>
        <button type="button" data-screen="controls">Como jogar</button>
        <button type="button" data-screen="credits">Créditos</button>
      </nav>
      <footer class="title-footer"><span>FANTASIA MEDIEVAL · SOBREVIVÊNCIA</span><span>v0.2 <i>◆</i> Feito para sobreviver</span></footer>`;
    // "Jogar" opens the area picker; an area leads into its tavern, where heroes are picked and runs start.
    step.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach((button) => {
      button.addEventListener('click', () => this.navigate(button.dataset.screen as MenuScreen));
    });
    return step;
  }

  /** After "Jogar": the save's overall progress, then one card per arena with its missions, heroes won over and
   *  guardians beaten, and the button that loads it. */
  private areaStep(): HTMLElement {
    const save = this.progress.save();
    const step = document.createElement('section');
    step.className = 'start-step area-step';
    step.innerHTML = `<header class="selection-heading"><p class="eyebrow">PROGRESSÃO</p><h1>Escolha a área</h1><p class="start-subtitle">Para onde vai a próxima rodada?</p></header>`;
    const summary = document.createElement('dl');
    summary.className = 'area-summary';
    const totals: Array<[string, string]> = [
      ['Heróis liberados', `${this.progress.roster().length}/${Object.keys(CHARACTERS).length}`],
      ['Partidas', String(save.records.runs)],
      ['Vitórias', String(save.records.wins)],
      ['Dificuldade aberta', DIFFICULTY_TIERS[save.tierUnlocked - 1].name],
      ['Fichas', String(save.fichas)]
    ];
    totals.forEach(([label, value]) => {
      const item = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      item.append(term, detail);
      summary.append(item);
    });
    const list = document.createElement('div');
    list.className = 'area-list';
    Object.values(ARENA_LAYOUTS).forEach((layout, index) => {
      const progress = arenaProgress(save, layout.id, layout.guardians);
      const card = document.createElement('article');
      card.className = 'area-card';
      card.dataset.arena = layout.id;
      card.setAttribute('aria-current', String(layout.id === this.progress.arena()));
      card.innerHTML = `<p class="eyebrow">ÁREA ${index + 1}</p><h2></h2><p class="area-text"></p><ul class="area-stats"></ul><p class="area-heading">Guardiões</p><ul class="area-guardians"></ul>`;
      card.querySelector('h2')!.textContent = layout.name;
      card.querySelector('.area-text')!.textContent = AREA_TEXT[layout.id] ?? '';
      const stats = card.querySelector('.area-stats')!;
      const stat = (label: string, done: number, total: number) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = label;
        const count = document.createElement('small');
        count.textContent = total ? `${done}/${total}` : 'Em breve';
        const bar = document.createElement('i');
        bar.style.setProperty('--progress', `${total ? Math.round((done / total) * 100) : 0}%`);
        item.append(name, count, bar);
        stats.append(item);
      };
      stat('Missões da taverna', progress.missions.done, progress.missions.total);
      stat('Heróis da região', progress.heroes.joined, progress.heroes.total);
      const defeated = progress.guardians.filter((guardian) => guardian.defeated).length;
      stat('Guardiões derrotados', defeated, progress.guardians.length);
      const guardians = card.querySelector('.area-guardians')!;
      progress.guardians.forEach((guardian) => {
        const item = document.createElement('li');
        item.classList.toggle('done', guardian.defeated);
        item.textContent = guardian.defeated ? MINI_BOSSES[guardian.kind as MiniBossKind]?.name ?? guardian.kind : '???';
        guardians.append(item);
      });
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'ui-button primary';
      if (AREAS_IN_DEVELOPMENT.has(layout.id)) {
        card.classList.add('in-development');
        const badge = document.createElement('p');
        badge.className = 'area-badge';
        badge.textContent = 'Em desenvolvimento';
        card.querySelector('h2')!.after(badge);
        play.disabled = true;
        play.textContent = 'Em desenvolvimento';
      } else {
        play.textContent = `Jogar em ${layout.name}  →`;
        play.addEventListener('click', () => this.progress.play(layout.id));
      }
      card.append(play);
      list.append(card);
    });
    step.append(summary, list, this.backButton('title', 'Menu principal'));
    return step;
  }

  private backButton(screen: MenuScreen, label = 'Voltar'): HTMLButtonElement {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'start-back';
    back.innerHTML = `<span aria-hidden="true">←</span> ${label} <kbd>Esc</kbd>`;
    back.addEventListener('click', () => this.navigate(screen));
    return back;
  }

  private infoStep(credits: boolean): HTMLElement {
    const step = document.createElement('section');
    step.className = 'start-step info-step';
    step.innerHTML = credits ? `
      <p class="eyebrow">POR TRÁS DA AVENTURA</p><h1>Créditos</h1>
      <div class="info-panel"><h2>Venivium</h2><p>Sobrevivência</p>
      <p>Uma aventura de fantasia medieval sobre enfrentar a escuridão, encontrar poder e sobreviver à próxima rodada.</p>
      <div class="info-divider"></div><p>Obrigado por jogar e fazer parte desta jornada.</p></div>` : `
      <p class="eyebrow">ANTES DA PRIMEIRA RODADA</p><h1>Como jogar</h1>
      <div class="info-panel"><div class="control-row"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / setas</span><strong>Mover o herói</strong></div>
      <div class="control-row"><span><kbd>Esc</kbd> / <kbd>P</kbd></span><strong>Pausar a aventura</strong></div>
      <div class="control-row"><span><kbd>E</kbd></span><strong>Usar portais e falar na taverna</strong></div>
      <div class="control-row"><span><kbd>1</kbd> a <kbd>5</kbd></span><strong>Escolher melhorias</strong></div>
      <div class="info-divider"></div><p>Suas armas atacam automaticamente. Derrote inimigos para ganhar experiência, escolha melhorias e enfrente o chefe após cinco minutos.</p>
      <p>Entre as partidas você fica na taverna: gaste Fichas com o Sergio, troque de herói e saia pelo portal para jogar.</p>
      <p>No celular, use o joystick para mover e toque nas opções para escolher.</p></div>`;
    step.append(this.backButton('title', 'Menu principal'));
    return step;
  }

  private unlocked(hero: CharacterId): boolean {
    return this.progress.roster().includes(hero);
  }

  private characterStep(): HTMLElement {
    const character = this.selected ??= CHARACTERS.barbarian;
    const locked = !this.unlocked(character.id);
    const step = document.createElement('section');
    step.className = 'start-step character-step';
    step.style.setProperty('--accent', locked ? '#6b6478' : hex(character.accentColor));
    step.innerHTML = `<header class="selection-heading"><p class="eyebrow">01 / ${this.fromTavern ? 'ANTES DE ATRAVESSAR O PORTAL' : 'PREPARE SUA JORNADA'}</p><h1>Escolha seu herói</h1><p class="start-subtitle">Quem vai enfrentar a próxima rodada?</p></header>`;
    const showcase = document.createElement('div');
    showcase.className = 'hero-showcase';
    const details = locked ? this.lockedDetails(character) : this.heroDetails(character);
    showcase.append(this.previewStage(character, character.preferredWeaponId ?? 'staff', locked), details);
    const roster = document.createElement('div');
    roster.className = 'hero-roster'; roster.setAttribute('role', 'group'); roster.setAttribute('aria-label', 'Heróis');
    Object.values(CHARACTERS).forEach((hero, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hero-choice';
      button.dataset.heroId = hero.id; button.style.setProperty('--accent', hex(hero.accentColor));
      button.setAttribute('aria-pressed', String(hero.id === character.id));
      const number = `<span class="hero-choice-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>`;
      if (!this.unlocked(hero.id)) {
        button.classList.add('locked');
        button.setAttribute('aria-label', `Herói bloqueado ${index + 1}`);
        button.innerHTML = `${number}<span><strong>???</strong><small>BLOQUEADO</small></span><span class="hero-choice-level" aria-hidden="true">🔒</span>`;
      } else {
        const xp = this.progress.save().mastery[hero.id] ?? 0;
        const frame = masteryFrame(xp);
        if (frame) button.dataset.frame = frame;
        button.innerHTML = `${number}<span><strong>${hero.name}</strong><small>${HERO_ROLES[hero.id].trait}</small></span><span class="hero-choice-level" title="Nível de maestria">Nv ${masteryLevel(xp)}</span>`;
      }
      button.addEventListener('click', () => { this.selected = hero; this.render(); });
      roster.append(button);
    });
    const footer = document.createElement('div'); footer.className = 'selection-footer';
    if (this.fromTavern) {
      const toTavern = document.createElement('button');
      toTavern.type = 'button';
      toTavern.className = 'start-back';
      toTavern.innerHTML = '<span aria-hidden="true">←</span> Voltar à taverna <kbd>Esc</kbd>';
      toTavern.addEventListener('click', () => this.progress.closeToTavern());
      footer.append(toTavern);
    } else {
      footer.append(this.backButton('title', 'Menu principal'));
    }
    const hint = document.createElement('p'); hint.className = 'selection-keyboard-hint'; hint.innerHTML = '<kbd>←</kbd><kbd>→</kbd> Trocar herói';
    footer.append(hint);
    step.append(showcase, roster, footer);
    return step;
  }

  /** An unlocked hero's card: attributes, abilities, signature weapon, mastery and skins, and the button onwards. */
  private heroDetails(character: CharacterConfig): HTMLElement {
    const details = document.createElement('div');
    details.className = 'hero-details';
    const role = HERO_ROLES[character.id];
    details.innerHTML = `<p class="eyebrow">${role.trait}</p><div class="hero-name-row"><h2>${character.name}</h2></div><p class="hero-role">${role.title}</p><p class="hero-description">${character.description}</p>
      <dl class="hero-attributes"><div><dt>Vida</dt><dd>${character.maxHealth}<small>HP</small></dd></div><div><dt>Movimento</dt><dd>${character.movementSpeed}</dd></div><div><dt>Armadura</dt><dd>${character.armor}</dd></div></dl>`;
    const advantages = document.createElement('ul');
    advantages.className = 'hero-abilities';
    character.advantages.forEach(advantage => {
      const item = document.createElement('li'); item.textContent = advantage; advantages.append(item);
    });
    const preferred = WEAPONS[character.preferredWeaponId ?? 'staff'];
    const signature = document.createElement('div'); signature.className = 'hero-signature';
    signature.innerHTML = `<img src="${weaponIcon(preferred.id)}" alt=""><span><small>ARMA DE AFINIDADE</small><strong>${preferred.name}</strong></span><span class="signature-bonus">+${character.startingWeaponUpgradeChoices ?? 0} melhorias</span>`;
    const choose = document.createElement('button');
    choose.type = 'button'; choose.className = 'ui-button primary hero-confirm';
    choose.textContent = `Escolher ${character.name}  →`;
    choose.addEventListener('click', () => this.navigate('weapons'));
    // The powers the hero grows into during a run.
    const powers = document.createElement('ol');
    powers.className = 'hero-powers';
    POWER_TIERS[character.id].forEach((power, index) => {
      const item = document.createElement('li');
      const level = document.createElement('b');
      level.textContent = `Nv ${POWER_TIER_LEVELS[index]}`;
      const name = document.createElement('strong');
      name.textContent = power.name;
      const text = document.createElement('span');
      text.textContent = power.text;
      item.append(level, name, text);
      powers.append(item);
    });
    // The kit tab: the hero's abilities, then their weapon of affinity.
    const kit = document.createElement('div');
    kit.className = 'hero-kit';
    kit.append(advantages, signature);
    details.append(this.detailTabs({ habilidades: kit, poderes: powers, maestria: this.masteryPanel(character) }), choose);
    details.querySelector('.hero-name-row')!.append(this.masteryBadge(character, () => {
      details.querySelector<HTMLButtonElement>('[role="tablist"] button:last-child')!.click();
    }));
    return details;
  }

  /** Keep saved mastery visible while browsing any details tab. */
  private masteryBadge(character: CharacterConfig, openDetails: () => void): HTMLButtonElement {
    const xp = this.progress.save().mastery[character.id] ?? 0;
    const level = masteryLevel(xp);
    const maxed = level >= MAX_MASTERY;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'hero-mastery-badge';
    badge.classList.toggle('maxed', maxed);
    const progress = Math.round(masteryProgress(xp) * 100);
    const status = maxed ? 'Maestria máxima' : `${xp} / ${MASTERY_THRESHOLDS[level]} XP`;
    badge.title = `${status}. Ver detalhes da maestria`;
    badge.setAttribute('aria-label', `Maestria de ${character.name}, nível ${level}. ${status}. Ver detalhes`);
    badge.style.setProperty('--mastery-progress', `${progress}%`);
    badge.innerHTML = `<span class="hero-mastery-badge-label">Maestria</span><strong>Nv. ${level}</strong>${maxed ? '<span class="hero-mastery-badge-max">MÁX.</span>' : ''}<span class="hero-mastery-badge-track" aria-hidden="true"></span>`;
    badge.addEventListener('click', openDetails);
    return badge;
  }

  /** The kit, the run's powers and the mastery share one tabbed panel (its height fixed to the tallest), so the
   *  details column stays as short as the 3D stage beside it. The tab chosen carries over between heroes. */
  private detailTabs(panels: Record<DetailTab, HTMLElement>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hero-detail-tabs';
    const tabs = document.createElement('div');
    tabs.className = 'hero-tabs';
    tabs.setAttribute('role', 'tablist');
    const panel = document.createElement('div');
    panel.className = 'hero-tabpanel';
    panel.setAttribute('role', 'tabpanel');
    DETAIL_TABS.forEach(({ id, label }) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === this.detailTab));
      tab.textContent = label;
      tab.addEventListener('click', () => {
        this.detailTab = id;
        tabs.querySelectorAll('[role="tab"]').forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
        panel.replaceChildren(panels[id]);
      });
      tabs.append(tab);
    });
    panel.append(panels[this.detailTab]);
    wrap.append(tabs, panel);
    return wrap;
  }

  /** A hero not unlocked yet: no name, no kit — just what it takes, with the save's progress on each condition. */
  private lockedDetails(character: CharacterConfig): HTMLElement {
    const details = document.createElement('div');
    details.className = 'hero-details hero-locked';
    details.innerHTML = '<p class="eyebrow">HERÓI MISTERIOSO</p><h2>???</h2><p class="hero-role">Alguém na taverna ainda não confia em você.</p><p class="hero-abilities-heading">PARA LIBERAR</p>';
    const list = document.createElement('ul');
    list.className = 'unlock-steps';
    unlockSteps(this.progress.save(), character.id).forEach((condition) => {
      const item = document.createElement('li');
      if (condition.current >= condition.needed) item.classList.add('done');
      const label = document.createElement('span');
      label.textContent = condition.label;
      const count = document.createElement('small');
      count.textContent = `${condition.current} / ${condition.needed}`;
      const bar = document.createElement('i');
      bar.style.setProperty('--progress', `${Math.round((condition.current / condition.needed) * 100)}%`);
      item.append(label, count, bar);
      list.append(item);
    });
    const choose = document.createElement('button');
    choose.type = 'button'; choose.className = 'ui-button primary hero-confirm'; choose.disabled = true;
    choose.textContent = 'Bloqueado';
    details.append(list, choose);
    return details;
  }

  /** The chosen skin, if it's still unlocked (a reset or imported save can take one away). */
  private skinFor(hero: CharacterId): SkinId {
    const save = this.progress.save();
    const skin = save.skins[hero] ?? 'base';
    return unlockedSkins(save.mastery[hero] ?? 0).includes(skin) ? skin : 'base';
  }

  /** Mastery level, title and XP bar, and the skin picker (locked skins show the level they need). */
  private masteryPanel(character: CharacterConfig): HTMLElement {
    const save = this.progress.save();
    const xp = save.mastery[character.id] ?? 0;
    const level = masteryLevel(xp);
    const panel = document.createElement('div');
    panel.className = 'hero-mastery';
    const head = document.createElement('p');
    head.className = 'hero-mastery-head';
    const title = masteryTitle(xp);
    head.innerHTML = `<strong>Maestria nível ${level}</strong>${title ? `<span>${title}</span>` : ''}<small>${level >= MAX_MASTERY ? 'Máximo' : `${xp} / ${MASTERY_THRESHOLDS[level]} XP`}</small>`;
    const bar = document.createElement('div');
    bar.className = 'hero-mastery-bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(masteryProgress(xp) * 100)}%`;
    bar.append(fill);
    const skins = document.createElement('div');
    skins.className = 'skin-picker';
    skins.setAttribute('role', 'radiogroup');
    skins.setAttribute('aria-label', 'Skin');
    const unlocked = unlockedSkins(xp);
    const current = this.skinFor(character.id);
    SKIN_ORDER.forEach((skin) => {
      const open = unlocked.includes(skin);
      const reward = MASTERY_REWARDS.find((entry) => entry.kind === 'skin' && entry.id === skin);
      const needed = reward?.level ?? 1;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'skin-chip';
      chip.disabled = !open;
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(skin === current));
      chip.style.setProperty('--swatch', SKINS[skin].swatch);
      chip.title = reward?.comingSoon ? `${reward.name} · maestria nível ${needed}` : open ? SKINS[skin].name : `${SKINS[skin].name} · maestria nível ${needed}`;
      chip.innerHTML = `<i aria-hidden="true"></i><span>${reward?.comingSoon ? 'Em breve' : open ? SKINS[skin].name : `Nv ${needed}`}</span>`;
      chip.addEventListener('click', () => {
        this.progress.setSkin(character.id, skin);
        this.render();
      });
      skins.append(chip);
    });
    panel.append(head, bar, skins);
    return panel;
  }

  private previewStage(character: CharacterConfig, weaponId: WeaponConfig['id'], silhouette = false): HTMLElement {
    const stage = document.createElement('div'); stage.className = 'hero-stage';
    stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', silhouette ? 'Herói bloqueado. Arraste para girar.' : `Modelo de ${character.name}. Arraste para girar ou use os botões.`);
    const viewport = document.createElement('div'); viewport.className = 'hero-viewport';
    const controls = document.createElement('div'); controls.className = 'hero-preview-controls';
    const rotateLeft = document.createElement('button'); rotateLeft.type = 'button'; rotateLeft.className = 'preview-rotate';
    rotateLeft.textContent = '↶'; rotateLeft.setAttribute('aria-label', 'Girar herói para a esquerda');
    rotateLeft.addEventListener('click', () => this.preview?.rotate(-1));
    const attack = document.createElement('button'); attack.type = 'button'; attack.className = 'preview-attack';
    attack.textContent = 'Testar ataque'; attack.addEventListener('click', () => this.preview?.attack());
    const rotateRight = document.createElement('button'); rotateRight.type = 'button'; rotateRight.className = 'preview-rotate';
    rotateRight.textContent = '↷'; rotateRight.setAttribute('aria-label', 'Girar herói para a direita');
    rotateRight.addEventListener('click', () => this.preview?.rotate(1));
    controls.append(rotateLeft, attack, rotateRight);
    const hint = document.createElement('p'); hint.className = 'hero-stage-hint'; hint.textContent = 'Arraste para girar · veja de todos os ângulos';
    const equipped = document.createElement('p'); equipped.className = 'hero-equipped'; equipped.textContent = silhouette ? 'Em mãos: ???' : `Em mãos: ${WEAPONS[weaponId].name}`;
    if (silhouette) attack.disabled = true;
    stage.append(equipped, viewport, controls, hint);
    this.preview ??= new HeroPreview();
    this.preview.mount(viewport, character.id, weaponId, this.skinFor(character.id), silhouette);
    return stage;
  }

  private weaponStep(character: CharacterConfig): HTMLElement {
    const step = document.createElement('section');
    step.className = 'start-step weapon-step';
    step.style.setProperty('--accent', hex(character.accentColor));
    const header = document.createElement('header'); header.className = 'selection-heading';
    header.innerHTML = `<p class="eyebrow">02 / ${character.name}</p><h1>Escolha sua arma</h1><p class="start-subtitle">Veja seu equipamento. Escolha como lutar.</p>`;
    const layout = document.createElement('div'); layout.className = 'weapon-showcase';
    const stage = this.previewStage(character, character.preferredWeaponId ?? 'staff');
    const list = document.createElement('div'); list.className = 'weapon-list';
    Object.values(WEAPONS).forEach(weapon => list.append(this.weaponRow(character, weapon)));
    layout.append(stage, list);
    step.append(header, layout, this.backButton('characters', 'Escolher outro herói'));
    return step;
  }

  private weaponRow(character: CharacterConfig, weapon: WeaponConfig): HTMLButtonElement {
    const preferred = weapon.id === character.preferredWeaponId;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = preferred ? 'weapon-row preferred' : 'weapon-row';
    const previewWeapon = () => {
      this.preview?.setCharacter(character.id, weapon.id, this.skinFor(character.id));
      const equipped = this.root.querySelector('.hero-equipped');
      if (equipped) equipped.textContent = `Em mãos: ${weapon.name}`;
    };
    row.addEventListener('pointerenter', previewWeapon);
    row.addEventListener('focus', previewWeapon);
    const icon = document.createElement('img');
    icon.src = weaponIcon(weapon.id);
    icon.alt = '';
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = weapon.name;
    const stats = document.createElement('span');
    stats.textContent = `Dano ${weapon.baseDamage} · Recarga ${weapon.cooldown}ms · ${weapon.description}`;
    text.append(name, stats);
    row.append(icon, text);
    if (preferred) {
      const badge = document.createElement('em');
      badge.textContent = `Afinidade + ${character.startingWeaponUpgradeChoices ?? 0} melhorias iniciais`;
      row.appendChild(badge);
    }
    row.addEventListener('click', () => this.onStart({ characterId: character.id, weaponId: weapon.id }));
    return row;
  }
}
