import { DIFFICULTY_STAGES, SANDBOX_SPAWN_CAPS } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import { GameSession } from '../../core/session/GameSession';
import { EnemyVariantId } from '../../core/systems/EnemySpawnScheduler';

/** Toggles the panel keeps across runs (and page reloads, via localStorage when it's available). */
interface SandboxSettings {
  enabled: boolean;
  fog: boolean;
  skeletons: boolean;
  variants: boolean;
  invincible: boolean;
  difficultyStage: number | null;
  capIndex: number;
}

const STORAGE_KEY = 'mesadebar.sandbox';
const DEFAULTS: SandboxSettings = { enabled: false, fog: true, skeletons: true, variants: true, invincible: false, difficultyStage: null, capIndex: 0 };

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
}

interface Control {
  label: () => string;
  run: () => void;
}

/** The F9 sandbox panel (Phaser: SandboxDebugPanel + SandboxState): run-time toggles, spawn/kill shortcuts, clock and
 *  difficulty overrides, and the "SANDBOX ATIVO (F9)" indicator. Settings stick across runs; applyTo() puts them on
 *  each new session. Same controls as the Phaser panel (minus the merchant toggle, until the merchant exists in 3D),
 *  plus "Boss agora" and "Próxima arma". */
export class SandboxPanel {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly indicator: HTMLDivElement;
  private readonly settings = loadSettings();
  private readonly controls: Control[];
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
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F9' || !this.allowed) return;
      event.preventDefault();
      this.settings.enabled = !this.settings.enabled;
      this.save();
      this.render();
    });
    this.render();
  }

  /** Only usable during a run (not on the character menu). */
  setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.render();
  }

  get enabled(): boolean {
    return this.settings.enabled;
  }

  /** Puts the sticky toggles on a fresh run (only while sandbox mode is on, like the Phaser build). */
  applyTo(session: GameSession, forceInvincible: boolean): void {
    const on = this.settings.enabled;
    session.skeletonSpawnEnabled = !on || this.settings.skeletons;
    session.variantSpawnEnabled = !on || this.settings.variants;
    session.player.invincible = forceInvincible || (on && this.settings.invincible);
    session.setForcedDifficultyStage(on ? this.settings.difficultyStage : null);
    session.setEnemySpawnCap(SANDBOX_SPAWN_CAPS[on ? this.settings.capIndex : 0]);
    this.host.setFogVisible(!on || this.settings.fog);
  }

  private buildControls(): Control[] {
    const s = this.settings;
    const run = () => this.host.session();
    const toggle = (label: string, key: 'fog' | 'skeletons' | 'variants' | 'invincible', apply: (value: boolean) => void): Control => ({
      label: () => `${label}: ${s[key] ? 'Ligado' : 'Desligado'}`,
      run: () => { s[key] = !s[key]; apply(s[key]); this.save(); }
    });
    const spawn = (label: string, variant: EnemyVariantId, count: number): Control => ({ label: () => label, run: () => run().spawnNearPlayer(variant, count) });
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
      { label: () => '+1 Boss Extra', run: () => run().bosses.spawnExtraBoss() },
      { label: () => 'Boss da onda agora', run: () => run().triggerBossWave() },
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

  private refreshLabels(): void {
    this.list.querySelectorAll('button').forEach((button, index) => { button.textContent = this.controls[index].label(); });
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
