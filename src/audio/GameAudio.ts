import { GameSession } from '../core/session/GameSession';
import { EnemyState } from '../core/session/entities';
import { MiniBossKind } from '../core/systems/MiniBossSystem';
import { DIFFICULTY_STAGES } from '../config/balance';
import { SoundName, synthesizeSound } from './soundbank';

/** The score, one loop per situation (art-source/MUSIC_PROMPTS.md), loudness-matched MP3s. One static URL literal per
 *  file so Vite rewrites them; each is fetched the first time it's needed. */
const TRACK_URLS = {
  tavern: new URL('../assets/audio/music/tavern.mp3', import.meta.url).href,
  // The original score ("The Last Watch", src/audio/score.ts) stays the arena's theme.
  arena: new URL('../assets/audio/the-last-watch.mp3', import.meta.url).href,
  'arena-intense': new URL('../assets/audio/music/arena-intense.mp3', import.meta.url).href,
  'guardian-gravedigger': new URL('../assets/audio/music/guardian-gravedigger.mp3', import.meta.url).href,
  'guardian-temple': new URL('../assets/audio/music/guardian-temple.mp3', import.meta.url).href,
  'guardian-lake': new URL('../assets/audio/music/guardian-lake_v2.mp3', import.meta.url).href,
  'boss-necromancer': new URL('../assets/audio/music/boss-necromancer.mp3', import.meta.url).href,
  'boss-necromancer-enraged': new URL('../assets/audio/music/boss-necromancer-enraged.mp3', import.meta.url).href
};
/** Short cues over the music (which ducks under them). */
const STING_URLS = {
  guardian: new URL('../assets/audio/music/sting-guardian.mp3', import.meta.url).href,
  boss: new URL('../assets/audio/music/sting-boss.mp3', import.meta.url).href,
  victory: new URL('../assets/audio/music/sting-victory.mp3', import.meta.url).href,
  defeat: new URL('../assets/audio/music/sting-defeat.mp3', import.meta.url).href
};
export type TrackName = keyof typeof TRACK_URLS;
type StingName = keyof typeof STING_URLS;
const GUARDIAN_TRACK: Record<MiniBossKind, TrackName> = { gravedigger: 'guardian-gravedigger', templeGuardian: 'guardian-temple', lakeSpirit: 'guardian-lake' };
const CROSSFADE_S = 1.6;

/** What the music reads off the session (GameSession fits it). */
export interface MusicSituation {
  merchant: { hub: boolean; inside: boolean };
  bosses: { bosses: ReadonlyArray<{ phaseTwo: boolean; enraged: boolean }> };
  miniBosses: { bosses: ReadonlyArray<{ kind: MiniBossKind }> };
  difficulty: { stageFor(elapsedMs: number): { startMs: number } };
  elapsedMs: number;
  over: boolean;
}

/** The loop the moment calls for: the tavern (menu, between runs, inside the portal, after a run), the Necromancer
 *  (enraged once he's in his second phase), a guardian's theme while one is up, else the arena, heating up from the
 *  third difficulty stage. */
export function musicFor(session: MusicSituation, inMenu: boolean): TrackName {
  if (inMenu || session.over || session.merchant.hub || session.merchant.inside) return 'tavern';
  if (session.bosses.bosses.length) return session.bosses.bosses.some((boss) => boss.phaseTwo || boss.enraged) ? 'boss-necromancer-enraged' : 'boss-necromancer';
  const guardian = session.miniBosses.bosses[0];
  if (guardian) return GUARDIAN_TRACK[guardian.kind];
  return session.difficulty.stageFor(session.elapsedMs).startMs >= DIFFICULTY_STAGES[2].startMs ? 'arena-intense' : 'arena';
}
const STORAGE_KEY = 'venivium.audio.v1';
const VOICE_LIMIT = 20;
type Settings = { music: number; effects: number; muted: boolean };
type Position = { x: number; y: number };
type Mode = 'menu' | 'run' | 'paused' | 'ended';
const COOLDOWN: Partial<Record<SoundName, number>> = { bolt: .09, sword: .09, whip: .11, boomerang: .15, aura: .3, impact: .09, critical: .1, pickup: .065, explosion: .16, beam: .2, dash: .15 };

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const volume = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
    return { music: volume(saved.music, .38), effects: volume(saved.effects, .65), muted: saved.muted === true };
  } catch { return { music: .38, effects: .65, muted: false }; }
}

