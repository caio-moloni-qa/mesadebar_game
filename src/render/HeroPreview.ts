import * as THREE from 'three';
import { SkinId } from '../core/progress/Progress';
import { CharacterId } from '../config/characters';
import { WeaponConfig } from '../config/weapons';
import { HeroClipName } from './models/clips';
import { HeroModel, attachWeapons, createHeroModel } from './models/heroes';

/** A locked hero: one flat dark shape (shared, never disposed with a model). */
const SILHOUETTE = new THREE.MeshBasicMaterial({ color: 0x0b0a12 });
const ATTACKS: Record<WeaponConfig['id'], HeroClipName> = { staff: 'cast', sword: 'swing', whip: 'lash', boomerang: 'throw', amulet: 'pulse', hammer: 'slam', bow: 'shoot', coins: 'toss', crystal: 'pulse', pack: 'hurl' };

/** One lazily-created preview renderer and one active hero, reused by every menu screen.
 * Uses the game's real imported meshes, rigs, clips and weapons. Driven by Game3D's existing frame loop.
 */
export class HeroPreview {
  private readonly renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  private readonly pedestal: THREE.Mesh;
  private readonly rim: THREE.Mesh;
  private readonly key: THREE.DirectionalLight;
  private model: HeroModel | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private characterId: CharacterId | null = null;
  private skin: SkinId = 'base';
  private weaponId: WeaponConfig['id'] = 'sword';
  private host: HTMLElement | null = null;
  private elapsed = 0;
  private frameTime = 0;
  private yaw = -.22;
  private pointer: { id: number; x: number } | null = null;
  private width = 0;
  private height = 0;
  private modelHeight = 2.4;
  private modelWidth = 2;
  private manualAnimation = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  private silhouette = false;

  constructor() {
    const canvas = this.renderer.domElement;
    canvas.className = 'hero-preview-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(new THREE.HemisphereLight(0xd4e7ee, 0x394739, 2.2));
    this.key = new THREE.DirectionalLight(0xffe1af, 2.7);
    this.key.position.set(-3, 5, 5); this.key.castShadow = true;
    this.key.shadow.mapSize.set(512, 512); this.key.shadow.camera.left = -3; this.key.shadow.camera.right = 3;
    this.key.shadow.camera.top = 4; this.key.shadow.camera.bottom = -2; this.key.shadow.camera.far = 15;
    this.key.shadow.normalBias = .025; this.key.shadow.bias = -.0004;
    this.scene.add(this.key, this.key.target);
    const rimLight = new THREE.DirectionalLight(0x8dc8c3, 1.6); rimLight.position.set(3, 3, -3); this.scene.add(rimLight);
    this.pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, .16, 48), new THREE.MeshStandardMaterial({ color: 0x283936, roughness: .85, metalness: .15 }));
    this.pedestal.position.y = -.08; this.pedestal.receiveShadow = true;
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, .018, 5, 64), new THREE.MeshStandardMaterial({ color: 0xb79c64, emissive: 0x352a12, roughness: .45, metalness: .55 }));
    this.rim.rotation.x = Math.PI / 2; this.rim.position.y = .008;
    this.scene.add(this.pedestal, this.rim);
    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary) return;
      this.pointer = { id: event.pointerId, x: event.clientX };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', event => {
      if (this.pointer?.id !== event.pointerId) return;
      this.yaw += (event.clientX - this.pointer.x) * .012;
      this.pointer.x = event.clientX;
    });
    const release = (event: PointerEvent) => {
      if (this.pointer?.id !== event.pointerId) return;
      this.pointer = null; canvas.classList.remove('dragging');
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
  }

  mount(host: HTMLElement, characterId: CharacterId, weaponId: WeaponConfig['id'], skin: SkinId = 'base', silhouette = false): void {
    this.host = host;
    host.append(this.renderer.domElement);
    this.setCharacter(characterId, weaponId, skin, silhouette);
    this.width = 0;
  }

  /** `silhouette`: a hero not unlocked yet shows only as a dark shape. */
  setCharacter(characterId: CharacterId, weaponId: WeaponConfig['id'], skin: SkinId = this.skin, silhouette = false): void {
    if (this.characterId === characterId && this.model && this.skin === skin && this.silhouette === silhouette) {
      if (this.weaponId !== weaponId) {
        this.weaponId = weaponId; attachWeapons(this.model, [weaponId]); this.measure(); this.width = 0;
      }
      return;
    }
    this.clearModel();
    this.characterId = characterId; this.weaponId = weaponId; this.skin = skin; this.silhouette = silhouette;
    this.model = createHeroModel(characterId, weaponId, skin);
    if (silhouette) this.model.root.traverse((child) => { if (child instanceof THREE.Mesh) child.material = SILHOUETTE; });
    this.scene.add(this.model.root);
    this.mixer = new THREE.AnimationMixer(this.model.root);
    this.mixer.clipAction(this.model.clips.idle).play();
    this.mixer.update(0);
    this.yaw = -.22; this.elapsed = 0;
    this.measure(); this.width = 0;
  }

  private measure(): void {
    if (!this.model) return;
    this.model.root.rotation.y = 0; this.model.root.position.y = 0;
    this.model.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.model.root, true);
    const size = bounds.getSize(new THREE.Vector3());
    this.modelHeight = Math.max(1.6, size.y); this.modelWidth = Math.max(2.2, size.x);
    this.model.root.position.y = -bounds.min.y + .015;
  }

  rotate(direction: number): void { this.yaw += direction * Math.PI / 6; }

  attack(): void {
    if (!this.model || !this.mixer) return;
    const action = this.mixer.clipAction(this.model.clips[ATTACKS[this.weaponId]]);
    action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play();
    this.manualAnimation = action.getClip().duration + .1;
  }

  /** Cap the preview at 30 fps; hidden or detached screens allocate no new frames. */
  update(deltaSeconds: number): void {
    if (!this.host?.isConnected || !this.model || document.hidden) return;
    this.frameTime += deltaSeconds;
    if (this.frameTime < 1 / 30) return;
    const dt = Math.min(.1, this.frameTime); this.frameTime = 0;
    this.elapsed += dt;
    if (!this.reducedMotion.matches || this.manualAnimation > 0) this.mixer?.update(dt);
    this.manualAnimation = Math.max(0, this.manualAnimation - dt);
    this.model.root.rotation.y = this.yaw + (this.pointer || this.reducedMotion.matches ? 0 : Math.sin(this.elapsed * .65) * .065);
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      this.renderer.setSize(width, height, false);
      const aspect = width / height;
      const half = Math.max(this.modelHeight * .68, this.modelWidth * .68 / aspect, 1.5);
      this.camera.left = -half * aspect; this.camera.right = half * aspect; this.camera.top = half; this.camera.bottom = -half;
      this.camera.position.set(3.6, this.modelHeight * .65 + 1.4, 7);
      this.camera.lookAt(0, this.modelHeight * .46, 0); this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Drop session-specific models while keeping the single renderer for the next menu visit. */
  unmount(): void {
    this.host = null; this.pointer = null;
    this.renderer.domElement.remove(); this.clearModel();
  }

  private clearModel(): void {
    if (!this.model) return;
    this.mixer?.stopAllAction(); this.mixer?.uncacheRoot(this.model.root);
    this.model.root.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    this.model.root.removeFromParent(); this.model.material.dispose();
    this.model = null; this.mixer = null; this.characterId = null;
  }
}
