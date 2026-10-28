import * as THREE from 'three';

const MOTE_COUNT = 60;
const EMBER_COUNT = 14;
/** Snow blown in through the igloo's door gap. */
const DRAFT_COUNT = 40;

interface Mote { x: number; y: number; z: number; phase: number; speed: number; }
interface Particle { age: number; life: number; x: number; z: number; }

/** Where the room's ambience happens, in the room group's local meters. */
export interface RoomAmbienceSpots {
  /** Half the room's side. */
  half: number;
  /** Floor point in front of the fire (the tavern hearth or the igloo brazier). */
  fire: THREE.Vector3;
  /** Floor point at the middle of the door gap (exit portal). */
  door: THREE.Vector3;
}

/** The tavern and igloo's moving air: dust (tavern) or a few drifting flakes (igloo) hanging in the room, embers
 *  rising off the fire and, in the igloo, snow blowing in through the door. All pixel-sized unlit cubes like the
 *  arena's Ambient, so the pixel pipeline turns them into single dots. The igloo also gets a cold blue fill light. */
export class RoomAmbience {
  readonly root = new THREE.Group();
  private readonly motes: THREE.InstancedMesh;
  private readonly moteState: Mote[] = [];
  private readonly embers: THREE.InstancedMesh;
  private readonly emberState: Particle[] = [];
  private readonly draft: THREE.InstancedMesh | null;
  private readonly draftState: Particle[] = [];
  private readonly matrix = new THREE.Matrix4();
  private time = 0;

  constructor(private readonly spots: RoomAmbienceSpots, private readonly igloo: boolean, private readonly rng: () => number = Math.random) {
    const cube = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.motes = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: igloo ? 0xeef6ff : 0xffe2a8, transparent: true, opacity: 0.7 }), MOTE_COUNT);
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      this.moteState.push({ x: (rng() - 0.5) * 2 * spots.half, y: 0.3 + rng() * 2.6, z: (rng() - 0.5) * 2 * spots.half, phase: rng() * 10, speed: 0.2 + rng() * 0.4 });
    }
    this.embers = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: 0xffb04a }), EMBER_COUNT);
    for (let index = 0; index < EMBER_COUNT; index += 1) this.emberState.push(this.newParticle(rng() * 1.6, 0.4));
    this.draft = igloo ? new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: 0xf4f8ff }), DRAFT_COUNT) : null;
    if (this.draft) for (let index = 0; index < DRAFT_COUNT; index += 1) this.draftState.push(this.newParticle(rng() * 2.4, 1.6));
    [this.motes, this.embers, this.draft].forEach((mesh) => {
      if (!mesh) return;
      mesh.frustumCulled = false;
      this.root.add(mesh);
    });
    if (igloo) {
      // Cold daylight through the ice, so the brazier's warm pool reads against blue walls.
      const fill = new THREE.PointLight(0x9fd0ff, 4, spots.half * 3, 1);
      fill.position.set(0, 4, 0);
      this.root.add(fill);
    }
  }

  /** Bits the pixel pipeline should skip in its normal pass. */
  get glows(): THREE.Object3D[] {
    return [this.motes, this.embers, ...(this.draft ? [this.draft] : [])];
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const { half, fire, door } = this.spots;
    // Motes hang and drift slowly, wrapping around inside the walls.
    this.moteState.forEach((mote, index) => {
      mote.phase += deltaSeconds * mote.speed;
      const x = wrap(mote.x + Math.sin(mote.phase * 0.6) * 0.8, half);
      const z = wrap(mote.z + Math.cos(mote.phase * 0.4) * 0.8 + (this.igloo ? 0 : this.time * 0.05), half);
      const y = this.igloo ? 3 - ((mote.y + this.time * mote.speed * 0.3) % 2.8) : mote.y + Math.sin(mote.phase) * 0.2;
      const size = 0.6 + (index % 3) * 0.25;
      this.matrix.makeScale(size, size, size).setPosition(x, y, z);
      this.motes.setMatrixAt(index, this.matrix);
    });
    this.motes.instanceMatrix.needsUpdate = true;

    // Embers rise off the fire and shrink.
    this.emberState.forEach((ember, index) => {
      ember.age += deltaSeconds;
      if (ember.age >= ember.life) Object.assign(ember, this.newParticle(0, 0.4));
      const t = ember.age / ember.life;
      const size = 1 - t;
      this.matrix.makeScale(size, size, size).setPosition(fire.x + ember.x + Math.sin(this.time * 3 + index) * 0.12 * t, 0.4 + t * 2, fire.z + ember.z);
      this.embers.setMatrixAt(index, this.matrix);
    });
    this.embers.instanceMatrix.needsUpdate = true;

    // Snow blows in through the door and settles a few meters into the room.
    if (!this.draft) return;
    this.draftState.forEach((flake, index) => {
      flake.age += deltaSeconds;
      if (flake.age >= flake.life) Object.assign(flake, this.newParticle(0, 1.6));
      const t = flake.age / flake.life;
      const size = 1 - t * 0.6;
      // The door is in the north wall (smaller z), so flakes travel toward +z.
      this.matrix.makeScale(size, size, size).setPosition(door.x + flake.x + Math.sin(this.time * 2 + index) * 0.2, 1.4 * (1 - t) + 0.05, door.z + t * 4.5 + flake.z * 0.3);
      this.draft!.setMatrixAt(index, this.matrix);
    });
    this.draft.instanceMatrix.needsUpdate = true;
  }

  private newParticle(age: number, spread: number): Particle {
    return { age, life: 1 + this.rng() * 1.4, x: (this.rng() - 0.5) * spread, z: (this.rng() - 0.5) * spread };
  }
}

/** Wraps an offset into [-range, range). */
function wrap(value: number, range: number): number {
  const span = range * 2;
  return ((((value + range) % span) + span) % span) - range;
}