/** Browser audio lives outside the deterministic simulation. One context and music loop per page;
 * session bindings, short-lived voices and boss transition tracking are replaced on every new run.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  /** Under the music volume: the loops go through it, the stings don't, so a sting can duck the loop. */
  private trackBus: GainNode | null = null;
  private current: { name: TrackName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: TrackName | null = null;
  private readonly decoded = new Map<string, Promise<AudioBuffer>>();
  /** No track change until a sting is over. */
  private stingUntil = 0;
  private readonly settings = loadSettings();
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly last = new Map<SoundName, number>();
  private readonly bossStates = new Map<EnemyState, string>();
  private unsubscribe: Array<() => void> = [];
  private session: GameSession | null = null;
  private mode: Mode = 'menu';
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly mute: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div'); this.root.className = 'audio-controls';
    this.root.innerHTML = `
      <button type="button" class="audio-toggle" aria-expanded="false" aria-controls="audio-settings" aria-label="Configurar áudio" title="Configurar áudio">♫</button>
      <div class="audio-panel" id="audio-settings" hidden role="group" aria-label="Configurações de áudio">
        <div class="audio-heading"><strong>Áudio</strong><button type="button" class="audio-close" aria-label="Fechar configurações de áudio">×</button></div>
        <label>Música <output data-output="music"></output><input type="range" min="0" max="100" step="1" data-volume="music" aria-label="Volume da música"></label>
        <label>Efeitos <output data-output="effects"></output><input type="range" min="0" max="100" step="1" data-volume="effects" aria-label="Volume dos efeitos"></label>
        <button type="button" class="audio-mute"></button><p class="audio-status"></p>
      </div>`;
    container.append(this.root);
    this.panel = this.root.querySelector('.audio-panel')!;
    this.toggle = this.root.querySelector('.audio-toggle')!;
    this.mute = this.root.querySelector('.audio-mute')!;
    this.status = this.root.querySelector('.audio-status')!;
    this.toggle.addEventListener('click', () => this.setOpen(this.panel.hidden));
    this.root.querySelector('.audio-close')!.addEventListener('click', () => this.setOpen(false));
    this.mute.addEventListener('click', () => { this.settings.muted = !this.settings.muted; this.save(); });
    this.root.querySelectorAll<HTMLInputElement>('[data-volume]').forEach(input => {
      const key = input.dataset.volume as 'music' | 'effects';
      input.value = String(Math.round(this.settings[key] * 100));
      input.addEventListener('input', () => { this.settings[key] = Number(input.value) / 100; this.save(); });
    });
    // Browser autoplay policy: audio starts only in response to a user gesture, with no rejected promises.
    window.addEventListener('pointerdown', () => { void this.unlock(); }, { passive: true });
    window.addEventListener('keydown', event => {
      if (event.target instanceof Node && this.root.contains(event.target)) {
        if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.setOpen(false); }
        return;
      }
      void this.unlock();
    }, true);
    this.root.addEventListener('keydown', event => event.stopPropagation());
    document.addEventListener('pointerdown', event => { if (!this.root.contains(event.target as Node)) this.setOpen(false); });
    document.addEventListener('visibilitychange', () => {
      if (!this.context) return;
      this.stopEffects();
      if (document.hidden) void this.context.suspend().catch(() => {});
      else void this.context.resume().catch(() => {});
    });
    this.refreshControls();
  }

  private setOpen(open: boolean): void {
    if (this.panel.hidden === !open) return;
    this.panel.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) this.panel.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* blocked storage */ }
    this.refreshControls(); this.applyMix();
    if (this.settings.muted || this.settings.effects === 0) this.stopEffects();
  }

  private refreshControls(): void {
    for (const key of ['music', 'effects'] as const) this.root.querySelector(`[data-output="${key}"]`)!.textContent = `${Math.round(this.settings[key] * 100)}%`;
    this.mute.textContent = this.settings.muted ? 'Ativar som' : 'Silenciar tudo';
    this.mute.setAttribute('aria-pressed', String(this.settings.muted));
    this.toggle.textContent = this.settings.muted ? '♪̸' : '♫';
    this.status.textContent = this.context ? 'Trilha original' : 'O som começa ao interagir com o jogo.';
  }

  private async unlock(): Promise<void> {
    try {
      if (!this.context) {
        if (typeof AudioContext === 'undefined') { this.status.textContent = 'Áudio não disponível neste navegador.'; return; }
        const ctx = this.context = new AudioContext({ latencyHint: 'interactive' });
        this.master = ctx.createGain(); this.master.gain.value = 0;
        const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 8; limiter.attack.value = .004; limiter.release.value = .15;
        this.master.connect(limiter).connect(ctx.destination);
        this.music = ctx.createGain(); this.effects = ctx.createGain(); this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass';
        this.trackBus = ctx.createGain();
        this.trackBus.connect(this.music).connect(this.musicFilter).connect(this.master); this.effects.connect(this.master);
        this.applyMix(); this.refreshControls();
        // The arena and the stings (small) load up front; the other loops as they come up.
        this.preload(TRACK_URLS.arena);
        Object.values(STING_URLS).forEach((url) => this.preload(url));
      }
      if (this.context.state === 'suspended' && !document.hidden) await this.context.resume();
    } catch { this.status.textContent = 'Interaja novamente para ativar o som.'; }
  }

  /** Fetches and decodes once per file; a failed load is forgotten so it can be retried. */
  private load(url: string): Promise<AudioBuffer> {
    let buffer = this.decoded.get(url);
    if (!buffer) {
      const ctx = this.context!;
      buffer = fetch(url).then((response) => {
        if (!response.ok) throw Error(`Music: ${response.status}`);
        return response.arrayBuffer();
      }).then((data) => ctx.decodeAudioData(data));
      buffer.catch(() => this.decoded.delete(url));
      this.decoded.set(url, buffer);
    }
    return buffer;
  }

  private preload(url: string): void {
    if (this.context) this.load(url).catch(() => {});
  }

  /** Crossfades to `name` once it's loaded (the current loop keeps playing meanwhile). */
  private setTrack(name: TrackName): void {
    if (!this.context || !this.trackBus || this.wanted === name) return;
    this.wanted = name;
    this.load(TRACK_URLS[name]).then((buffer) => {
      const ctx = this.context!;
      if (this.wanted !== name || this.current?.name === name) return;
      this.fadeOutTrack();
      const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_S);
      source.connect(gain).connect(this.trackBus!); source.start();
      this.current = { name, source, gain };
    }).catch(() => {
      if (this.wanted === name) this.wanted = null;
      this.status.textContent = 'Não foi possível carregar a música.';
    });
  }

  private fadeOutTrack(): void {
    if (!this.current || !this.context) return;
    const { source, gain } = this.current;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value, now); gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_S);
    source.stop(now + CROSSFADE_S);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    this.current = null;
  }

  /** Plays a sting over the music, ducking the loop under it. `stopLoop` (the run's end) fades the loop out instead;
   *  the next one starts after the sting. Falls back to the synthesized cue if the file can't load. */
  private sting(name: StingName, stopLoop = false): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.settings.muted) return;
    // Hold the loop where it is while the sting loads.
    this.stingUntil = ctx.currentTime + 10;
    this.load(STING_URLS[name]).then((buffer) => {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource(); source.buffer = buffer;
      source.connect(this.music!); source.start();
      source.onended = () => source.disconnect();
      this.stingUntil = now + buffer.duration;
      if (stopLoop) {
        this.fadeOutTrack();
        this.wanted = null;
      } else {
        const duck = this.trackBus!.gain;
        duck.cancelScheduledValues(now); duck.setValueAtTime(duck.value, now);
        duck.linearRampToValueAtTime(.3, now + .25); duck.setValueAtTime(.3, now + buffer.duration - .6); duck.linearRampToValueAtTime(1, now + buffer.duration);
      }
    }).catch(() => {
      this.stingUntil = 0;
      this.play(name === 'victory' || name === 'defeat' ? name : 'warning', undefined, .8, true);
    });
  }

  private applyMix(): void {
    if (!this.context || !this.master || !this.music || !this.effects || !this.musicFilter) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : .8, now, .04);
    // The results screen keeps the menu's level: its sting and the tavern after it are heard, not muffled.
    const depth = this.mode === 'run' ? 1 : this.mode === 'paused' ? .28 : .65;
    this.music.gain.setTargetAtTime(this.settings.music * depth, now, .3);
    this.effects.gain.setTargetAtTime(this.settings.effects, now, .025);
    this.musicFilter.frequency.setTargetAtTime(this.mode === 'paused' ? 650 : 9000, now, .25);
  }

  bind(session: GameSession): void {
    this.unsubscribe.forEach(off => off()); this.unsubscribe = [];
    this.stopEffects(); this.last.clear(); this.bossStates.clear(); this.session = session; this.stingUntil = 0;
    const on = session.events.on.bind(session.events);
    this.unsubscribe.push(
      on('melee-swing', ({ weaponId, x, y }) => this.play(weaponId === 'whip' ? 'whip' : 'sword', { x, y })),
      on('projectile-fired', ({ kind, x, y }) => this.play(kind === 'bolt' ? 'bolt' : kind === 'thrownSword' ? 'sword' : 'boomerang', { x, y })),
      on('aura-pulse', () => this.play('aura')),
      on('whip-burst', () => this.play('explosion', undefined, .5)),
      on('staff-explosion', ({ x, y, index }) => { if (index === 0) this.play('explosion', { x, y }, .45); }),
      on('enemy-hit', ({ enemy, critical }) => this.play(critical ? 'critical' : 'impact', enemy, .5)),
      on('soul-fired', ({ x, y }) => this.play('bolt', { x, y }, .6)),
      on('player-damaged', () => this.play('hurt')),
      on('pickup-collected', ({ kind }) => this.play(kind === 'gem' ? 'pickup' : 'upgrade', undefined, kind === 'gem' ? .35 : .65)),
      on('upgrade-applied', () => this.play('upgrade', undefined, .65, true)),
      on('boss-warning', () => { this.sting('boss'); this.preload(TRACK_URLS['boss-necromancer']); }),
      on('boss-shield-countdown', () => this.play('warning', undefined, .35)),
      on('boss-explosion', ({ x, y, kind }) => this.play('explosion', { x, y }, kind === 'shield' ? 1 : .65)),
      on('boss-shield-broken', ({ enemy }) => this.play('shield-break', enemy)),
      on('boss-phase-two', () => { this.play('roar'); this.preload(TRACK_URLS['boss-necromancer-enraged']); }),
      on('boss-enraged', () => this.play('roar', undefined, .8)),
      on('boss-shockwave', ({ x, y }) => this.play('explosion', { x, y })),
      on('boss-wave-cleared', () => this.play('victory')),
      on('miniboss-warning', ({ kind }) => { this.sting('guardian'); this.preload(TRACK_URLS[GUARDIAN_TRACK[kind]]); }),
      on('miniboss-impact', ({ x, y, attack }) => this.play(attack === 'shockwave' || attack === 'geyser' ? 'explosion' : attack === 'wave' ? 'dash' : 'impact', { x, y }, attack === 'shockwave' ? .7 : attack === 'geyser' ? .45 : 1)),
      on('companion-heal', () => this.play('aura', undefined, .45)),
      on('miniboss-stunned', ({ enemy }) => this.play('shield-break', enemy, .6)),
      on('miniboss-defeated', ({ x, y }) => this.play('explosion', { x, y }, .8)),
      on('companion-joined', () => this.play('upgrade', undefined, .8, true)),
      on('companion-attack', ({ x, y }) => this.play('impact', { x, y }, .35)),
      on('ally-raised', ({ x, y }) => this.play('impact', { x, y }, .25)),
      on('hammer-quake', ({ x, y }) => this.play('explosion', { x, y }, .45)),
      on('bottle-burst', ({ x, y }) => this.play('explosion', { x, y }, .35)),
      on('barrel-burst', ({ x, y }) => this.play('explosion', { x, y }, .6)),
      on('fate-burst', ({ x, y }) => this.play('explosion', { x, y }, .5)),
      on('arrow-rain', ({ x, y }) => this.play('bolt', { x, y }, .5)),
      on('potion-heal', () => this.play('pickup', undefined, .5)),
      on('hero-ability', () => this.play('upgrade', undefined, .6, true)),
      on('merchant-portal-opened', () => this.play('warning', undefined, .5)),
      on('merchant-entered', () => this.play('dash', undefined, .7, true)),
      on('merchant-left', () => this.play('dash', undefined, .7, true)),
      on('merchant-purchase', () => this.play('upgrade', undefined, .8, true)),
      on('quest-accepted', () => this.play('pickup', undefined, .7, true)),
      on('quest-completed', () => this.play('upgrade', undefined, .9, true)),
      on('quest-claimed', () => this.play('victory', undefined, .5, true)),
      on('barrel-collected', () => this.play('pickup', undefined, .8)),
      on('power-arc', ({ points }) => this.play('bolt', points[0], .3)),
      on('power-blast', ({ kind, x, y }) => this.play(kind === 'hawk' || kind === 'peel-slip' || kind === 'crack' ? 'impact' : kind === 'roots' ? 'dash' : kind === 'warcry' ? 'roar' : 'explosion', { x, y }, kind === 'meteor' || kind === 'eclipse' || kind === 'sanctuary' ? .9 : kind === 'warcry' ? .7 : .45)),
      on('power-cast', ({ kind }) => { if (kind === 'fury') this.play('roar'); else if (kind === 'foresight') this.play('shield-break', undefined, .6); else if (kind !== 'fury-end' && kind !== 'foresight-ready') this.play('dash', undefined, .5, true); }),
      on('power-item', ({ kind, x, y }) => this.play(kind === 'potion' ? 'pickup' : 'impact', { x, y }, .35)),
      on('run-ended', ({ victory }) => this.sting(victory ? 'victory' : 'defeat', true))
    );
  }

  update(session: GameSession, inMenu: boolean): void {
    const mode: Mode = inMenu ? 'menu' : session.over ? 'ended' : session.frozen ? 'paused' : 'run';
    if (mode !== this.mode) {
      this.mode = mode;
      if (mode === 'menu' || mode === 'paused') this.stopEffects();
      this.applyMix();
    }
    this.root.dataset.mode = mode;
    if (this.context && this.context.currentTime >= this.stingUntil) this.setTrack(musicFor(session, inMenu));
    if (mode !== 'run') return;
    const live = new Set<EnemyState>();
    session.bosses.bosses.forEach(boss => {
      live.add(boss.enemy);
      const state = `${boss.beamState}|${boss.melee?.phase ?? ''}|${boss.dash.phase}|${boss.channelActive}`;
      const previous = this.bossStates.get(boss.enemy)?.split('|');
      if (previous) {
        if (boss.beamState === 'active' && previous[0] !== 'active') this.play('beam', boss.enemy);
        if (boss.melee?.phase.startsWith('sweep') && previous[1] !== boss.melee.phase) this.play('sword', boss.enemy, 1);
        if (boss.dash.phase === 'dashing' && previous[2] !== 'dashing') this.play('dash', boss.enemy);
        if (boss.channelActive && previous[3] !== 'true') this.play('warning', boss.enemy, .6);
      }
      this.bossStates.set(boss.enemy, state);
    });
    for (const enemy of this.bossStates.keys()) if (!live.has(enemy)) this.bossStates.delete(enemy);
  }

  /** A power tier switching on: a short, bright fanfare of our own (a quick rising run, then a held chord with a bell
   *  on top), synthesized on the spot. The paused game already muffles the music under it. */
  fanfare(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.settings.muted || this.settings.effects <= 0) return;
    const out = ctx.createGain(); out.gain.value = .5; out.connect(this.effects!);
    const start = ctx.currentTime + .03;
    const note = (frequency: number, at: number, length: number, type: OscillatorType, level: number) => {
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = frequency;
      const envelope = ctx.createGain();
      const t = start + at;
      envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(level, t + .012);
      envelope.gain.exponentialRampToValueAtTime(level * .45, t + length * .45); envelope.gain.exponentialRampToValueAtTime(.0001, t + length);
      osc.connect(envelope).connect(out); osc.start(t); osc.stop(t + length + .02);
      osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
    };
    // G4 · C5 · E5 · G5 in quick steps, a breath, then C6 over a C-major chord.
    [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
      note(frequency, index * .085, .15, 'square', .13);
      note(frequency * 2, index * .085, .1, 'triangle', .05);
    });
    [261.63, 523.25, 659.25, 783.99].forEach((frequency) => note(frequency, .42, 1.15, 'triangle', .12));
    note(1046.5, .42, 1.1, 'square', .07);
    note(2093, .42, .9, 'sine', .07);
    note(3135.96, .6, .7, 'sine', .04);
    window.setTimeout(() => out.disconnect(), 2200);
  }

  private play(name: SoundName, position?: Position, volume = 1, allowOutsideRun = false): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || document.hidden || this.settings.muted || this.settings.effects <= 0 || (!allowOutsideRun && this.mode !== 'run')) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -Infinity) < (COOLDOWN[name] ?? .18)) return;
    let attenuation = 1, pan = 0;
    if (position && this.session) {
      const dx = position.x - this.session.player.x, dy = position.y - this.session.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1400) return;
      attenuation = 1 / (1 + distance / 450);
      pan = Math.max(-.85, Math.min(.85, (dx - dy) / 900));
    }
    if (this.voices.size >= VOICE_LIMIT) return;
    this.last.set(name, now);
    let buffer = this.buffers.get(name);
    if (!buffer) {
      const samples = synthesizeSound(name, ctx.sampleRate);
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate); buffer.getChannelData(0).set(samples); this.buffers.set(name, buffer);
    }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    source.playbackRate.value = name === 'pickup' ? 1 : .97 + Math.random() * .06;
    const gain = ctx.createGain(); gain.gain.value = volume * attenuation * .65;
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    source.connect(gain).connect(panner).connect(this.effects!);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); panner.disconnect(); };
    source.start();
  }

  private stopEffects(): void {
    for (const voice of this.voices) { try { voice.stop(); } catch { /* already ended */ } }
    this.voices.clear();
  }
}
