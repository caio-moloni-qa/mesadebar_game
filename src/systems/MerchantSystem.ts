import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH, WORLD_SIZE } from '../config/gameConfig';
import { FAMILY_LABELS, WEAPONS, WeaponFamily, weaponFamily } from '../config/weapons';
import { CurrencyGem } from '../entities/CurrencyGem';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SoulProjectile } from '../entities/SoulProjectile';

type MerchantPathType = 'straight' | 'zigzag' | 'curve';
const MERCHANT_PATH_TYPES: MerchantPathType[] = ['straight', 'zigzag', 'curve'];

interface MerchantItemOption { id: string; name: string; cost: number; apply?: (player: Player) => void; }
const MERCHANT_AFFINITY_TOME_OPTION: MerchantItemOption = { id: 'affinity-tome', name: 'Tomo de Afinidade', cost: 500 };
/** Falls back into the affinity-tome slot once the player already owns every family — there's nothing left to unlock. */
const MERCHANT_FALLBACK_ITEM_OPTION: MerchantItemOption = { id: 'max-health', name: 'Elixir de Vitalidade', cost: 25, apply: (player) => { player.maxHealth += 20; player.heal(20); } };
/** Pool for the random-buff slot — one is picked (33% each) per merchant visit and re-priced to MERCHANT_RANDOM_BUFF_COST. */
const MERCHANT_BASE_ITEM_OPTIONS: MerchantItemOption[] = [
  { id: 'heal', name: 'Poção de Cura', cost: 0, apply: (player) => player.heal(40) },
  { id: 'damage', name: 'Lâmina Afiada', cost: 0, apply: (player) => { player.damageMultiplier += 0.15; } },
  { id: 'speed', name: 'Botas Ligeiras', cost: 0, apply: (player) => { player.movementSpeed += 15; } }
];
const MERCHANT_RANDOM_BUFF_COST = 100;
const MERCHANT_DIVINE_BLESSING_OPTION: MerchantItemOption = { id: 'divine-blessing', name: 'Bênção Divina', cost: 350, apply: (player) => player.addDivineBlessing() };
const MERCHANT_ARCANE_CURSE_OPTION: MerchantItemOption = { id: 'arcane-curse', name: 'Maldição Arcana', cost: 250, apply: (player) => player.addArcaneCurse() };
interface MerchantItemSlot { option: MerchantItemOption; position: Phaser.Math.Vector2; purchased: boolean; marker: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text; }

const MERCHANT_PORTAL_INTERVAL_MS = 10000;
const MERCHANT_PORTAL_OPEN_MS = 20000;
const MERCHANT_PATH_LENGTH = 740;
const MERCHANT_PATH_WIDTH = 160;
const MERCHANT_ROOM_SIZE = 480;

/** Everything MerchantSystem needs from GameScene, exposed narrowly so the two stay decoupled. */
export interface MerchantHost {
  scene: Phaser.Scene;
  getPlayer(): Player;
  getKeys(): Record<string, Phaser.Input.Keyboard.Key>;
  getEnemies(): Phaser.Physics.Arcade.Group;
  getProjectiles(): Phaser.Physics.Arcade.Group;
  getSoulProjectiles(): Phaser.Physics.Arcade.Group;
  getGems(): Phaser.Physics.Arcade.Group;
  getCurrency(): number;
  spendCurrency(amount: number): void;
  getAffinityFamilies(): Set<WeaponFamily>;
  addAffinityFamily(family: WeaponFamily): void;
  isMerchantEnabled(): boolean;
  isBossEncounterActive(): boolean;
  setLevelPending(value: boolean): void;
}

