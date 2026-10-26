import * as THREE from 'three';
import { MERCHANT_ROOM, MERCHANT_TUNING, MerchantItemId, MerchantSystem } from '../../core/systems/MerchantSystem';
import { toonMaterial } from '../materials';
import { humanoidClips } from '../models/clips';
import { ball, box, cone, cylinder, part } from '../models/parts';
import { buildRiggedModel, clipForBones, humanoidBones } from '../models/rig';
import { WORLD_SCALE, simToWorld } from '../space';

/** The merchant's item art (the Phaser shop's icons), one static URL per file for Vite. */
const ITEM_ICONS: Record<MerchantItemId, string> = {
  'divine-blessing': new URL('../../assets/upgrades/merchant/merchant-divine-blessing-icon.png', import.meta.url).href,
  'arcane-curse': new URL('../../assets/upgrades/merchant/merchant-arcane-curse-icon.png', import.meta.url).href,
  heal: new URL('../../assets/upgrades/merchant/merchant-heal-potion-icon.png', import.meta.url).href,
  damage: new URL('../../assets/upgrades/merchant/merchant-sharp-blade-icon.png', import.meta.url).href,
  speed: new URL('../../assets/upgrades/merchant/merchant-swift-boots-icon.png', import.meta.url).href,
  'affinity-tome': new URL('../../assets/upgrades/merchant/merchant-affinity-tome-icon.png', import.meta.url).href,
  'max-health': new URL('../../assets/upgrades/merchant/merchant-vitality-elixir-icon.png', import.meta.url).href
};

export function merchantItemIcon(id: MerchantItemId): string {
  return ITEM_ICONS[id];
}

const PORTAL_COLOR = 0xffc65a;
const PORTAL_CORE = 0xb48cff;

/** A spinning ring portal (gold rim, violet core) standing upright, with a glowing pool at its feet. */
function portalMesh(): THREE.Group {
  const group = new THREE.Group();
  const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 8, 32), new THREE.MeshBasicMaterial({ color: PORTAL_COLOR }));
  const core = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), additive(PORTAL_CORE, 0.55));
  const swirl = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.1, 32, 1, 0, Math.PI * 1.4), additive(0xffffff, 0.35));
  ring.position.y = core.position.y = swirl.position.y = 1.5;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2), additive(PORTAL_CORE, 0.3));
  pool.position.y = 0.05;
  group.add(ring, core, swirl, pool);
  return group;
}

