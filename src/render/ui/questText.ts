import { QuestGoal, QuestReward, QuestState, QuestSystem, goalAmount } from '../../core/systems/QuestSystem';

/** "Recupere 3 barris", "Derrote 100 inimigos", ... */
export function goalText(goal: QuestGoal): string {
  switch (goal.type) {
    case 'barrels': return `Recupere ${goal.count} barris espalhados pela arena`;
    case 'kills': return `Derrote ${goal.count} inimigos`;
    case 'untouched': return `Fique ${goal.ms / 1000}s sem levar dano na arena`;
    case 'guardians': return goal.count === 1 ? 'Derrote um guardião de zona' : `Derrote ${goal.count} guardiões de zona`;
  }
}

export function rewardText(reward: QuestReward): string {
  switch (reward.type) {
    case 'currency': return `${reward.amount} moedas`;
    case 'max-health': return `+${reward.amount} de vida máxima`;
    case 'damage': return `+${reward.percent}% de dano`;
    case 'upgrades': return reward.count === 1 ? '1 melhoria aleatória' : `${reward.count} melhorias aleatórias`;
  }
}

/** "2/3", "12/30s". */
export function progressText(quests: QuestSystem, quest: QuestState): string {
  const { goal } = quests.spec(quest);
  const total = goalAmount(goal);
  return goal.type === 'untouched' ? `${Math.floor(quest.progress / 1000)}/${total / 1000}s` : `${quest.progress}/${total}`;
}
