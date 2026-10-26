/** Phaser layout (1280×720 units): base centred 120 in from the bottom-left corner, knob travel 70, 12 dead zone. */
const TRAVEL = 70;
const DEAD_ZONE = 12;

/** Same condition the Phaser build uses to show its joystick: a compact or coarse-pointer touch screen. */
export function isTouchDevice(): boolean {
  const compactScreen = window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(max-height: 900px) and (pointer: coarse)').matches;
  return compactScreen && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
}

/** On-screen movement stick (Phaser: GameScene.createMobileControls) with pointer events, so it tracks one finger
 *  while others tap cards or buttons. `direction` is screen-relative: x right, y up, length ≤ 1. */
export class Joystick {
  readonly direction = { x: 0, y: 0 };
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;

  constructor(container: HTMLElement, private readonly canStart: () => boolean) {
    this.root = document.createElement('div');
    this.root.className = 'joystick';
    this.root.innerHTML = '<div class="joystick-base"><div class="joystick-knob"></div></div><span>MOVER</span>';
    this.knob = this.root.querySelector('.joystick-knob')!;
    container.appendChild(this.root);
    const zone = this.root.querySelector<HTMLDivElement>('.joystick-base')!;
    zone.addEventListener('pointerdown', (event) => {
      if (this.pointerId !== null || !this.canStart()) return;
      this.pointerId = event.pointerId;
      try { zone.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
      this.track(event, zone);
    });
    zone.addEventListener('pointermove', (event) => { if (event.pointerId === this.pointerId) this.track(event, zone); });
    const release = (event: PointerEvent) => { if (event.pointerId === this.pointerId) this.release(); };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.release();
  }

  release(): void {
    this.pointerId = null;
    this.direction.x = 0;
    this.direction.y = 0;
    this.knob.style.transform = '';
  }

  private track(event: PointerEvent, zone: HTMLElement): void {
    const rect = zone.getBoundingClientRect();
    // Base is drawn 176 units wide; convert the pointer offset into those units so travel matches Phaser at any size.
    const unit = rect.width / 176;
    let dx = (event.clientX - (rect.left + rect.width / 2)) / unit;
    let dy = (event.clientY - (rect.top + rect.height / 2)) / unit;
    const distance = Math.hypot(dx, dy);
    if (distance > TRAVEL) { dx *= TRAVEL / distance; dy *= TRAVEL / distance; }
    this.knob.style.transform = `translate(${dx * unit}px, ${dy * unit}px)`;
    const dead = distance < DEAD_ZONE;
    this.direction.x = dead ? 0 : dx / TRAVEL;
    this.direction.y = dead ? 0 : -dy / TRAVEL;
  }
}