/** Sergio, the merchant: a robed trader under a wide hat, a grey beard and a huge pack on his back. */
function merchantModel(): { root: THREE.Group; mixer: THREE.AnimationMixer } {
  const robe = 0x5a3a6b;
  const sash = 0xc9963f;
  const skin = 0xd9a77e;
  const hat = 0x3a2a1e;
  const pack = 0x7a5232;
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const limb = (s: 'L' | 'R') => [
    { bone: `upperArm${s}`, geometry: part(box(0.15, 0.32, 0.15), robe, [0, -0.15, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.08, 0.1, 0.3, 6), robe, [0, -0.15, 0]) },
    { bone: `hand${s}`, geometry: part(ball(0.07), skin, [0, -0.02, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.17, 0.4, 0.17), 0x3a2a40, [0, -0.2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.14, 0.4, 0.14), 0x3a2a40, [0, -0.2, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.16, 0.08, 0.26), 0x2a1d14, [0, 0.04, 0.05]) }
  ];
  const parts = [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(cylinder(0.3, 0.42, 0.62, 8), robe, [0, -0.26, 0]) },
    { bone: 'spine', geometry: part(box(0.46, 0.3, 0.3), robe, [0, 0.14, 0]) },
    { bone: 'spine', geometry: part(box(0.48, 0.08, 0.32), sash, [0, 0.02, 0]) },
    { bone: 'chest', geometry: part(box(0.54, 0.36, 0.32), robe, [0, 0.1, 0]) },
    // The pack: a tall bundle with a rolled blanket on top and a pan hanging off it.
    { bone: 'chest', geometry: part(box(0.56, 0.7, 0.36), pack, [0, 0.12, -0.36]) },
    { bone: 'chest', geometry: part(cylinder(0.11, 0.11, 0.62, 8), 0xa8342a, [0, 0.52, -0.36], [0, 0, Math.PI / 2]) },
    { bone: 'chest', geometry: part(cylinder(0.12, 0.12, 0.03, 10), 0x6f6a62, [0.3, 0.02, -0.4], [0, 0, Math.PI / 2]) },
    { bone: 'head', geometry: part(box(0.12, 0.1, 0.12), skin, [0, 0.03, 0]) },
    { bone: 'head', geometry: part(ball(0.23, 1), skin, [0, 0.24, 0]) },
    { bone: 'head', geometry: part(cone(0.2, 0.32, 6), 0xcfc8bb, [0, 0.08, 0.14], [Math.PI, 0, 0]) }, // beard
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), 0x1a1410, [0.08, 0.28, 0.2]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), 0x1a1410, [-0.08, 0.28, 0.2]) },
    { bone: 'head', geometry: part(cylinder(0.5, 0.5, 0.05, 10), hat, [0, 0.42, 0]) }, // brim
    { bone: 'head', geometry: part(cone(0.26, 0.42, 8), hat, [0, 0.64, -0.02], [-0.15, 0, 0]) }
  ];
  const model = buildRiggedModel(humanoidBones({ hipHeight: 0.82 }), parts, material);
  const mixer = new THREE.AnimationMixer(model.root);
  mixer.clipAction(clipForBones(humanoidClips(0.82).idle, model.bones)).play();
  return { root: model.root, mixer };
}

/** The merchant's pocket realm (a plank floor, low stone walls with a gap for the exit portal, his counter, warm
 *  lanterns, four pedestals with the items floating over them), plus the portal that opens on the arena. Lives in the
 *  same scene as the arena, far outside it — nothing out there is ever in view from in here. */
export class MerchantRoom {
  readonly root = new THREE.Group();
  readonly characters = new THREE.Group();
  private readonly arenaPortal = portalMesh();
  private readonly exitPortal = portalMesh();
  private readonly icons: THREE.Sprite[] = [];
  private readonly pedestals: THREE.Mesh[] = [];
  private readonly merchant = merchantModel();
  private readonly loader = new THREE.TextureLoader();
  private readonly textures = new Map<MerchantItemId, THREE.Texture>();
  private shownOffers = '';
  private time = 0;

