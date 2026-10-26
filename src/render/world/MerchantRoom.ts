import * as THREE from 'three';
import { MERCHANT_ROOM, MERCHANT_TUNING, MerchantItemId, MerchantSystem } from '../../core/systems/MerchantSystem';
import { QuestStatus, QuestSystem } from '../../core/systems/QuestSystem';
import { toonMaterial } from '../materials';
import { humanoidClips } from '../models/clips';
import { ball, box, cone, cylinder, mergeParts, part } from '../models/parts';
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
const HIP = 0.82;

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

type PartSpec = { bone: string; geometry: THREE.BufferGeometry };

/** The shared humanoid body: limbs, hips/spine/chest and a head, in the given colours. */
function body(colors: { skin: number; shirt: number; sleeve: number; pants: number; boots: number }, { chestWidth = 0.5, headSize = 0.23 } = {}): PartSpec[] {
  const { skin, shirt, sleeve, pants, boots } = colors;
  const limb = (s: 'L' | 'R'): PartSpec[] => [
    { bone: `upperArm${s}`, geometry: part(box(0.14, 0.32, 0.14), sleeve, [0, -0.15, 0]) },
    { bone: `foreArm${s}`, geometry: part(cylinder(0.07, 0.09, 0.3, 6), sleeve, [0, -0.15, 0]) },
    { bone: `hand${s}`, geometry: part(ball(0.07), skin, [0, -0.02, 0]) },
    { bone: `thigh${s}`, geometry: part(box(0.16, 0.4, 0.16), pants, [0, -0.2, 0]) },
    { bone: `shin${s}`, geometry: part(box(0.14, 0.4, 0.14), pants, [0, -0.2, 0]) },
    { bone: `foot${s}`, geometry: part(box(0.16, 0.08, 0.26), boots, [0, 0.04, 0.05]) }
  ];
  return [
    ...limb('L'),
    ...limb('R'),
    { bone: 'hips', geometry: part(box(chestWidth * 0.8, 0.22, 0.28), pants, [0, -0.02, 0]) },
    { bone: 'spine', geometry: part(box(chestWidth * 0.85, 0.3, 0.28), shirt, [0, 0.14, 0]) },
    { bone: 'chest', geometry: part(box(chestWidth, 0.36, 0.3), shirt, [0, 0.1, 0]) },
    { bone: 'head', geometry: part(box(0.12, 0.1, 0.12), skin, [0, 0.03, 0]) },
    { bone: 'head', geometry: part(ball(headSize, 1), skin, [0, 0.24, 0]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), 0x1a1410, [0.08, 0.27, headSize - 0.02]) },
    { bone: 'head', geometry: part(box(0.05, 0.05, 0.03), 0x1a1410, [-0.08, 0.27, headSize - 0.02]) }
  ];
}

interface Character { root: THREE.Group; mixer: THREE.AnimationMixer }

function rigged(parts: PartSpec[], scale: number, phase: number): Character {
  const material = toonMaterial({ vertexColors: true, flatShading: true });
  const model = buildRiggedModel(humanoidBones({ hipHeight: HIP }), parts, material);
  model.root.scale.setScalar(scale);
  const mixer = new THREE.AnimationMixer(model.root);
  const idle = mixer.clipAction(clipForBones(humanoidClips(HIP).idle, model.bones));
  // Regulars don't idle in lockstep.
  idle.time = phase * idle.getClip().duration;
  idle.play();
  return { root: model.root, mixer };
}

