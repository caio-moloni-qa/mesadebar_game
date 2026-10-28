import type { EnemyState, PlayerState } from '../session/entities';

export type SnowAttackKind = 'eruption' | 'breath' | 'constrict' | 'shard' | 'bellWave' | 'bell' | 'resonance' | 'snowball' | 'leap' | 'avalanche' | 'roar' | 'iceTrail' | 'lance';
export interface SnowHazard {
  owner: EnemyState;
  kind: SnowAttackKind;
  x: number; y: number;
  radius: number;
  angle: number;
  length: number;
  elapsed: number;
  warning: number;
  lifetime: number;
  damage: number;
  speed: number;
  hitAt: number;
}
export interface SnowAttackHost {
  readonly player: PlayerState;
  hurtPlayer(damage: number): void;
  slowPlayer(percent: number, ms: number): void;
  pushPlayer(x: number, y: number): void;
  frostPlayer?(stacks: number): void;
}

/** Shared deterministic hazards: warning first, then visible collision. No browser timers. */
export class SnowfieldAttacks {
  readonly hazards: SnowHazard[] = [];
  constructor(private readonly host: SnowAttackHost) {}

  add(owner: EnemyState, kind: SnowAttackKind, x: number, y: number, radius: number, damage: number, warning = 1000, lifetime = 450, angle = 0, length = 0, speed = 0): SnowHazard {
    const hazard = { owner, kind, x, y, radius, damage, warning, lifetime, angle, length, speed, elapsed: 0, hitAt: -Infinity };
    if (this.hazards.length < 80) this.hazards.push(hazard);
    return hazard;
  }

  clear(owner?: EnemyState): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) if (!owner || this.hazards[i].owner === owner) this.hazards.splice(i, 1);
  }

  update(delta: number): void {
    const { player } = this.host;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      const wasActive = Math.max(0, h.elapsed - h.warning);
      h.elapsed += delta;
      if (!h.owner.alive || h.elapsed >= h.warning + h.lifetime) { this.hazards.splice(i, 1); continue; }
      if (h.elapsed < h.warning) continue;
      const active = h.elapsed - h.warning;
      const dt = (active - wasActive) / 1000;
      h.x += Math.cos(h.angle) * h.speed * dt;
      h.y += Math.sin(h.angle) * h.speed * dt;
      if (h.kind === 'snowball') h.radius = Math.min(90, h.radius + dt * 30);
      const dx = player.x - h.x, dy = player.y - h.y;
      const distance = Math.hypot(dx, dy);
      const progress = active / h.lifetime;
      let hit = distance <= h.radius + player.radius;
      if (h.kind === 'bellWave') hit = Math.abs(distance - h.radius * progress) <= 16 + player.radius;
      if (h.kind === 'constrict') {
        const gap = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - h.angle), Math.cos(Math.atan2(dy, dx) - h.angle))) < 0.5;
        hit = !gap && Math.abs(distance - h.radius * (1 - progress * 0.8)) <= 20 + player.radius;
      }
      if (h.kind === 'breath' || h.kind === 'resonance') {
        const along = Math.max(0, Math.min(h.length, dx * Math.cos(h.angle) + dy * Math.sin(h.angle)));
        hit = Math.hypot(dx - Math.cos(h.angle) * along, dy - Math.sin(h.angle) * along) <= h.radius + player.radius;
      }
      // Dropped bells and water holes remain solid until they melt; damage only on landing.
      if ((h.kind === 'bell' || h.kind === 'eruption') && active > 350) {
        if (hit && distance > 0) this.host.pushPlayer(dx / distance * (h.radius + player.radius - distance), dy / distance * (h.radius + player.radius - distance));
        continue;
      }
      if (!hit || h.elapsed - h.hitAt < 650) continue;
      h.hitAt = h.elapsed;
      if (h.damage > 0) {
        this.host.hurtPlayer(h.damage);
        this.host.frostPlayer?.(h.kind === 'breath' ? 2 : 1);
      }
      this.host.slowPlayer(h.kind === 'bellWave' ? 0.9 : 0.3, h.kind === 'bellWave' ? 800 : 1600);
      if ((h.kind === 'roar' || h.kind === 'leap') && distance > 0) this.host.pushPlayer(dx / distance * 130, dy / distance * 130);
    }
  }
}
