import { Projectile, TAVERN_BATTLE } from '../../config/tavernBattle';
import { SNOW_FOES } from '../../config/tavernRoster';
import { TurnBattle, BattleHit, EnemyAttack, Fighter } from '../../core/tavern/TurnBattle';
import { ReactionResult } from '../../core/tavern/Reaction';
import { ActiveFx, FX_LIFE_MS, SkillFx, chargeMs, drawSkillFx, impacts, skillFx } from './SkillFx';
import { StatusBadge, StatusId, badgeLefts, drawStatusBadges, fighterStatuses } from './StatusBadges';

/** The duel's side-view stage: a 960×540 logical canvas scaled by an integer factor with smoothing off, drawn from the
 *  battle's state and the cues its events leave. Codex's art (art-source/tavern-battle/) paints the room and the
 *  regulars once loaded; until then, and for the hero, placeholder pixel art made of blocks. It never decides
 *  anything — it only reads the battle. */
export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;
const FLOOR_Y = 432;
const HERO_HOME = 300;
const ENEMY_HOME = 670;
/** Where Brom stands to swing at the hero. */
const ENEMY_CLOSE = 446;
/** How far in front of whoever they swing at a melee attacker stops. */
const CLOSE_GAP = ENEMY_CLOSE - HERO_HOME;
/** One "pixel" of the placeholder sprites, in stage pixels. */
const U = 6;
/** Timing track: stage pixels per ms, and where "now" sits. */
const TRACK_PX_PER_MS = 0.32;
const TRACK_X = 250;
const TRACK_Y = 498;
/** The name plate over each head (name, HP bar, the squad's Coragem). */
const PLATE_W = 112;
const PLATE_H = 35;

type Pose = 'idle' | 'windup' | 'feint' | 'strike' | 'counter' | 'parry' | 'dodge' | 'hurt' | 'down' | 'drink' | 'stagger' | 'cast';

interface Cue { kind: string; at: number; fighterId: string; value?: number }
interface FloatText { text: string; color: string; x: number; y: number; at: number; size: number; life: number }
interface Spark { x: number; y: number; vx: number; vy: number; at: number; color: string }

/** Placeholder looks of the regulars without art yet (Brom has Codex's atlas, and his own block fallback). */
const REGULAR_LOOKS: Record<string, { skin: string; hair: string; body: string; dark: string; trim: string }> = {
  lyra: { skin: '#f0c8a0', hair: '#e8d070', body: '#3f7a4a', dark: '#24482a', trim: '#8a5a2a' },
  grimbo: { skin: '#7fb04a', hair: '#3a2a1a', body: '#8a3a3a', dark: '#4a1e1e', trim: '#e0c060' },
  zora: { skin: '#d8a888', hair: '#2a1a30', body: '#7a3a9a', dark: '#42204f', trim: '#e0c060' },
  sergio: { skin: '#e0b090', hair: '#4a3020', body: '#f0e6d0', dark: '#5a3a6b', trim: '#7a4a26' },
  // The Nevado, until Codex's sheets come.
  eskimo: { skin: '#d8a070', hair: '#f0ece0', body: '#b8632e', dark: '#6a3a1a', trim: '#f0ece0' },
  frostKnight: { skin: '#a8d8f0', hair: '#5a7a9a', body: '#6fa8d8', dark: '#2a4a6a', trim: '#d8f0ff' },
  iceSerpent: { skin: '#8fe0e8', hair: '#3a8a9a', body: '#5fc8d8', dark: '#2a6a7a', trim: '#e0ffff' },
  bellringer: { skin: '#c8b8a0', hair: '#3a3020', body: '#5a4a3a', dark: '#2a2018', trim: '#d8b040' },
  ancientYeti: { skin: '#a0b8c8', hair: '#f4f8fc', body: '#d8dde6', dark: '#8a96a8', trim: '#5a6a7a' },
  winterKing: { skin: '#c8e0f0', hair: '#f4f8fc', body: '#3a5a9a', dark: '#1a2a5a', trim: '#e0e8ff' },
  frostSkeleton: { skin: '#e8f0f4', hair: '#c8d8e0', body: '#c8d8e0', dark: '#7a8a98', trim: '#8fe0ff' },
  frostSpirit: { skin: '#c8f0ff', hair: '#8fd8ff', body: '#8fd8ff', dark: '#4a8ab8', trim: '#ffffff' }
};
/** The thrown things: colour and size in stage pixels. */
const PROJECTILES: Record<Projectile, { color: string; w: number; h: number }> = {
  arrow: { color: '#d8c8a0', w: 34, h: 4 },
  mug: { color: '#c89a3a', w: 20, h: 22 },
  plate: { color: '#f0ece0', w: 26, h: 8 },
  bottle: { color: '#3f8a4a', w: 10, h: 26 },
  barrel: { color: '#7a4a26', w: 56, h: 56 },
  fish: { color: '#9ab8c8', w: 30, h: 10 },
  ice: { color: '#bfefff', w: 26, h: 8 },
  snowball: { color: '#f4f8fc', w: 14, h: 14 }
};
const FEINT_COLOR = '#c58bff';

const RESULT_COLORS: Record<ReactionResult, string> = { parry: '#ffd75a', dodge: '#7fdcff', taken: '#ff5a4a', early: '#9a9a9a', held: '#c58bff' };

/** Everything Codex has delivered so far (an atlas that isn't there yet just keeps the blocks). */
const ART_URLS = import.meta.glob<string>('../../assets/tavern-battle/*.png', { query: '?url', import: 'default', eager: true });
/** The region rooms: 960×540 flattened side views (tavern v1; the igloo until its art lands is painted in code). */
export type StageBackdrop = 'tavern' | 'igloo';
const STAGE_ART: Record<StageBackdrop, HTMLImageElement> = {
  tavern: loadImage(artUrl('tavern-stage_v1.png')),
  igloo: loadImage(artUrl('igloo-stage_v1.png'))
};
/** How big the fighters are drawn in each room: the tavern's bar stands close behind them, so they shrink a little
 *  for the room to read as big as the igloo's deep floor. */
const FIGHTER_SIZE: Record<StageBackdrop, number> = { tavern: 0.82, igloo: 1 };
/** Each regular's 8 static poses (Codex, art-source/tavern-battle/REPORT.md and ROSTER_REPORT_v1.md): 4×2 cells of
 *  128×128, facing left, pivot at (64, 120). Cells 0 idle, 4 parry, 5 dodge, 6 hurt, 7 knockout are the same for all;
 *  1–3 are each one's own attacks. */
