import { AreaConfig } from '../../config/areas';
import { CHARACTERS, CharacterId } from '../../config/characters';
import { QuestNpcId } from '../systems/QuestSystem';

// Progress between runs: what a finished run pays (Fichas and mastery XP), what the Fichas buy at Sergio's counter
// (permanent upgrades), the mastery track per hero (cosmetic rewards), and which tavern regulars have joined the
// roster. Pure data and functions — the renderer owns where the save lives (browser storage) and when to write it.

/** Every hero the roster can hold: the four starting ones, the four regulars, and Sergio. */
export type HeroId = CharacterId | QuestNpcId | 'sergio';

export const STARTING_HEROES: HeroId[] = ['barbarian', 'mage', 'reliquia', 'fabri'];

// ── Difficulty tiers ────────────────────────────────────────────────────────────────────────────────────────────

/** Winning a run on a tier opens the next. Enemies get tougher; Fichas and mastery XP grow with them. */
export interface DifficultyTier {
  tier: number;
  name: string;
  enemyHealth: number;
  enemyDamage: number;
  reward: number;
}

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { tier: 1, name: 'Normal', enemyHealth: 1, enemyDamage: 1, reward: 1 },
  { tier: 2, name: 'Difícil', enemyHealth: 1.4, enemyDamage: 1.2, reward: 1.3 },
  { tier: 3, name: 'Cruel', enemyHealth: 1.9, enemyDamage: 1.4, reward: 1.6 },
  { tier: 4, name: 'Pesadelo', enemyHealth: 2.5, enemyDamage: 1.65, reward: 2 },
  { tier: 5, name: 'Lenda', enemyHealth: 3.2, enemyDamage: 1.9, reward: 2.5 }
];

export function difficultyTier(tier: number): DifficultyTier {
  return DIFFICULTY_TIERS[Math.min(DIFFICULTY_TIERS.length, Math.max(1, Math.floor(tier))) - 1];
}

// ── Fichas ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a finished run counts, for the payout and the records. */
export interface RunSummary {
  heroId: HeroId;
  victory: boolean;
  elapsedMs: number;
  kills: number;
  guardians: number;
  bosses: number;
  missions: number;
  /** Coins still held when the run ended. */
  coins: number;
  /** The boss cycle reached (1 = the first). */
  cycle: number;
  killsByVariant: Record<string, number>;
  guardiansByKind: Record<string, number>;
  /** Each regular's mission tier at the end of the run (how many of their missions are done). */
  questTiers: Partial<Record<QuestNpcId, number>>;
  /** When it ended (ms since epoch), for the run history. */
  endedAt: number;
  /** The difficulty tier it was played on. */
  tier: number;
}

export const FICHAS_RATES = {
  perMinute: 10,
  killsPerFicha: 50,
  perGuardian: 25,
  perBoss: 60,
  perMission: 15,
  coinShare: 0.1,
  /** A won run pays this much more on its subtotal. */
  victoryBonus: 0.5
};

export interface PayoutLine {
  label: string;
  detail: string;
  amount: number;
}

export interface RunPayout {
  fichas: PayoutLine[];
  fichasTotal: number;
  xp: PayoutLine[];
  xpTotal: number;
}

export const XP_RATES = { perSecond: 1, killsPerXp: 10, perGuardian: 50, perBoss: 150, victory: 200 };

