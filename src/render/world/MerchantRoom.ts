import * as THREE from 'three';
import { MERCHANT_ROOM, MERCHANT_TUNING, MerchantSystem } from '../../core/systems/MerchantSystem';
import { QuestStatus, QuestSystem } from '../../core/systems/QuestSystem';
import type { CharacterId } from '../../config/characters';
import { importedHeroRig } from '../models/heroes';
import { toonMaterial } from '../materials';
import { humanoidClips } from '../models/clips';
import { buildRoomDecor } from './roomDecor';
import { RoomAmbience } from './RoomAmbience';
import { MerchantPortal } from './MerchantPortal';
import { PartSpec, REGULAR_FIGURES, REGULAR_FIGURE_LOOK, RegularFigureId } from '../models/regulars';
import { buildRiggedModel, clipForBones, humanoidBones } from '../models/rig';
import { WORLD_SCALE, simToWorld } from '../space';
import { CHARACTER_LAYER } from '../PixelPipeline';


const HIP = 0.82;

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

/** A tavern figure idling: their imported mesh when it's loaded, otherwise the procedural one (with what they hold). */
function figure(id: RegularFigureId): Character {
  const look = REGULAR_FIGURE_LOOK[id];
  const imported = importedHeroRig(id as CharacterId, toonMaterial({ vertexColors: true, flatShading: true }));
  if (!imported) return rigged(REGULAR_FIGURES[id](true), look.scale, look.phase);
  const mixer = new THREE.AnimationMixer(imported.model.root);
  const idle = mixer.clipAction(imported.clips.idle);
  idle.time = look.phase * idle.getClip().duration;
  idle.play();
  return { root: imported.model.root, mixer };
}

