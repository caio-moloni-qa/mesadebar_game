import * as THREE from 'three';
import { QuestSystem } from '../../core/systems/QuestSystem';
import { toonMaterial } from '../materials';
import { cylinder, mergeParts, part } from '../models/parts';
import { simToWorld } from '../space';

/** Brom's lost barrels out on the arena: a mead barrel each, bobbing in a pillar of golden light so they read from
 *  across the map. Rebuilt whenever one is picked up or a new batch is scattered. */
export class QuestBarrels {
  readonly root = new THREE.Group();
  private readonly barrel = mergeParts([
    part(cylinder(0.42, 0.42, 0.9, 10), 0x8a5a32),
    part(cylinder(0.45, 0.45, 0.07, 10), 0x4a4a52, [0, -0.28, 0]),
    part(cylinder(0.45, 0.45, 0.07, 10), 0x4a4a52, [0, 0.28, 0]),
    part(cylinder(0.3, 0.3, 0.02, 10), 0xc9963f, [0, 0.46, 0])
  ]);
  private readonly material = toonMaterial({ vertexColors: true, flatShading: true });
  private readonly beam = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGeometry = new THREE.CylinderGeometry(0.55, 0.75, 7, 12, 1, true).translate(0, 3.5, 0);
  private shownKey = '';
  private time = 0;

  update(quests: QuestSystem, deltaSeconds: number): void {
    this.time += deltaSeconds;
    const key = quests.barrels.map((barrel) => `${Math.round(barrel.x)},${Math.round(barrel.y)}`).join(';');
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.root.clear();
      quests.barrels.forEach((barrel) => {
        const group = new THREE.Group();
        simToWorld(barrel.x, barrel.y, 0, group.position);
        const mesh = new THREE.Mesh(this.barrel, this.material);
        mesh.castShadow = true;
        mesh.position.y = 0.6;
        group.add(mesh, new THREE.Mesh(this.beamGeometry, this.beam));
        this.root.add(group);
      });
    }
    this.root.children.forEach((group, index) => {
      const mesh = group.children[0];
      mesh.position.y = 0.6 + Math.sin(this.time * 2.5 + index) * 0.12;
      mesh.rotation.y = this.time * 0.8 + index;
    });
    this.beam.opacity = 0.18 + Math.sin(this.time * 3) * 0.05;
  }
}
