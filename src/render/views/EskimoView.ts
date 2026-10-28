import * as THREE from 'three';
import { QuestSystem } from '../../core/systems/QuestSystem';
import { ShelterSystem } from '../../core/systems/ShelterSystem';
import { toonMaterial } from '../materials';
import { humanoidClips } from '../models/clips';
import { REGULAR_FIGURE_LOOK, REGULAR_FIGURES } from '../models/regulars';
import { buildRiggedModel, clipForBones, humanoidBones } from '../models/rig';
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
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly lantern = new THREE.PointLight(0xffb45a, 9, 7, 1.6);
  private readonly halo: THREE.Mesh;
  private readonly offerRing: THREE.Mesh;
  private readonly fragments = new THREE.Group();
  private readonly shard = new THREE.OctahedronGeometry(0.32, 0).scale(0.7, 1.4, 0.7);
  private readonly shardMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  private readonly beam = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGeometry = new THREE.CylinderGeometry(0.45, 0.6, 7, 12, 1, true).translate(0, 3.5, 0);
  private shownKey = '';
  private walking = false;
  private time = 0;

  constructor(private readonly shelter: ShelterSystem, private readonly quests: QuestSystem) {
    const model = buildRiggedModel(humanoidBones({ hipHeight: HIP }), REGULAR_FIGURES.eskimo(true), toonMaterial({ vertexColors: true, flatShading: true }));
    model.root.scale.setScalar(REGULAR_FIGURE_LOOK.eskimo.scale);
    this.figure.add(model.root);
    this.mixer = new THREE.AnimationMixer(model.root);
    const clips = humanoidClips(HIP);
    this.idle = this.mixer.clipAction(clipForBones(clips.idle, model.bones));
    this.walk = this.mixer.clipAction(clipForBones(clips.run, model.bones));
    this.walk.timeScale = 0.55;
    this.idle.play();
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
    if (walking !== this.walking) {
      this.walking = walking;
      (walking ? this.walk : this.idle).reset().fadeIn(0.2).play();
      (walking ? this.idle : this.walk).fadeOut(0.2);
    }
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