/** "!" (mission on offer), "?" (come claim it), "…" (under way) over a regular's head. */
function markerTexture(symbol: string, background: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  // A dark enamel quest badge, with a bright metal rim and an oversized glyph.
  // Draw at high resolution; the character pass keeps the silhouette readable in-game.
  context.shadowColor = '#100b08';
  context.shadowBlur = 12;
  context.shadowOffsetY = 6;
  context.beginPath();
  context.moveTo(128, 15);
  context.lineTo(222, 63);
  context.lineTo(222, 170);
  context.lineTo(128, 235);
  context.lineTo(34, 170);
  context.lineTo(34, 63);
  context.closePath();
  context.fillStyle = '#21150e';
  context.fill();
  context.shadowBlur = context.shadowOffsetY = 0;
  context.lineWidth = 10;
  context.strokeStyle = background;
  context.stroke();
  context.lineWidth = 2;
  context.strokeStyle = '#fff2bc';
  context.stroke();
  const ink = context.createLinearGradient(0, 50, 0, 195);
  ink.addColorStop(0, '#fff8da');
  ink.addColorStop(1, background);
  context.fillStyle = ink;
  if (symbol === '!') {
    // Custom silhouette avoids thin serif strokes and font-dependent rendering.
    context.beginPath();
    context.moveTo(106, 57);
    context.lineTo(150, 57);
    context.lineTo(143, 143);
    context.lineTo(113, 143);
    context.closePath();
    context.fill();
    context.beginPath();
    context.arc(128, 176, 18, 0, Math.PI * 2);
    context.fill();
  } else {
    context.font = '900 160px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbol, 128, 132);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** The tavern behind Sergio's portal (a plank floor and stone walls with a gap for the exit portal, the bar down the
 *  west side with his items over it and bottles behind him, a fireplace, the regulars at their tables), plus the
 *  portal that opens on the arena. Lives in the same scene as the arena, far outside it — the arena's land is hidden
 *  while you're in here. */
export class MerchantRoom {
  readonly root = new THREE.Group();
  readonly characters = new THREE.Group();
  readonly questMarkers = new THREE.Group();
  private readonly arenaPortal = new MerchantPortal();
  private readonly exitPortal = new MerchantPortal();
  /** Sergio behind his bar, or the Esquimó in his igloo. */
  private readonly sergio: Character;
  /** The area's regulars, in table order. */
  private readonly regulars: Character[];
  private readonly markers: THREE.Sprite[] = [];
  private readonly markerTextures: Record<Exclude<QuestStatus, 'done'>, THREE.Texture> = {
    offer: markerTexture('!', '#ffd25a'),
    ready: markerTexture('?', '#7dffa0'),
    active: markerTexture('…', '#b9b2a6')
  };
  private readonly fireLight: THREE.PointLight;
  private readonly flames: THREE.Mesh[];
  /** Dust or snow in the air, embers off the fire (the pixel pipeline skips its glows in the normal pass). */
  readonly ambience: RoomAmbience;
  private time = 0;

  constructor(private readonly system: MerchantSystem, private readonly quests: QuestSystem) {
    this.sergio = figure(system.igloo ? 'eskimo' : 'sergio');
    this.regulars = quests.quests.map((quest) => figure(quest.npc.id as RegularFigureId));
    const center = simToWorld(system.room.x, system.room.y, 0, new THREE.Vector3());
    const room = new THREE.Group();
    room.add(this.questMarkers);
    room.position.copy(center);
    const { flames, fireLight } = buildRoomDecor(room, system.igloo);
    this.flames = flames;
    this.fireLight = fireLight;
    const at = (x: number, y: number, height = 0) => new THREE.Vector3(x * WORLD_SCALE, height, y * WORLD_SCALE);
    const { layout } = system;
    this.ambience = new RoomAmbience({ half: (MERCHANT_ROOM.size * WORLD_SCALE) / 2, fire: at(layout.fireplace.x, layout.fireplace.y), door: at(MERCHANT_ROOM.exit.x, MERCHANT_ROOM.exit.y) }, system.igloo);
    room.add(this.ambience.root);

    this.exitPortal.position.copy(at(MERCHANT_ROOM.exit.x, MERCHANT_ROOM.exit.y));
    // The doorway belongs to the north wall (X/Y plane), rather than facing the camera.
    // Its threshold must follow the wall's diagonal in the isometric view.
    this.exitPortal.rotation.y = 0;
    room.add(this.exitPortal);

    // Sergio faces the spot you talk to him from, across his bar; the regulars face the island over their tables
    // (west, in the igloo).
    const facing = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.x - from.x, to.y - from.y);
    this.sergio.root.position.copy(at(layout.merchant.x, layout.merchant.y).add(center));
    this.sergio.root.rotation.y = facing(layout.merchant, layout.sergioSpot);
    this.characters.add(this.sergio.root);
    this.regulars.forEach((regular, index) => {
      const spot = layout.npcs[index];
      // Regulars who joined your roster have left the bar.
      regular.root.visible = !system.away.has(index);
      regular.root.position.copy(at(spot.x, spot.y).add(center));
      regular.root.rotation.y = layout.island ? facing(spot, layout.island) : -Math.PI / 2;
      this.characters.add(regular.root);
      // The composite needs sprite depth, too; alphaTest keeps the transparent corners out of it.
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.2, depthWrite: true, toneMapped: false, fog: false }));
      // Only draw in the finer character pass, avoiding a second coarse world copy.
      marker.layers.set(CHARACTER_LAYER);
      marker.scale.setScalar(1.05);
      marker.position.copy(at(spot.x, spot.y, 2.9));
      this.questMarkers.add(marker);
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
    this.arenaPortal.animate(this.time);
    this.exitPortal.animate(this.time);
    if (!system.inside) return;
    this.sergio.mixer.update(deltaSeconds);
    this.regulars.forEach((regular) => regular.mixer.update(deltaSeconds));
    this.ambience.update(deltaSeconds);
    // The fire breathes.
    this.fireLight.intensity = 18 + Math.sin(this.time * 9) * 3 + Math.sin(this.time * 23) * 2;
    this.flames.forEach((flame, index) => flame.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(this.time * (7 + index * 2) + index)), 1));
    this.quests.quests.forEach((quest, index) => {
      const marker = this.markers[index];
      marker.visible = quest.status !== 'done' && !system.away.has(index);
      if (quest.status === 'done' || !marker.visible) return;
      const texture = this.markerTextures[quest.status];
      if (marker.material.map !== texture) {
        marker.material.map = texture;
        marker.material.needsUpdate = true;
      }
      const emphasis = quest.status === 'active' ? 0.78 : 1.05;
      marker.scale.setScalar(emphasis);
      marker.position.y = 2.9 + Math.sin(this.time * 2.4 + index) * 0.06;
    });
  }
}
