import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FIREFLY_COUNT = 70;
const FIREFLY_RANGE = 18;
const EMBERS_PER_BRAZIER = 10;
/** Point light per brazier. Physically based units (threejs-lighting): candela with inverse-square decay, so a
 *  small fire needs an intensity in the tens and a finite `distance` to keep it local and cheap. */
const FIRE_LIGHT = { color: 0xff8a3a, intensity: 26, distance: 9, decay: 2 };

interface Ember { brazier: number; age: number; life: number; x: number; z: number; }

/** Things that move on their own in the arena: brazier flames (flickering mesh + warm point light + rising embers)
 *  and fireflies drifting around wherever the camera is looking. All pixel-sized unlit cubes, so the pixel pipeline
 *  turns them into single glowing dots. Advanced with the environment clock, so they freeze with pause. */
export class Ambient {
  readonly root = new THREE.Group();
  /** Transparent / glowing bits the pipeline should skip in its normal pass. */
  readonly glows: THREE.Object3D[] = [];
  private readonly flames: THREE.InstancedMesh;
  private readonly lights: THREE.PointLight[] = [];
  private readonly embers: THREE.InstancedMesh;
  private readonly emberState: Ember[] = [];
  private readonly fireflies: THREE.InstancedMesh;
  private readonly fireflyState: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly focus = new THREE.Vector3();

  constructor(private readonly braziers: THREE.Vector3[], private readonly rng: () => number) {
    // Flame: two stacked tapered cones, inner bright, outer orange.
    const outerFlame = new THREE.ConeGeometry(0.3, 0.75, 5).translate(0, 0.37, 0).toNonIndexed();
    const outerCount = outerFlame.attributes.position.count;
    const flameGeometry = mergeGeometries([outerFlame, new THREE.ConeGeometry(0.16, 0.5, 5).translate(0, 0.3, 0.02).toNonIndexed()])!;
    const flameColors = new Float32Array(flameGeometry.attributes.position.count * 3);
    const outer = new THREE.Color(0xff7a24);
    const inner = new THREE.Color(0xffe27a);
    for (let vertex = 0; vertex < flameGeometry.attributes.position.count; vertex += 1) {
      (vertex < outerCount ? outer : inner).toArray(flameColors, vertex * 3);
    }
    flameGeometry.setAttribute('color', new THREE.BufferAttribute(flameColors, 3));
    this.flames = new THREE.InstancedMesh(flameGeometry, new THREE.MeshBasicMaterial({ vertexColors: true }), Math.max(1, braziers.length));
    this.flames.frustumCulled = false;
    braziers.forEach((position) => {
      const light = new THREE.PointLight(FIRE_LIGHT.color, FIRE_LIGHT.intensity, FIRE_LIGHT.distance, FIRE_LIGHT.decay);
      light.position.set(position.x, position.y + 0.9, position.z);
      this.lights.push(light);
      this.root.add(light);
    });

    const cube = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.embers = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: 0xffb04a }), Math.max(1, braziers.length * EMBERS_PER_BRAZIER));
    this.embers.frustumCulled = false;
    braziers.forEach((_position, brazier) => {
      for (let index = 0; index < EMBERS_PER_BRAZIER; index += 1) this.emberState.push(this.newEmber(brazier, rng() * 1.6));
    });

    this.fireflies = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: 0xe8ff9a }), FIREFLY_COUNT);
    this.fireflies.frustumCulled = false;
    for (let index = 0; index < FIREFLY_COUNT; index += 1) {
      this.fireflyState.push({ x: (rng() - 0.5) * 2 * FIREFLY_RANGE, y: 0.4 + rng() * 2, z: (rng() - 0.5) * 2 * FIREFLY_RANGE, phase: rng() * 10, speed: 0.4 + rng() * 0.6 });
    }

    this.root.add(this.flames, this.embers, this.fireflies);
    this.glows.push(this.flames, this.embers, this.fireflies);
  }

  update(time: number, deltaSeconds: number, focus: THREE.Vector3): void {
    this.focus.copy(focus);
    this.braziers.forEach((position, index) => {
      // Flicker: two incommensurate sines + a little per-brazier offset.
      const flicker = 0.85 + Math.sin(time * 11 + index * 3.1) * 0.08 + Math.sin(time * 23.7 + index) * 0.07;
      this.lights[index].intensity = FIRE_LIGHT.intensity * flicker;
      this.matrix.makeScale(0.9 + flicker * 0.2, 0.75 + flicker * 0.5, 0.9 + flicker * 0.2).setPosition(position.x, position.y + 1.1, position.z);
      this.flames.setMatrixAt(index, this.matrix);
    });
    this.flames.instanceMatrix.needsUpdate = true;

    this.emberState.forEach((ember, index) => {
      ember.age += deltaSeconds;
      if (ember.age >= ember.life) Object.assign(ember, this.newEmber(ember.brazier, 0));
      const origin = this.braziers[ember.brazier];
      const t = ember.age / ember.life;
      const size = 1 - t;
      this.matrix.makeScale(size, size, size).setPosition(origin.x + ember.x + Math.sin(time * 3 + index) * 0.15 * t, origin.y + 1.3 + t * 2.4, origin.z + ember.z);
      this.embers.setMatrixAt(index, this.matrix);
    });
    this.embers.instanceMatrix.needsUpdate = true;

    // Fireflies live in a box that follows the camera focus (wrapping around), so there are always some on screen.
    this.fireflyState.forEach((fly, index) => {
      fly.phase += deltaSeconds * fly.speed;
      const x = wrap(fly.x + Math.sin(fly.phase * 0.7) * 1.5 - this.focus.x, FIREFLY_RANGE) + this.focus.x;
      const z = wrap(fly.z + Math.cos(fly.phase * 0.5) * 1.5 - this.focus.z, FIREFLY_RANGE) + this.focus.z;
      const blink = Math.max(0, Math.sin(fly.phase * 3 + index));
      const size = 0.4 + blink * 0.8;
      this.matrix.makeScale(size, size, size).setPosition(x, fly.y + Math.sin(fly.phase * 1.3) * 0.3, z);
      this.fireflies.setMatrixAt(index, this.matrix);
    });
    this.fireflies.instanceMatrix.needsUpdate = true;
  }

  private newEmber(brazier: number, age: number): Ember {
    return { brazier, age, life: 0.9 + this.rng() * 0.9, x: (this.rng() - 0.5) * 0.4, z: (this.rng() - 0.5) * 0.4 };
  }
}

/** Wraps an offset into [-range, range). */
function wrap(value: number, range: number): number {
  const span = range * 2;
  return ((((value + range) % span) + span) % span) - range;
}