const ATLAS_CELL = 128;
const ATLAS_PIVOT = { x: 64, y: 120 };
const ATLAS_SCALE = 2;
const POSE_CELL = { idle: 0, parry: 4, dodge: 5, hurt: 6, down: 7 } as const;
/** Per attack (pattern id): the cell of the wind-up and of the swing, and `tip` to throw an overhead pose forward
 *  onto the hero as it lands (the hammer, the table). A wind-up of 0 is the idle pose coiled back. */
interface AttackCells { windup: number; strike: number; tip?: boolean }
/** `drink` and `counter` are cells of their own on the playable heroes' sheets (a raised tankard, a quick riposte);
 *  without them a drink is the idle pose bobbing and a counter is the main swing. */
interface FighterAtlas {
  image: HTMLImageElement; attacks: Record<string, AttackCells>; fallback: AttackCells; feint?: number; drink?: number; counter?: number;
  /** Drawn bigger than ATLAS_SCALE (a sheet whose long reach left the body small in its cell). */
  scale?: number;
}
const atlas = (file: string, attacks: Record<string, AttackCells>, fallback: AttackCells, feint?: number): FighterAtlas =>
  ({ image: loadImage(artUrl(file)), attacks, fallback, feint });
/** The base heroes (Codex, HERO_REPORT_v1.md): 0 idle, 1 main swing, 2 counter, 3 toast, then the shared 4–7. */
const heroAtlas = (id: string): FighterAtlas =>
  ({ ...atlas(`${id}-hero-poses_v1.png`, {}, { windup: 0, strike: 1 }), counter: 2, drink: 3 });
/** The Nevado's sheets (Codex, same contract as the heroes'): 1 main attack, 2 a quick second one (also the counter),
 *  3 the heavy one held overhead. Each foe pattern picks its cell by intent. */
const snowAtlas = (id: keyof typeof SNOW_FOES, file: string, feint?: number): FighterAtlas => ({
  ...atlas(file, Object.fromEntries(SNOW_FOES[id].patterns.map((pattern) => [pattern.id,
    pattern.intent === 'pesado' ? { windup: 3, strike: 3, tip: true } : pattern.intent === 'combo' ? { windup: 0, strike: 2 } : { windup: 0, strike: 1 }])), { windup: 0, strike: 1 }, feint),
  counter: 2
});
const ATLASES: Record<string, FighterAtlas> = {
  // 1 tankard, 2 punch, 3 hammer overhead.
  brom: atlas('brom-poses_v3.png', { caneca: { windup: 0, strike: 1 }, socos: { windup: 0, strike: 2 }, martelada: { windup: 3, strike: 3, tip: true } }, { windup: 0, strike: 1 }),
  // 1 drawn bow, 2 dagger thrust, 3 bow wound back.
  lyra: atlas('lyra-poses_v2.png', { flecha: { windup: 1, strike: 1 }, saraivada: { windup: 1, strike: 1 }, adaga: { windup: 0, strike: 2 }, 'queima-roupa': { windup: 3, strike: 1 } }, { windup: 0, strike: 2 }),
  // 1 coin flick, 2 dice, 3 table overhead.
  grimbo: atlas('grimbo-poses_v2.png', { moeda: { windup: 0, strike: 1 }, dados: { windup: 2, strike: 2 }, mesa: { windup: 3, strike: 3, tip: true } }, { windup: 0, strike: 1 }),
  // 1 crystal bolt, 2 palm strike, 3 the raised palm that never comes down (the feint).
  zora: atlas('zora-poses_v2.png', { cristal: { windup: 0, strike: 1 }, sombras: { windup: 0, strike: 2 }, olhar: { windup: 0, strike: 2 }, corvo: { windup: 3, strike: 2 } }, { windup: 0, strike: 1 }, 3),
  // 1 mug, 2 plate, 3 barrel push; the bottles reuse the throw.
  sergio: atlas('sergio-poses_v2.png', { caneca: { windup: 0, strike: 1 }, pratos: { windup: 0, strike: 2 }, garrafas: { windup: 0, strike: 1 }, barril: { windup: 3, strike: 3 } }, { windup: 0, strike: 1 }),
  barbarian: heroAtlas('barbarian'),
  mage: heroAtlas('mage'),
  reliquia: heroAtlas('reliquia'),
  fabri: heroAtlas('fabri'),
  eskimo: snowAtlas('eskimo', 'eskimo-poses_v1.png'),
  frostKnight: snowAtlas('frostKnight', 'frost-knight-poses_v1.png'),
  iceSerpent: snowAtlas('iceSerpent', 'ice-serpent-poses_v1.png'),
  // The bell (and the scepter) go up and hang there on a feint, like Zora's palm.
  bellringer: snowAtlas('bellringer', 'bellringer-poses_v2.png', 3),
  ancientYeti: snowAtlas('ancientYeti', 'ancient-yeti-poses_v1.png'),
  // The horde (Codex, FROST_HORDE_REPORT_v1.md; the spirit's v2 cleaned its breath out of the idle).
  frostSkeleton: snowAtlas('frostSkeleton', 'frost-skeleton-poses_v1.png'),
  frostSpirit: snowAtlas('frostSpirit', 'frost-spirit-poses_v2.png'),
  // The scepter's long bolt left the King small in his cells (Codex, SNOW_REPORT_v1.md): drawn larger, he's a champion.
  winterKing: { ...snowAtlas('winterKing', 'winter-king-poses_v2.png', 3), scale: 2.7 }
};

function artUrl(file: string): string {
  return ART_URLS[`../../assets/tavern-battle/${file}`] ?? '';
}

function loadImage(src: string): HTMLImageElement {
  const image = new Image();
  // The world's models are still streaming in when a duel opens; without this the sheets queue behind them for
  // seconds and the fighters show up as blocks.
  image.fetchPriority = 'high';
  if (src) image.src = src;
  return image;
}