export function runPayout(run: RunSummary): RunPayout {
  const R = FICHAS_RATES;
  const minutes = run.elapsedMs / 60_000;
  const fichas: PayoutLine[] = [
    { label: 'Tempo sobrevivido', detail: `${Math.floor(minutes)} min`, amount: Math.floor(minutes * R.perMinute) },
    { label: 'Abates', detail: `${run.kills}`, amount: Math.floor(run.kills / R.killsPerFicha) },
    { label: 'Guardiões de zona', detail: `${run.guardians}`, amount: run.guardians * R.perGuardian },
    { label: 'Necromantes', detail: `${run.bosses}`, amount: run.bosses * R.perBoss },
    { label: 'Missões da taverna', detail: `${run.missions}`, amount: run.missions * R.perMission },
    { label: 'Moedas restantes', detail: `${run.coins}`, amount: Math.floor(run.coins * R.coinShare) }
  ];
  const subtotal = fichas.reduce((sum, line) => sum + line.amount, 0);
  if (run.victory) fichas.push({ label: 'Vitória', detail: `+${R.victoryBonus * 100}%`, amount: Math.round(subtotal * R.victoryBonus) });
  const tier = difficultyTier(run.tier);
  const tierLine = (lines: PayoutLine[]): PayoutLine => ({
    label: `Dificuldade ${tier.name}`,
    detail: `+${Math.round((tier.reward - 1) * 100)}%`,
    amount: Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * (tier.reward - 1))
  });
  if (tier.reward > 1) fichas.push(tierLine(fichas));
  const X = XP_RATES;
  const xp: PayoutLine[] = [
    { label: 'Tempo sobrevivido', detail: `${Math.floor(run.elapsedMs / 1000)} s`, amount: Math.floor(run.elapsedMs / 1000) * X.perSecond },
    { label: 'Abates', detail: `${run.kills}`, amount: Math.floor(run.kills / X.killsPerXp) },
    { label: 'Guardiões de zona', detail: `${run.guardians}`, amount: run.guardians * X.perGuardian },
    { label: 'Necromantes', detail: `${run.bosses}`, amount: run.bosses * X.perBoss }
  ];
  if (run.victory) xp.push({ label: 'Vitória', detail: '', amount: X.victory });
  if (tier.reward > 1) xp.push(tierLine(xp));
  return {
    fichas: fichas.filter((line) => line.amount > 0),
    fichasTotal: fichas.reduce((sum, line) => sum + line.amount, 0),
    xp: xp.filter((line) => line.amount > 0),
    xpTotal: xp.reduce((sum, line) => sum + line.amount, 0)
  };
}

// ── Sergio's permanent upgrades ─────────────────────────────────────────────────────────────────────────────────

export type MetaUpgradeId = 'vitalidade' | 'forca' | 'agilidade' | 'ima' | 'bolsa' | 'escolha' | 'segundaChance';

export interface MetaUpgradeSpec {
  id: MetaUpgradeId;
  name: string;
  /** What one level gives. */
  perLevel: string;
  maxLevel: number;
  /** Level n costs n × this. */
  basePrice: number;
}

export const META_UPGRADES: MetaUpgradeSpec[] = [
  { id: 'vitalidade', name: 'Vitalidade', perLevel: '+10 de vida máxima', maxLevel: 5, basePrice: 100 },
  { id: 'forca', name: 'Força', perLevel: '+5% de dano', maxLevel: 5, basePrice: 120 },
  { id: 'agilidade', name: 'Agilidade', perLevel: '+4% de velocidade', maxLevel: 3, basePrice: 100 },
  { id: 'ima', name: 'Ímã', perLevel: '+10% de alcance de coleta', maxLevel: 3, basePrice: 80 },
  { id: 'bolsa', name: 'Bolsa inicial', perLevel: 'Começa com +50 moedas', maxLevel: 3, basePrice: 90 },
  { id: 'escolha', name: 'Escolha extra', perLevel: '+1 escolha de melhoria inicial', maxLevel: 1, basePrice: 1500 },
  { id: 'segundaChance', name: 'Segunda chance', perLevel: 'Renasce uma vez por partida com 50% de vida', maxLevel: 1, basePrice: 2000 }
];

/** What the bought levels add to a run. */
export interface MetaBonuses {
  maxHealth: number;
  /** Fractions added to the multipliers. */
  damage: number;
  speed: number;
  pickupRange: number;
  startingCoins: number;
  extraStartingPicks: number;
  revives: number;
}

export const NO_META_BONUSES: MetaBonuses = { maxHealth: 0, damage: 0, speed: 0, pickupRange: 0, startingCoins: 0, extraStartingPicks: 0, revives: 0 };

