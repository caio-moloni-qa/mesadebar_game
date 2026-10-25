import * as THREE from 'three';

const COLOR = 0xffd34d;
/** Envelope over the pulse clip (0.55 s): up while the hand reaches the relic, held while it grips, then out. */
const RISE = 0.1;
const HOLD_UNTIL = 0.36;
const DURATION = 0.55;
const LIGHT_PEAK = 1.2;
const HALO_SIZE = 0.5;

let haloTexture: THREE.CanvasTexture | null = null;

function radialHalo(): THREE.CanvasTexture {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 245, 190, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 211, 77, 0.75)');
  gradient.addColorStop(1, 'rgba(255, 180, 40, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

/** The Relíquia Divina's tick: the hand gripping the relic glows yellow — an additive halo around it plus a small
 *  warm light that lights the hand and chest. Lives outside the hero's own render pass (Game3D adds `root` to the
 *  scene), so the halo spreads around the hand at world resolution. The light always exists (intensity 0 when off)
 *  so toggling it never changes the scene's light count and recompiles shaders. */
export class RelicGlow {
  readonly root = new THREE.Group();
  private readonly halo: THREE.Sprite;
  private readonly light = new THREE.PointLight(COLOR, 0, 0.7, 2);
  private hand: THREE.Object3D | null = null;
  private age = DURATION;

  constructor() {
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: COLOR, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.halo.scale.setScalar(HALO_SIZE);
    this.halo.visible = false;
    this.root.add(this.halo, this.light);
  }

  flash(hand: THREE.Object3D): void {
    // The halo texture is a canvas, made on first use (keeps the hero buildable without a DOM, e.g. in tests).
    const material = this.halo.material as THREE.SpriteMaterial;
    if (!material.map) {
      material.map = radialHalo();
      material.needsUpdate = true;
    }
    this.hand = hand;
    this.age = 0;
  }

  update(deltaSeconds: number): void {
    this.age = Math.min(DURATION, this.age + deltaSeconds);
    const strength = this.age < RISE ? this.age / RISE : this.age < HOLD_UNTIL ? 1 : 1 - (this.age - HOLD_UNTIL) / (DURATION - HOLD_UNTIL);
    const on = this.hand !== null && strength > 0.001;
    this.halo.visible = on;
    this.light.intensity = on ? LIGHT_PEAK * strength : 0;
    if (!on) return;
    this.hand!.getWorldPosition(this.root.position);
    (this.halo.material as THREE.SpriteMaterial).opacity = strength;
    this.halo.scale.setScalar(HALO_SIZE * (0.8 + 0.2 * strength));
  }

  dispose(): void {
    this.root.removeFromParent();
    (this.halo.material as THREE.SpriteMaterial).dispose();
  }
}
