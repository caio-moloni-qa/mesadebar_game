import { Projectile } from '../../config/tavernBattle';
import { TurnBattle, BattleHit, EnemyAttack, Fighter } from '../../core/tavern/TurnBattle';
import { ReactionResult } from '../../core/tavern/Reaction';

/** The duel's side-view stage: a 960×540 logical canvas scaled by an integer factor with smoothing off, drawn from the
 *  battle's state and the cues its events leave. Codex's prototype art (art-source/tavern-battle/REPORT.md) paints the
 *  room and Brom once loaded; until then, and for the hero and the other regulars, placeholder pixel art made of
 *  blocks. It never decides anything — it only reads the battle. */
export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;
const FLOOR_Y = 432;
const HERO_HOME = 300;
const ENEMY_HOME = 670;
/** Where Brom stands to swing at the hero. */
const ENEMY_CLOSE = 446;
/** One "pixel" of the placeholder sprites, in stage pixels. */
const U = 6;
/** Timing track: stage pixels per ms, and where "now" sits. */
const TRACK_PX_PER_MS = 0.32;
const TRACK_X = 250;
const TRACK_Y = 498;

type Pose = 'idle' | 'windup' | 'strike' | 'parry' | 'dodge' | 'hurt' | 'down' | 'drink' | 'stagger';

interface Cue { kind: string; at: number; fighterId: string; value?: number }
interface FloatText { text: string; color: string; x: number; y: number; at: number; size: number; life: number }
interface Spark { x: number; y: number; vx: number; vy: number; at: number; color: string }

/** Placeholder looks of the regulars without art yet (Brom has Codex's atlas, and his own block fallback). */
const REGULAR_LOOKS: Record<string, { skin: string; hair: string; body: string; dark: string; trim: string }> = {
  lyra: { skin: '#f0c8a0', hair: '#e8d070', body: '#3f7a4a', dark: '#24482a', trim: '#8a5a2a' },
  grimbo: { skin: '#7fb04a', hair: '#3a2a1a', body: '#8a3a3a', dark: '#4a1e1e', trim: '#e0c060' },
  zora: { skin: '#d8a888', hair: '#2a1a30', body: '#7a3a9a', dark: '#42204f', trim: '#e0c060' },
  sergio: { skin: '#e0b090', hair: '#4a3020', body: '#f0e6d0', dark: '#5a3a6b', trim: '#7a4a26' }
};
/** The thrown things: colour and size in stage pixels. */
const PROJECTILES: Record<Projectile, { color: string; w: number; h: number }> = {
  arrow: { color: '#d8c8a0', w: 34, h: 4 },
  mug: { color: '#c89a3a', w: 20, h: 22 },
  plate: { color: '#f0ece0', w: 26, h: 8 },
  bottle: { color: '#3f8a4a', w: 10, h: 26 },
  barrel: { color: '#7a4a26', w: 56, h: 56 }
};
const FEINT_COLOR = '#c58bff';

const RESULT_COLORS: Record<ReactionResult, string> = { parry: '#ffd75a', dodge: '#7fdcff', taken: '#ff5a4a', early: '#9a9a9a', held: '#c58bff' };

/** A 960×540 flattened side view of the tavern (prototype art, v1). */
const STAGE_ART = loadImage(new URL('../../assets/tavern-battle/tavern-stage_v1.png', import.meta.url).href);
/** Brom's 8 static poses, 4×2 cells of 128×128, facing left, pivot at (64, 120). */
const BROM_ATLAS = loadImage(new URL('../../assets/tavern-battle/brom-poses_v3.png', import.meta.url).href);
const BROM_CELL = 128;
const BROM_PIVOT = { x: 64, y: 120 };
const BROM_SCALE = 2;
/** Atlas index per pose: 0 idle, 1 tankard strike, 2 punch, 3 hammer overhead, 4 parry, 5 dodge, 6 hurt, 7 knockout. */
const BROM_POSE = { idle: 0, caneca: 1, soco: 2, martelo: 3, parry: 4, dodge: 5, hurt: 6, down: 7 } as const;

