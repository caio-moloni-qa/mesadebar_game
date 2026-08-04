import { Player } from '../entities/Player';
import { WeaponConfig } from '../config/weapons';

export type UpgradeTier = 'common' | 'rare';

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  tier: UpgradeTier;
  apply: (player: Player) => void;
}

export class UpgradeSystem {
  private readonly upgrades: Upgrade[] = [
    { id: 'damage', name: 'Poder Arcano', description: '+25% de dano dos projéteis mágicos', tier: 'common', apply: (player) => { player.damageMultiplier += 0.25; } },
    { id: 'cooldown', name: 'Ritual Veloz', description: '+20% de velocidade de ataque', tier: 'common', apply: (player) => { player.attackSpeedMultiplier += 0.2; } },
    { id: 'speed', name: 'Passos Ligeiros', description: '+25 de velocidade de movimento', tier: 'common', apply: (player) => { player.movementSpeed += 25; } }
  ];

  private readonly meleeCommonUpgrades: Upgrade[] = [
    { id: 'sword-life-steal', name: 'Roubo de Vida', description: 'No primeiro nível, cura 0,5% do dano causado. Os próximos níveis somam 0,25%.', tier: 'common', apply: (player) => player.addLifeSteal() },
    { id: 'melee-range', name: 'Braços do Colosso', description: '+1,5px de alcance para ataques corpo a corpo', tier: 'common', apply: (player) => player.addMeleeRangeBonus(1.5) },
    { id: 'melee-extra-attack', name: 'Fúria Encadeada', description: '+10% de chance e +1 ataque extra possível', tier: 'common', apply: (player) => player.addMeleeExtraAttack() }
  ];

  private readonly meleeRareUpgrades: Upgrade[] = [
    { id: 'melee-whirlwind', name: 'Ataque Redemoinho', description: 'A cada 5s, ataca ao redor do herói nas 4 direções', tier: 'rare', apply: (player) => player.unlockWhirlwind() }
  ];

  private readonly projectileCommonUpgrades: Upgrade[] = [
    { id: 'projectile-extra-count', name: 'Benção Arcana', description: '+1 projétil por lançamento, em direções diferentes', tier: 'common', apply: (player) => player.addProjectileExtraCount() },
    { id: 'projectile-ricochet', name: 'Rebote Arcano', description: '+10% de chance e +1 ricochete possível', tier: 'common', apply: (player) => player.addProjectileRicochet() }
  ];

  choices(weapon: WeaponConfig, player?: Player): Upgrade[] {
    if (weapon.type === 'cone') return this.weightedChoices(this.availableMeleeUpgrades(player), 3);
    if (weapon.type === 'projectile' || weapon.type === 'boomerang') return this.weightedChoices(this.availableProjectileUpgrades(), 3);

    const available = [...this.upgrades];
    return available.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  private availableMeleeUpgrades(player?: Player): Upgrade[] {
    const rareUpgrades = player?.whirlwindUnlocked ? [] : this.meleeRareUpgrades;
    return [...this.meleeCommonUpgrades, ...rareUpgrades];
  }

  private availableProjectileUpgrades(): Upgrade[] {
    return [...this.upgrades, ...this.projectileCommonUpgrades];
  }

  private weightedChoices(available: Upgrade[], amount: number): Upgrade[] {
    const choices: Upgrade[] = [];
    const remaining = [...available];
    for (let index = 0; index < amount && remaining.length > 0; index += 1) {
      const preferredTier: UpgradeTier = Math.random() < 0.7 ? 'common' : 'rare';
      const tierPool = remaining.filter((upgrade) => upgrade.tier === preferredTier);
      const fallbackPool = remaining.filter((upgrade) => upgrade.tier !== preferredTier);
      const pool = tierPool.length > 0 ? tierPool : fallbackPool;
      const selected = pool[Math.floor(Math.random() * pool.length)];
      choices.push(selected);
      remaining.splice(remaining.indexOf(selected), 1);
    }
    return choices;
  }
}
