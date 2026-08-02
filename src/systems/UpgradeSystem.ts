import { Player } from '../entities/Player';
import { WeaponConfig } from '../config/weapons';

export interface Upgrade { id: string; name: string; description: string; apply: (player: Player) => void; }

export class UpgradeSystem {
  private readonly upgrades: Upgrade[] = [
    { id: 'damage', name: 'Poder Arcano', description: '+25% de dano dos projéteis mágicos', apply: (player) => { player.damageMultiplier += 0.25; } },
    { id: 'cooldown', name: 'Ritual Veloz', description: '+20% de velocidade de ataque', apply: (player) => { player.attackSpeedMultiplier += 0.2; } },
    { id: 'speed', name: 'Passos Ligeiros', description: '+25 de velocidade de movimento', apply: (player) => { player.movementSpeed += 25; } }
  ];

  private readonly boomerangUpgrade: Upgrade = { id: 'boomerang-count', name: 'Bumerangue Extra', description: '+1 bumerangue por lançamento, em direções diferentes', apply: () => undefined };
  private readonly swordLifeStealUpgrade: Upgrade = { id: 'sword-life-steal', name: 'Roubo de Vida', description: 'No primeiro nível, cura 0,5% do dano causado. Os próximos níveis somam 0,25%.', apply: (player) => player.addLifeSteal() };

  choices(weaponId: WeaponConfig['id']): Upgrade[] {
    const available = [...this.upgrades];
    if (weaponId === 'boomerang') available.push(this.boomerangUpgrade);
    if (weaponId === 'sword') available.push(this.swordLifeStealUpgrade);
    return available.sort(() => Math.random() - 0.5).slice(0, 3);
  }
}