/** Portal spawning, the merchant excursion (path/room/shop) and its shop interactions. Owns all merchant-only state. */
export class MerchantSystem {
  private merchantElapsed = 0;
  private merchantPortalActive = false;
  private merchantPortalExpiresAt = 0;
  private readonly merchantPortalPosition = new Phaser.Math.Vector2();
  private readonly merchantPortalDirection = new Phaser.Math.Vector2();
  private merchantPortalVisual?: Phaser.GameObjects.Arc;
  private merchantArrow?: Phaser.GameObjects.Container;
  private merchantPrompt?: Phaser.GameObjects.Text;
  private merchantOverlay: Phaser.GameObjects.GameObject[] = [];
  private merchantAreaVisuals: Phaser.GameObjects.GameObject[] = [];
  private inMerchant = false;
  private readonly merchantReturnPosition = new Phaser.Math.Vector2();
  private readonly merchantRoomCenter = new Phaser.Math.Vector2();
  private merchantPathType: MerchantPathType = 'straight';
  private readonly merchantRoomEntrance = new Phaser.Math.Vector2();
  private readonly merchantNpcPosition = new Phaser.Math.Vector2();
  private merchantItemSlots: MerchantItemSlot[] = [];
  private merchantColliders: Phaser.Physics.Arcade.Collider[] = [];

  constructor(private readonly host: MerchantHost) {}

  reset(): void {
    this.merchantElapsed = 0;
    this.merchantPortalActive = false;
    this.merchantPortalExpiresAt = 0;
    this.merchantPortalVisual = undefined;
    this.merchantArrow = undefined;
    this.merchantPrompt = undefined;
    this.merchantOverlay = [];
    this.merchantAreaVisuals = [];
    this.inMerchant = false;
    this.merchantItemSlots = [];
    this.merchantColliders = [];
  }

  isInMerchant(): boolean {
    return this.inMerchant;
  }

  /** Called every frame GameScene is NOT already inside the merchant room. */
  update(delta: number): void {
    if (!this.host.isMerchantEnabled() || this.host.isBossEncounterActive()) { this.closeMerchantPortal(); return; }
    if (this.merchantPortalActive) {
      if (this.host.scene.time.now >= this.merchantPortalExpiresAt) { this.closeMerchantPortal(); return; }
      this.updateMerchantArrow();
      this.updateMerchantApproachPrompt();
      return;
    }
    this.merchantElapsed += delta;
    if (this.merchantElapsed < MERCHANT_PORTAL_INTERVAL_MS) return;
    this.merchantElapsed = 0;
    this.openMerchantPortal();
  }

  /** Called every frame GameScene IS inside the merchant room. */
  updateInteraction(): void {
    const player = this.host.getPlayer();
    const exitDistance = Phaser.Math.Distance.Between(player.x, player.y, this.merchantRoomEntrance.x, this.merchantRoomEntrance.y);
    if (exitDistance <= 90) {
      this.setMerchantPrompt(this.merchantRoomEntrance.x, this.merchantRoomEntrance.y - 60, 'Pressione E para voltar à arena');
      if (Phaser.Input.Keyboard.JustDown(this.host.getKeys().E)) this.leaveMerchant();
      return;
    }
    const merchantDistance = Phaser.Math.Distance.Between(player.x, player.y, this.merchantNpcPosition.x, this.merchantNpcPosition.y);
    if (merchantDistance <= 80) {
      this.setMerchantPrompt(this.merchantNpcPosition.x, this.merchantNpcPosition.y - 60, 'Comerciante (em breve)');
      return;
    }
    const nearestSlot = this.merchantItemSlots.find((slot) => !slot.purchased && Phaser.Math.Distance.Between(player.x, player.y, slot.position.x, slot.position.y) <= 70);
    if (nearestSlot) {
      const canAfford = this.host.getCurrency() >= nearestSlot.option.cost;
      const suffix = canAfford ? '(E para comprar)' : '(moedas insuficientes)';
      this.setMerchantPrompt(nearestSlot.position.x, nearestSlot.position.y - 60, `${nearestSlot.option.name} — ${nearestSlot.option.cost} moedas ${suffix}`);
      if (canAfford && Phaser.Input.Keyboard.JustDown(this.host.getKeys().E)) this.purchaseMerchantItem(nearestSlot);
      return;
    }
    this.destroyMerchantPrompt();
  }

