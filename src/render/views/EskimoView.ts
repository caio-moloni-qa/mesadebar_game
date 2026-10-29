import * as THREE from 'three';
import { QuestSystem } from '../../core/systems/QuestSystem';
import { ShelterSystem } from '../../core/systems/ShelterSystem';
import { toonMaterial } from '../materials';
import { iceWolfParts } from '../models/enemies';
import { importedHeroRig } from '../models/heroes';
import { box, cylinder, mergeParts, part } from '../models/parts';
import { humanoidClips, quadrupedTrotClip } from '../models/clips';
import { REGULAR_FIGURE_LOOK, REGULAR_FIGURES } from '../models/regulars';
import { buildRiggedModel, clipForBones, humanoidBones, quadrupedBones } from '../models/rig';
import { simToWorld } from '../space';

const HIP = 0.82;

/** The Nevado's walkers and finds: the Esquimó doing his rounds with his lantern (a warm light you can spot through
 *  the storm, and a halo when he's offering shelter), and Joe's memory fragments — shards of glowing ice in a cold
 *  pillar of light, shown only while they can be picked up. */
export class EskimoView {
  readonly root = new THREE.Group();
  /** The lantern's halo and the fragments' light: the pixel pipeline skips them in its normal pass. */
  readonly glow = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly lantern = new THREE.PointLight(0xffb45a, 9, 7, 1.6);
  private readonly halo: THREE.Mesh;
  private readonly offerRing: THREE.Mesh;
  private readonly fragments = new THREE.Group();
  private readonly shard = new THREE.OctahedronGeometry(0.32, 0).scale(0.7, 1.4, 0.7);
  private readonly shardMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  private readonly beam = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGeometry = new THREE.CylinderGeometry(0.45, 0.6, 7, 12, 1, true).translate(0, 3.5, 0);
  private shownKey = '';
  private time = 0;
  private readonly wolves: THREE.AnimationMixer[] = [];

  constructor(private readonly shelter: ShelterSystem, private readonly quests: QuestSystem) {
    // His imported mesh when it's loaded (with a lantern added to the mitten), otherwise the procedural figure.
    const material = toonMaterial({ vertexColors: true, flatShading: true });
    const imported = importedHeroRig('eskimo', material);
    const model = imported?.model ?? buildRiggedModel(humanoidBones({ hipHeight: HIP }), REGULAR_FIGURES.eskimo(true), material);
    if (imported) {
      model.bones.handR.add(new THREE.Mesh(mergeParts([
        part(cylinder(0.01, 0.01, 0.14, 4), 0x3a2414, [0, -0.12, 0.04]),
        part(box(0.14, 0.18, 0.14), 0x4a3a2a, [0, -0.28, 0.04]),
        part(box(0.1, 0.13, 0.15), 0xffc65a, [0, -0.28, 0.04])
      ]), material));
    } else {
      model.root.scale.setScalar(REGULAR_FIGURE_LOOK.eskimo.scale);
    }
    model.root.position.set(0, 0.32, -0.75);
    // The driver rides at the rear; the front cushion is reserved for the passenger.
    this.figure.add(model.root);
    const sledParts: THREE.BufferGeometry[] = [
      part(box(1.35, 0.18, 2.25), 0x69462d, [0, 0.35, -0.05]),
      part(box(1.15, 0.18, 1.2), 0xc9b79a, [0, 0.53, 0.25]),
      part(box(1.3, 0.55, 0.12), 0x69462d, [0, 0.67, -1.1])
    ];
    for (const side of [-1, 1]) {
      sledParts.push(part(box(0.12, 0.12, 2.9), 0xb3c8ce, [side * 0.65, 0.12, 0.12]));
      sledParts.push(part(box(0.1, 0.12, 0.6), 0xb3c8ce, [side * 0.65, 0.28, 1.7], [-0.55, 0, 0]));
      sledParts.push(part(box(0.08, 0.12, 2.2), 0x9c7045, [side * 0.66, 0.76, 0]));
      for (const z of [-0.7, 0.7]) sledParts.push(part(box(0.1, 0.65, 0.1), 0x69462d, [side * 0.65, 0.44, z]));
      // Taut leather traces link both wolves to the sled.
      sledParts.push(part(cylinder(0.025, 0.025, 2.2), 0x6b4d36, [side * 0.58, 0.45, 2.1], [Math.PI / 2, 0, 0]));
      const bones = quadrupedBones({ hipHeight: 0.56, bodyLength: 0.56, shoulderRise: 0.04, legSpread: 0.11, thighLength: 0.24, headReach: 0.32 });
      const wolf = buildRiggedModel(bones, iceWolfParts(), toonMaterial({ vertexColors: true, flatShading: true }));
      wolf.root.position.set(side * 0.65, 0, 3.35);
      const mixer = new THREE.AnimationMixer(wolf.root);
      mixer.clipAction(clipForBones(quadrupedTrotClip(bones[1].offset, 0.42), wolf.bones)).play();
      this.wolves.push(mixer);
      this.figure.add(wolf.root);
      sledParts.push(part(box(0.48, 0.08, 0.14), 0x8a3e2d, [side * 0.65, 0.61, 3.4]));
    }
    this.figure.add(new THREE.Mesh(mergeParts(sledParts), toonMaterial({ vertexColors: true, flatShading: true })));
    this.mixer = new THREE.AnimationMixer(model.root);
    this.mixer.clipAction(imported?.clips.idle ?? clipForBones(humanoidClips(HIP).idle, model.bones)).play();
    this.lantern.position.set(0.35, 0.9, 0.2);
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.position.y = 0.04;
    this.offerRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.15, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.offerRing.position.y = 0.05;
    this.figure.add(this.lantern);
    this.figure.visible = false;
    this.root.add(this.figure, this.fragments);
    this.glow.add(this.halo, this.offerRing);
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.updateEskimo(deltaSeconds);
    this.updateFragments();
  }

