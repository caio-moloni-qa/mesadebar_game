import { Player } from '../entities/Player';

export interface Upgrade { id: string; name: string; description: string; apply: (player: Player) => void; }

export class UpgradeSystem {
  private readonly upgrades: Upgrade[] = [
    { id: 'damage', name: 'Poder Arcano', description: '+25% de dano dos projéteis mágicos', apply: (player) => { player.damageMultiplier += 0.25; } },
    { id: 'cooldown', name: 'Ritual Veloz', description: '+20% de velocidade de ataque', apply: (player) => { player.attackSpeedMultiplier += 0.2; } },
    { id: 'speed', name: 'Passos Ligeiros', description: '+25 de velocidade de movimento', apply: (player) => { player.movementSpeed += 25; } }
  ];

  choices(): Upgrade[] { return [...this.upgrades].sort(() => Math.random() - 0.5).slice(0, 3); }
}