export function metaBonuses(save: SaveData): MetaBonuses {
  const level = (id: MetaUpgradeId) => save.upgrades[id] ?? 0;
  return {
    maxHealth: 10 * level('vitalidade'),
    damage: 0.05 * level('forca'),
    speed: 0.04 * level('agilidade'),
    pickupRange: 0.1 * level('ima'),
    startingCoins: 50 * level('bolsa'),
    extraStartingPicks: level('escolha'),
    revives: level('segundaChance')
  };
}

/** Price of the next level, or null when maxed. */
export function nextPrice(save: SaveData, id: MetaUpgradeId): number | null {
  const spec = META_UPGRADES.find((upgrade) => upgrade.id === id)!;
  const level = save.upgrades[id] ?? 0;
  return level >= spec.maxLevel ? null : spec.basePrice * (level + 1);
}

/** Buys the next level if affordable; returns the new save, or null. */
export function buyUpgrade(save: SaveData, id: MetaUpgradeId): SaveData | null {
  const price = nextPrice(save, id);
  if (price === null || save.fichas < price) return null;
  return { ...save, fichas: save.fichas - price, upgrades: { ...save.upgrades, [id]: (save.upgrades[id] ?? 0) + 1 } };
}

// ── Mastery ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Total XP needed for each level (index 0 = level 1). */
export const MASTERY_THRESHOLDS = [0, 500, 1200, 2100, 3200, 4500, 6000, 7700, 9600, 12000];
export const MAX_MASTERY = MASTERY_THRESHOLDS.length;

export type SkinId = 'base' | 'sombra' | 'gelo' | 'brasa' | 'ouro' | 'lenda';

export interface MasteryReward {
  level: number;
  kind: 'skin' | 'title' | 'frame';
  id: string;
  name: string;
  /** Announced but not in the game yet: shown as "em breve", never unlocked. */
  comingSoon?: boolean;
}

export const MASTERY_REWARDS: MasteryReward[] = [
  { level: 2, kind: 'skin', id: 'sombra', name: 'Paleta Sombra' },
  { level: 3, kind: 'title', id: 'iniciado', name: 'Iniciado' },
  { level: 4, kind: 'skin', id: 'gelo', name: 'Paleta Gelo' },
  { level: 5, kind: 'frame', id: 'bronze', name: 'Moldura de bronze' },
  { level: 6, kind: 'skin', id: 'brasa', name: 'Paleta Brasa' },
  { level: 7, kind: 'title', id: 'veterano', name: 'Veterano' },
  { level: 8, kind: 'skin', id: 'ouro', name: 'Paleta Ouro' },
  { level: 9, kind: 'frame', id: 'ouro', name: 'Moldura de ouro' },
  // The signature skin is a new model per hero; the models aren't in yet, so it's announced as coming soon.
  { level: 10, kind: 'skin', id: 'lenda', name: 'Skin exclusiva (em breve)', comingSoon: true },
  { level: 10, kind: 'title', id: 'lenda', name: 'Lenda' }
];

export function masteryLevel(xp: number): number {
  let level = 1;
  MASTERY_THRESHOLDS.forEach((threshold, index) => { if (xp >= threshold) level = index + 1; });
  return level;
}

/** Progress inside the current level, 0..1 (1 at max). */
export function masteryProgress(xp: number): number {
  const level = masteryLevel(xp);
  if (level >= MAX_MASTERY) return 1;
  const from = MASTERY_THRESHOLDS[level - 1];
  return (xp - from) / (MASTERY_THRESHOLDS[level] - from);
}

export function unlockedSkins(xp: number): SkinId[] {
  const level = masteryLevel(xp);
  return ['base', ...MASTERY_REWARDS.filter((reward) => reward.kind === 'skin' && !reward.comingSoon && reward.level <= level).map((reward) => reward.id as SkinId)];
}