function ready(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

export class BattleStage2D {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly backgrounds: Record<StageBackdrop, HTMLCanvasElement> = { tavern: document.createElement('canvas'), igloo: document.createElement('canvas') };
  private battle: TurnBattle | null = null;
  private cues: Cue[] = [];
  private floats: FloatText[] = [];
  private sparks: Spark[] = [];
  /** The skills playing out (bolts, meteors, signs). */
  private fxs: ActiveFx[] = [];
  /** When the blow that knocks each fighter out lands (a bolt still in the air keeps them up until it hits). */
  private readonly impactAt = new Map<string, number>();
  /** The skill each fighter last used (their cast pose and the sheet cell it picks). */
  private readonly casting = new Map<string, { fx: SkillFx; at: number }>();
  /** Where each fighter was drawn this frame (a skill's effects follow a caster that dashes). */
  private readonly drawnX = new Map<string, number>();
  /** When the last skill aimed at each fighter lands (a buff or a hex shows up over the head then, not at the click). */
  private readonly statusAt = new Map<string, number>();
  /** When each status badge appeared, by `fighterId:status` (it pops in); dropped once the status wears off. */
  private readonly badgeSince = new Map<string, number>();
  /** The badges drawn this frame, in stage pixels (what the mouse can hover). */
  private badgeBoxes: Array<{ x: number; y: number; side: number; fighter: Fighter; badge: StatusBadge }> = [];
  /** The name plates drawn this frame, in stage pixels (clicking an enemy's picks the target). */
  private plateBoxes: Array<{ x: number; y: number; w: number; h: number; fighter: Fighter }> = [];
  /** The HP each plate shows: it holds until the blow lands, then slides; the trail behind it drains slower. */
  private readonly shownHp = new Map<string, { hp: number; trail: number; at: number }>();
  /** Whose turn it is in the squad (the overlay sets it; their plate glows green). */
  actingId: string | null = null;
  private shakeFrom = 0;
  private shakeUntil = 0;
  private shakePower = 0;
  private unbind: Array<() => void> = [];
  /** A fighter's colour (the blocks of whoever has no atlas yet), by look. */
  private colorOf: (look: string) => string = () => '#c0502a';
  /** Who each party fighter last struck (their lunge goes to them). */
  private readonly lastTarget = new Map<string, string>();
  /** The region's room behind the fight. */
  private backdrop: StageBackdrop = 'tavern';
  showTrack = true;
  /** The enemy chosen to strike in a group fight (the overlay sets it; drawn as a marker). */
  targetId: string | null = null;

  constructor() {
    this.canvas.className = 'duel-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.paintBackground();
    this.paintIgloo();
  }

  /** Fits the stage to the screen. The canvas is drawn at a whole-number multiple of the stage (crisp blocks) and
   *  shown at the largest size that fits — an exact multiple only would leave half the screen black on e.g. 1904×985. */
  resize(width: number, height: number): { scale: number; width: number; height: number } {
    const fit = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
    this.canvas.width = STAGE_WIDTH * Math.max(1, Math.ceil(fit));
    this.canvas.height = STAGE_HEIGHT * Math.max(1, Math.ceil(fit));
    return { scale: fit, width: Math.floor(STAGE_WIDTH * fit), height: Math.floor(STAGE_HEIGHT * fit) };
  }

  /** The room to paint (also before a fight starts, behind the bet and the ladder). */
  setBackdrop(backdrop: StageBackdrop): void {
    this.backdrop = backdrop;
  }

  attach(battle: TurnBattle, colorOf: (look: string) => number): void {
    this.unbind.forEach((off) => off());
    this.battle = battle;
    this.colorOf = (look) => `#${colorOf(look).toString(16).padStart(6, '0')}`;
    this.lastTarget.clear();
    this.cues = [];
    this.floats = [];
    this.sparks = [];
    this.fxs = [];
    this.impactAt.clear();
    this.casting.clear();
    this.drawnX.clear();
    this.statusAt.clear();
    this.badgeSince.clear();
    this.shownHp.clear();
    const now = () => battle.clock.now;
    const { events } = battle;
    // Only Brom's duel drinks every round.
    const drinking = battle.duel.rule === 'drinking';
    const round = (n: number) => {
      if (drinking) this.cue('drink', now(), 'all');
      this.floats.push({ text: drinking ? `Rodada ${n} — Saúde!` : `Rodada ${n}`, color: '#ffe3a0', x: 480, y: 150, at: now(), size: 30, life: 1300 });
    };
    const party = (id: string) => battle.fighter(id)?.side === 'party';
    round(1);
    this.unbind = [
      events.on('roundStarted', ({ round: n }) => round(n)),
      events.on('attackAnnounced', ({ attackerId }) => this.cue('announce', now(), attackerId)),
      events.on('strike', ({ attackerId, targetId, damage, crit }) => {
        if (party(attackerId)) this.lastTarget.set(attackerId, targetId);
        this.cue('strike', now(), attackerId);
        this.cue('hurt', now() + 180, targetId);
        this.impactAt.set(targetId, now() + 180);
        this.floats.push({ text: crit ? `CRÍTICO -${damage}` : `-${damage}`, color: crit ? '#ffb84a' : '#ffffff', x: this.restX(targetId), y: FLOOR_Y - 190, at: now() + 180, size: crit ? 32 : 28, life: 800 });
        this.burst(this.restX(targetId) - 30, FLOOR_Y - 100, '#fff3c0', 8, now() + 180);
      }),
      events.on('firmed', ({ fighterId }) => {
        this.cue('firm', now(), fighterId);
        this.floats.push({ text: 'FIRME', color: '#8fc8ff', x: this.restX(fighterId), y: FLOOR_Y - 190, at: now(), size: 24, life: 800 });
      }),
      events.on('early', ({ fighterId }) => {
        this.cue('stagger', now(), fighterId);
        this.floats.push({ text: 'CEDO!', color: '#b9b9b9', x: this.restX(fighterId), y: FLOOR_Y - 200, at: now(), size: 22, life: 600 });
      }),
      events.on('hitResolved', ({ targetId, result, damage, perfect }) => {
        const at = now();
        this.cue(result, at, targetId);
        const home = this.restX(targetId);
        const x = home + 40;
        if (result === 'parry') {
          this.floats.push({ text: 'PERFEITO!', color: '#ffd75a', x: home, y: FLOOR_Y - 210, at, size: 34, life: 900 });
          this.burst(x + 40, FLOOR_Y - 110, '#fff6b0', 14, at);
        } else if (result === 'dodge' && perfect) {
          this.floats.push({ text: 'ESQUIVA PERFEITA!', color: '#7fdcff', x: home - 30, y: FLOOR_Y - 205, at, size: 28, life: 900 });
          this.burst(home - 30, FLOOR_Y - 120, '#c8f2ff', 10, at);
        } else if (result === 'dodge') {
          this.floats.push({ text: 'ESQUIVA', color: '#7fdcff', x: home - 30, y: FLOOR_Y - 200, at, size: 24, life: 700 });
        } else if (result === 'held') {
          this.floats.push({ text: 'SEGUROU! ERA FINTA', color: FEINT_COLOR, x: home + 40, y: FLOOR_Y - 210, at, size: 24, life: 900 });
        } else if (result === 'taken') {
          this.floats.push({ text: `-${damage}`, color: '#ff5a4a', x: home, y: FLOOR_Y - 200, at, size: 30, life: 800 });
          this.burst(x, FLOOR_Y - 100, '#ff7a5a', 8, at);
          this.shake(at, damage >= 15 ? 9 : 5);
        }
      }),
      events.on('counter', ({ defenderId, attackerId, damage }) => {
        this.cue('counter', now(), defenderId);
        this.cue('hurt', now() + 120, attackerId);
        const x = this.restX(attackerId);
        this.floats.push({ text: 'CONTRA-ATAQUE!', color: '#ff9a3a', x: 480, y: 140, at: now(), size: 32, life: 1100 });
        this.floats.push({ text: `-${damage}`, color: '#ffffff', x: x + 20, y: FLOOR_Y - 200, at: now() + 120, size: 28, life: 800 });
        this.burst(x - 20, FLOOR_Y - 110, '#ffd08a', 12, now() + 120);
        this.shake(now() + 120, 6);
      }),
      events.on('skillUsed', ({ fighterId, skill, targetId, damage, heal, crit, splash }) => {
        const at = now();
        const finisher = skill.kind === 'finisher';
        const fx = skillFx(skill);
        const charge = chargeMs(fx);
        this.floats.push({ text: finisher ? `${skill.name.toUpperCase()}!` : skill.name, color: finisher ? '#ffb84a' : '#ffe3a0', x: 480, y: 140, at, size: finisher ? 34 : 28, life: 1100 });
        // A sweep (Fúria, Avalanche) lands on everyone it hit; a buff on whoever it covers.
        const hits = damage > 0 ? (splash.length > 0 ? splash : [{ targetId, damage }]) : [];
        const caster = battle.fighter(fighterId);
        const covered = fx.motion === 'party' ? battle.fighters.filter((f) => f.side === caster?.side && f.hp > 0).map((f) => f.id)
          : fx.motion === 'self' ? [fighterId]
          : hits.length > 0 ? hits.map((hit) => hit.targetId) : [targetId];
        const casterX = this.restX(fighterId);
        const hitMs = impacts(fx, covered.map((id) => Math.abs(this.restX(id) - casterX)));
        this.fxs.push({ fx, at, casterId: fighterId, targetIds: covered, hitMs });
        this.casting.set(fighterId, { fx, at });
        covered.forEach((id, i) => this.statusAt.set(id, at + hitMs[i]));
        // How the caster moves: a melee lunges (after coiling, if heavy), a sweep dashes through, the rest stay home.
        if (fx.motion === 'melee' || fx.motion === 'spin') {
          const far = covered.reduce((a, b) => (this.restX(b) > this.restX(a) ? b : a), covered[0]);
          if (party(fighterId)) this.lastTarget.set(fighterId, fx.motion === 'spin' ? far : targetId);
          this.cue(fx.motion === 'spin' ? 'dash' : 'strike', at + charge, fighterId);
        } else {
          this.cue('cast', at, fighterId);
        }
        hits.forEach((hit) => {
          const landAt = at + hitMs[covered.indexOf(hit.targetId)];
          this.impactAt.set(hit.targetId, landAt);
          this.cue('hurt', landAt, hit.targetId);
          this.floats.push({ text: crit && hits.length === 1 ? `CRÍTICO -${hit.damage}` : `-${hit.damage}`, color: crit ? '#ffb84a' : '#ffffff', x: this.restX(hit.targetId), y: FLOOR_Y - 190, at: landAt, size: finisher ? 36 : 30, life: 900 });
          this.burst(this.restX(hit.targetId) - 30, FLOOR_Y - 100, fx.color, finisher ? 20 : 12, landAt);
          this.burst(this.restX(hit.targetId) - 30, FLOOR_Y - 100, '#fff3c0', finisher ? 8 : 4, landAt);
          this.shake(landAt, battle.fighter(hit.targetId)!.hp <= 0 ? 10 : finisher ? 12 : 6);
        });
        if (hits.length === 0) {
          if (heal > 0) this.floats.push({ text: `+${heal}`, color: '#8dffa8', x: this.restX(fighterId), y: FLOOR_Y - 200, at: at + charge, size: 28, life: 900 });
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
      // Emitted as the blow is dealt, before the strike or skill that dealt it: the fall itself waits for `impactAt`.
      events.on('fighterDown', ({ fighterId }) => {
        this.impactAt.set(fighterId, now());
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
    const painted = STAGE_ART[this.backdrop];
    const art = ready(painted);
    const room = art ? painted : this.backgrounds[this.backdrop];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#120c09';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Before the fight (Grimbo's bet, the tower's ladder): just the room.
    if (!battle) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.drawImage(room, 0, 0);
      return;
    }
    const hero = battle.party[0];
    const enemy = battle.enemies[0];
    // The player's drinks sway the room a little (cosmetic in phase 1); hits shake it.
    const sway = hero.tipsiness * 1.6;
    let dx = Math.sin(wallMs / 900) * sway;
    let dy = Math.sin(wallMs / 1300) * sway * 0.4;
    if (now >= this.shakeFrom && now < this.shakeUntil) {
      dx += (Math.random() * 2 - 1) * this.shakePower;
      dy += (Math.random() * 2 - 1) * this.shakePower * 0.5;
    }
    ctx.setTransform(k, 0, 0, k, Math.round(dx * k), Math.round(dy * k));
    ctx.rotate(Math.sin(wallMs / 1100) * hero.tipsiness * 0.0018);
    ctx.drawImage(room, 0, 0);
    // The painted tavern has its own light; only the placeholder one needs the flicker.
    if (!art && this.backdrop === 'tavern') this.drawLanternGlow(wallMs);
    if (!this.artReady) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000aa';
      ctx.fillText('Chamando os lutadores…', STAGE_WIDTH / 2 + 2, FLOOR_Y - 98);
      ctx.fillStyle = '#ffe9b8';
      ctx.fillText('Chamando os lutadores…', STAGE_WIDTH / 2, FLOOR_Y - 100);
      return;
    }

    // The attacker (or, with nobody attacking, the front one) anchors the badge and what flies.
    const attacker = battle.attack ? battle.fighter(battle.attack.attackerId) ?? enemy : enemy;
    const enemyX = this.enemyX(now, attacker);
    // Back to front: the farthest slot first, the one walking in last.
    const order = [...battle.enemies].sort((a, b) => (a === attacker ? 1 : b === attacker ? -1 : b.slot - a.slot));
    order.forEach((foe) => {
      const x = this.enemyX(now, foe);
      this.shadow(x);
      this.drawnX.set(foe.id, x);
      this.drawFighter(foe, x, this.enemyPose(now, foe), now, -1);
    });
    const target = battle.fighter(this.targetId ?? '');
    if (battle.enemies.length > 1 && target && target.hp > 0 && battle.phase === 'player-turn') this.drawTargetMark(this.enemyX(now, target), wallMs, '#ffd75a', this.badgesShown(target));
    // The squad, back to front too (the leader stands in front).
    [...battle.party].sort((a, b) => b.slot - a.slot).forEach((member) => {
      const struck = battle.fighter(this.lastTarget.get(member.id) ?? '');
      const x = this.partyX(now, member, struck && struck.side === 'enemy' ? this.enemyX(now, struck) : enemyX);
      this.shadow(x);
      this.drawnX.set(member.id, x);
      this.drawFighter(member, x, this.partyPose(now, member), now, 1);
      // Whose turn it is, when there's more than one to command.
      if (battle.party.length > 1 && battle.phase === 'player-turn' && battle.active === member) this.drawTargetMark(this.partyHome(member), wallMs, '#8dffa8', this.badgesShown(member));
    });
    this.drawProjectiles(now, enemyX);
    this.fxs = this.fxs.filter((active) => now - active.at <= FX_LIFE_MS);
    const fxStage = { ctx, floorY: FLOOR_Y, size: this.size, xOf: (id: string) => this.drawnX.get(id) ?? this.restX(id) };
    this.fxs.forEach((active) => drawSkillFx(fxStage, active, now));
    this.badgeBoxes = [];
    this.plateBoxes = [];
    battle.fighters.forEach((fighter) => this.drawPlate(now, wallMs, fighter));
    battle.fighters.forEach((fighter) => this.drawStatuses(now, fighter));
    this.drawIntent(now, enemyX);
    this.drawSparks(now);
    this.drawFloats(now);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.showTrack) this.drawTrack(now);
  }

  // ── Positions and poses, from the battle state and the cues ──

  private cue(kind: string, at: number, fighterId: string): void {
    this.cues.push({ kind, at, fighterId });
    if (this.cues.length > 80) this.cues.splice(0, this.cues.length - 80);
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

  /** Knocked out, once the blow that did it has landed (a bolt still in the air keeps them standing). */
  private fallen(now: number, fighter: Fighter): boolean {
    return fighter.hp <= 0 && now >= (this.impactAt.get(fighter.id) ?? 0);
  }

  private restX(fighterId: string): number {
    const battle = this.battle;
    const fighter = battle?.fighter(fighterId);
    if (!battle || !fighter) return ENEMY_HOME;
    if (fighter.side === 'party') return this.partyHome(fighter);
    const attack = battle.attack;
    return battle.phase === 'enemy-attack' && attack?.attackerId === fighterId && !attack.pattern.projectile ? this.closeX(attack) : this.enemyHome(fighter);
  }

  /** Where a squad member stands: alone where the hero always stood, a squad spread toward the left (the leader in
   *  front). */
  private partyHome(fighter: Fighter): number {
    const count = this.battle?.party.length ?? 1;
    if (count <= 1) return HERO_HOME;
    const front = 350, back = 70;
    return Math.round(front + ((back - front) * fighter.slot) / (count - 1));
  }

  /** Where an enemy stands: alone in the middle, a group spread toward the back (slot 0 in front). */
  private enemyHome(fighter: Fighter): number {
    const count = this.battle?.enemies.length ?? 1;
    if (count <= 1) return ENEMY_HOME;
    const front = 610, back = 890;
    return Math.round(front + ((back - front) * fighter.slot) / (count - 1));
  }

  /** Where a melee attacker stops: in front of whoever the attack is aimed at. */
  private closeX(attack: EnemyAttack): number {
    const target = this.battle!.fighter(attack.hits[0]?.targetId ?? '');
    return (target ? this.partyHome(target) : HERO_HOME) + CLOSE_GAP;
  }

  /** The attacker walks in at the announcement and back once the attack has played out; throwers and archers stay
   *  home, and so does everyone else. */
  private enemyX(now: number, fighter: Fighter): number {
    const battle = this.battle!;
    const attack = battle.attack;
    const home = this.enemyHome(fighter);
    if (!attack || attack.attackerId !== fighter.id || attack.pattern.projectile) return home;
    const close = this.closeX(attack);
    const resolved = attack.hits.every((hit) => hit.result !== null);
    const lastAt = Math.max(...attack.hits.map((hit) => hit.at));
    if (!resolved || now < lastAt + 250) {
      const t = Math.min(1, (now - attack.announcedAt) / 420);
      return home + (close - home) * easeOut(t);
    }
    const back = Math.min(1, (now - lastAt - 250) / 450);
    return close + (home - close) * easeOut(back);
  }

  /** A bobbing marker over a head: the chosen target (gold) or whose turn it is in the squad (green); `above` lifts
   *  it over the status badges. */
  private drawTargetMark(x: number, wallMs: number, color: string, above = false): void {
    const { ctx } = this;
    const y = this.plateTop() - 6 - (above ? 38 : 0) + Math.sin(wallMs / 180) * 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 14);
    ctx.lineTo(x + 12, y - 14);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }

  private partyX(now: number, fighter: Fighter, enemyX: number): number {
    const home = this.partyHome(fighter);
    const strike = this.recent(now, fighter.id, ['strike'], 650);
    let x = home;
    if (strike) {
      const t = now - strike.at;
      const reach = enemyX - 116;
      x = t < 180 ? home + (reach - home) * easeOut(t / 180)
        : t < 420 ? reach
        : reach + (home - reach) * easeOut((t - 420) / 230);
    }
    // A sweep (Fúria): straight through the line to the farthest foe, a beat there, then back.
    const dash = this.recent(now, fighter.id, ['dash'], 800);
    if (dash) {
      const t = now - dash.at;
      const reach = enemyX + 40;
      x = t < 380 ? home + (reach - home) * (t / 380)
        : t < 500 ? reach
        : reach + (home - reach) * easeOut((t - 500) / 300);
    }
    const counter = this.recent(now, fighter.id, ['counter'], 420);
    if (counter) x += Math.sin(Math.min(1, (now - counter.at) / 420) * Math.PI) * 30;
    const dodge = this.recent(now, fighter.id, ['dodge'], 300);
    if (dodge) x -= Math.sin(Math.min(1, (now - dodge.at) / 300) * Math.PI) * 46;
    const hurt = this.recent(now, fighter.id, ['taken'], 260);
    if (hurt) x -= Math.sin(Math.min(1, (now - hurt.at) / 260) * Math.PI) * 14;
    return Math.round(x);
  }

  private partyPose(now: number, fighter: Fighter): Pose {
    const id = fighter.id;
    if (this.fallen(now, fighter)) return 'down';
    if (this.recent(now, id, ['drink'], 900)) return 'drink';
    const strike = this.recent(now, id, ['strike'], 650);
    if (strike && now - strike.at >= 120 && now - strike.at < 420) return 'strike';
    const dash = this.recent(now, id, ['dash'], 800);
    if (dash && now - dash.at < 500) return 'strike';
    // A heavy blow coils before it goes; a cast charges (the arm drawn back), then lets go and holds a beat.
    const casting = this.casting.get(id);
    if (casting) {
      const t = now - casting.at;
      const charge = chargeMs(casting.fx);
      const lunges = casting.fx.motion === 'melee' || casting.fx.motion === 'spin';
      if (t >= 0 && t < charge) return 'windup';
      if (!lunges && t >= charge && t < charge + 380) return 'cast';
    }
    if (this.recent(now, id, ['counter'], 380)) return 'counter';
    if (this.recent(now, id, ['parry'], 240)) return 'parry';
    if (this.recent(now, id, ['dodge'], 300)) return 'dodge';
    if (this.recent(now, id, ['taken', 'hurt'], 300)) return 'hurt';
    if (this.recent(now, id, ['stagger'], 250)) return 'stagger';
    return 'idle';
  }

  private enemyPose(now: number, enemy: Fighter): Pose {
    if (this.fallen(now, enemy)) return 'down';
    if (this.recent(now, enemy.id, ['drink'], 900)) return 'drink';
    if (this.recent(now, enemy.id, ['hurt'], 280)) return 'hurt';
    const attack = this.battle!.attack;
    if (attack && attack.attackerId === enemy.id && this.battle!.phase === 'enemy-attack') {
      const heavy = attack.pattern.intent === 'pesado';
      // A projectile's swing is its release, a flight before it lands.
      const flight = attack.pattern.projectile ? attack.pattern.flightMs ?? 0 : 0;
      for (const hit of attack.hits) {
        const dt = now - (hit.at - flight);
        // A feint: the arm goes up... and stays there.
        if (hit.feint && dt > -(heavy ? 900 : 380) && dt < 220) return 'feint';
        if (dt >= 0 && dt < 150) return 'strike';
        if (dt < 0 && dt > -(heavy ? 900 : 280)) return 'windup';
      }
    }
    return 'idle';
  }

  // ── Drawing ──

  private shadow(x: number): void {
    this.ctx.fillStyle = '#00000055';
    const half = Math.round(50 * this.size);
    this.ctx.fillRect(x - half, FLOOR_Y - 5, half * 2, 10);
  }

  private get size(): number {
    return FIGHTER_SIZE[this.backdrop];
  }

  /** Whether every sheet this fight draws has finished loading (a failed one counts, it falls back to blocks): the
   *  duel holds its clock until then, so nobody fights as blocks while the world's models are still streaming in. */
  get artReady(): boolean {
    return !this.battle || this.battle.fighters.every((fighter) => ATLASES[fighter.look]?.image.complete ?? true);
  }

  /** `facing` 1 = right (the party), -1 = left (the enemies). Sprites are drawn facing right and mirrored. */
  private drawFighter(fighter: Fighter, x: number, pose: Pose, now: number, facing: 1 | -1): void {
    const { ctx } = this;
    // What they swing is their own attack's; anyone else holds their usual thing.
    const own = this.battle!.attack?.attackerId === fighter.id ? this.battle!.attack : null;
    // Anyone with a sheet uses it (the party's turned to face the enemies).
    const sheet = ATLASES[fighter.look];
    if (sheet && ready(sheet.image)) {
      const casting = own ? undefined : this.casting.get(fighter.id);
      const castId = casting ? castCells(casting.fx).find((id) => id === TOAST || id in sheet.attacks) ?? '' : '';
      this.drawSprite(sheet, x, pose, now, own?.pattern.id ?? castId, facing);
      return;
    }
    // The block placeholders have no feint, counter or cast pose: the arm just stays up, or swings.
    if (pose === 'feint') pose = 'windup';
    if (pose === 'counter' || pose === 'cast') pose = 'strike';
    ctx.save();
    ctx.translate(x, FLOOR_Y);
    ctx.scale(facing * this.size, this.size);
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
    if (fighter.look === 'brom') this.drawBrom(block, pose, own?.pattern.intent ?? 'golpe');
    else if (REGULAR_LOOKS[fighter.look]) this.drawRegular(block, pose, fighter.look, own, now);
    else this.drawHero(block, pose, this.colorOf(fighter.look));
    ctx.restore();
  }

  private drawHero(block: (x: number, y: number, w: number, h: number, color: string) => void, pose: Pose, accent: string): void {
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
      else if (item === 'ice' || item === 'snowball') block(hx - 1, hy - 3, 4, 4, Math.floor(now / 200) % 2 === 0 ? '#bfefff' : '#ffffff');
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
    const target = this.battle!.fighter(attack.hits[0]?.targetId ?? '');
    const toX = (target ? this.partyHome(target) : HERO_HOME) + 40;
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

  /** Codex's atlases: one static pose per state, the motion comes from the stage (lunge, lean, flash). */
  private drawSprite(sheet: FighterAtlas, x: number, pose: Pose, now: number, attackId: string, facing: 1 | -1): void {
    const { ctx } = this;
    const cells = sheet.attacks[attackId] ?? sheet.fallback;
    let index: number = POSE_CELL.idle;
    let lean = 0;
    if (pose === 'down') index = POSE_CELL.down;
    else if (pose === 'hurt' || pose === 'stagger') index = POSE_CELL.hurt;
    else if (pose === 'feint') index = sheet.feint ?? cells.windup;
    else if (pose === 'windup') {
      // An overhead pose goes up as it is; the idle one coils back.
      index = cells.windup;
      lean = cells.windup === POSE_CELL.idle ? 0.08 : 0;
    } else if (pose === 'strike') {
      index = cells.strike;
      // The overhead thing comes down: tip the pose forward onto the hero.
      lean = cells.tip ? -0.45 : 0;
    } else if (pose === 'cast') {
      // Let go from where they stand: the thing that does it (the bow, the dice), or the toast raised for a buff.
      index = attackId === TOAST && sheet.drink !== undefined ? sheet.drink : cells.strike;
      lean = cells.tip ? -0.2 : 0;
    } else if (pose === 'counter') index = sheet.counter ?? cells.strike;
    else if (pose === 'drink') index = sheet.drink ?? POSE_CELL.idle;
    else if (pose === 'parry') index = POSE_CELL.parry;
    else if (pose === 'dodge') index = POSE_CELL.dodge;
    const sx = (index % 4) * ATLAS_CELL;
    const sy = Math.floor(index / 4) * ATLAS_CELL;
    ctx.save();
    ctx.translate(x, FLOOR_Y);
    // The sheets face left: a right-facing fighter is mirrored, and so is the way it tips.
    ctx.rotate(lean * -facing);
    ctx.scale(-facing, 1);
    // A gulp: the idle pose already holds the tankard (or the coin, the orb), so they just bob.
    const bob = pose === 'drink' && sheet.drink === undefined ? -Math.abs(Math.sin(now / 120)) * 6 : 0;
    if (pose === 'hurt' && Math.floor(now / 60) % 2 === 0) ctx.filter = 'brightness(2.6)';
    const scale = (sheet.scale ?? ATLAS_SCALE) * this.size;
    ctx.drawImage(sheet.image, sx, sy, ATLAS_CELL, ATLAS_CELL,
      -ATLAS_PIVOT.x * scale, -ATLAS_PIVOT.y * scale + bob, ATLAS_CELL * scale, ATLAS_CELL * scale);
    ctx.restore();
  }

  /** The top of the name plates over the heads (the badges and markers stack above it). */
  private plateTop(): number {
    return FLOOR_Y - 178 * this.size - PLATE_H;
  }

  /** The plate over a head: the name, the HP bar (the shield over it in blue) and, for the squad, the Coragem. The
   *  HP waits for the blow to land and then slides; a pale trail shows what was just lost. */
  private drawPlate(now: number, wallMs: number, fighter: Fighter): void {
    const { ctx } = this;
    const battle = this.battle!;
    const x = Math.round(this.drawnX.get(fighter.id) ?? this.restX(fighter.id));
    const top = Math.round(this.plateTop());
    const left = x - PLATE_W / 2;
    // The shown HP: frozen while the blow is in the air, then it eases to the real value.
    const shown = this.shownHp.get(fighter.id) ?? { hp: fighter.hp, trail: fighter.hp, at: wallMs };
    const dt = Math.max(0, wallMs - shown.at);
    shown.at = wallMs;
    if (now >= (this.impactAt.get(fighter.id) ?? 0) || fighter.hp > shown.hp) shown.hp += (fighter.hp - shown.hp) * Math.min(1, dt / 90);
    if (Math.abs(fighter.hp - shown.hp) < 0.05) shown.hp = fighter.hp;
    shown.trail = shown.trail > shown.hp ? Math.max(shown.hp, shown.trail - (fighter.maxHp * dt) / 900) : shown.hp;
    this.shownHp.set(fighter.id, shown);
    const down = fighter.hp <= 0 && this.fallen(now, fighter);
    const party = fighter.side === 'party';
    const height = party ? PLATE_H : PLATE_H - 7;
    const y = top + PLATE_H - height;
    ctx.save();
    if (down) ctx.globalAlpha = 0.45;
    // Whose turn (green) or the chosen target (gold) lights the frame.
    const lit = party && battle.party.length > 1 && fighter.id === this.actingId ? '#8dffa8'
      : !party && battle.enemies.length > 1 && fighter.id === this.targetId && !down ? '#ffd75a' : null;
    ctx.fillStyle = '#140c08d8';
    ctx.fillRect(left, y, PLATE_W, height);
    ctx.strokeStyle = lit ?? '#5a4636';
    ctx.lineWidth = lit ? 2 : 1;
    ctx.strokeRect(left + 0.5, y + 0.5, PLATE_W - 1, height - 1);
    // The name (shortened to fit) and the drinks in Brom's duel.
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const mugs = fighter.tipsiness > 0 ? ` ${'▮'.repeat(Math.min(fighter.tipsiness, 4))}` : '';
    let name = fighter.name;
    while (name.length > 3 && ctx.measureText(name + mugs).width > PLATE_W - 8) name = name.slice(0, -1);
    if (name !== fighter.name) name = `${name.slice(0, -1)}…`;
    ctx.fillStyle = party ? '#d8f5c8' : '#ffd8c8';
    ctx.fillText(name, left + 4, y + 11);
    if (mugs) {
      ctx.fillStyle = '#ffb84a';
      ctx.fillText(mugs, left + 4 + ctx.measureText(name).width, y + 11);
    }
    // The bar.
    const barX = left + 3, barY = y + 14, barW = PLATE_W - 6, barH = 10;
    const width = (hp: number) => Math.round((Math.max(0, hp) / fighter.maxHp) * barW);
    ctx.fillStyle = '#3a1410';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ffe3c0';
    ctx.fillRect(barX, barY, width(shown.trail), barH);
    const ratio = shown.hp / fighter.maxHp;
    // The squad's bar turns from green to yellow to red as it drops; the enemies' stays red.
    ctx.fillStyle = !party ? '#e0463a' : ratio > 0.5 ? '#5ad27a' : ratio > 0.25 ? '#e0b03a' : '#ff5a3a';
    ctx.fillRect(barX, barY, width(shown.hp), barH);
    // The shield sits on the bar as a blue band from the left.
    if (fighter.shield > 0 && !down && now >= (this.statusAt.get(fighter.id) ?? 0)) {
      ctx.fillStyle = '#7fdcffb0';
      ctx.fillRect(barX, barY, Math.min(barW, width(fighter.shield)), 4);
    }
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const label = `${Math.max(0, Math.round(shown.hp))}/${fighter.maxHp}`;
    ctx.fillStyle = '#000';
    ctx.fillText(label, x + 1, barY + barH - 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, barY + barH - 2);
    // The squad's Coragem, one pip each.
    if (party) {
      const max = TAVERN_BATTLE.courageMax;
      const pip = Math.floor((barW - (max - 1) * 2) / max);
      for (let i = 0; i < max; i += 1) {
        ctx.fillStyle = i < fighter.courage ? '#ffd75a' : '#4a3a2a';
        ctx.fillRect(barX + i * (pip + 2), barY + barH + 3, pip, 4);
      }
    }
    ctx.restore();
    this.plateBoxes.push({ x: left, y, w: PLATE_W, h: height, fighter });
  }

  /** The fighter whose plate is under a point of the page (a click there picks an enemy as the target). */
  plateUnder(clientX: number, clientY: number): Fighter | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const k = rect.width / STAGE_WIDTH;
    const x = (clientX - rect.left) / k;
    const y = (clientY - rect.top) / k;
    return this.plateBoxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.fighter ?? null;
  }

  /** Whether a fighter has badges over the head (the turn and target markers go above them). */
  private badgesShown(fighter: Fighter): boolean {
    return fighter.hp > 0 && fighterStatuses(fighter).length > 0;
  }

  /** The buffs and debuffs over a head. A new one waits for the skill that gave it to land, then pops in. */
  private drawStatuses(now: number, fighter: Fighter): void {
    const badges = fighter.hp > 0 ? fighterStatuses(fighter) : [];
    const key = (id: StatusId) => `${fighter.id}:${id}`;
    const ids = new Set(badges.map((badge) => key(badge.id)));
    [...this.badgeSince.keys()].forEach((k) => { if (k.startsWith(`${fighter.id}:`) && !ids.has(k)) this.badgeSince.delete(k); });
    if (badges.length === 0) return;
    badges.forEach((badge) => {
      if (!this.badgeSince.has(key(badge.id))) this.badgeSince.set(key(badge.id), Math.max(now, this.statusAt.get(fighter.id) ?? now));
    });
    const x = this.drawnX.get(fighter.id) ?? this.restX(fighter.id);
    const bottom = this.plateTop() - 4;
    drawStatusBadges(this.ctx, x, bottom, badges, (id) => {
      const t = now - this.badgeSince.get(key(id))!;
      return t < 0 ? 0 : t < 220 ? 1 + 0.6 * Math.sin((t / 220) * Math.PI) : 1;
    });
    const { lefts, side } = badgeLefts(x, badges.length);
    badges.forEach((badge, i) => {
      if (now >= this.badgeSince.get(key(badge.id))!) this.badgeBoxes.push({ x: lefts[i], y: bottom - side, side, fighter, badge });
    });
  }

  /** The badge under a point of the page (the hover tooltip), with its box in page pixels. */
  statusUnder(clientX: number, clientY: number): { fighter: Fighter; badge: StatusBadge; left: number; top: number; bottom: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const k = rect.width / STAGE_WIDTH;
    const x = (clientX - rect.left) / k;
    const y = (clientY - rect.top) / k;
    const box = this.badgeBoxes.find((b) => x >= b.x - 2 && x <= b.x + b.side + 2 && y >= b.y - 2 && y <= b.y + b.side + 2);
    return box ? { fighter: box.fighter, badge: box.badge, left: rect.left + (box.x + box.side / 2) * k, top: rect.top + box.y * k, bottom: rect.top + (box.y + box.side) * k } : null;
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
   *  one the dodge window, the bright strip the perfect dodge (all as wide as the defender's are right now). */
  private drawTrack(now: number): void {
    const battle = this.battle!;
    const attack = battle.attack;
    const { ctx } = this;
    // The windows of whoever the attack is aimed at.
    const hero = (attack && battle.fighter(attack.hits[0]?.targetId ?? '')) || battle.party[0];
    const windows = battle.windowsFor(hero);
    const left = 120, right = 840;
    ctx.fillStyle = '#0c0806c8';
    ctx.fillRect(left, TRACK_Y - 16, right - left, 32);
    ctx.fillStyle = '#7fdcff40';
    ctx.fillRect(TRACK_X - windows.dodgeMs * TRACK_PX_PER_MS, TRACK_Y - 14, windows.dodgeMs * 2 * TRACK_PX_PER_MS, 28);
    ctx.fillStyle = '#ffd75a70';
    ctx.fillRect(TRACK_X - windows.parryMs * TRACK_PX_PER_MS, TRACK_Y - 14, windows.parryMs * 2 * TRACK_PX_PER_MS, 28);
    // The perfect dodge: a blue strip along the bottom.
    ctx.fillStyle = '#7fdcff';
    ctx.fillRect(TRACK_X - windows.perfectDodgeMs * TRACK_PX_PER_MS, TRACK_Y + 10, windows.perfectDodgeMs * 2 * TRACK_PX_PER_MS, 4);
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
    this.shakeFrom = at;
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
    const canvas = this.backgrounds.tavern;
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

  /** The igloo until Codex paints it: ice-block walls, a fire, furs and the Esquimó's pot, drawn once. */
  private paintIgloo(): void {
    const canvas = this.backgrounds.igloo;
    canvas.width = STAGE_WIDTH;
    canvas.height = STAGE_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0e1a2a';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    // The dome: rows of ice blocks, offset every other row, darker toward the top.
    for (let row = 0; row * 40 < FLOOR_Y - 40; row += 1) {
      const y = FLOOR_Y - 80 - row * 40;
      const shade = Math.max(0, 1 - row * 0.09);
      for (let x = -((row % 2) * 60); x < STAGE_WIDTH; x += 120) {
        ctx.fillStyle = `rgb(${Math.round(150 * shade + 30)}, ${Math.round(195 * shade + 30)}, ${Math.round(225 * shade + 30)})`;
        ctx.fillRect(x + 2, y + 2, 116, 36);
        ctx.fillStyle = '#ffffff30';
        ctx.fillRect(x + 4, y + 4, 112, 6);
      }
    }
    // The doorway's dark tunnel at the back.
    ctx.fillStyle = '#0a1420';
    ctx.beginPath();
    ctx.arc(480, FLOOR_Y - 40, 90, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(390, FLOOR_Y - 40, 180, 4);
    // Furs on the walls.
    [[150, 170], [810, 170]].forEach(([x, y]) => {
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(x - 46, y, 92, 120);
      ctx.fillStyle = '#5a3e26';
      for (let i = 0; i < 6; i += 1) ctx.fillRect(x - 46 + i * 16, y + 110, 10, 18);
    });
    // The fire and the Esquimó's pot over it.
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(452, FLOOR_Y - 58, 56, 14);
    ctx.fillStyle = '#ff9a3a';
    ctx.fillRect(462, FLOOR_Y - 84, 36, 28);
    ctx.fillStyle = '#ffd75a';
    ctx.fillRect(472, FLOOR_Y - 96, 16, 30);
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(446, FLOOR_Y - 136, 68, 40);
    ctx.fillStyle = '#4a4a54';
    ctx.fillRect(440, FLOOR_Y - 140, 80, 8);
    // Snow floor.
    ctx.fillStyle = '#d8e8f4';
    ctx.fillRect(0, FLOOR_Y - 40, STAGE_WIDTH, STAGE_HEIGHT - FLOOR_Y + 40);
    ctx.fillStyle = '#b8cde0';
    for (let y = FLOOR_Y - 40; y < STAGE_HEIGHT; y += 22) ctx.fillRect(0, y, STAGE_WIDTH, 2);
    ctx.fillStyle = '#00000020';
    ctx.fillRect(0, FLOOR_Y - 40, STAGE_WIDTH, 10);
    // The fire's warm light.
    ctx.fillStyle = 'rgba(255, 170, 70, 0.12)';
    ctx.beginPath();
    ctx.arc(480, FLOOR_Y - 90, 200, 0, Math.PI * 2);
    ctx.fill();
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

/** The cast pose of a heal: the hero sheets' raised toast. */
const TOAST = '@toast';

/** Which of a sheet's attack cells a skill is let go with, best first (the first one the sheet has wins): an arrow
 *  from the drawn bow, dice from the dice throw, a heavy blow from the overhead one. */
function castCells(fx: SkillFx): string[] {
  if (fx.sigil === 'heal') return [TOAST];
  const byItem: Partial<Record<NonNullable<SkillFx['item']>, string[]>> = {
    arrow: ['flecha'], dice: ['dados'], plate: ['pratos'], bottle: ['garrafas', 'caneca'], barrel: ['barril'], coin: ['moeda'],
    bolt: ['cristal'], orb: ['cristal'], breath: ['caneca']
  };
  return [...(fx.item ? byItem[fx.item] ?? [] : []), ...(fx.heavy ? ['martelada', 'mesa'] : [])];
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
