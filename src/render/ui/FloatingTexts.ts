import * as THREE from 'three';

export interface FloatingTextStyle {
  color: string;
  /** CSS px at a 720 px tall viewport; scaled with the viewport like the rest of the HUD. */
  size?: number;
  /** How far it rises (CSS px at 720 px tall) and how long it lives — Phaser's combat text: 34 px over 520 ms. */
  rise?: number;
  durationMs?: number;
  delayMs?: number;
}

interface Entry {
  element: HTMLSpanElement;
  world: THREE.Vector3;
  bornAt: number;
  rise: number;
  durationMs: number;
  active: boolean;
}

/** Projects a world point to CSS pixels from the container's top-left; false when off screen (unless
 *  `allowOffscreen`, which always writes the position — for edge arrows). */
export type Projector = (world: THREE.Vector3, out: { x: number; y: number }, allowOffscreen?: boolean) => boolean;

/** Floating combat text (damage numbers, CRIT!, CURA -N, LENTO +%, ...) as DOM spans over the canvas: crisp at native
 *  resolution, outside the pixelated pass (plan §4.3). A fixed pool — under a big horde the oldest text is recycled
 *  instead of piling up hundreds of nodes. Positions are re-projected every frame so text sticks to the world. */
export class FloatingTexts {
  private readonly root: HTMLDivElement;
  private readonly entries: Entry[] = [];
  private next = 0;
  private readonly screen = { x: 0, y: 0 };

  constructor(container: HTMLElement, capacity = 64) {
    this.root = document.createElement('div');
    this.root.className = 'floating-texts';
    container.appendChild(this.root);
    for (let index = 0; index < capacity; index += 1) {
      const element = document.createElement('span');
      element.hidden = true;
      this.root.appendChild(element);
      this.entries.push({ element, world: new THREE.Vector3(), bornAt: 0, rise: 0, durationMs: 0, active: false });
    }
  }

  spawn(world: THREE.Vector3, text: string, style: FloatingTextStyle, nowMs: number): void {
    const entry = this.entries[this.next];
    this.next = (this.next + 1) % this.entries.length;
    entry.world.copy(world);
    entry.bornAt = nowMs + (style.delayMs ?? 0);
    entry.rise = style.rise ?? 34;
    entry.durationMs = style.durationMs ?? 520;
    entry.active = true;
    entry.element.textContent = text;
    entry.element.style.color = style.color;
    entry.element.style.fontSize = `calc(${style.size ?? 22} * var(--ui-unit))`;
    entry.element.hidden = true;
  }

  update(nowMs: number, project: Projector): void {
    for (const entry of this.entries) {
      if (!entry.active) continue;
      const age = nowMs - entry.bornAt;
      if (age < 0) continue;
      if (age >= entry.durationMs) {
        entry.active = false;
        entry.element.hidden = true;
        continue;
      }
      if (!project(entry.world, this.screen)) {
        entry.element.hidden = true;
        continue;
      }
      // Quad.Out on both the rise and the fade, like the Phaser tween.
      const t = age / entry.durationMs;
      const eased = 1 - (1 - t) * (1 - t);
      entry.element.hidden = false;
      entry.element.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -50%) translateY(calc(${-entry.rise * eased} * var(--ui-unit)))`;
      entry.element.style.opacity = String(1 - eased);
    }
  }

  clear(): void {
    this.entries.forEach((entry) => { entry.active = false; entry.element.hidden = true; });
  }

  get activeCount(): number {
    return this.entries.filter((entry) => entry.active).length;
  }
}