/** The title shown under the hero's name (the highest one earned), if any. */
export function masteryTitle(xp: number): string | null {
  const level = masteryLevel(xp);
  const titles = MASTERY_REWARDS.filter((reward) => reward.kind === 'title' && reward.level <= level);
  return titles.length ? titles[titles.length - 1].name : null;
}

export function masteryFrame(xp: number): 'bronze' | 'ouro' | null {
  const level = masteryLevel(xp);
  return level >= 9 ? 'ouro' : level >= 5 ? 'bronze' : null;
}

// ── The regulars (and Sergio) as heroes ─────────────────────────────────────────────────────────────────────────

export const MISSIONS_PER_REGULAR = 3;

/** Each regular joins once all their missions are done (across runs) and a mastery level is reached with the hero
 *  closest to them. */
export const REGULAR_UNLOCKS: Record<QuestNpcId, { hero: CharacterId; level: number }> = {
  brom: { hero: 'barbarian', level: 5 },
  lyra: { hero: 'fabri', level: 5 },
  grimbo: { hero: 'reliquia', level: 5 },
  zora: { hero: 'mage', level: 5 }
};

/** Sergio joins with all four regulars and this many mastery levels summed over every hero. */
export const SERGIO_TOTAL_MASTERY = 30;

export function totalMastery(save: SaveData): number {
  return Object.values(save.mastery).reduce((sum, xp) => sum + masteryLevel(xp ?? 0), 0);
}

/** Heroes unlocked that the tavern hasn't announced yet (in roster order). */
export function heroesToWelcome(save: SaveData): HeroId[] {
  return rosterFor(save).filter((hero) => !save.welcomed.includes(hero));
}

/** Every hero the save has unlocked, in roster order. */
export function rosterFor(save: SaveData): HeroId[] {
  const roster: HeroId[] = [...STARTING_HEROES];
  (Object.keys(REGULAR_UNLOCKS) as QuestNpcId[]).forEach((npc) => {
    const rule = REGULAR_UNLOCKS[npc];
    if ((save.regularMissions[npc] ?? 0) >= MISSIONS_PER_REGULAR && masteryLevel(save.mastery[rule.hero] ?? 0) >= rule.level) roster.push(npc);
  });
  if ((Object.keys(REGULAR_UNLOCKS) as QuestNpcId[]).every((npc) => roster.includes(npc)) && totalMastery(save) >= SERGIO_TOTAL_MASTERY) roster.push('sergio');
  return roster;
}

/** One condition to unlock a hero, with how far the save is. */
export interface UnlockStep {
  label: string;
  current: number;
  needed: number;
}

/** What a hero still asks for (empty for the starting heroes): a regular's missions and a mastery level with the hero
 *  closest to them; Sergio, every regular and a mastery total. */
export function unlockSteps(save: SaveData, hero: HeroId): UnlockStep[] {
  if (hero in REGULAR_UNLOCKS) {
    const npc = hero as QuestNpcId;
    const rule = REGULAR_UNLOCKS[npc];
    return [
      { label: `Concluir as missões de ${CHARACTERS[npc].name} na taverna`, current: Math.min(MISSIONS_PER_REGULAR, save.regularMissions[npc] ?? 0), needed: MISSIONS_PER_REGULAR },
      { label: `Maestria nível ${rule.level} com ${CHARACTERS[rule.hero].name}`, current: Math.min(rule.level, masteryLevel(save.mastery[rule.hero] ?? 0)), needed: rule.level }
    ];
  }
  if (hero === 'sergio') {
    const roster = rosterFor(save);
    const regulars = Object.keys(REGULAR_UNLOCKS) as QuestNpcId[];
    return [
      { label: 'Liberar os quatro frequentadores da taverna', current: regulars.filter((npc) => roster.includes(npc)).length, needed: regulars.length },
      { label: `Somar ${SERGIO_TOTAL_MASTERY} níveis de maestria entre todos os heróis`, current: Math.min(SERGIO_TOTAL_MASTERY, totalMastery(save)), needed: SERGIO_TOTAL_MASTERY }
    ];
  }
  return [];
}

