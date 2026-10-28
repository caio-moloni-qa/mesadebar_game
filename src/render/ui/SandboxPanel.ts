import { NeutralSpot } from '../../config/arenaLayout';
import { DIFFICULTY_STAGES, SANDBOX_SPAWN_CAPS } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import { GameSession } from '../../core/session/GameSession';
import { BOSS_TUNING, BOSS_TUNING_DEFAULTS, BossTuning } from '../../core/systems/BossSystem';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';

/** Toggles the panel keeps across runs (and page reloads, via localStorage when it's available). */
interface SandboxSettings {
  enabled: boolean;
  fog: boolean;
  skeletons: boolean;
  variants: boolean;
  merchant: boolean;
  invincible: boolean;
  difficultyStage: number | null;
  capIndex: number;
}

const STORAGE_KEY = 'mesadebar.sandbox';
const BOSS_STORAGE_KEY = 'mesadebar.bossTuning';

/** Boss values the panel tunes live: label, step, bounds and how to show it. */
interface BossKnob { key: keyof BossTuning; label: string; step: number; min: number; max: number; format?: (value: number) => string }
const seconds = (value: number) => `${(value / 1000).toFixed(1)}s`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const BOSS_KNOBS: BossKnob[] = [
  { key: 'apparitionCount', label: 'Aparições/invocação', step: 1, min: 0, max: 40 },
  { key: 'summonIntervalMs', label: 'Intervalo invocação', step: 1000, min: 2000, max: 30000, format: seconds },
  { key: 'undeadSquadSize', label: 'Mortos-vivos (Solo)', step: 1, min: 0, max: 30 },
  { key: 'undeadRiseMs', label: 'Aviso do Solo', step: 100, min: 0, max: 3000, format: seconds },
  { key: 'meleeDamage', label: 'Dano da espada', step: 5, min: 0, max: 200 },
  { key: 'shieldMaxHealthScaling', label: 'Escudo (% vida)', step: 0.05, min: 0.05, max: 1, format: percent },
  { key: 'explosionDamageRatio', label: 'Explosão (% vida jogador)', step: 0.1, min: 0, max: 1, format: (value) => (value >= 1 ? 'Letal' : percent(value)) },
  { key: 'meteorIntervalMs', label: 'Intervalo meteoros', step: 250, min: 250, max: 5000, format: seconds },
  { key: 'staggerMs', label: 'Atordoamento', step: 500, min: 0, max: 10000, format: seconds },
  { key: 'staggerDamageMultiplier', label: 'Dano no atordoado', step: 0.25, min: 1, max: 4, format: (value) => `${value.toFixed(2)}x` },
  { key: 'phaseTwoHealthRatio', label: 'Fase 2 em', step: 0.1, min: 0.1, max: 0.9, format: percent },
  { key: 'beamCountPhase1', label: 'Feixes fase 1', step: 1, min: 1, max: 20 },
  { key: 'beamCountPhase2', label: 'Feixes fase 2', step: 1, min: 1, max: 20 },
  { key: 'lungeMinDistance', label: 'Investida a partir de', step: 100, min: 200, max: 2000 },
  { key: 'cleanupMs', label: 'Escuridão consome em', step: 5000, min: 5000, max: 120000, format: seconds },
  { key: 'cleanupHealthPerEnemy', label: 'Vida por inimigo limpo', step: 5, min: 0, max: 50 },
  { key: 'enrageSpeedMultiplier', label: 'Velocidade enfurecido', step: 0.1, min: 1, max: 3, format: (value) => `${value.toFixed(1)}x` }
];

function loadBossTuning(): void {
  try {
    Object.assign(BOSS_TUNING, JSON.parse(localStorage.getItem(BOSS_STORAGE_KEY) ?? '{}'));
  } catch {
    // Blocked storage: keep the shipped values.
  }
}
const DEFAULTS: SandboxSettings = { enabled: false, fog: true, skeletons: true, variants: true, merchant: true, invincible: false, difficultyStage: null, capIndex: 0 };

