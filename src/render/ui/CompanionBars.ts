import * as THREE from 'three';
import { GameSession } from '../../core/session/GameSession';
import { simToWorld } from '../space';
import { ALLY_SKELETON_SIZE, COMPANION_SIZE } from '../views/ZoneActorViews';
import { Projector } from './FloatingTexts';

const MAX_BARS = 16;

/** Health bars over the companions (always, while they stand) and over the Coveiro's skeletons (once hurt): small DOM
 *  bars projected above their heads, crisp outside the pixelated pass like the floating texts. */
export class CompanionBars {
  private readonly root: HTMLDivElement;
  private readonly bars: Array<{ element: HTMLDivElement; fill: HTMLDivElement; width: string }> = [];
  private readonly world = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'companion-bars';
    container.appendChild(this.root);
    for (let index = 0; index < MAX_BARS; index += 1) {
      const element = document.createElement('div');
      element.className = 'companion-bar';
      element.hidden = true;
      const fill = document.createElement('div');
      element.appendChild(fill);
      this.root.appendChild(element);
      this.bars.push({ element, fill, width: '' });
    }
  }

  update(session: GameSession, project: Projector): void {
    const { companions, skeletons } = session.companions;
    // Heads: a display size of 62 units is ~2 m; the fairy hovers at shoulder height.
    const targets = session.merchant.inside ? [] : [
      ...companions.filter((companion) => companion.downUntil === 0).map((companion) => ({
        body: companion, ally: false, height: companion.kind === 'waterFairy' ? 2.1 : (COMPANION_SIZE[companion.kind] / 62) * 2 + 0.25
      })),
      ...skeletons.filter((skeleton) => skeleton.health < skeleton.maxHealth).map((skeleton) => ({ body: skeleton, ally: true, height: (ALLY_SKELETON_SIZE / 62) * 2 + 0.2 }))
    ];
    this.bars.forEach((bar, index) => {
      const target = targets[index];
      const shown = !!target && project(simToWorld(target.body.x, target.body.y, target.height, this.world), this.screen);
      if (bar.element.hidden === shown) bar.element.hidden = !shown;
      if (!shown || !target) return;
      bar.element.classList.toggle('ally', target.ally);
      const width = `${Math.max(0, Math.min(1, target.body.health / target.body.maxHealth)) * 100}%`;
      if (bar.width !== width) {
        bar.width = width;
        bar.fill.style.width = width;
      }
      bar.element.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -100%)`;
    });
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