function loadImage(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

function ready(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

export class BattleStage2D {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background = document.createElement('canvas');
  private battle: TurnBattle | null = null;
  private cues: Cue[] = [];
  private floats: FloatText[] = [];
  private sparks: Spark[] = [];
  private shakeUntil = 0;
  private shakePower = 0;
  private unbind: Array<() => void> = [];
  private heroColor = '#c0502a';
  showTrack = true;

  constructor() {
    this.canvas.className = 'duel-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.paintBackground();
  }

  /** Fits the stage to the screen. The canvas is drawn at a whole-number multiple of the stage (crisp blocks) and
   *  shown at the largest size that fits — an exact multiple only would leave half the screen black on e.g. 1904×985. */
  resize(width: number, height: number): { scale: number; width: number; height: number } {
    const fit = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
    this.canvas.width = STAGE_WIDTH * Math.max(1, Math.ceil(fit));
    this.canvas.height = STAGE_HEIGHT * Math.max(1, Math.ceil(fit));
    return { scale: fit, width: Math.floor(STAGE_WIDTH * fit), height: Math.floor(STAGE_HEIGHT * fit) };
  }

  attach(battle: TurnBattle, heroColor: number): void {
    this.unbind.forEach((off) => off());
    this.battle = battle;
    this.heroColor = `#${heroColor.toString(16).padStart(6, '0')}`;
    this.cues = [];
    this.floats = [];
    this.sparks = [];
    const now = () => battle.clock.now;
    const { events } = battle;
    // Only Brom's duel drinks every round.
    const drinking = battle.duel.rule === 'drinking';
    const round = (n: number) => {
      if (drinking) this.cue('drink', now(), 'all');
      this.floats.push({ text: drinking ? `Rodada ${n} — Saúde!` : `Rodada ${n}`, color: '#ffe3a0', x: 480, y: 150, at: now(), size: 30, life: 1300 });
    };
    round(1);
    this.unbind = [
      events.on('roundStarted', ({ round: n }) => round(n)),
      events.on('attackAnnounced', ({ attackerId }) => this.cue('announce', now(), attackerId)),
      events.on('strike', ({ attackerId, targetId, damage, crit }) => {
        this.cue('strike', now(), attackerId);
        this.cue('hurt', now() + 180, targetId);
        this.floats.push({ text: crit ? `CRÍTICO -${damage}` : `-${damage}`, color: crit ? '#ffb84a' : '#ffffff', x: this.restX(targetId), y: FLOOR_Y - 190, at: now() + 180, size: crit ? 32 : 28, life: 800 });
        this.burst(this.restX(targetId) - 30, FLOOR_Y - 100, '#fff3c0', 8, now() + 180);
      }),
      events.on('firmed', ({ fighterId }) => {
        this.cue('firm', now(), fighterId);
        this.floats.push({ text: 'FIRME', color: '#8fc8ff', x: HERO_HOME, y: FLOOR_Y - 190, at: now(), size: 24, life: 800 });
      }),
      events.on('early', ({ fighterId }) => {
        this.cue('stagger', now(), fighterId);
        this.floats.push({ text: 'CEDO!', color: '#b9b9b9', x: HERO_HOME, y: FLOOR_Y - 200, at: now(), size: 22, life: 600 });
      }),
      events.on('hitResolved', ({ targetId, result, damage }) => {
        const at = now();
        this.cue(result, at, targetId);
        const x = HERO_HOME + 40;
        if (result === 'parry') {
          this.floats.push({ text: 'PERFEITO!', color: '#ffd75a', x: HERO_HOME, y: FLOOR_Y - 210, at, size: 34, life: 900 });
          this.burst(x + 40, FLOOR_Y - 110, '#fff6b0', 14, at);
        } else if (result === 'dodge') {
          this.floats.push({ text: 'ESQUIVA', color: '#7fdcff', x: HERO_HOME - 30, y: FLOOR_Y - 200, at, size: 24, life: 700 });
        } else if (result === 'held') {
          this.floats.push({ text: 'SEGUROU! ERA FINTA', color: FEINT_COLOR, x: HERO_HOME + 40, y: FLOOR_Y - 210, at, size: 24, life: 900 });
        } else if (result === 'taken') {
          this.floats.push({ text: `-${damage}`, color: '#ff5a4a', x: HERO_HOME, y: FLOOR_Y - 200, at, size: 30, life: 800 });
          this.burst(x, FLOOR_Y - 100, '#ff7a5a', 8, at);
          this.shake(at, damage >= 15 ? 9 : 5);
        }
      }),
      events.on('counter', ({ defenderId, attackerId, damage }) => {
        this.cue('counter', now(), defenderId);
        this.cue('hurt', now() + 120, attackerId);
        this.floats.push({ text: 'CONTRA-ATAQUE!', color: '#ff9a3a', x: 480, y: 140, at: now(), size: 32, life: 1100 });
        this.floats.push({ text: `-${damage}`, color: '#ffffff', x: ENEMY_CLOSE + 20, y: FLOOR_Y - 200, at: now() + 120, size: 28, life: 800 });
        this.burst(ENEMY_CLOSE - 20, FLOOR_Y - 110, '#ffd08a', 12, now() + 120);
        this.shake(now() + 120, 6);
      }),
      events.on('skillUsed', ({ fighterId, skill, targetId, damage, heal, crit }) => {
        const at = now();
        const finisher = skill.kind === 'finisher';
        this.floats.push({ text: finisher ? `${skill.name.toUpperCase()}!` : skill.name, color: finisher ? '#ffb84a' : '#ffe3a0', x: 480, y: 140, at, size: finisher ? 34 : 28, life: 1100 });
        if (damage > 0) {
          this.cue('strike', at, fighterId);
          this.cue('hurt', at + 180, targetId);
          this.floats.push({ text: crit ? `CRÍTICO -${damage}` : `-${damage}`, color: crit ? '#ffb84a' : '#ffffff', x: this.restX(targetId), y: FLOOR_Y - 190, at: at + 180, size: finisher ? 36 : 30, life: 900 });
          this.burst(this.restX(targetId) - 30, FLOOR_Y - 100, finisher ? '#ffb84a' : '#fff3c0', finisher ? 20 : 10, at + 180);
          this.shake(at + 180, finisher ? 12 : 6);
        } else {
          this.cue(heal > 0 ? 'drink' : 'firm', at, fighterId);
          if (heal > 0) this.floats.push({ text: `+${heal}`, color: '#8dffa8', x: this.restX(fighterId), y: FLOOR_Y - 200, at, size: 28, life: 900 });
        }
      }),
      events.on('riposte', ({ defenderId, attackerId, damage, on }) => {
        if (on === 'parry') this.cue('counter', now(), defenderId);
        this.cue('hurt', now() + 100, attackerId);
        const x = this.restX(attackerId);
        this.floats.push({ text: `${on === 'dodge' ? 'DE VOLTA' : 'CONTRAGOLPE'} -${damage}`, color: '#ff9a3a', x: x + 20, y: FLOOR_Y - 165, at: now() + 100, size: 22, life: 800 });
        this.burst(x - 20, FLOOR_Y - 110, '#ffd08a', 8, now() + 100);
      }),
      events.on('poisoned', ({ fighterId, damage }) => {
        this.cue('hurt', now() + 200, fighterId);
        this.floats.push({ text: `VENENO -${damage}`, color: '#8de05a', x: this.restX(fighterId), y: FLOOR_Y - 220, at: now() + 200, size: 24, life: 900 });
        this.burst(this.restX(fighterId), FLOOR_Y - 120, '#8de05a', 8, now() + 200);
      }),
      events.on('looted', ({ fighterId, fichas }) => {
        this.floats.push({ text: `+${fichas} FICHA${fichas === 1 ? '' : 'S'}`, color: '#ffd75a', x: this.restX(fighterId), y: FLOOR_Y - 240, at: now() + 150, size: 22, life: 900 });
      }),
      events.on('healed', ({ fighterId, amount }) => {
        this.floats.push({ text: `+${amount}`, color: '#8dffa8', x: this.restX(fighterId), y: FLOOR_Y - 200, at: now() + 300, size: 24, life: 900 });
      }),
      events.on('fighterDown', ({ fighterId }) => {
        this.cue('down', now(), fighterId);
        this.shake(now(), 10);
      })
    ];
  }

  detach(): void {
    this.unbind.forEach((off) => off());
    this.unbind = [];
    this.battle = null;
  }

  /** `now` is the battle clock's time (the stage moves with it, so pausing freezes it). */
  draw(now: number, wallMs: number): void {
    const battle = this.battle;
    const { ctx } = this;
    const k = this.canvas.width / STAGE_WIDTH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#120c09';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Before the fight (Grimbo's bet): just the room.
    if (!battle) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.drawImage(ready(STAGE_ART) ? STAGE_ART : this.background, 0, 0);
      return;
    }
    const hero = battle.party[0];
    const enemy = battle.enemies[0];
    // The player's drinks sway the room a little (cosmetic in phase 1); hits shake it.
    const sway = hero.tipsiness * 1.6;
    let dx = Math.sin(wallMs / 900) * sway;
    let dy = Math.sin(wallMs / 1300) * sway * 0.4;
    if (now < this.shakeUntil) {
      dx += (Math.random() * 2 - 1) * this.shakePower;
      dy += (Math.random() * 2 - 1) * this.shakePower * 0.5;
    }
    ctx.setTransform(k, 0, 0, k, Math.round(dx * k), Math.round(dy * k));
    ctx.rotate(Math.sin(wallMs / 1100) * hero.tipsiness * 0.0018);
    const art = ready(STAGE_ART);
    ctx.drawImage(art ? STAGE_ART : this.background, 0, 0);
    // The painted room has its own light; only the placeholder one needs the flicker.
    if (!art) this.drawLanternGlow(wallMs);

    const enemyX = this.enemyX(now);
    const heroX = this.heroX(now, enemyX);
    this.shadow(heroX);
    this.shadow(enemyX);
    this.drawFighter(enemy, enemyX, this.enemyPose(now, enemy), now, -1);
    this.drawFighter(hero, heroX, this.heroPose(now, hero), now, 1);
    if (hero.hp > 0) {
      if (hero.firm) this.drawAura(heroX, wallMs, '143, 200, 255', 0);
      if (hero.shield > 0) this.drawAura(heroX, wallMs, '224, 160, 90', 8);
      if (hero.wall) this.drawAura(heroX, wallMs, '255, 215, 90', 16);
    }
    this.drawProjectiles(now, enemyX);
    this.drawIntent(now, enemyX);
    this.drawSparks(now);
    this.drawFloats(now);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.showTrack) this.drawTrack(now);
  }

  // ── Positions and poses, from the battle state and the cues ──

  private cue(kind: string, at: number, fighterId: string): void {
    this.cues.push({ kind, at, fighterId });
    if (this.cues.length > 60) this.cues.splice(0, this.cues.length - 60);
  }

  /** The latest cue of one of `kinds` for a fighter, if it started within `withinMs`. */
  private recent(now: number, fighterId: string, kinds: string[], withinMs: number): Cue | undefined {
    for (let i = this.cues.length - 1; i >= 0; i -= 1) {
      const cue = this.cues[i];
      if (cue.at > now) continue;
      if ((cue.fighterId === fighterId || cue.fighterId === 'all') && kinds.includes(cue.kind)) return now - cue.at <= withinMs ? cue : undefined;
    }
    return undefined;
  }

  private restX(fighterId: string): number {
    if (fighterId === 'hero') return HERO_HOME;
    const attack = this.battle?.attack;
    return this.battle && this.battle.phase === 'enemy-attack' && !attack?.pattern.projectile ? ENEMY_CLOSE : ENEMY_HOME;
  }

  /** The enemy walks in at the announcement and back once the attack has played out; throwers and archers stay home. */
  private enemyX(now: number): number {
    const battle = this.battle!;
    const attack = battle.attack;
    if (!attack || attack.pattern.projectile) return ENEMY_HOME;
    const resolved = attack.hits.every((hit) => hit.result !== null);
    const lastAt = Math.max(...attack.hits.map((hit) => hit.at));
    if (!resolved || now < lastAt + 250) {
      const t = Math.min(1, (now - attack.announcedAt) / 420);
      return ENEMY_HOME + (ENEMY_CLOSE - ENEMY_HOME) * easeOut(t);
    }
    const back = Math.min(1, (now - lastAt - 250) / 450);
    return ENEMY_CLOSE + (ENEMY_HOME - ENEMY_CLOSE) * easeOut(back);
  }

  private heroX(now: number, enemyX: number): number {
    const strike = this.recent(now, 'hero', ['strike'], 650);
    let x = HERO_HOME;
    if (strike) {
      const t = now - strike.at;
      const reach = enemyX - 116;
      x = t < 180 ? HERO_HOME + (reach - HERO_HOME) * easeOut(t / 180)
        : t < 420 ? reach
        : reach + (HERO_HOME - reach) * easeOut((t - 420) / 230);
    }
    const counter = this.recent(now, 'hero', ['counter'], 420);
    if (counter) x += Math.sin(Math.min(1, (now - counter.at) / 420) * Math.PI) * 30;
    const dodge = this.recent(now, 'hero', ['dodge'], 300);
    if (dodge) x -= Math.sin(Math.min(1, (now - dodge.at) / 300) * Math.PI) * 46;
    const hurt = this.recent(now, 'hero', ['taken'], 260);
    if (hurt) x -= Math.sin(Math.min(1, (now - hurt.at) / 260) * Math.PI) * 14;
    return Math.round(x);
  }

  private heroPose(now: number, hero: Fighter): Pose {
    if (hero.hp <= 0) return 'down';
    if (this.recent(now, 'hero', ['drink'], 900)) return 'drink';
    const strike = this.recent(now, 'hero', ['strike'], 650);
    if (strike && now - strike.at >= 120 && now - strike.at < 420) return 'strike';
    if (this.recent(now, 'hero', ['counter'], 380)) return 'strike';
    if (this.recent(now, 'hero', ['parry'], 240)) return 'parry';
    if (this.recent(now, 'hero', ['dodge'], 300)) return 'dodge';
    if (this.recent(now, 'hero', ['taken', 'hurt'], 300)) return 'hurt';
    if (this.recent(now, 'hero', ['stagger'], 250)) return 'stagger';
    return 'idle';
  }

  private enemyPose(now: number, enemy: Fighter): Pose {
    if (enemy.hp <= 0) return 'down';
    if (this.recent(now, enemy.id, ['drink'], 900)) return 'drink';
    if (this.recent(now, enemy.id, ['hurt'], 280)) return 'hurt';
    const attack = this.battle!.attack;
    if (attack && this.battle!.phase === 'enemy-attack') {
      const heavy = attack.pattern.intent === 'pesado';
      // A projectile's swing is its release, a flight before it lands.
      const flight = attack.pattern.projectile ? attack.pattern.flightMs ?? 0 : 0;
      for (const hit of attack.hits) {
        const dt = now - (hit.at - flight);
        // A feint: the arm goes up... and stays there.
        if (hit.feint && dt > -(heavy ? 900 : 380) && dt < 220) return 'windup';
        if (dt >= 0 && dt < 150) return 'strike';
        if (dt < 0 && dt > -(heavy ? 900 : 280)) return 'windup';
      }
    }
    return 'idle';
  }

  // ── Drawing ──

  private shadow(x: number): void {
    this.ctx.fillStyle = '#00000055';
    this.ctx.fillRect(x - 50, FLOOR_Y - 5, 100, 10);
  }

  /** `facing` 1 = right (the party), -1 = left (the enemies). Sprites are drawn facing right and mirrored. */
  private drawFighter(fighter: Fighter, x: number, pose: Pose, now: number, facing: 1 | -1): void {
    const { ctx } = this;
    if (fighter.side === 'enemy' && fighter.id === 'brom' && ready(BROM_ATLAS)) {
      this.drawBromSprite(x, pose, now, this.battle!.attack?.pattern.intent ?? 'golpe');
      return;
    }
    ctx.save();
    ctx.translate(x, FLOOR_Y);
    ctx.scale(facing, 1);
    if (pose === 'down') {
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-8, -26);
    }
    if (pose === 'dodge') ctx.rotate(-0.22);
    if (pose === 'hurt' || pose === 'stagger') ctx.rotate(-0.12);
    const flash = pose === 'hurt' && Math.floor(now / 60) % 2 === 0;
    const block = (bx: number, by: number, w: number, h: number, color: string) => {
      ctx.fillStyle = flash ? '#ffffff' : color;
      ctx.fillRect(bx * U, by * U, w * U, h * U);
    };
    if (fighter.side === 'party') this.drawHero(block, pose);
    else if (fighter.id === 'brom') this.drawBrom(block, pose, this.battle!.attack?.pattern.intent ?? 'golpe');
    else this.drawRegular(block, pose, fighter.id, this.battle!.attack, now);
    ctx.restore();
  }

  private drawHero(block: (x: number, y: number, w: number, h: number, color: string) => void, pose: Pose): void {
    const accent = this.heroColor;
    const dark = shade(accent, -0.45);
    const crouch = pose === 'parry' ? 1 : 0;
    // Legs and boots.
    block(-4, -8, 3, 8, '#3a2a22'); block(1, -8, 3, 8, '#3a2a22');
    block(-5, -2, 4, 2, '#1e1612'); block(1, -2, 5, 2, '#1e1612');
    // Tunic, belt, cape.
    block(-6, -19 + crouch, 3, 12, dark);
    block(-4, -19 + crouch, 9, 11, accent);
    block(-4, -11 + crouch, 9, 2, '#5a3a1e');
    block(0, -11 + crouch, 2, 2, '#e0c060');
    // Head, hair, eye.
    block(-2, -25 + crouch, 6, 6, '#e8b890');
    block(-3, -27 + crouch, 7, 3, dark);
    block(-3, -25 + crouch, 2, 4, dark);
    block(2, -23 + crouch, 1, 2, '#1a1410');
    // Arm and sword by pose.
    const steel = '#d8dde6', hilt = '#6a4a2a';
    if (pose === 'strike') {
      block(3, -17, 6, 2, '#e8b890');
      block(9, -18, 2, 4, hilt);
      block(11, -17, 13, 2, steel);
    } else if (pose === 'parry') {
      block(3, -17 + crouch, 4, 2, '#e8b890');
      block(7, -30, 2, 18, steel);
      block(5, -15, 6, 2, hilt);
    } else if (pose === 'drink') {
      block(3, -26, 2, 8, '#e8b890');
      block(3, -30, 4, 5, '#c89a3a');
      block(3, -31, 4, 1, '#fff6d8');
    } else if (pose === 'down') {
      block(4, -14, 8, 2, steel);
    } else {
      block(4, -18 + crouch, 2, 7, '#e8b890');
      block(4, -12 + crouch, 3, 2, hilt);
      block(6, -24 + crouch, 2, 12, steel);
    }
  }

  private drawBrom(block: (x: number, y: number, w: number, h: number, color: string) => void, pose: Pose, intent: string): void {
    const skin = '#e0a882', beard = '#c0502a', leather = '#6a4426', iron = '#8a8f99';
    // Short sturdy legs.
    block(-6, -7, 5, 7, '#4a3020'); block(1, -7, 5, 7, '#4a3020');
    block(-7, -2, 6, 2, '#241812'); block(1, -2, 7, 2, '#241812');
    // Barrel body, belt, apron.
    block(-8, -19, 16, 13, leather);
    block(-8, -10, 16, 2, '#3a2416');
    block(-1, -10, 3, 2, '#d8b040');
    // Head, iron cap, beard (big, braided), eye.
    block(-4, -26, 9, 7, skin);
    block(-5, -29, 11, 3, iron); block(-6, -27, 13, 2, '#6f737c');
    block(-3, -21, 10, 6, beard); block(0, -15, 3, 4, beard); block(4, -15, 2, 3, beard);
    block(3, -24, 2, 2, '#1a1410');
    block(4, -23, 3, 1, '#c87050');
    // The arm: what he swings depends on the attack (caneca, socos, martelo).
    const weapon = (hx: number, hy: number) => {
      if (intent === 'pesado') {
        block(hx, hy - 12, 2, 14, '#6a4a2a');
        block(hx - 3, hy - 17, 8, 6, iron);
        block(hx - 3, hy - 17, 8, 1, '#c8ccd4');
      } else if (intent === 'golpe') {
        block(hx, hy - 3, 5, 6, '#c89a3a');
        block(hx, hy - 4, 5, 1, '#fff6d8');
        block(hx + 5, hy - 2, 1, 3, '#c89a3a');
      } else {
        block(hx, hy - 1, 4, 4, skin);
      }
    };
    if (pose === 'windup') {
      block(-9, -27, 3, 9, skin);
      weapon(-10, -28);
    } else if (pose === 'strike') {
      block(7, -18, 8, 3, skin);
      weapon(15, -16);
    } else if (pose === 'drink') {
      block(5, -27, 3, 9, skin);
      block(6, -31, 5, 5, '#c89a3a');
      block(6, -32, 5, 1, '#fff6d8');
    } else if (pose !== 'down') {
      block(7, -18, 3, 8, skin);
      weapon(8, -10);
    }
  }

  /** The other regulars until their art comes: one humanoid in their colours, holding what the attack uses (a bow,
   *  a dagger, dice, a crystal orb, the shop's stock). Drawn facing right, mirrored by the caller. */
  private drawRegular(block: (x: number, y: number, w: number, h: number, color: string) => void, pose: Pose, id: string, attack: EnemyAttack | null, now: number): void {
    const look = REGULAR_LOOKS[id] ?? REGULAR_LOOKS.sergio;
    const goblin = id === 'grimbo';
    const robe = id === 'zora';
    const top = goblin ? -22 : -28;
    // Legs (Zora's robe covers them), body, belt.
    if (robe) block(-6, -16, 12, 16, look.dark);
    else { block(-4, -8, 3, 8, look.dark); block(1, -8, 3, 8, look.dark); block(-5, -2, 4, 2, '#1e1612'); block(1, -2, 5, 2, '#1e1612'); }
    block(-5, top + 8, 10, -top - 16 + (robe ? 6 : 0), look.body);
    block(-5, -10, 10, 2, look.trim);
    if (id === 'sergio') block(-3, top + 10, 7, -top - 12, '#d8cbb0');
    // Head, hair, eye; goblin ears, Lyra's hood, Zora's scarf.
    block(-3, top, 7, 7, look.skin);
    block(-4, top - 2, 9, 3, look.hair);
    if (goblin) { block(-6, top + 1, 3, 2, look.skin); block(4, top + 1, 3, 2, look.skin); }
    if (id === 'lyra') { block(-4, top - 3, 8, 3, look.body); block(-5, top, 2, 6, look.hair); }
    if (robe) block(-4, top - 3, 9, 2, look.trim);
    block(2, top + 2, 1, 2, '#1a1410');
    // The arm and what it holds.
    const item = attack?.pattern.projectile ?? (id === 'lyra' ? 'dagger' : id === 'grimbo' ? 'dice' : id === 'zora' ? 'orb' : 'mug');
    const held = (hx: number, hy: number) => {
      if (item === 'arrow') { block(hx, hy - 8, 1, 16, '#8a5a2a'); block(hx - 1, hy - 8, 1, 1, '#d8c8a0'); }
      else if (item === 'dagger') block(hx, hy - 4, 1, 5, '#d8dde6');
      else if (item === 'dice') { block(hx, hy - 2, 3, 3, '#f4f0e6'); block(hx + 1, hy - 1, 1, 1, '#1a1410'); }
      else if (item === 'orb') { block(hx - 1, hy - 3, 4, 4, Math.floor(now / 200) % 2 === 0 ? '#c58bff' : '#e0c0ff'); }
      else if (item === 'barrel') block(hx - 2, hy - 6, 6, 7, '#7a4a26');
      else { const p = PROJECTILES[item as Projectile] ?? PROJECTILES.mug; block(hx, hy - 3, Math.max(2, Math.round(p.w / U)), Math.max(2, Math.round(p.h / U)), p.color); }
    };
    if (pose === 'windup') { block(-8, top + 1, 3, 9, look.skin); held(-8, top); }
    else if (pose === 'strike') { block(5, top + 10, 8, 3, look.skin); held(13, top + 12); }
    else if (pose === 'hurt' || pose === 'stagger') block(5, top + 12, 3, 7, look.skin);
    else if (pose !== 'down') { block(5, top + 10, 3, 8, look.skin); held(6, top + 18); }
  }

  /** What's flying: from the thrower toward the hero, landing exactly when its hit does. A parried one flies back, a
   *  dodged one sails past, a taken one stops there. */
  private drawProjectiles(now: number, enemyX: number): void {
    const attack = this.battle!.attack;
    const kind = attack?.pattern.projectile;
    if (!attack || !kind) return;
    const { ctx } = this;
    const spec = PROJECTILES[kind];
    const flight = attack.pattern.flightMs ?? 400;
    const fromX = enemyX - 60;
    const toX = HERO_HOME + 40;
    attack.hits.forEach((hit) => {
      const t = (now - (hit.at - flight)) / flight;
      if (t < 0) return;
      let x: number;
      let y: number;
      // Chest high (a barrel rolls on the floor).
      const ground = kind === 'barrel' ? FLOOR_Y - spec.h / 2 : FLOOR_Y - 85;
      const arc = kind === 'arrow' || kind === 'barrel' ? 0 : 60;
      if (hit.result === null || t <= 1) {
        const c = Math.min(1, t);
        x = fromX + (toX - fromX) * c;
        y = ground - Math.sin(c * Math.PI) * arc;
      } else {
        const after = now - hit.at;
        if (hit.result === 'taken' || after > 450) return;
        const back = hit.result === 'parry' ? 1 : -1;
        x = toX + back * after * 0.9;
        y = ground - (hit.result === 'parry' ? Math.sin(Math.min(1, after / 450) * Math.PI) * 60 : 0);
      }
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      // Spin what tumbles; an arrow points where it flies.
      if (kind !== 'arrow') ctx.rotate(kind === 'barrel' ? -now / 90 : now / 70);
      ctx.fillStyle = spec.color;
      ctx.fillRect(-spec.w / 2, -spec.h / 2, spec.w, spec.h);
      if (kind === 'arrow') {
        // Flying left: the head leads, the fletching trails.
        ctx.fillStyle = '#c8ccd4';
        ctx.fillRect(-spec.w / 2 - 6, -3, 6, 6);
        ctx.fillStyle = '#8fc86a';
        ctx.fillRect(spec.w / 2 - 6, -4, 6, 8);
      } else if (kind === 'barrel') {
        ctx.fillStyle = '#3a2416';
        ctx.fillRect(-spec.w / 2, -spec.h / 2 + 10, spec.w, 5);
        ctx.fillRect(-spec.w / 2, spec.h / 2 - 15, spec.w, 5);
      } else if (kind === 'mug') {
        ctx.fillStyle = '#fff6d8';
        ctx.fillRect(-spec.w / 2, -spec.h / 2, spec.w, 4);
      }
      ctx.restore();
    });
  }

  /** Codex's atlas: one static pose per state, the motion comes from the stage (lunge, lean, flash). */
  private drawBromSprite(x: number, pose: Pose, now: number, intent: string): void {
    const { ctx } = this;
    const swing = intent === 'pesado' ? BROM_POSE.martelo : intent === 'combo' ? BROM_POSE.soco : BROM_POSE.caneca;
    let index: number = BROM_POSE.idle;
    let lean = 0;
    if (pose === 'down') index = BROM_POSE.down;
    else if (pose === 'hurt' || pose === 'stagger') index = BROM_POSE.hurt;
    else if (pose === 'windup') {
      // The hammer goes up overhead; the tankard and fists coil back.
      index = intent === 'pesado' ? BROM_POSE.martelo : BROM_POSE.idle;
      lean = intent === 'pesado' ? 0 : 0.08;
    } else if (pose === 'strike') {
      index = swing;
      // The overhead hammer comes down: tip the pose forward onto the hero.
      lean = intent === 'pesado' ? -0.45 : 0;
    } else if (pose === 'parry') index = BROM_POSE.parry;
    else if (pose === 'dodge') index = BROM_POSE.dodge;
    const sx = (index % 4) * BROM_CELL;
    const sy = Math.floor(index / 4) * BROM_CELL;
    ctx.save();
    ctx.translate(x, FLOOR_Y);
    ctx.rotate(lean);
    // A gulp: the idle pose already holds the tankard, so he just bobs.
    const bob = pose === 'drink' ? -Math.abs(Math.sin(now / 120)) * 6 : 0;
    if (pose === 'hurt' && Math.floor(now / 60) % 2 === 0) ctx.filter = 'brightness(2.6)';
    ctx.drawImage(BROM_ATLAS, sx, sy, BROM_CELL, BROM_CELL,
      -BROM_PIVOT.x * BROM_SCALE, -BROM_PIVOT.y * BROM_SCALE + bob, BROM_CELL * BROM_SCALE, BROM_CELL * BROM_SCALE);
    ctx.restore();
  }

  /** Firmar (blue), the Barril shield (amber) and Muralha Viva (gold) as nested frames around the hero. */
  private drawAura(x: number, wallMs: number, rgb: string, inset: number): void {
    const { ctx } = this;
    ctx.strokeStyle = `rgba(${rgb}, ${0.45 + Math.sin(wallMs / 160) * 0.2})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 48 - inset, FLOOR_Y - 180 - inset, 104 + inset * 2, 184 + inset);
  }

  /** The intent badge over the enemy while an attack is coming: "18 PESADO", "6 × 3 COMBO". */
  private drawIntent(now: number, enemyX: number): void {
    const battle = this.battle!;
    const attack = battle.attack;
    if (!attack || battle.phase !== 'enemy-attack') return;
    const { pattern } = attack;
    const damage = attack.hits[0].damage;
    const count = attack.hits.length;
    const label = intentLabel(attack, damage, count);
    const color = pattern.intent === 'pesado' ? '#ff6a4a' : pattern.intent === 'combo' || pattern.intent === 'dados' ? '#ffb84a' : pattern.intent === 'flecha' ? '#7fdcff' : '#ffe08a';
    const { ctx } = this;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    const width = Math.max(ctx.measureText(label).width, ctx.measureText(pattern.name).width) + 24;
    const y = FLOOR_Y - 250;
    ctx.fillStyle = '#140c08e0';
    ctx.fillRect(Math.round(enemyX - width / 2), y - 22, Math.round(width), 50);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(enemyX - width / 2), y - 22, Math.round(width), 3);
    ctx.fillText(label, enemyX, y);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#e8dcc0';
    ctx.fillText(pattern.name, enemyX, y + 20);
    // The "!" blinks through the wind-up before the first hit.
    if (now < attack.hits[0].at && Math.floor(now / 140) % 2 === 0) {
      ctx.font = 'bold 34px monospace';
      ctx.fillStyle = color;
      ctx.fillText('!', enemyX, y - 32);
    }
  }

  /** Under the stage: every hit of the attack slides toward the line; the gold band is the parry window, the blue
   *  one the dodge window (both as wide as the defender's are right now). */
  private drawTrack(now: number): void {
    const battle = this.battle!;
    const attack = battle.attack;
    const { ctx } = this;
    const hero = battle.party[0];
    const windows = battle.windowsFor(hero);
    const left = 120, right = 840;
    ctx.fillStyle = '#0c0806c8';
    ctx.fillRect(left, TRACK_Y - 16, right - left, 32);
    ctx.fillStyle = '#7fdcff40';
    ctx.fillRect(TRACK_X - windows.dodgeMs * TRACK_PX_PER_MS, TRACK_Y - 14, windows.dodgeMs * 2 * TRACK_PX_PER_MS, 28);
    ctx.fillStyle = '#ffd75a70';
    ctx.fillRect(TRACK_X - windows.parryMs * TRACK_PX_PER_MS, TRACK_Y - 14, windows.parryMs * 2 * TRACK_PX_PER_MS, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(TRACK_X - 1, TRACK_Y - 18, 2, 36);
    if (battle.lockedUntil > now) {
      ctx.fillStyle = '#9a9a9a80';
      ctx.fillRect(left, TRACK_Y - 16, right - left, 32);
    }
    if (!attack) return;
    // Unrevealed dice: only the next hit shows, so you can't count them in advance.
    const hidden = attack.dice !== null && !attack.dice.revealed;
    const next = attack.hits.find((hit) => hit.result === null);
    attack.hits.forEach((hit: BattleHit) => {
      if (hidden && hit.result === null && hit !== next) return;
      const x = TRACK_X + (hit.at - now) * TRACK_PX_PER_MS;
      if (x < left - 10 || x > right + 10) return;
      // Pressentimento shows the feints for what they are.
      const color = hit.result ? RESULT_COLORS[hit.result] : hit.feint && hero.passives.foresight ? FEINT_COLOR : hit.dodgeOnly ? '#7fdcff' : '#ffffff';
      if (hit.result && now - hit.at > 500) return;
      ctx.fillStyle = color;
      const size = hit.damage >= 15 ? 11 : 8;
      ctx.beginPath();
      ctx.moveTo(x, TRACK_Y - size);
      ctx.lineTo(x + size, TRACK_Y);
      ctx.lineTo(x, TRACK_Y + size);
      ctx.lineTo(x - size, TRACK_Y);
      ctx.closePath();
      ctx.fill();
    });
  }

  private burst(x: number, y: number, color: string, count: number, at: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 0.12 + Math.random() * 0.18;
      this.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 0.05, at, color });
    }
    if (this.sparks.length > 200) this.sparks.splice(0, this.sparks.length - 200);
  }

  private shake(at: number, power: number): void {
    this.shakeUntil = at + 220;
    this.shakePower = power;
  }

  private drawSparks(now: number): void {
    const { ctx } = this;
    this.sparks = this.sparks.filter((spark) => now - spark.at < 450);
    this.sparks.forEach((spark) => {
      const t = now - spark.at;
      if (t < 0) return;
      ctx.fillStyle = spark.color;
      ctx.fillRect(Math.round(spark.x + spark.vx * t), Math.round(spark.y + spark.vy * t + 0.0004 * t * t), 4, 4);
    });
  }

  private drawFloats(now: number): void {
    const { ctx } = this;
    this.floats = this.floats.filter((float) => now - float.at < float.life);
    ctx.textAlign = 'center';
    this.floats.forEach((float) => {
      const t = now - float.at;
      if (t < 0) return;
      const rise = Math.min(1, t / float.life);
      const pop = t < 90 ? 1.25 - (t / 90) * 0.25 : 1;
      ctx.globalAlpha = rise > 0.7 ? (1 - rise) / 0.3 : 1;
      ctx.font = `bold ${Math.round(float.size * pop)}px monospace`;
      ctx.fillStyle = '#140c08';
      ctx.fillText(float.text, float.x + 3, float.y - rise * 40 + 3);
      ctx.fillStyle = float.color;
      ctx.fillText(float.text, float.x, float.y - rise * 40);
      ctx.globalAlpha = 1;
    });
  }

  private drawLanternGlow(wallMs: number): void {
    const { ctx } = this;
    [180, 780].forEach((x, i) => {
      const flicker = 0.16 + Math.sin(wallMs / (170 + i * 40)) * 0.03;
      ctx.fillStyle = `rgba(255, 170, 70, ${flicker})`;
      ctx.beginPath();
      ctx.arc(x, 120, 90, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** The flat tavern wall, a shelf of bottles, the bar counter, lanterns and the floorboards — drawn once. */
  private paintBackground(): void {
    const canvas = this.background;
    canvas.width = STAGE_WIDTH;
    canvas.height = STAGE_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    // Wall planks.
    for (let y = 0; y < FLOOR_Y - 40; y += 36) {
      ctx.fillStyle = (y / 36) % 2 === 0 ? '#4a3021' : '#43291c';
      ctx.fillRect(0, y, STAGE_WIDTH, 36);
      ctx.fillStyle = '#2e1c12';
      ctx.fillRect(0, y + 34, STAGE_WIDTH, 2);
      for (let x = ((y / 36) % 2) * 90; x < STAGE_WIDTH; x += 180) ctx.fillRect(x, y, 2, 34);
    }
    // Beams.
    ctx.fillStyle = '#2a170e';
    ctx.fillRect(0, 0, STAGE_WIDTH, 20);
    [80, 480, 880].forEach((x) => ctx.fillRect(x - 10, 0, 20, FLOOR_Y - 40));
    // Bottle shelf.
    ctx.fillStyle = '#5c3a22';
    ctx.fillRect(260, 186, 440, 10);
    ctx.fillRect(260, 120, 440, 8);
    const bottles = ['#3f8a4a', '#8a3a3a', '#c8a040', '#3a5a8a', '#6a3a7a', '#3f8a4a', '#c86a30'];
    for (let i = 0; i < 26; i += 1) {
      const x = 272 + i * 16 + (i % 3) * 2;
      const tall = 22 + ((i * 7) % 3) * 6;
      const shelfY = i % 2 === 0 ? 186 : 120;
      ctx.fillStyle = bottles[i % bottles.length];
      ctx.fillRect(x, shelfY - tall, 10, tall);
      ctx.fillRect(x + 3, shelfY - tall - 8, 4, 8);
      ctx.fillStyle = '#ffffff30';
      ctx.fillRect(x + 2, shelfY - tall + 3, 2, tall - 6);
    }
    // Barrels on the shelf ends.
    [[180, 300], [790, 300]].forEach(([x, y]) => {
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(x - 34, y - 40, 68, 92);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(x - 34, y - 26, 68, 6);
      ctx.fillRect(x - 34, y + 30, 68, 6);
    });
    // Lanterns.
    [180, 780].forEach((x) => {
      ctx.fillStyle = '#2a1a10';
      ctx.fillRect(x - 2, 20, 4, 80);
      ctx.fillStyle = '#ffcf6a';
      ctx.fillRect(x - 10, 100, 20, 26);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(x - 12, 96, 24, 6);
      ctx.fillRect(x - 12, 124, 24, 4);
    });
    // The bar counter behind the fighters.
    ctx.fillStyle = '#6a3e22';
    ctx.fillRect(0, FLOOR_Y - 110, STAGE_WIDTH, 70);
    ctx.fillStyle = '#8a5530';
    ctx.fillRect(0, FLOOR_Y - 118, STAGE_WIDTH, 12);
    ctx.fillStyle = '#4a2a16';
    for (let x = 30; x < STAGE_WIDTH; x += 120) ctx.fillRect(x, FLOOR_Y - 100, 6, 56);
    // Mugs on the counter.
    [120, 560, 600, 860].forEach((x) => {
      ctx.fillStyle = '#c89a3a';
      ctx.fillRect(x, FLOOR_Y - 136, 18, 18);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(x, FLOOR_Y - 200, 18, 5);
    });
    // Floorboards.
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(0, FLOOR_Y - 40, STAGE_WIDTH, STAGE_HEIGHT - FLOOR_Y + 40);
    for (let y = FLOOR_Y - 40; y < STAGE_HEIGHT; y += 22) {
      ctx.fillStyle = '#2a170e';
      ctx.fillRect(0, y, STAGE_WIDTH, 2);
    }
    ctx.fillStyle = '#00000030';
    ctx.fillRect(0, FLOOR_Y - 40, STAGE_WIDTH, 10);
  }
}

/** The intent badge's first line: "18 PESADO", "6 × 3 COMBO", "9 FLECHA · SÓ ESQUIVA", "? × 5 DADOS". */
function intentLabel(attack: EnemyAttack, damage: number, count: number): string {
  switch (attack.pattern.intent) {
    case 'combo': return `${damage} × ${count} COMBO`;
    case 'pesado': return `${damage} PESADO`;
    case 'flecha': return count > 1 ? `${damage} × ${count} FLECHAS · SÓ ESQUIVA` : `${damage} FLECHA · SÓ ESQUIVA`;
    case 'dados': return attack.dice && !attack.dice.revealed ? `? × ${damage} DADOS` : `🎲 ${count} × ${damage} DADOS`;
    case 'arremesso': return count > 1 ? `${damage} × ${count} ARREMESSO` : `${damage} ARREMESSO`;
    default: return `${damage} GOLPE`;
  }
}

function easeOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) * (1 - c);
}

/** Lightens (amount > 0) or darkens a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}