/** How far an area is: its regulars won over (each one only joins from that area's tavern). */
export function areaCompletion(save: SaveData, area: AreaConfig): { joined: number; total: number } {
  const roster = rosterFor(save);
  return { joined: area.regulars.filter((hero) => roster.includes(hero)).length, total: area.regulars.length };
}

// ── The save ────────────────────────────────────────────────────────────────────────────────────────────────────

export const SAVE_VERSION = 1;
const HISTORY_LENGTH = 10;

export interface RunRecord {
  heroId: HeroId;
  tier?: number;
  victory: boolean;
  elapsedMs: number;
  kills: number;
  cycle: number;
  fichas: number;
  endedAt: number;
}

export interface SaveData {
  version: number;
  fichas: number;
  /** Fichas earned over all time (the results screen's running total). */
  fichasEarned: number;
  upgrades: Partial<Record<MetaUpgradeId, number>>;
  /** Mastery XP per hero. */
  mastery: Partial<Record<HeroId, number>>;
  /** The skin chosen per hero. */
  skins: Partial<Record<HeroId, SkinId>>;
  /** Missions completed with each regular, over all runs (their next run starts at the next mission). */
  regularMissions: Partial<Record<QuestNpcId, number>>;
  records: {
    runs: number;
    wins: number;
    bestTimeMs: number;
    deepestCycle: number;
    kills: Record<string, number>;
    guardians: Record<string, number>;
  };
  history: RunRecord[];
  /** The highest difficulty tier open (a win on the top open tier opens the next). */
  tierUnlocked: number;
  /** Heroes seen as unlocked when the last run ended (to announce newcomers once). */
  announced: HeroId[];
  tutorialSeen: boolean;
  /** Sergio has explained zone guardians (the first time one rises). */
  guardianTipSeen: boolean;
  /** Sergio has explained the run's goal (at the start of the first run). */
  firstRunTipSeen: boolean;
  /** Heroes the tavern has announced as playable (the welcome on coming back after an unlock). */
  welcomed: HeroId[];
}

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    fichas: 0,
    fichasEarned: 0,
    upgrades: {},
    mastery: {},
    skins: {},
    regularMissions: {},
    records: { runs: 0, wins: 0, bestTimeMs: 0, deepestCycle: 0, kills: {}, guardians: {} },
    history: [],
    tierUnlocked: 1,
    announced: [...STARTING_HEROES],
    tutorialSeen: false,
    guardianTipSeen: false,
    firstRunTipSeen: false,
    welcomed: [...STARTING_HEROES]
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const numbersOnly = <K extends string>(value: unknown): Partial<Record<K, number>> => (
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) as Partial<Record<K, number>> : {}
);

/** Reads a save written by any version, keeping whatever is valid and defaulting the rest; garbage gives a fresh save. */
export function parseSave(text: string | null | undefined): SaveData {
  const fresh = emptySave();
  if (!text) return fresh;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fresh; }
  if (!isRecord(raw)) return fresh;
  const records = isRecord(raw.records) ? raw.records : {};
  const number = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback);
  return {
    version: SAVE_VERSION,
    fichas: Math.floor(number(raw.fichas)),
    fichasEarned: Math.floor(number(raw.fichasEarned)),
    upgrades: numbersOnly<MetaUpgradeId>(raw.upgrades),
    mastery: numbersOnly<HeroId>(raw.mastery),
    skins: isRecord(raw.skins) ? Object.fromEntries(Object.entries(raw.skins).filter(([, v]) => typeof v === 'string')) as Partial<Record<HeroId, SkinId>> : {},
    regularMissions: numbersOnly<QuestNpcId>(raw.regularMissions),
    records: {
      runs: number(records.runs),
      wins: number(records.wins),
      bestTimeMs: number(records.bestTimeMs),
      deepestCycle: number(records.deepestCycle),
      kills: numbersOnly<string>(records.kills) as Record<string, number>,
      guardians: numbersOnly<string>(records.guardians) as Record<string, number>
    },
    history: Array.isArray(raw.history) ? (raw.history.filter(isRecord) as unknown as RunRecord[]).slice(0, HISTORY_LENGTH) : [],
    tierUnlocked: Math.min(DIFFICULTY_TIERS.length, Math.max(1, Math.floor(number(raw.tierUnlocked, 1)))),
    announced: Array.isArray(raw.announced) ? raw.announced.filter((id): id is HeroId => typeof id === 'string') : [...STARTING_HEROES],
    tutorialSeen: raw.tutorialSeen === true,
    guardianTipSeen: raw.guardianTipSeen === true,
    firstRunTipSeen: raw.firstRunTipSeen === true,
    welcomed: Array.isArray(raw.welcomed) ? raw.welcomed.filter((id): id is HeroId => typeof id === 'string') : [...STARTING_HEROES]
  };
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