  private openMerchantPortal(): void {
    const scene = this.host.scene;
    const side = Phaser.Math.Between(0, 3);
    const edge = 40;
    const along = Phaser.Math.Between(420, WORLD_SIZE - 420);
    if (side === 0) { this.merchantPortalPosition.set(along, edge); this.merchantPortalDirection.set(0, -1); }
    else if (side === 1) { this.merchantPortalPosition.set(along, WORLD_SIZE - edge); this.merchantPortalDirection.set(0, 1); }
    else if (side === 2) { this.merchantPortalPosition.set(edge, along); this.merchantPortalDirection.set(-1, 0); }
    else { this.merchantPortalPosition.set(WORLD_SIZE - edge, along); this.merchantPortalDirection.set(1, 0); }
    this.merchantPathType = MERCHANT_PATH_TYPES[Phaser.Math.Between(0, MERCHANT_PATH_TYPES.length - 1)];
    this.merchantPortalActive = true;
    this.merchantPortalExpiresAt = scene.time.now + MERCHANT_PORTAL_OPEN_MS;
    this.merchantPortalVisual = scene.add.circle(this.merchantPortalPosition.x, this.merchantPortalPosition.y, 46, 0x8a5cf6, 0.5).setStrokeStyle(4, 0xffd868, 0.95).setDepth(9);
    scene.tweens.add({ targets: this.merchantPortalVisual, scale: 1.12, yoyo: true, repeat: -1, duration: 700 });
    this.ensureMerchantArrow();
  }
  private closeMerchantPortal(): void {
    if (!this.merchantPortalActive) return;
    this.merchantPortalActive = false;
    this.merchantElapsed = 0;
    this.merchantPortalVisual?.destroy();
    this.merchantPortalVisual = undefined;
    this.merchantArrow?.setVisible(false);
    this.destroyMerchantPrompt();
  }
  private ensureMerchantArrow(): void {
    if (this.merchantArrow) return;
    const scene = this.host.scene;
    const arrow = scene.add.graphics();
    arrow.fillStyle(0x2b1d00, 0.9);
    arrow.fillTriangle(25, 0, -15, -22, -9, 0);
    arrow.fillTriangle(25, 0, -15, 22, -9, 0);
    arrow.fillRect(-30, -7, 22, 14);
    arrow.fillStyle(0xffd868, 1);
    arrow.fillTriangle(18, 0, -11, -15, -7, 0);
    arrow.fillTriangle(18, 0, -11, 15, -7, 0);
    arrow.fillRect(-25, -4, 19, 8);
    this.merchantArrow = scene.add.container(0, 0, [arrow]).setScrollFactor(0).setDepth(44).setVisible(false);
  }
  private updateMerchantArrow(): void {
    if (!this.merchantArrow || !this.merchantPortalActive) { this.merchantArrow?.setVisible(false); return; }
    const scene = this.host.scene;
    const view = scene.cameras.main.worldView;
    const screenX = this.merchantPortalPosition.x - view.x;
    const screenY = this.merchantPortalPosition.y - view.y;
    const visible = screenX >= 0 && screenX <= GAME_WIDTH && screenY >= 0 && screenY <= GAME_HEIGHT;
    if (visible) { this.merchantArrow.setVisible(false); return; }
    const x = Phaser.Math.Clamp(screenX, 48, GAME_WIDTH - 48);
    const y = Phaser.Math.Clamp(screenY, 48, GAME_HEIGHT - 48);
    this.merchantArrow.setVisible(true).setPosition(x, y).setRotation(Phaser.Math.Angle.Between(GAME_WIDTH / 2, GAME_HEIGHT / 2, screenX, screenY));
  }
  private updateMerchantApproachPrompt(): void {
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    const distance = Phaser.Math.Distance.Between(player.x, player.y, this.merchantPortalPosition.x, this.merchantPortalPosition.y);
    const inRange = distance <= 90;
    if (inRange && !this.merchantPrompt) {
      this.merchantPrompt = scene.add.text(this.merchantPortalPosition.x, this.merchantPortalPosition.y - 70, 'Pressione E para entrar', { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#ffe29a', stroke: '#101015', strokeThickness: 4 }).setOrigin(0.5).setDepth(31);
    } else if (!inRange && this.merchantPrompt) {
      this.destroyMerchantPrompt();
    }
    if (inRange && Phaser.Input.Keyboard.JustDown(this.host.getKeys().E)) this.showMerchantEntryPrompt();
  }
  private destroyMerchantPrompt(): void {
    this.merchantPrompt?.destroy();
    this.merchantPrompt = undefined;
  }
  private showMerchantEntryPrompt(): void {
    const scene = this.host.scene;
    this.host.setLevelPending(true);
    scene.physics.pause();
    this.destroyMerchantPrompt();
    const veil = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090b12, 0.78).setScrollFactor(0).setDepth(30);
    const title = scene.add.text(GAME_WIDTH / 2, 280, 'Um portal misterioso surge à sua frente.\nDeseja entrar?', { fontFamily: TITLE_FONT_FAMILY, fontSize: '26px', color: '#ffe29a', align: 'center', stroke: '#101015', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this.merchantOverlay = [veil, title];
    this.merchantPromptButton('ENTRAR', 370, () => this.enterMerchantPortal());
    this.merchantPromptButton('CANCELAR', 435, () => {
      this.merchantOverlay.forEach((object) => object.destroy());
      this.merchantOverlay = [];
      this.host.setLevelPending(false);
      scene.physics.resume();
    });
  }
  private merchantPromptButton(label: string, y: number, action: () => void): void {
    const scene = this.host.scene;
    const button = scene.add.text(GAME_WIDTH / 2, y, label, { fontFamily: TITLE_FONT_FAMILY, fontSize: '22px', color: '#ffffff', backgroundColor: '#6b4db3', padding: { x: 24, y: 12 } }).setOrigin(0.5).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setStyle({ backgroundColor: '#896bd0' }));
    button.on('pointerout', () => button.setStyle({ backgroundColor: '#6b4db3' }));
    button.on('pointerup', action);
    this.merchantOverlay.push(button);
  }
  private enterMerchantPortal(): void {
    const scene = this.host.scene;
    const player = this.host.getPlayer();
    this.merchantOverlay.forEach((object) => object.destroy());
    this.merchantOverlay = [];
    const direction = this.merchantPortalDirection.clone();
    const pathStart = this.merchantPortalPosition.clone();
    const waypoints = this.computeMerchantWaypoints(pathStart, direction, this.merchantPathType);
    const pathEnd = waypoints[waypoints.length - 1];
    const finalDirection = new Phaser.Math.Vector2(pathEnd.x - waypoints[waypoints.length - 2].x, pathEnd.y - waypoints[waypoints.length - 2].y).normalize();
    this.merchantRoomCenter.copy(pathEnd.clone().add(finalDirection.clone().scale(MERCHANT_ROOM_SIZE / 2 + 20)));
    this.merchantRoomEntrance.copy(pathEnd);
    this.closeMerchantPortal();
    this.merchantReturnPosition.set(player.x, player.y);
    this.expandWorldBoundsForMerchant(waypoints);
    this.darkenMainArena();
    this.buildMerchantPath(waypoints);
    this.buildMerchantRoomGround();
    this.buildMerchantShop();
    this.freezeArenaEntities();
    player.setPosition(pathStart.x + direction.x * 20, pathStart.y + direction.y * 20);
    this.inMerchant = true;
    this.host.setLevelPending(false);
    scene.physics.resume();
  }
  private freezeArenaEntities(): void {
    this.host.getEnemies().children.each((child) => { const enemy = child as Enemy; if (enemy.active) { (enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0); enemy.setVisible(false); } return true; });
    this.host.getProjectiles().children.each((child) => { const projectile = child as Projectile; if (projectile.active) { (projectile.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0); projectile.setVisible(false); } return true; });
    this.host.getSoulProjectiles().children.each((child) => { const projectile = child as SoulProjectile; if (projectile.active) { (projectile.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0); projectile.setVisible(false); } return true; });
    this.host.getGems().children.each((child) => { const gem = child as CurrencyGem; if (gem.active) { (gem.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0); gem.setVisible(false); } return true; });
  }
  private unfreezeArenaEntities(): void {
    this.host.getEnemies().children.each((child) => { const enemy = child as Enemy; if (enemy.active) enemy.setVisible(true); return true; });
    this.host.getProjectiles().children.each((child) => { const projectile = child as Projectile; if (projectile.active) projectile.setVisible(true); return true; });
    this.host.getSoulProjectiles().children.each((child) => { const projectile = child as SoulProjectile; if (projectile.active) projectile.setVisible(true); return true; });
    this.host.getGems().children.each((child) => { const gem = child as CurrencyGem; if (gem.active) gem.setVisible(true); return true; });
  }
  private computeMerchantWaypoints(pathStart: Phaser.Math.Vector2, direction: Phaser.Math.Vector2, pathType: MerchantPathType): Phaser.Math.Vector2[] {
    const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x);
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    const along = (fraction: number) => direction.clone().scale(MERCHANT_PATH_LENGTH * fraction);
    const side = (amount: number) => perpendicular.clone().scale(amount * sideSign);
    if (pathType === 'zigzag') {
      const w0 = pathStart.clone();
      const w1 = w0.clone().add(along(0.3));
      const w2 = w1.clone().add(side(210));
      const w3 = w2.clone().add(along(0.4));
      const w4 = w3.clone().add(side(-210));
      const w5 = w4.clone().add(along(0.3));
      return [w0, w1, w2, w3, w4, w5];
    }
    if (pathType === 'curve') {
      const w0 = pathStart.clone();
      const w1 = w0.clone().add(along(0.5));
      const w2 = w1.clone().add(side(220));
      const w3 = w2.clone().add(along(0.5));
      return [w0, w1, w2, w3];
    }
    return [pathStart.clone(), pathStart.clone().add(along(1))];
  }
  private expandWorldBoundsForMerchant(waypoints: Phaser.Math.Vector2[]): void {
    const scene = this.host.scene;
    const pathPad = MERCHANT_PATH_WIDTH / 2 + 60;
    const roomPad = MERCHANT_ROOM_SIZE / 2 + 40;
    const xs = [0, WORLD_SIZE, ...waypoints.flatMap((point) => [point.x - pathPad, point.x + pathPad]), this.merchantRoomCenter.x - roomPad, this.merchantRoomCenter.x + roomPad];
    const ys = [0, WORLD_SIZE, ...waypoints.flatMap((point) => [point.y - pathPad, point.y + pathPad]), this.merchantRoomCenter.y - roomPad, this.merchantRoomCenter.y + roomPad];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    scene.physics.world.setBounds(minX, minY, maxX - minX, maxY - minY);
    scene.cameras.main.setBounds(minX, minY, maxX - minX, maxY - minY);
  }
  private darkenMainArena(): void {
    const dark = this.host.scene.add.rectangle(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0x000000, 0.92).setDepth(16);
    this.merchantAreaVisuals.push(dark);
  }
  private buildMerchantPath(waypoints: Phaser.Math.Vector2[]): void {
    for (let index = 0; index < waypoints.length - 1; index += 1) {
      const isFirst = index === 0;
      const isLast = index === waypoints.length - 2;
      this.buildMerchantPathSegment(waypoints[index], waypoints[index + 1], isFirst, isLast);
    }
    for (let index = 1; index < waypoints.length - 1; index += 1) {
      const joint = this.host.scene.add.circle(waypoints[index].x, waypoints[index].y, MERCHANT_PATH_WIDTH / 2, 0x3a3f3a, 1).setDepth(1);
      this.merchantAreaVisuals.push(joint);
    }
  }
  private buildMerchantPathSegment(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2, isFirst: boolean, isLast: boolean): void {
    const scene = this.host.scene;
    const length = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const ground = scene.add.rectangle(midX, midY, length, MERCHANT_PATH_WIDTH, 0x3a3f3a, 1).setRotation(angle).setDepth(1);
    const fogOverlay = scene.add.rectangle(midX, midY, length, MERCHANT_PATH_WIDTH, 0xdfe9f0, 0.22).setRotation(angle).setDepth(9);
    this.merchantAreaVisuals.push(ground, fogOverlay);
    const direction = new Phaser.Math.Vector2(to.x - from.x, to.y - from.y).normalize();
    const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x);
    // Trim walls back from interior joints (by the joint clearance-circle radius) so a
    // segment's wall never cuts across the ground the next segment considers walkable.
    const jointClearance = MERCHANT_PATH_WIDTH / 2;
    const trimStart = isFirst ? 0 : jointClearance;
    const trimEnd = isLast ? 0 : jointClearance;
    const wallLength = length - trimStart - trimEnd;
    if (wallLength > 0) {
      const wallMid = new Phaser.Math.Vector2(from.x, from.y).add(direction.clone().scale(trimStart + wallLength / 2));
      const isHorizontal = Math.abs(from.y - to.y) < 0.01;
      const wallThickness = 20;
      const wallOffset = MERCHANT_PATH_WIDTH / 2 + wallThickness / 2;
      if (isHorizontal) {
        this.buildMerchantWallRect(wallMid.x, wallMid.y - wallOffset, wallLength, wallThickness);
        this.buildMerchantWallRect(wallMid.x, wallMid.y + wallOffset, wallLength, wallThickness);
      } else {
        this.buildMerchantWallRect(wallMid.x - wallOffset, wallMid.y, wallThickness, wallLength);
        this.buildMerchantWallRect(wallMid.x + wallOffset, wallMid.y, wallThickness, wallLength);
      }
    }
    const treeCount = Math.max(2, Math.floor(length / 140));
    for (let index = 0; index < treeCount; index += 1) {
      const t = (index + 0.5) / treeCount;
      const point = new Phaser.Math.Vector2(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      const side = index % 2 === 0 ? 1 : -1;
      const offset = perpendicular.clone().scale(side * (MERCHANT_PATH_WIDTH / 2 + 30 + Phaser.Math.Between(0, 20)));
      this.merchantAreaVisuals.push(this.drawDeadTree(point.x + offset.x, point.y + offset.y));
    }
  }
  private buildMerchantWallRect(x: number, y: number, width: number, height: number): void {
    const scene = this.host.scene;
    const wall = scene.add.rectangle(x, y, width, height, 0x000000, 0).setDepth(1);
    scene.physics.add.existing(wall, true);
    (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(width, height);
    this.merchantAreaVisuals.push(wall);
    this.merchantColliders.push(scene.physics.add.collider(this.host.getPlayer(), wall));
  }
  private drawDeadTree(x: number, y: number): Phaser.GameObjects.Graphics {
    const tree = this.host.scene.add.graphics({ x, y }).setDepth(2);
    tree.lineStyle(4, 0x2c2620, 1);
    tree.beginPath();
    tree.moveTo(0, 20);
    tree.lineTo(0, -20);
    tree.moveTo(0, -10);
    tree.lineTo(-14, -26);
    tree.moveTo(0, -4);
    tree.lineTo(13, -20);
    tree.moveTo(0, -18);
    tree.lineTo(-10, -34);
    tree.strokePath();
    return tree;
  }
  private buildMerchantRoomGround(): void {
    const scene = this.host.scene;
    const ground = scene.add.rectangle(this.merchantRoomCenter.x, this.merchantRoomCenter.y, MERCHANT_ROOM_SIZE, MERCHANT_ROOM_SIZE, 0x241a30, 1).setDepth(1);
    const border = scene.add.rectangle(this.merchantRoomCenter.x, this.merchantRoomCenter.y, MERCHANT_ROOM_SIZE, MERCHANT_ROOM_SIZE).setStrokeStyle(4, 0xa888d9, 0.8).setDepth(9);
    this.merchantAreaVisuals.push(ground, border);
    this.buildMerchantRoomWalls();
  }
  private nearestRoomEdge(point: Phaser.Math.Vector2): 'left' | 'right' | 'top' | 'bottom' {
    const half = MERCHANT_ROOM_SIZE / 2;
    const distances = {
      left: Math.abs(point.x - (this.merchantRoomCenter.x - half)),
      right: Math.abs(point.x - (this.merchantRoomCenter.x + half)),
      top: Math.abs(point.y - (this.merchantRoomCenter.y - half)),
      bottom: Math.abs(point.y - (this.merchantRoomCenter.y + half))
    };
    return (Object.keys(distances) as Array<'left' | 'right' | 'top' | 'bottom'>).reduce((a, b) => (distances[a] <= distances[b] ? a : b));
  }
  private buildMerchantRoomWalls(): void {
    const half = MERCHANT_ROOM_SIZE / 2;
    const cx = this.merchantRoomCenter.x;
    const cy = this.merchantRoomCenter.y;
    const openEdge = this.nearestRoomEdge(this.merchantRoomEntrance);
    const thickness = 20;
    if (openEdge !== 'top') this.buildMerchantWallRect(cx, cy - half - thickness / 2, MERCHANT_ROOM_SIZE, thickness);
    if (openEdge !== 'bottom') this.buildMerchantWallRect(cx, cy + half + thickness / 2, MERCHANT_ROOM_SIZE, thickness);
    if (openEdge !== 'left') this.buildMerchantWallRect(cx - half - thickness / 2, cy, thickness, MERCHANT_ROOM_SIZE);
    if (openEdge !== 'right') this.buildMerchantWallRect(cx + half + thickness / 2, cy, thickness, MERCHANT_ROOM_SIZE);
  }
  private buildMerchantShop(): void {
    const scene = this.host.scene;
    this.merchantNpcPosition.set(this.merchantRoomCenter.x - 140, this.merchantRoomCenter.y - 20);
    const npc = scene.add.circle(this.merchantNpcPosition.x, this.merchantNpcPosition.y, 26, 0xf5c542, 1).setStrokeStyle(3, 0x8a6a10, 1).setDepth(3);
    const npcLabel = scene.add.text(this.merchantNpcPosition.x, this.merchantNpcPosition.y + 40, 'Comerciante', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#ffe29a', stroke: '#101015', strokeThickness: 3 }).setOrigin(0.5).setDepth(3);
    this.merchantAreaVisuals.push(npc, npcLabel);

    const tableX = this.merchantRoomCenter.x - 40;
    const tableY = this.merchantRoomCenter.y;
    const tableWidth = 44;
    const tableHeight = 260;
    const table = scene.add.rectangle(tableX, tableY, tableWidth, tableHeight, 0xf2a8c8, 1).setStrokeStyle(3, 0xb05f86, 1).setDepth(3);
    scene.physics.add.existing(table, true);
    (table.body as Phaser.Physics.Arcade.StaticBody).setSize(tableWidth, tableHeight);
    this.merchantAreaVisuals.push(table);
    this.merchantColliders.push(scene.physics.add.collider(this.host.getPlayer(), table));

    const affinityOption = this.availableAffinityFamilies().length > 0 ? MERCHANT_AFFINITY_TOME_OPTION : MERCHANT_FALLBACK_ITEM_OPTION;
    const randomBuffBase = MERCHANT_BASE_ITEM_OPTIONS[Math.floor(Math.random() * MERCHANT_BASE_ITEM_OPTIONS.length)];
    const randomBuffOption: MerchantItemOption = { ...randomBuffBase, cost: MERCHANT_RANDOM_BUFF_COST };
    const itemOptions: MerchantItemOption[] = [MERCHANT_DIVINE_BLESSING_OPTION, MERCHANT_ARCANE_CURSE_OPTION, randomBuffOption, affinityOption];
    this.merchantItemSlots = itemOptions.map((option, index) => {
      const x = this.merchantRoomCenter.x + 150;
      const y = this.merchantRoomCenter.y - 150 + index * 100;
      const marker = scene.add.circle(x, y, 22, 0x4fae5c, 1).setStrokeStyle(3, 0x2c6b34, 1).setDepth(3);
      const label = scene.add.text(x, y + 36, `${option.name}\n${option.cost} moedas`, { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#eafbea', align: 'center', stroke: '#0d1a0d', strokeThickness: 3 }).setOrigin(0.5).setDepth(3);
      this.merchantAreaVisuals.push(marker, label);
      return { option, position: new Phaser.Math.Vector2(x, y), purchased: false, marker, label };
    });
  }
  private setMerchantPrompt(x: number, y: number, text: string): void {
    if (!this.merchantPrompt) {
      this.merchantPrompt = this.host.scene.add.text(0, 0, '', { fontFamily: TITLE_FONT_FAMILY, fontSize: '16px', color: '#ffe29a', align: 'center', stroke: '#101015', strokeThickness: 4 }).setOrigin(0.5).setDepth(31);
    }
    this.merchantPrompt.setPosition(x, y).setText(text);
  }
  private availableAffinityFamilies(): WeaponFamily[] {
    const owned = this.host.getAffinityFamilies();
    return Object.values(WEAPONS).map(weaponFamily).filter((family, index, all) => all.indexOf(family) === index && !owned.has(family));
  }
  private purchaseMerchantItem(slot: MerchantItemSlot): void {
    if (slot.purchased || this.host.getCurrency() < slot.option.cost) return;
    this.host.spendCurrency(slot.option.cost);
    slot.purchased = true;
    slot.marker.setFillStyle(0x555555, 0.6);
    slot.label.setText(`${slot.option.name}\n(comprado)`);
    this.destroyMerchantPrompt();
    if (slot.option.id === 'affinity-tome') { this.openAffinityTomeChoice(); return; }
    slot.option.apply?.(this.host.getPlayer());
  }
  private openAffinityTomeChoice(): void {
    const scene = this.host.scene;
    this.host.setLevelPending(true);
    scene.physics.pause();
    const families = this.availableAffinityFamilies();
    const veil = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090b12, 0.84).setScrollFactor(0).setDepth(30);
    const title = scene.add.text(GAME_WIDTH / 2, 190, 'Tomo de Afinidade: escolha a família de arma', { fontFamily: TITLE_FONT_FAMILY, fontSize: '28px', color: '#ffe29a', align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this.merchantOverlay = [veil, title];
    const spacing = 260;
    const startX = GAME_WIDTH / 2 - (spacing * (families.length - 1)) / 2;
    families.forEach((family, index) => this.affinityFamilyCard(family, startX + index * spacing));
  }
  private affinityFamilyCard(family: WeaponFamily, x: number): void {
    const scene = this.host.scene;
    const representative = Object.values(WEAPONS).find((weapon) => weaponFamily(weapon) === family)!;
    const label = FAMILY_LABELS[family];
    const card = scene.add.rectangle(x, 410, 220, 240, 0x6b4d10, 1).setStrokeStyle(3, 0xffd868, 0.95).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true });
    const banner = scene.add.text(x, 314, label, { fontFamily: TITLE_FONT_FAMILY, fontSize: '14px', color: '#3a2400', backgroundColor: '#ffd868', padding: { x: 8, y: 3 } }).setOrigin(0.5).setScrollFactor(0).setDepth(33);
    const icon = scene.add.image(x, 360, `weapon-${representative.id}-icon`).setDisplaySize(64, 64).setScrollFactor(0).setDepth(32);
    const name = scene.add.text(x, 415, `Afinidade ${label}`, { fontFamily: TITLE_FONT_FAMILY, fontSize: '18px', color: '#fff3d2', align: 'center', wordWrap: { width: 190 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    const description = scene.add.text(x, 470, `Desbloqueia as melhorias de armas ${label.toLowerCase()} que você já possui ou vier a possuir`, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#fff0d2', align: 'center', wordWrap: { width: 190 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    this.merchantOverlay.push(card, banner, icon, name, description);
    card.on('pointerover', () => card.setFillStyle(0x86611a));
    card.on('pointerout', () => card.setFillStyle(0x6b4d10));
    card.on('pointerup', () => this.confirmAffinityChoice(family));
  }
  private confirmAffinityChoice(family: WeaponFamily): void {
    this.host.addAffinityFamily(family);
    this.merchantOverlay.forEach((object) => object.destroy());
    this.merchantOverlay = [];
    this.host.setLevelPending(false);
    this.host.scene.physics.resume();
  }
  private leaveMerchant(): void {
    const scene = this.host.scene;
    this.destroyMerchantPrompt();
    this.merchantColliders.forEach((collider) => collider.destroy());
    this.merchantColliders = [];
    this.merchantAreaVisuals.forEach((object) => object.destroy());
    this.merchantAreaVisuals = [];
    this.merchantItemSlots = [];
    scene.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    scene.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.host.getPlayer().setPosition(this.merchantReturnPosition.x, this.merchantReturnPosition.y);
    this.unfreezeArenaEntities();
    this.inMerchant = false;
  }
}