  constructor(private readonly system: MerchantSystem) {
    const center = simToWorld(system.room.x, system.room.y, 0, new THREE.Vector3());
    const room = new THREE.Group();
    room.position.copy(center);
    const size = MERCHANT_ROOM.size * WORLD_SCALE;
    const stone = toonMaterial({ color: 0x6f6458, flatShading: true });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), toonMaterial({ color: 0x6b4a2e, flatShading: true }));
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    room.add(floor);
    // Plank seams.
    for (let index = 1; index < 10; index += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, size), new THREE.MeshBasicMaterial({ color: 0x4a3220 }));
      seam.position.set(-size / 2 + (index * size) / 10, 0.005, 0);
      room.add(seam);
    }
    const wall = (width: number, depth: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1.4, depth), stone);
      mesh.position.set(x, 0.7, z);
      mesh.castShadow = true;
      room.add(mesh);
    };
    const thick = 0.5;
    const gap = 3.2;
    wall(thick, size + thick, -size / 2, 0);
    wall(thick, size + thick, size / 2, 0);
    wall(size + thick, thick, 0, size / 2);
    wall((size - gap) / 2, thick, -(size + gap) / 4, -size / 2);
    wall((size - gap) / 2, thick, (size + gap) / 4, -size / 2);
    // The counter.
    const counter = MERCHANT_ROOM.counter;
    const table = new THREE.Mesh(new THREE.BoxGeometry(counter.halfWidth * 2 * WORLD_SCALE, 1.0, counter.halfHeight * 2 * WORLD_SCALE), toonMaterial({ color: 0x8a5a32, flatShading: true }));
    table.position.set(counter.x * WORLD_SCALE, 0.5, counter.y * WORLD_SCALE);
    table.castShadow = true;
    room.add(table);
    // Lanterns hanging over the counter and the pedestals.
    [[counter.x * WORLD_SCALE, -2], [150 * WORLD_SCALE, 2]].forEach(([x, z]) => {
      const light = new THREE.PointLight(0xffc27a, 18, 10, 2);
      light.position.set(x, 3, z);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd894 }));
      glow.position.copy(light.position);
      room.add(light, glow);
    });
    MERCHANT_ROOM.slots.forEach((slot) => {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 8), stone);
      pedestal.position.set(slot.x * WORLD_SCALE, 0.45, slot.y * WORLD_SCALE);
      pedestal.castShadow = true;
      room.add(pedestal);
      this.pedestals.push(pedestal);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      icon.scale.setScalar(1.3);
      icon.position.set(slot.x * WORLD_SCALE, 1.8, slot.y * WORLD_SCALE);
      room.add(icon);
      this.icons.push(icon);
    });
    this.exitPortal.position.set(MERCHANT_ROOM.exit.x * WORLD_SCALE, 0, MERCHANT_ROOM.exit.y * WORLD_SCALE);
    room.add(this.exitPortal);
    this.merchant.root.position.set(center.x + MERCHANT_ROOM.merchant.x * WORLD_SCALE, 0, center.z + MERCHANT_ROOM.merchant.y * WORLD_SCALE);
    // Faces the pedestals across the counter.
    this.merchant.root.rotation.y = Math.PI / 2;
    this.merchant.root.scale.setScalar(1.2);
    this.characters.add(this.merchant.root);
    this.root.add(room, this.arenaPortal);
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const { system } = this;
    const portal = system.portal;
    this.arenaPortal.visible = !!portal && !system.inside;
    if (portal) {
      simToWorld(portal.x, portal.y, 0, this.arenaPortal.position);
      // Fades in as it opens and flickers in its last seconds.
      const closing = portal.remainingMs < 3000 ? 0.6 + 0.4 * Math.sin(this.time * 25) : 1;
      const opening = Math.min(1, (MERCHANT_TUNING.portalOpenMs - portal.remainingMs) / 400);
      this.arenaPortal.scale.setScalar(opening * closing);
    }
    [this.arenaPortal, this.exitPortal].forEach((group) => {
      group.children[0].rotation.y += deltaSeconds * 1.6;
      group.children[1].rotation.y = group.children[0].rotation.y;
      group.children[2].rotation.set(0, group.children[0].rotation.y, this.time * 3);
    });
    if (!system.inside) return;
    this.merchant.mixer.update(deltaSeconds);
    // Items bob over their pedestals; sold ones sink, greyed.
    const key = system.offers.map((offer) => `${offer.id}${offer.purchased ? 'x' : ''}`).join(',');
    if (key !== this.shownOffers) {
      this.shownOffers = key;
      system.offers.forEach((offer, index) => {
        const material = this.icons[index].material;
        material.map = this.texture(offer.id);
        material.color.setHex(offer.purchased ? 0x555555 : 0xffffff);
        material.opacity = offer.purchased ? 0.5 : 1;
        material.needsUpdate = true;
      });
    }
    this.icons.forEach((icon, index) => {
      const sold = system.offers[index]?.purchased;
      icon.position.y = sold ? 1.2 : 1.8 + Math.sin(this.time * 2 + index) * 0.12;
    });
  }

  private texture(id: MerchantItemId): THREE.Texture {
    let texture = this.textures.get(id);
    if (!texture) {
      texture = this.loader.load(ITEM_ICONS[id]);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(id, texture);
    }
    return texture;
  }
}
