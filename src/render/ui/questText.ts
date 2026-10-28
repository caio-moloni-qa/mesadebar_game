import { QuestGoal, QuestReward, QuestState, QuestSystem, goalAmount, isTimedGoal } from '../../core/systems/QuestSystem';

/** "Recupere 3 barris", "Derrote 100 inimigos", ... */
export function goalText(goal: QuestGoal): string {
  switch (goal.type) {
    case 'barrels': return `Recupere ${goal.count} barris espalhados pela arena`;
    case 'kills': return `Derrote ${goal.count} inimigos`;
    case 'untouched': return `Fique ${goal.ms / 1000}s sem levar dano na arena`;
    case 'guardians': return goal.count === 1 ? 'Derrote um guardião de zona' : `Derrote ${goal.count} guardiões de zona`;
    case 'fragments': return `Recupere ${goal.count} fragmentos de memória${goal.storm ? ' durante a nevasca' : ''}${goal.unfrozen ? ' sem congelar' : ''}`;
    case 'tame': return goal.count === 1 ? 'Dome um bicho calmo (fique perto dele)' : `Dome ${goal.count} bichos${goal.distinct ? ' diferentes' : ''} (fique perto deles)`;
    case 'packs': return goal.count === 1 ? 'Derrube uma matilha de lobos inteira' : `Derrube ${goal.count} matilhas de lobos inteiras`;
    case 'ice-blocks': return `Quebre ${goal.count} blocos de gelo`;
    case 'cold-endurance': return `Aguente ${goal.ms / 1000}s de nevasca longe das tochas`;
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
  return isTimedGoal(goal) ? `${Math.floor(quest.progress / 1000)}/${total / 1000}s` : `${quest.progress}/${total}`;
}