export interface RunOutcome {
  save: SaveData;
  payout: RunPayout;
  heroId: HeroId;
  xpBefore: number;
  xpAfter: number;
  /** Mastery rewards reached by this run. */
  rewards: MasteryReward[];
  /** Heroes who joined the roster with this run. */
  joined: HeroId[];
  /** The difficulty tier this win opened, if any. */
  newTier: DifficultyTier | null;
}

/** Banks a finished run: Fichas, mastery XP, mission progress with the regulars, records, history, unlocks. */
export function applyRun(save: SaveData, run: RunSummary): RunOutcome {
  const payout = runPayout(run);
  const xpBefore = save.mastery[run.heroId] ?? 0;
  const xpAfter = xpBefore + payout.xpTotal;
  const add = (into: Record<string, number>, from: Record<string, number>) => {
    const merged = { ...into };
    Object.entries(from).forEach(([key, value]) => { merged[key] = (merged[key] ?? 0) + value; });
    return merged;
  };
  const regularMissions = { ...save.regularMissions };
  (Object.entries(run.questTiers) as Array<[QuestNpcId, number]>).forEach(([npc, tier]) => {
    regularMissions[npc] = Math.min(MISSIONS_PER_REGULAR, Math.max(regularMissions[npc] ?? 0, tier));
  });
  const next: SaveData = {
    ...save,
    fichas: save.fichas + payout.fichasTotal,
    fichasEarned: save.fichasEarned + payout.fichasTotal,
    mastery: { ...save.mastery, [run.heroId]: xpAfter },
    regularMissions,
    records: {
      runs: save.records.runs + 1,
      wins: save.records.wins + (run.victory ? 1 : 0),
      bestTimeMs: Math.max(save.records.bestTimeMs, run.elapsedMs),
      deepestCycle: Math.max(save.records.deepestCycle, run.cycle),
      kills: add(save.records.kills, run.killsByVariant),
      guardians: add(save.records.guardians, run.guardiansByKind)
    },
    history: [{ heroId: run.heroId, tier: run.tier, victory: run.victory, elapsedMs: run.elapsedMs, kills: run.kills, cycle: run.cycle, fichas: payout.fichasTotal, endedAt: run.endedAt }, ...save.history].slice(0, HISTORY_LENGTH)
  };
  const levelBefore = masteryLevel(xpBefore);
  const levelAfter = masteryLevel(xpAfter);
  const rewards = MASTERY_REWARDS.filter((reward) => reward.level > levelBefore && reward.level <= levelAfter);
  const roster = rosterFor(next);
  const joined = roster.filter((hero) => !save.announced.includes(hero));
  next.announced = [...new Set([...save.announced, ...roster])];
  let newTier: DifficultyTier | null = null;
  if (run.victory && run.tier >= save.tierUnlocked && save.tierUnlocked < DIFFICULTY_TIERS.length) {
    next.tierUnlocked = save.tierUnlocked + 1;
    newTier = difficultyTier(next.tierUnlocked);
  }
  return { save: next, payout, heroId: run.heroId, xpBefore, xpAfter, rewards, joined, newTier };
}
