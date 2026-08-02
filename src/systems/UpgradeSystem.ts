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

  choices(weaponId: WeaponConfig['id']): Upgrade[] {
    const common = [...this.upgrades].sort(() => Math.random() - 0.5);
    return weaponId === 'boomerang' ? [this.boomerangUpgrade, ...common.slice(0, 2)] : common.slice(0, 3);
  }
}
