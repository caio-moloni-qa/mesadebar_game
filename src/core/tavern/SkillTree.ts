import { SKILL_PROGRESSION, SKILL_TREES, SkillNode, SkillTreeSpec } from '../../config/tavernSkills';
import { SaveData, TavernRegularSave } from '../progress/Progress';

// The rules of the regulars' skill trees (Taverna em Turnos, phase 2); the content lives in config/tavernSkills.ts.
// Every function is pure: it takes a regular's saved state and returns a new one (or null when the move isn't allowed).

export type NodeStatus = 'learned' | 'available' | 'locked';

/** A regular nobody has duelled yet: level 1, one point to spend. */
export function freshRegular(): TavernRegularSave {
  return { xp: 0, level: 1, learned: [] };
}

export function treeFor(regular: string): SkillTreeSpec | undefined {
  return SKILL_TREES[regular];
}

export function findNode(tree: SkillTreeSpec, nodeId: string): { node: SkillNode; branch: number; tier: number } | undefined {
  for (let branch = 0; branch < tree.branches.length; branch += 1) {
    const tier = tree.branches[branch].nodes.findIndex((node) => node.id === nodeId);
    if (tier >= 0) return { node: tree.branches[branch].nodes[tier], branch, tier };
  }
  return undefined;
}

/** The level a total of XP reaches (capped at the table's end). */
export function levelForXp(xp: number): number {
  const { levelXp } = SKILL_PROGRESSION;
  let level = 1;
  while (level + 1 < levelXp.length && xp >= levelXp[level + 1]) level += 1;
  return level;
}

/** XP still missing for the next level, and that level's span (for the XP bar); null at the cap. */
export function nextLevelProgress(state: TavernRegularSave): { into: number; span: number } | null {
  const { levelXp } = SKILL_PROGRESSION;
  if (state.level + 1 >= levelXp.length) return null;
  const from = levelXp[state.level];
  return { into: Math.max(0, state.xp - from), span: levelXp[state.level + 1] - from };
}

/** One point per level. */
export function pointsLeft(state: TavernRegularSave): number {
  return Math.max(0, state.level - state.learned.length);
}

/** Learned; available (the previous node of its branch is learned and a point is left); or locked. */
export function nodeStatus(tree: SkillTreeSpec, state: TavernRegularSave, nodeId: string): NodeStatus {
  if (state.learned.includes(nodeId)) return 'learned';
  const found = findNode(tree, nodeId);
  if (!found || pointsLeft(state) <= 0) return 'locked';
  const previous = found.tier > 0 ? tree.branches[found.branch].nodes[found.tier - 1].id : null;
  return previous === null || state.learned.includes(previous) ? 'available' : 'locked';
}

/** Spends a point on a node. The first finisher learned is equipped on its own. */
export function learn(tree: SkillTreeSpec, state: TavernRegularSave, nodeId: string): TavernRegularSave | null {
  if (nodeStatus(tree, state, nodeId) !== 'available') return null;
  const { node } = findNode(tree, nodeId)!;
  const next: TavernRegularSave = { ...state, learned: [...state.learned, nodeId] };
  if (node.kind === 'finisher' && !state.finisher) next.finisher = nodeId;
  return next;
}

/** Only one finisher can be equipped at a time: equipping one unequips the other. */
export function equipFinisher(tree: SkillTreeSpec, state: TavernRegularSave, nodeId: string): TavernRegularSave | null {
  const found = findNode(tree, nodeId);
  if (!found || found.node.kind !== 'finisher' || !state.learned.includes(nodeId)) return null;
  return { ...state, finisher: nodeId };
}

/** XP gained (a duel, a Night, a run mission): levels follow the XP. */
export function grantXp(state: TavernRegularSave, amount: number): { state: TavernRegularSave; levelsGained: number } {
  const xp = state.xp + Math.max(0, Math.floor(amount));
  const level = Math.max(state.level, levelForXp(xp));
  return { state: { ...state, xp, level }, levelsGained: level - state.level };
}

/** What a regular learns from a duel with the player: more for a win, a little per perfect parry. */
export function duelXp(won: boolean, parries: number): number {
  const P = SKILL_PROGRESSION;
  return (won ? P.duelWinXp : P.duelLossXp) + parries * P.xpPerParry;
}

/** The nodes in play in a fight: the learned passives and actives, plus only the equipped finisher. */
export function activeKit(tree: SkillTreeSpec, state: TavernRegularSave): SkillNode[] {
  return tree.branches.flatMap((branch) => branch.nodes).filter((node) =>
    state.learned.includes(node.id) && (node.kind !== 'finisher' || node.id === state.finisher));
}

/** A regular's state in the save (fresh if they've never duelled). */
export function regularState(save: SaveData, regular: string): TavernRegularSave {
  return save.tavern.regulars[regular as keyof SaveData['tavern']['regulars']] ?? freshRegular();
}

/** Writes a regular's state back into the save. */
export function withRegular(save: SaveData, regular: string, state: TavernRegularSave): SaveData {
  return { ...save, tavern: { ...save.tavern, regulars: { ...save.tavern.regulars, [regular]: state } } };
}

/** Resetting a tree refunds every point (XP and level stay) and costs Fichas; null if they can't pay. */
export function resetTree(save: SaveData, regular: string): SaveData | null {
  const cost = SKILL_PROGRESSION.resetFichas;
  const state = regularState(save, regular);
  if (state.learned.length === 0 || save.fichas < cost) return null;
  return { ...withRegular(save, regular, { xp: state.xp, level: state.level, learned: [] }), fichas: save.fichas - cost };
}