  private updateEskimo(deltaSeconds: number): void {
    const eskimo = this.shelter.eskimo;
    const shown = !!eskimo;
    this.figure.visible = this.halo.visible = shown;
    this.offerRing.visible = shown && this.shelter.offering;
    if (!eskimo) return;
    simToWorld(eskimo.x, eskimo.y, 0, this.figure.position);
    this.figure.rotation.y = Math.atan2(eskimo.facingX, eskimo.facingY);
    this.halo.position.set(this.figure.position.x, 0.04, this.figure.position.z);
    this.offerRing.position.set(this.figure.position.x, 0.05, this.figure.position.z);
    this.offerRing.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06);
    const walking = Math.hypot(eskimo.x - eskimo.prevX, eskimo.y - eskimo.prevY) > 0.01;
    this.wolves.forEach((mixer) => mixer.update(walking ? deltaSeconds : 0));
    // The flame in the lantern flickers.
    this.lantern.intensity = 9 + Math.sin(this.time * 11) * 1.2 + Math.sin(this.time * 27) * 0.6;
    this.mixer.update(deltaSeconds);
  }

  private updateFragments(): void {
    const showing = this.quests.fragmentsShowing;
    const key = showing ? this.quests.fragments.map((spot) => `${Math.round(spot.x)},${Math.round(spot.y)}`).join(';') : '';
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.fragments.clear();
      if (showing) {
        this.quests.fragments.forEach((spot) => {
          const group = new THREE.Group();
          simToWorld(spot.x, spot.y, 0, group.position);
          group.add(new THREE.Mesh(this.shard, this.shardMaterial), new THREE.Mesh(this.beamGeometry, this.beam));
          this.fragments.add(group);
        });
      }
    }
    this.fragments.children.forEach((group, index) => {
      const shard = group.children[0];
      shard.position.y = 0.9 + Math.sin(this.time * 2.2 + index) * 0.15;
      shard.rotation.y = this.time * 1.4 + index;
    });
    this.beam.opacity = 0.16 + Math.sin(this.time * 3) * 0.05;
  }
}
