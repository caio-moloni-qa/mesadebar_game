import { CHARACTERS, CharacterConfig, CharacterId } from '../config/characters';
import { WEAPONS, WeaponConfig } from '../config/weapons';

export interface RunChoice {
  characterId: CharacterId;
  weaponId: WeaponConfig['id'];
}

// One literal `new URL(...)` per file (same pattern as PreloadScene): Vite only rewrites — and bundles — asset
// URLs written as static strings, so a helper that builds the path at runtime breaks under the /mesadebar_game/ base.
/** Same illustrated card art the Phaser character select uses (idle, swapped to hover on pointer-over). */
const CARD_ART: Record<CharacterId, { idle: string; hover: string }> = {
  barbarian: {
    idle: new URL('../assets/characters/players/barbarian-card-idle.png', import.meta.url).href,
    hover: new URL('../assets/characters/players/barbarian-card-hover.png', import.meta.url).href
  },
  mage: {
    idle: new URL('../assets/characters/players/mage-card-idle.png', import.meta.url).href,
    hover: new URL('../assets/characters/players/mage-card-hover.png', import.meta.url).href
  },
  reliquia: {
    idle: new URL('../assets/characters/players/reliquia-card-idle.png', import.meta.url).href,
    hover: new URL('../assets/characters/players/reliquia-card-hover.png', import.meta.url).href
  },
  fabri: {
    idle: new URL('../assets/characters/players/fabri-card-idle.png', import.meta.url).href,
    hover: new URL('../assets/characters/players/fabri-card-hover.png', import.meta.url).href
  }
};

const WEAPON_ICONS: Record<WeaponConfig['id'], string> = {
  staff: new URL('../assets/weapons/staff-icon.png', import.meta.url).href,
  sword: new URL('../assets/weapons/sword-icon.png', import.meta.url).href,
  whip: new URL('../assets/weapons/whip-icon.png', import.meta.url).href,
  boomerang: new URL('../assets/weapons/boomerang-icon.png', import.meta.url).href,
  amulet: new URL('../assets/weapons/aura-amulet-icon.png', import.meta.url).href
};

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Simple DOM character + starting-weapon select for the 3D page (same rules as MenuScene: any weapon can be
 *  picked; the character's preferred one is highlighted because it grants the free affinity + starting upgrades).
 *  The themed version of this screen is Etapa 4 — this one only needs to be clear and usable on desktop and mobile. */
export class StartMenu {
  private readonly root: HTMLDivElement;
  private selected: CharacterConfig | null = null;

  constructor(container: HTMLElement, private readonly onStart: (choice: RunChoice) => void) {
    this.root = document.createElement('div');
    this.root.className = 'start-menu';
    this.root.hidden = true;
    container.appendChild(this.root);
    window.addEventListener('keydown', (event) => {
      if (this.root.hidden || event.code !== 'Escape' || !this.selected) return;
      this.selected = null;
      this.render();
    });
  }

  show(): void {
    this.selected = null;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private render(): void {
    this.root.replaceChildren(this.selected ? this.weaponStep(this.selected) : this.characterStep());
  }

  private characterStep(): HTMLElement {
    const step = document.createElement('section');
    step.className = 'start-step';
    step.innerHTML = '<h1>Mesa de Bar</h1><p class="start-subtitle">Escolha seu herói</p>';
    const grid = document.createElement('div');
    grid.className = 'hero-grid';
    Object.values(CHARACTERS).forEach((character) => grid.appendChild(this.heroCard(character)));
    step.appendChild(grid);
    return step;
  }

  private heroCard(character: CharacterConfig): HTMLButtonElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hero-card';
    card.style.setProperty('--accent', hex(character.accentColor));
    const art = document.createElement('img');
    art.src = CARD_ART[character.id].idle;
    art.alt = '';
    art.loading = 'lazy';
    card.addEventListener('pointerenter', () => { art.src = CARD_ART[character.id].hover; });
    card.addEventListener('pointerleave', () => { art.src = CARD_ART[character.id].idle; });
    const info = document.createElement('div');
    info.className = 'hero-info';
    const name = document.createElement('h2');
    name.textContent = character.name;
    const stats = document.createElement('p');
    stats.className = 'hero-stats';
    stats.textContent = `Vida ${character.maxHealth} · Velocidade ${character.movementSpeed} · Armadura ${character.armor}`;
    const description = document.createElement('p');
    description.textContent = character.description;
    const advantages = document.createElement('ul');
    character.advantages.forEach((advantage) => {
      const item = document.createElement('li');
      item.textContent = advantage;
      advantages.appendChild(item);
    });
    info.append(name, stats, description, advantages);
    card.append(art, info);
    card.addEventListener('click', () => {
      this.selected = character;
      this.render();
    });
    return card;
  }

  private weaponStep(character: CharacterConfig): HTMLElement {
    const step = document.createElement('section');
    step.className = 'start-step weapon-step';
    step.style.setProperty('--accent', hex(character.accentColor));
    const header = document.createElement('div');
    header.className = 'weapon-header';
    const portrait = document.createElement('img');
    portrait.src = CARD_ART[character.id].hover;
    portrait.alt = '';
    const title = document.createElement('div');
    title.innerHTML = `<p class="start-subtitle">${character.name}</p><h1>Arma inicial</h1>`;
    header.append(portrait, title);
    const list = document.createElement('div');
    list.className = 'weapon-list';
    Object.values(WEAPONS).forEach((weapon) => list.appendChild(this.weaponRow(character, weapon)));
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'start-back';
    back.textContent = '← Voltar (Esc)';
    back.addEventListener('click', () => {
      this.selected = null;
      this.render();
    });
    step.append(header, list, back);
    return step;
  }

  private weaponRow(character: CharacterConfig, weapon: WeaponConfig): HTMLButtonElement {
    const preferred = weapon.id === character.preferredWeaponId;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = preferred ? 'weapon-row preferred' : 'weapon-row';
    const icon = document.createElement('img');
    icon.src = WEAPON_ICONS[weapon.id];
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