function loadSettings(): SandboxSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export interface SandboxHost {
  /** The run the buttons act on (the current one when clicked). */
  session(): GameSession;
  setFogVisible(visible: boolean): void;
  /** "Sandbox: <upgrade>!" over the hero. */
  announce(text: string): void;
  /** Every hero playable (the tavern regulars and Sergio), without touching the save. */
  unlockAllHeroes(): void;
  /** The save, for testing: Fichas to spend, a mastery level for the hero in play, or a clean slate (every tip, unlock
   *  and welcome plays again). */
  addFichas(amount: number): void;
  addMasteryLevel(): void;
  resetProgress(): void;
}

interface Control {
  label: () => string;
  run: () => void;
}

/** The F9 sandbox panel: run-time toggles, spawn/kill shortcuts, clock and
 *  difficulty overrides, and the "SANDBOX ATIVO (F9)" indicator. Settings stick across runs; applyTo() puts them on
 *  each new session. Includes "Boss agora" and "Próxima arma". */
export class SandboxPanel {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly indicator: HTMLDivElement;
  private readonly settings = loadSettings();
  private readonly controls: Control[];
  private readonly knobValues = new Map<keyof BossTuning, HTMLElement>();
  private allowed = false;

  constructor(container: HTMLElement, private readonly host: SandboxHost) {
    this.root = document.createElement('div');
    this.root.className = 'sandbox-panel';
    this.root.innerHTML = '<h3>SANDBOX (F9)</h3><div class="sandbox-list"></div>';
    this.list = this.root.querySelector('.sandbox-list')!;
    this.indicator = document.createElement('div');
    this.indicator.className = 'sandbox-indicator';
    this.indicator.textContent = 'SANDBOX ATIVO (F9)';
    container.append(this.root, this.indicator);
    this.controls = this.buildControls();
    this.controls.forEach((control) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = control.label();
      button.addEventListener('click', () => {
        control.run();
        this.refreshLabels();
        button.blur();
      });
      this.list.appendChild(button);
    });
    loadBossTuning();
    this.buildBossSection();
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F9' || !this.allowed) return;
      event.preventDefault();
      this.settings.enabled = !this.settings.enabled;
      this.save();
      this.render();
    });
    this.render();
  }

  /** Only usable in a run or the tavern (not on the title or character menus). */
  setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.render();
  }

  get enabled(): boolean {
    return this.settings.enabled;
  }

  /** Puts the sticky toggles on a fresh run (only while sandbox mode is on). */
  applyTo(session: GameSession, forceInvincible: boolean): void {
    const on = this.settings.enabled;
    session.skeletonSpawnEnabled = !on || this.settings.skeletons;
    session.variantSpawnEnabled = !on || this.settings.variants;
    session.merchant.enabled = !on || this.settings.merchant !== false;
    session.player.invincible = forceInvincible || (on && this.settings.invincible);
    session.setForcedDifficultyStage(on ? this.settings.difficultyStage : null);
    session.setEnemySpawnCap(SANDBOX_SPAWN_CAPS[on ? this.settings.capIndex : 0]);
    this.host.setFogVisible(!on || this.settings.fog);
  }

  private buildControls(): Control[] {
    const s = this.settings;
    const run = () => this.host.session();
    const toggle = (label: string, key: 'fog' | 'skeletons' | 'variants' | 'merchant' | 'invincible', apply: (value: boolean) => void): Control => ({
      label: () => `${label}: ${s[key] ? 'Ligado' : 'Desligado'}`,
      run: () => { s[key] = !s[key]; apply(s[key]); this.save(); }
    });
    const spawn = (label: string, variant: EnemyVariantId, count: number): Control => ({ label: () => label, run: () => run().spawnNearPlayer(variant, count) });
    // A group of wildlife a little to the hero's right, living there from now on.
    const neutral = (label: string, group: Omit<NeutralSpot, 'home'>): Control => ({
      label: () => label,
      run: () => { const { x, y } = run().player; run().neutrals.addGroup({ ...group, home: { x: x + 260, y } }); }
    });
    const upgrade = (label: string, kind: 'weapon' | 'attribute'): Control => ({
      label: () => label,
      run: () => {
        const granted = run().grantSandboxUpgrade(kind);
        if (granted) this.host.announce(`Sandbox: ${granted.name}!`);
      }
    });
    return [
      { label: () => '+100 moedas', run: () => run().addCurrency(100) },
      { label: () => 'Matar inimigos ativos', run: () => run().killAllEnemies() },
      toggle('Névoa', 'fog', (value) => this.host.setFogVisible(value)),
      toggle('Spawn esqueletos', 'skeletons', (value) => { run().skeletonSpawnEnabled = value; }),
      toggle('Spawn variantes', 'variants', (value) => { run().variantSpawnEnabled = value; }),
      toggle('Mercador', 'merchant', (value) => { run().merchant.enabled = value; }),
      { label: () => 'Abrir portal do mercador', run: () => run().openMerchantPortal() },
      { label: () => 'Chamar o Esquimó (Nevado)', run: () => run().summonEskimo() },
      { label: () => 'Liberar todos os heróis', run: () => this.host.unlockAllHeroes() },
      { label: () => 'Progresso: +500 Fichas', run: () => this.host.addFichas(500) },
      { label: () => 'Progresso: +1 nível de maestria', run: () => this.host.addMasteryLevel() },
      { label: () => 'Progresso: apagar tudo', run: () => this.host.resetProgress() },
      { label: () => 'Concluir missões ativas', run: () => run().quests.completeActive() },
      toggle('Invencível', 'invincible', (value) => { run().player.invincible = value; }),
      { label: () => '+500 Buffer de Dano', run: () => { run().player.damageBuffer += 500; } },
      {
        label: () => (s.difficultyStage === null ? 'Dificuldade: Auto' : `Dificuldade: Estágio ${s.difficultyStage + 1}`),
        run: () => {
          s.difficultyStage = s.difficultyStage === null ? 0 : s.difficultyStage < DIFFICULTY_STAGES.length - 1 ? s.difficultyStage + 1 : null;
          run().setForcedDifficultyStage(s.difficultyStage);
          this.save();
        }
      },
      { label: () => 'Avançar 30s (run)', run: () => run().adjustElapsedMs(30_000) },
      { label: () => 'Voltar 30s (run)', run: () => run().adjustElapsedMs(-30_000) },
      spawn('+10 Esqueletos', 'skeleton', 10),
      spawn('+1 Necromante', 'necromancerWraith', 1),
      spawn('+5 Aparições', 'apparitionWraith', 5),
      spawn('+1 Super Esqueleto', 'superSkeleton', 1),
      spawn('+10 Esqueletos Congelados', 'frostSkeleton', 10),
      spawn('+5 Espíritos da Geada', 'frostSpirit', 5),
        spawn('+1 Xamã da Nevasca', 'snowShaman', 1),
        spawn('+4 Bonecos de Neve', 'snowman', 4),
        spawn('+1 Troll de Gelo', 'iceTroll', 1),
        { label: () => '+Matilha (4 Lobos do Gelo)', run: () => run().spawnWolfPack(4) },
      neutral('+2 Javalis (perto)', { variant: 'boar', count: 2 }),
      neutral('+Cervo e 2 Corças (perto)', { variant: 'doe', leader: 'stag', count: 3 }),
      neutral('+1 Colmeia (perto)', { variant: 'hive', count: 1 }),
      neutral('+1 Mímico (perto)', { variant: 'mimic', count: 1 }),
      { label: () => '+1 Boss Extra', run: () => run().bosses.spawnExtraBoss() },
      { label: () => 'Boss da onda agora', run: () => run().triggerBossWave() },
      { label: () => 'Mini-boss: O Coveiro', run: () => { run().spawnMiniBoss('gravedigger'); } },
      { label: () => 'Mini-boss: Guardião do Templo', run: () => { run().spawnMiniBoss('templeGuardian'); } },
      { label: () => 'Mini-boss: Serpente do Gelo', run: () => { run().spawnMiniBoss('iceSerpent'); } },
      { label: () => 'Mini-boss: O Sineiro', run: () => { run().spawnMiniBoss('bellringer'); } },
      { label: () => 'Mini-boss: Yeti Ancião', run: () => { run().spawnMiniBoss('ancientYeti'); } },
      { label: () => 'Mini-boss: Cavaleiro Congelado', run: () => { run().spawnMiniBoss('frostKnight'); } },
      { label: () => 'Mini-boss: Espírito do Lago', run: () => { run().spawnMiniBoss('lakeSpirit'); } },
      { label: () => '+ Coveiro Aliado', run: () => { run().addCompanion('gravedigger'); } },
      { label: () => '+ Golem de Pedra', run: () => { run().addCompanion('stoneGolem'); } },
      { label: () => '+ Fada da Água', run: () => { run().addCompanion('waterFairy'); } },
      {
        label: () => `Limite spawn: ${SANDBOX_SPAWN_CAPS[s.capIndex]}`,
        run: () => {
          s.capIndex = (s.capIndex + 1) % SANDBOX_SPAWN_CAPS.length;
          run().setEnemySpawnCap(SANDBOX_SPAWN_CAPS[s.capIndex]);
          this.save();
        }
      },
      upgrade('Upgrade de arma aleatório', 'weapon'),
      upgrade('Atributo aleatório', 'attribute'),
      {
        label: () => 'Próxima arma',
        run: () => {
          const session = run();
          const next = Object.values(WEAPONS).find((weapon) => !session.weapons.has(weapon.id));
          if (next && session.addWeapon(next.id)) this.host.announce(`Sandbox: ${next.name}!`);
        }
      }
    ];
  }

  /** "BOSS" section: a −/+ row per tunable value (applied live, kept across reloads) and a reset button. */
  private buildBossSection(): void {
    const heading = document.createElement('h4');
    heading.textContent = 'BOSS';
    this.list.appendChild(heading);
    BOSS_KNOBS.forEach((knob) => {
      const row = document.createElement('div');
      row.className = 'sandbox-knob';
      row.innerHTML = '<span></span><output></output><button type="button" aria-label="menos">−</button><button type="button" aria-label="mais">+</button>';
      row.querySelector('span')!.textContent = knob.label;
      this.knobValues.set(knob.key, row.querySelector('output')!);
      const buttons = row.querySelectorAll('button');
      const less = buttons[0];
      const more = buttons[1];
      const nudge = (direction: number) => {
        const next = Math.min(knob.max, Math.max(knob.min, BOSS_TUNING[knob.key] + knob.step * direction));
        BOSS_TUNING[knob.key] = Math.round(next * 1000) / 1000;
        this.saveBossTuning();
        this.refreshKnobs();
      };
      less.addEventListener('click', () => nudge(-1));
      more.addEventListener('click', () => nudge(1));
      this.list.appendChild(row);
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Restaurar padrões do boss';
    reset.addEventListener('click', () => {
      Object.assign(BOSS_TUNING, BOSS_TUNING_DEFAULTS);
      this.saveBossTuning();
      this.refreshKnobs();
    });
    this.list.appendChild(reset);
    this.refreshKnobs();
  }

  private refreshKnobs(): void {
    BOSS_KNOBS.forEach((knob) => {
      const value = BOSS_TUNING[knob.key];
      this.knobValues.get(knob.key)!.textContent = knob.format ? knob.format(value) : String(value);
    });
  }

  private saveBossTuning(): void {
    try {
      const changed = Object.fromEntries(BOSS_KNOBS.map(({ key }) => [key, BOSS_TUNING[key]]).filter(([key, value]) => value !== BOSS_TUNING_DEFAULTS[key as keyof BossTuning]));
      localStorage.setItem(BOSS_STORAGE_KEY, JSON.stringify(changed));
    } catch {
      // Blocked storage: the values still apply for this page.
    }
  }

  private refreshLabels(): void {
    this.list.querySelectorAll<HTMLButtonElement>(':scope > button').forEach((button, index) => { if (this.controls[index]) button.textContent = this.controls[index].label(); });
  }

  private render(): void {
    const show = this.allowed && this.settings.enabled;
    this.root.hidden = !show;
    this.indicator.hidden = !show;
    if (show) this.refreshLabels();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private mode / blocked storage: the settings still hold for this page.
    }
  }
}