/** Sergio, the barkeep and merchant: a robed trader under a wide hat, a grey beard and a huge pack on his back. */
function sergioModel(): Character {
  const robe = 0x5a3a6b;
  const hat = 0x3a2a1e;
  return rigged([
    ...body({ skin: 0xd9a77e, shirt: robe, sleeve: robe, pants: 0x3a2a40, boots: 0x2a1d14 }, { chestWidth: 0.54 }),
    { bone: 'hips', geometry: part(cylinder(0.3, 0.42, 0.62, 8), robe, [0, -0.26, 0]) },
    { bone: 'spine', geometry: part(box(0.48, 0.08, 0.32), 0xc9963f, [0, 0.02, 0]) },
    { bone: 'chest', geometry: part(box(0.56, 0.7, 0.36), 0x7a5232, [0, 0.12, -0.36]) },
    { bone: 'chest', geometry: part(cylinder(0.11, 0.11, 0.62, 8), 0xa8342a, [0, 0.52, -0.36], [0, 0, Math.PI / 2]) },
    { bone: 'head', geometry: part(cone(0.2, 0.32, 6), 0xcfc8bb, [0, 0.08, 0.14], [Math.PI, 0, 0]) },
    { bone: 'head', geometry: part(cylinder(0.5, 0.5, 0.05, 10), hat, [0, 0.42, 0]) },
    { bone: 'head', geometry: part(cone(0.26, 0.42, 8), hat, [0, 0.64, -0.02], [-0.15, 0, 0]) }
  ], 1.2, 0);
}

