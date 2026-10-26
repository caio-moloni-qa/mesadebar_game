import { weaponIcon } from './ui/icons';
import { MASTERY_REWARDS, MASTERY_THRESHOLDS, MAX_MASTERY, SaveData, SkinId, masteryFrame, masteryLevel, masteryProgress, masteryTitle, unlockedSkins } from '../core/progress/Progress';
import { SKINS, SKIN_ORDER } from './models/skins';
import { CHARACTERS, CharacterConfig, CharacterId } from '../config/characters';
import { WEAPONS, WeaponConfig } from '../config/weapons';
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

type MenuScreen = 'title' | 'characters' | 'weapons' | 'controls' | 'credits';

/** Title and loadout screens over the idle 3D arena. */
/** What the menu reads from and writes to the progress save. */
export interface MenuProgress {
  save(): SaveData;
  setSkin(hero: CharacterId, skin: SkinId): void;
  /** "Jogar": into the tavern. */
  play(): void;
  /** Hero selection opened from the tavern was closed without choosing. */
  closeToTavern(): void;
  /** The heroes that may be picked (the regulars join as they're unlocked). */
  roster(): CharacterId[];
}

export class StartMenu {
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
        const heroes = this.progress.roster().map((id) => CHARACTERS[id]);
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
      : this.screen === 'characters' ? this.characterStep()
      : this.screen === 'weapons' && this.selected ? this.weaponStep(this.selected)
      : this.infoStep(this.screen === 'credits');
    this.content.replaceChildren(step);
    this.root.scrollTop = 0;
    const focus = this.screen === 'characters' ? step.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      : this.screen === 'weapons' ? step.querySelector<HTMLButtonElement>('.weapon-row.preferred')
      : step.querySelector<HTMLButtonElement>('button');
    focus?.focus({ preventScroll: true });
  }

  private titleStep(): HTMLElement {
    const step = document.createElement('section');
    step.className = 'title-step';
    step.innerHTML = `
      <div class="title-brand"><p class="eyebrow">MESA DE BAR APRESENTA</p>
        <h1 class="game-wordmark" aria-label="Venivium"><span aria-hidden="true">VENIVIUM</span></h1>
        <div class="brand-rule" aria-hidden="true"><i></i><b>◆</b><i></i></div>
        <p class="title-tagline">A última rodada é pela sobrevivência.</p></div>
      <nav class="title-nav" aria-label="Menu principal">
        <button type="button" class="title-play" data-screen="characters"><span>Jogar</span><span aria-hidden="true">↗</span></button>
        <button type="button" data-screen="controls">Como jogar</button>
        <button type="button" data-screen="credits">Créditos</button>
      </nav>
      <footer class="title-footer"><span>FANTASIA MEDIEVAL · SOBREVIVÊNCIA</span><span>v0.2 <i>◆</i> Feito para sobreviver</span></footer>`;
    step.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach((button) => {
      // "Jogar" goes into the tavern, where heroes are picked and runs start.
      button.addEventListener('click', () => (button.classList.contains('title-play') ? this.progress.play() : this.navigate(button.dataset.screen as MenuScreen)));
    });
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
      <div class="info-panel"><h2>Venivium</h2><p>Mesa de Bar: Sobrevivência</p>
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

  private characterStep(): HTMLElement {
    const character = this.selected ??= CHARACTERS.barbarian;
    const step = document.createElement('section');
    step.className = 'start-step character-step';
    step.style.setProperty('--accent', hex(character.accentColor));
    step.innerHTML = '<header class="selection-heading"><p class="eyebrow">01 / PREPARE SUA JORNADA</p><h1>Escolha seu herói</h1><p class="start-subtitle">Quem vai enfrentar a próxima rodada?</p></header>';
    const showcase = document.createElement('div');
    showcase.className = 'hero-showcase';
    const details = document.createElement('div');
    details.className = 'hero-details';
    const role = HERO_ROLES[character.id];
    details.innerHTML = `<p class="eyebrow">${role.trait}</p><h2>${character.name}</h2><p class="hero-role">${role.title}</p><p class="hero-description">${character.description}</p>
      <dl class="hero-attributes"><div><dt>Vida</dt><dd>${character.maxHealth}<small>HP</small></dd></div><div><dt>Movimento</dt><dd>${character.movementSpeed}</dd></div><div><dt>Armadura</dt><dd>${character.armor}</dd></div></dl>
      <p class="hero-abilities-heading">HABILIDADES DO HERÓI</p>`;
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
    details.append(advantages, signature, choose);
    details.insertBefore(this.masteryPanel(character), details.querySelector('.hero-abilities-heading'));
    showcase.append(this.previewStage(character, preferred.id), details);
    const roster = document.createElement('div');
    roster.className = 'hero-roster'; roster.setAttribute('role', 'group'); roster.setAttribute('aria-label', 'Heróis disponíveis');
    this.progress.roster().map((id) => CHARACTERS[id]).forEach((hero, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hero-choice';
      button.dataset.heroId = hero.id; button.style.setProperty('--accent', hex(hero.accentColor));
      button.setAttribute('aria-pressed', String(hero.id === character.id));
      const xp = this.progress.save().mastery[hero.id] ?? 0;
      const frame = masteryFrame(xp);
      if (frame) button.dataset.frame = frame;
      button.innerHTML = `<span class="hero-choice-number" aria-hidden="true">0${index + 1}</span><span><strong>${hero.name}</strong><small>${HERO_ROLES[hero.id].trait}</small></span><span class="hero-choice-level" title="Nível de maestria">Nv ${masteryLevel(xp)}</span>`;
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
      const needed = MASTERY_REWARDS.find((reward) => reward.kind === 'skin' && reward.id === skin)?.level ?? 1;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'skin-chip';
      chip.disabled = !open;
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(skin === current));
      chip.style.setProperty('--swatch', SKINS[skin].swatch);
      chip.title = open ? SKINS[skin].name : `${SKINS[skin].name} · maestria nível ${needed}`;
      chip.innerHTML = `<i aria-hidden="true"></i><span>${open ? SKINS[skin].name : `Nv ${needed}`}</span>`;
      chip.addEventListener('click', () => {
        this.progress.setSkin(character.id, skin);
        this.render();
      });
      skins.append(chip);
    });
    panel.append(head, bar, skins);
    return panel;
  }

  private previewStage(character: CharacterConfig, weaponId: WeaponConfig['id']): HTMLElement {
    const stage = document.createElement('div'); stage.className = 'hero-stage';
    stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', `Modelo de ${character.name}. Arraste para girar ou use os botões.`);
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
    const equipped = document.createElement('p'); equipped.className = 'hero-equipped'; equipped.textContent = `Em mãos: ${WEAPONS[weaponId].name}`;
    stage.append(equipped, viewport, controls, hint);
    this.preview ??= new HeroPreview();
    this.preview.mount(viewport, character.id, weaponId, this.skinFor(character.id));
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