/** Brom Barbaferro: a stout dwarf brewer, iron cap, a huge braided red beard, leather apron, a mug in hand. */
function bromModel(): Character {
  const beard = 0xc0502a;
  return rigged([
    ...body({ skin: 0xe0a882, shirt: 0x7a4a2a, sleeve: 0x6a3e22, pants: 0x4a4a5a, boots: 0x2a1d14 }, { chestWidth: 0.66, headSize: 0.25 }),
    { bone: 'chest', geometry: part(box(0.5, 0.62, 0.04), 0x4a3020, [0, -0.08, 0.17]) },
    { bone: 'spine', geometry: part(box(0.62, 0.08, 0.32), 0x2a1d14, [0, 0.0, 0]) },
    { bone: 'head', geometry: part(cone(0.24, 0.5, 6), beard, [0, -0.02, 0.15], [Math.PI, 0, 0]) },
    { bone: 'head', geometry: part(box(0.05, 0.22, 0.05), beard, [0.1, -0.3, 0.2]) },
    { bone: 'head', geometry: part(box(0.05, 0.22, 0.05), beard, [-0.1, -0.3, 0.2]) },
    { bone: 'head', geometry: part(box(0.2, 0.05, 0.05), beard, [0, 0.19, 0.24]) },
    { bone: 'head', geometry: part(new THREE.SphereGeometry(0.27, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8f99, [0, 0.3, 0]) },
    { bone: 'head', geometry: part(cylinder(0.29, 0.29, 0.05, 8), 0x6f737c, [0, 0.31, 0]) },
    { bone: 'handR', geometry: part(cylinder(0.08, 0.08, 0.18, 8), 0x8a5a32, [0, 0.02, 0.08]) },
    { bone: 'handR', geometry: part(cylinder(0.085, 0.085, 0.04, 8), 0xf5ecd0, [0, 0.12, 0.08]) }
  ], 0.78, 0.2);
}

/** Lyra Folhaverde: a slender elf huntress, green hooded cloak, golden hair, long ears, a bow across her back. */
function lyraModel(): Character {
  const cloak = 0x2f5a36;
  const hair = 0xe8d27a;
  return rigged([
    ...body({ skin: 0xf0d0b0, shirt: 0x3f7a4a, sleeve: 0x3f7a4a, pants: 0x5a4a32, boots: 0x3a2a1a }, { chestWidth: 0.42, headSize: 0.21 }),
    { bone: 'chest', geometry: part(box(0.5, 0.8, 0.05), cloak, [0, -0.1, -0.18]) },
    { bone: 'spine', geometry: part(box(0.44, 0.06, 0.3), 0x8a6a3a, [0, 0.02, 0]) },
    { bone: 'head', geometry: part(box(0.4, 0.3, 0.12), hair, [0, 0.2, -0.13]) },
    { bone: 'head', geometry: part(box(0.12, 0.42, 0.06), hair, [0, -0.02, -0.18]) },
    { bone: 'head', geometry: part(cone(0.05, 0.22, 4), 0xf0d0b0, [0.22, 0.3, 0], [0, 0, -1.2]) },
    { bone: 'head', geometry: part(cone(0.05, 0.22, 4), 0xf0d0b0, [-0.22, 0.3, 0], [0, 0, 1.2]) },
    { bone: 'head', geometry: part(new THREE.SphereGeometry(0.25, 8, 4, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI / 1.7), cloak, [0, 0.26, -0.02]) },
    { bone: 'chest', geometry: part(new THREE.TorusGeometry(0.45, 0.025, 4, 12, Math.PI), 0x6a4a2a, [0, 0.1, -0.24], [0, 0, Math.PI / 2 + 0.4]) }
  ], 1.02, 0.45);
}

/** Grimbo Dedoleve: a small green goblin gambler, huge ears and nose, a magenta vest and a top hat. */
function grimboModel(): Character {
  const skin = 0x7fb04a;
  return rigged([
    ...body({ skin, shirt: 0x8a3a5a, sleeve: 0xd8cbb0, pants: 0x4a3a2a, boots: 0x2a1d14 }, { chestWidth: 0.44, headSize: 0.3 }),
    { bone: 'head', geometry: part(cone(0.09, 0.42, 4), skin, [0.36, 0.3, 0], [0, 0, -1.35]) },
    { bone: 'head', geometry: part(cone(0.09, 0.42, 4), skin, [-0.36, 0.3, 0], [0, 0, 1.35]) },
    { bone: 'head', geometry: part(cone(0.07, 0.22, 4), 0x6a9a3a, [0, 0.2, 0.36], [Math.PI / 2, 0, 0]) },
    { bone: 'head', geometry: part(box(0.07, 0.07, 0.03), 0xffe14a, [0.11, 0.29, 0.28]) },
    { bone: 'head', geometry: part(box(0.07, 0.07, 0.03), 0xffe14a, [-0.11, 0.29, 0.28]) },
    { bone: 'head', geometry: part(cylinder(0.3, 0.3, 0.04, 10), 0x1e1a24, [0, 0.5, 0]) },
    { bone: 'head', geometry: part(cylinder(0.18, 0.2, 0.36, 10), 0x1e1a24, [0, 0.7, 0]) },
    { bone: 'head', geometry: part(cylinder(0.205, 0.205, 0.06, 10), 0xc9963f, [0, 0.56, 0]) },
    { bone: 'handR', geometry: part(cylinder(0.07, 0.07, 0.02, 10), 0xffd25a, [0, 0.02, 0.06], [Math.PI / 2, 0, 0]) }
  ], 0.64, 0.7);
}

/** Madame Zora: a fortune teller in a long violet gown, a golden headscarf and big hoop earrings. */
function zoraModel(): Character {
  const gown = 0x5a2a7a;
  const scarf = 0xd4a83a;
  return rigged([
    ...body({ skin: 0xc8946a, shirt: gown, sleeve: 0x7a3a9a, pants: gown, boots: 0x2a1a2a }, { chestWidth: 0.46, headSize: 0.22 }),
    { bone: 'hips', geometry: part(cylinder(0.28, 0.5, 0.82, 10), gown, [0, -0.38, 0]) },
    { bone: 'chest', geometry: part(box(0.6, 0.14, 0.34), 0x9a4a6a, [0, 0.22, 0]) },
    { bone: 'head', geometry: part(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 1.9), scarf, [0, 0.27, -0.02]) },
    { bone: 'head', geometry: part(cone(0.12, 0.3, 4), scarf, [0, 0.12, -0.24], [-2.6, 0, 0]) },
    { bone: 'head', geometry: part(new THREE.TorusGeometry(0.06, 0.012, 4, 10), 0xffd25a, [0.22, 0.14, 0]) },
    { bone: 'head', geometry: part(new THREE.TorusGeometry(0.06, 0.012, 4, 10), 0xffd25a, [-0.22, 0.14, 0]) },
    { bone: 'head', geometry: part(box(0.32, 0.04, 0.04), 0x2a1a2a, [0, 0.33, 0.21]) }
  ], 0.96, 0.9);
}

/** QUEST_NPCS order. */
const REGULAR_MODELS = [bromModel, lyraModel, grimboModel, zoraModel];

/** "!" (mission on offer), "?" (come claim it), "…" (under way) over a regular's head. */
function markerTexture(symbol: string, background: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = background;
  context.beginPath();
  context.arc(32, 32, 26, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = '#2a1a10';
  context.stroke();
  context.fillStyle = '#2a1a10';
  context.font = 'bold 40px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(symbol, 32, 35);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** The tavern behind Sergio's portal (a plank floor and stone walls with a gap for the exit portal, the bar down the
 *  west side with his items over it and bottles behind him, a fireplace, the regulars at their tables), plus the
 *  portal that opens on the arena. Lives in the same scene as the arena, far outside it — the arena's land is hidden
 *  while you're in here. */
export class MerchantRoom {
  readonly root = new THREE.Group();
  readonly characters = new THREE.Group();
  private readonly arenaPortal = portalMesh();
  private readonly exitPortal = portalMesh();
  private readonly icons: THREE.Sprite[] = [];
  private readonly sergio = sergioModel();
  private readonly regulars = REGULAR_MODELS.map((build) => build());
  private readonly markers: THREE.Sprite[] = [];
  private readonly markerTextures: Record<Exclude<QuestStatus, 'done'>, THREE.Texture> = {
    offer: markerTexture('!', '#ffd25a'),
    ready: markerTexture('?', '#7dffa0'),
    active: markerTexture('…', '#b9b2a6')
  };
  private readonly fireLight = new THREE.PointLight(0xff8a3a, 20, 9, 2);
  private readonly flames: THREE.Mesh[] = [];
  private readonly loader = new THREE.TextureLoader();
  private readonly textures = new Map<MerchantItemId, THREE.Texture>();
  private shownOffers = '';
  private time = 0;

  constructor(private readonly system: MerchantSystem, private readonly quests: QuestSystem) {
    const center = simToWorld(system.room.x, system.room.y, 0, new THREE.Vector3());
    const room = new THREE.Group();
    room.position.copy(center);
    const at = (x: number, y: number, height = 0) => new THREE.Vector3(x * WORLD_SCALE, height, y * WORLD_SCALE);
    // Everything static is merged into two meshes (lit and glowing); props are hundreds of tiny pieces otherwise.
    const lit: THREE.BufferGeometry[] = [];
    const unlit: THREE.BufferGeometry[] = [];
    const solid = (geometry: THREE.BufferGeometry, color: number, position: THREE.Vector3) => {
      lit.push(part(geometry, color, [position.x, position.y, position.z]));
    };
    const glow = (geometry: THREE.BufferGeometry, color: number, position: THREE.Vector3) => {
      unlit.push(part(geometry, color, [position.x, position.y, position.z]));
    };
    const size = MERCHANT_ROOM.size * WORLD_SCALE;
    const half = size / 2;

    // Floor, plank seams and a rug in the middle.
    solid(new THREE.BoxGeometry(size, 0.2, size), 0x6b4a2e, new THREE.Vector3(0, -0.1, 0));
    for (let index = 1; index < 14; index += 1) glow(new THREE.BoxGeometry(0.05, 0.01, size), 0x4a3220, new THREE.Vector3(-half + (index * size) / 14, 0.005, 0));
    solid(new THREE.BoxGeometry(5, 0.02, 3.4), 0x7a2a2a, at(10, 20, 0.01));
    solid(new THREE.BoxGeometry(4.4, 0.025, 2.8), 0xb8863a, at(10, 20, 0.012));
    solid(new THREE.BoxGeometry(4, 0.03, 2.4), 0x7a2a2a, at(10, 20, 0.014));

    // Walls, with the gap in the north wall for the exit portal.
    const thick = 0.5;
    const gap = 3.2;
    const wall = (width: number, depth: number, x: number, z: number) => solid(new THREE.BoxGeometry(width, 1.6, depth), 0x6f6458, new THREE.Vector3(x, 0.8, z));
    wall(thick, size + thick, -half, 0);
    wall(thick, size + thick, half, 0);
    wall(size + thick, thick, 0, half);
    wall((size - gap) / 2, thick, -(size + gap) / 4, -half);
    wall((size - gap) / 2, thick, (size + gap) / 4, -half);

    // The bar: counter with a darker top, the bottle shelves behind Sergio, a stack of barrels in the corner.
    const counter = MERCHANT_ROOM.counter;
    const counterSize = new THREE.Vector3(counter.halfWidth * 2 * WORLD_SCALE, 1.1, counter.halfHeight * 2 * WORLD_SCALE);
    solid(new THREE.BoxGeometry(counterSize.x, counterSize.y, counterSize.z), 0x7a4a28, at(counter.x, counter.y, 0.55));
    solid(new THREE.BoxGeometry(counterSize.x + 0.2, 0.1, counterSize.z + 0.2), 0x4a2c18, at(counter.x, counter.y, 1.12));
    const shelfX = -305;
    const bottleColors = [0x3a8a4a, 0x8a2a3a, 0x2a5a9a, 0xc9963f, 0x6a3a8a];
    for (let level = 0; level < 3; level += 1) {
      solid(new THREE.BoxGeometry(0.45, 0.06, 9), 0x5a3a22, at(shelfX, 0, 0.7 + level * 0.6));
      for (let index = 0; index < 12; index += 1) {
        const height = 0.3 + ((index * 7 + level * 3) % 4) * 0.06;
        solid(cylinder(0.07, 0.09, height, 6), bottleColors[(index + level * 2) % bottleColors.length], at(shelfX, -130 + index * 23, 0.73 + level * 0.6 + height / 2));
      }
    }
    [[-280, 280], [-250, 285], [-282, 250]].forEach(([x, y]) => {
      solid(cylinder(0.42, 0.42, 0.95, 10), 0x8a5a32, at(x, y, 0.48));
      solid(cylinder(0.44, 0.44, 0.06, 10), 0x4a4a52, at(x, y, 0.2));
      solid(cylinder(0.44, 0.44, 0.06, 10), 0x4a4a52, at(x, y, 0.76));
    });

    // The fireplace in the south wall.
    const hearth = at(-20, 300);
    solid(new THREE.BoxGeometry(2.6, 2.2, 0.9), 0x5a524a, hearth.clone().setY(1.1));
    glow(new THREE.BoxGeometry(1.5, 1.0, 0.2), 0x1a0e08, hearth.clone().add(new THREE.Vector3(0, 0.55, -0.4)));
    ([[-0.3, 0xff7a2a], [0.05, 0xffb04a], [0.32, 0xff7a2a]] as const).forEach(([offset, color]) => {
      const flame = new THREE.Mesh(cone(0.22, 0.6, 5).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color }));
      flame.position.copy(hearth).add(new THREE.Vector3(offset, 0.05, -0.45));
      room.add(flame);
      this.flames.push(flame);
    });
    this.fireLight.position.copy(hearth).add(new THREE.Vector3(0, 1, -1.2));
    room.add(this.fireLight);

    // Lanterns over the bar and over the tables.
    [[counter.x, -100], [counter.x, 120], [130, -90], [130, 190]].forEach(([x, y]) => {
      const light = new THREE.PointLight(0xffc27a, 14, 9, 2);
      light.position.copy(at(x, y, 3));
      room.add(light);
      glow(new THREE.BoxGeometry(0.3, 0.4, 0.3), 0xffd894, light.position);
    });

    // The regulars' tables: a round top on one leg, mugs and a candle (a crystal ball on Zora's).
    MERCHANT_ROOM.tables.forEach((table, index) => {
      const radius = MERCHANT_ROOM.tableRadius * WORLD_SCALE;
      solid(cylinder(radius, radius, 0.08, 10), 0x8a5a32, at(table.x, table.y, 0.85));
      solid(cylinder(0.1, 0.12, 0.85, 6), 0x5a3a22, at(table.x, table.y, 0.42));
      solid(cylinder(0.45, 0.5, 0.06, 8), 0x5a3a22, at(table.x, table.y, 0.03));
      solid(cylinder(0.1, 0.1, 0.2, 8), 0x9a6a3a, at(table.x - 10, table.y - 10, 0.99));
      solid(cylinder(0.1, 0.1, 0.2, 8), 0x9a6a3a, at(table.x + 12, table.y + 8, 0.99));
      if (index === 3) {
        glow(ball(0.24, 1), 0x9fe8ff, at(table.x, table.y, 1.14));
        solid(cylinder(0.15, 0.2, 0.08, 8), 0xc9963f, at(table.x, table.y, 0.93));
      } else {
        solid(cylinder(0.05, 0.05, 0.18, 6), 0xf0e6c8, at(table.x + 6, table.y - 14, 0.98));
        glow(cone(0.04, 0.09, 4), 0xffc65a, at(table.x + 6, table.y - 14, 1.12));
      }
    });

    // Sergio's items float over the counter beside where you stand to buy them.
    MERCHANT_ROOM.slots.forEach((slot) => {
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      icon.scale.setScalar(1.1);
      icon.position.copy(at(counter.x, slot.y, 1.9));
      room.add(icon);
      this.icons.push(icon);
    });

    const props = new THREE.Mesh(mergeParts(lit), toonMaterial({ vertexColors: true, flatShading: true }));
    props.castShadow = true;
    props.receiveShadow = true;
    room.add(props, new THREE.Mesh(mergeParts(unlit), new THREE.MeshBasicMaterial({ vertexColors: true })));

    this.exitPortal.position.copy(at(MERCHANT_ROOM.exit.x, MERCHANT_ROOM.exit.y));
    room.add(this.exitPortal);

    // Sergio faces the room across his bar; the regulars face west, over their tables.
    this.sergio.root.position.copy(at(MERCHANT_ROOM.merchant.x, MERCHANT_ROOM.merchant.y).add(center));
    this.sergio.root.rotation.y = Math.PI / 2;
    this.characters.add(this.sergio.root);
    this.regulars.forEach((regular, index) => {
      const spot = MERCHANT_ROOM.npcs[index];
      regular.root.position.copy(at(spot.x, spot.y).add(center));
      regular.root.rotation.y = -Math.PI / 2;
      this.characters.add(regular.root);
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      marker.scale.setScalar(0.7);
      marker.position.copy(at(spot.x, spot.y, 2.5));
      room.add(marker);
      this.markers.push(marker);
    });
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
    this.sergio.mixer.update(deltaSeconds);
    this.regulars.forEach((regular) => regular.mixer.update(deltaSeconds));
    // The fire breathes.
    this.fireLight.intensity = 18 + Math.sin(this.time * 9) * 3 + Math.sin(this.time * 23) * 2;
    this.flames.forEach((flame, index) => flame.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(this.time * (7 + index * 2) + index)), 1));
    this.quests.quests.forEach((quest, index) => {
      const marker = this.markers[index];
      marker.visible = quest.status !== 'done';
      if (quest.status === 'done') return;
      const texture = this.markerTextures[quest.status];
      if (marker.material.map !== texture) {
        marker.material.map = texture;
        marker.material.needsUpdate = true;
      }
      marker.position.y = 2.5 + Math.sin(this.time * 3 + index) * 0.08;
    });
    // Items bob over the counter; sold ones sink, greyed.
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
      icon.position.y = sold ? 1.45 : 1.9 + Math.sin(this.time * 2 + index) * 0.1;
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
