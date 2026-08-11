import Phaser from 'phaser';
import { FONT_FAMILY, TITLE_FONT_FAMILY } from '../config/fonts';
import { GAME_HEIGHT, GAME_WIDTH, WORLD_SIZE } from '../config/gameConfig';
import { FAMILY_LABELS, WEAPONS, WeaponFamily, weaponFamily } from '../config/weapons';
import { CurrencyGem } from '../entities/CurrencyGem';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SoulProjectile } from '../entities/SoulProjectile';

interface MerchantItemOption { id: string; name: string; cost: number; icon: string; description: string; apply?: (player: Player) => void; }
const MERCHANT_AFFINITY_TOME_OPTION: MerchantItemOption = { id: 'affinity-tome', name: 'Tomo de Afinidade', cost: 150, icon: 'merchant-affinity-tome-icon', description: 'Escolha uma família de arma para desbloquear afinidade com ela.' };
/** Falls back into the affinity-tome slot once the player already owns every family (nothing left to unlock) OR
 * has already bought the tome once — see merchantAffinityTomePurchased, the tome is a one-time-only offer now. */
const MERCHANT_FALLBACK_ITEM_OPTION: MerchantItemOption = { id: 'max-health', name: 'Elixir de Vitalidade', cost: 25, icon: 'merchant-vitality-elixir-icon', description: '+20 de vida máxima e cura 50% da vida máxima.', apply: (player) => { player.maxHealth += 20; player.heal(player.maxHealth * 0.5); } };
/** Pool for the random-buff slot — one is picked (33% each) per merchant visit and re-priced to MERCHANT_RANDOM_BUFF_COST. */
const MERCHANT_BASE_ITEM_OPTIONS: MerchantItemOption[] = [
  { id: 'heal', name: 'Poção de Cura', cost: 0, icon: 'merchant-heal-potion-icon', description: 'Cura 40 de vida instantaneamente.', apply: (player) => player.heal(40) },
  { id: 'damage', name: 'Lâmina Afiada', cost: 0, icon: 'merchant-sharp-blade-icon', description: '+15% de dano.', apply: (player) => { player.damageMultiplier += 0.15; } },
  { id: 'speed', name: 'Botas Ligeiras', cost: 0, icon: 'merchant-swift-boots-icon', description: '+15 de velocidade de movimento.', apply: (player) => { player.movementSpeed += 15; } }
];
const MERCHANT_RANDOM_BUFF_COST = 100;
const MERCHANT_DIVINE_BLESSING_OPTION: MerchantItemOption = { id: 'divine-blessing', name: 'Bênção Divina', cost: 150, icon: 'merchant-divine-blessing-icon', description: '+5 HP/s de cura passiva. Empilha se comprado de novo.', apply: (player) => player.addDivineBlessing() };
const MERCHANT_ARCANE_CURSE_OPTION: MerchantItemOption = { id: 'arcane-curse', name: 'Maldição Arcana', cost: 120, icon: 'merchant-arcane-curse-icon', description: '-50 de vida máxima, +150% de dano. Empilha se comprado de novo.', apply: (player) => player.addArcaneCurse() };
interface MerchantItemSlot { option: MerchantItemOption; position: Phaser.Math.Vector2; purchased: boolean; marker: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; }

const MERCHANT_PORTAL_INTERVAL_MS = 40000;
const MERCHANT_PORTAL_OPEN_MS = 20000;
/** Every item already purchased this run multiplies every item's cost by this much (compounding — see buildMerchantShop). */
const MERCHANT_PRICE_INFLATION_MULTIPLIER = 3;
const MERCHANT_ROOM_SIZE = 480;
/** Fixed anchor for the merchant's isolated pocket realm — far outside the normal 0..WORLD_SIZE arena so it can
 * never overlap it. World/camera bounds get locked to just this small area on entry (see isolateMerchantRealm),
 * so the original arena is never in scope for the camera to show. This point IS the store entrance/door now —
 * there's no walkway anymore, the player spawns right here on entry (see enterMerchantPortal). */
const MERCHANT_REALM_X = WORLD_SIZE * 4;
const MERCHANT_REALM_Y = WORLD_SIZE * 4;
/** How far the camera/physics bounds are allowed to extend past the entrance point (see isolateMerchantRealm) —
 * just enough breathing room for the player to stand just outside the portal on arrival. */
const MERCHANT_ENTRANCE_BUFFER = 200;
/** Length matches MERCHANT_ROOM_SIZE so it spans the full edge. Thickness is deliberately NOT derived from the
 * source art's own aspect ratio (1006x352 ≈ 2.86, which would give ~168px — way too deep, it was eating into the
 * walkable floor instead of hugging the border) — fixed small instead, art gets slightly squished to fit, which
 * reads fine since the whole point is just a border strip, not an accurate scale reproduction of the source art. */
const MERCHANT_WALL_LENGTH = MERCHANT_ROOM_SIZE;
const MERCHANT_WALL_THICKNESS = 50;
/** mist.png is 1254x1254 — a bigger tile still reads fine since cloud wisps have no hard edges to seam. Used by
 * the screen-space outside fog that covers everything except the room itself. */
const MERCHANT_MIST_TILE_SCALE = 0.4;
const MERCHANT_MIST_TINT = 0xffffff;

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
  /** Edge-triggered: true once the enter/cancel popup has been shown for this approach, so it doesn't reopen
   *  itself every frame while the player stands in range (e.g. right after hitting CANCELAR) — only resets when
   *  the player actually leaves the radius, see updateMerchantApproachPrompt. */
  private merchantEntryPromptShown = false;
  private merchantPortalVisual?: Phaser.GameObjects.Sprite;
  private merchantArrow?: Phaser.GameObjects.Container;
  private merchantAnnouncement?: Phaser.GameObjects.Text;
  private merchantPrompt?: Phaser.GameObjects.Text;
  private merchantOverlay: Phaser.GameObjects.GameObject[] = [];
  private merchantAreaVisuals: Phaser.GameObjects.GameObject[] = [];
  private inMerchant = false;
  private readonly merchantReturnPosition = new Phaser.Math.Vector2();
  private readonly merchantRoomCenter = new Phaser.Math.Vector2();
  private readonly merchantRoomEntrance = new Phaser.Math.Vector2();
  private readonly merchantNpcPosition = new Phaser.Math.Vector2();
  private merchantItemSlots: MerchantItemSlot[] = [];
  private merchantColliders: Phaser.Physics.Arcade.Collider[] = [];
  /** How many times the portal has spawned this run — no longer drives price inflation (see itemsPurchasedCount), kept for the affinity-tome/other spawn-count-relative logic. */
  private merchantSpawnCount = 0;
  /** Total items bought across the whole run (any shop visit) — drives price inflation (see buildMerchantShop). */
  private itemsPurchasedCount = 0;
  /** The affinity tome is a one-time-only offer across the whole run — see buildMerchantShop's affinityOption. */
  private merchantAffinityTomePurchased = false;

  constructor(private readonly host: MerchantHost) {}

  reset(): void {
    this.merchantElapsed = 0;
    this.merchantPortalActive = false;
    this.merchantPortalExpiresAt = 0;
    this.merchantEntryPromptShown = false;
    this.merchantPortalVisual = undefined;
    this.merchantArrow = undefined;
    this.merchantAnnouncement = undefined;
    this.merchantPrompt = undefined;
    this.merchantOverlay = [];
    this.merchantAreaVisuals = [];
    this.inMerchant = false;
    this.merchantSpawnCount = 0;
    this.itemsPurchasedCount = 0;
    this.merchantAffinityTomePurchased = false;
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
    // The exit portal sits exactly at merchantRoomEntrance — it never blocks movement, so this is a pure
    // distance+E-key check, same pattern as the arena's entry portal.
    const exitDistance = Phaser.Math.Distance.Between(player.x, player.y, this.merchantRoomEntrance.x, this.merchantRoomEntrance.y);
    if (exitDistance <= 90) {
      // No purchase required to leave — a player who can't afford anything (or just doesn't want to buy)
      // must always be able to walk back out, not get stuck in the pocket realm.
      this.setMerchantPrompt(this.merchantRoomEntrance.x, this.merchantRoomEntrance.y - 60, 'Pressione E para voltar à arena');
      if (Phaser.Input.Keyboard.JustDown(this.host.getKeys().E)) this.leaveMerchant();
      return;
    }
    const merchantDistance = Phaser.Math.Distance.Between(player.x, player.y, this.merchantNpcPosition.x, this.merchantNpcPosition.y);
    if (merchantDistance <= 80) {
      this.setMerchantPrompt(this.merchantNpcPosition.x, this.merchantNpcPosition.y - 60, 'Sergio (em breve)');
      return;
    }
    const nearestSlot = this.merchantItemSlots.find((slot) => !slot.purchased && Phaser.Math.Distance.Between(player.x, player.y, slot.position.x, slot.position.y) <= 70);
    if (nearestSlot) {
      const canAfford = this.host.getCurrency() >= nearestSlot.option.cost;
      const suffix = canAfford ? '(E para comprar)' : '(moedas insuficientes)';
      this.setMerchantPrompt(nearestSlot.position.x, nearestSlot.position.y - 60, `${nearestSlot.option.name} — ${nearestSlot.option.cost} moedas ${suffix}`);
      if (canAfford && Phaser.Input.Keyboard.JustDown(this.host.getKeys().E)) this.openItemPurchaseConfirm(nearestSlot);
      return;
    }
    this.destroyMerchantPrompt();
  }

  private openMerchantPortal(): void {
    const scene = this.host.scene;
    const side = Phaser.Math.Between(0, 3);
    this.merchantEntryPromptShown = false;
    const edge = 40;
    // On the top edge, the portal's own sprite (111px tall) risks clipping past the world's y=0 boundary once
    // the camera is fully scrolled up to follow the player there. Spawn further inward on that one edge only.
    const topEdge = 170;
    const along = Phaser.Math.Between(420, WORLD_SIZE - 420);
    // Direction no longer tracked here — the portal can still open on any of the 4 arena edges (find-the-portal
    // gameplay unchanged), but what's behind it is always the same fixed, isolated realm (see enterMerchantPortal).
    if (side === 0) { this.merchantPortalPosition.set(along, topEdge); }
    else if (side === 1) { this.merchantPortalPosition.set(along, WORLD_SIZE - edge); }
    else if (side === 2) { this.merchantPortalPosition.set(edge, along); }
    else { this.merchantPortalPosition.set(WORLD_SIZE - edge, along); }
    this.merchantPortalActive = true;
    this.merchantPortalExpiresAt = scene.time.now + MERCHANT_PORTAL_OPEN_MS;
    this.merchantPortalVisual = scene.add.sprite(this.merchantPortalPosition.x, this.merchantPortalPosition.y, 'portal', 0)
      .setDisplaySize(100, 111)
      .setDepth(9)
      .play('portal-spin');
    this.ensureMerchantArrow();
    this.merchantSpawnCount += 1;
    this.announceMerchantPortal();
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
  /** Centered banner announcing the spawn, same pattern as BossSystem's warn() message — brief flicker then
   *  auto-dismiss, independent of whether the player ever finds/enters the portal. */
  private announceMerchantPortal(): void {
    const scene = this.host.scene;
    this.merchantAnnouncement?.destroy();
    const message = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Um portal misterioso surgiu na arena!', {
      fontFamily: TITLE_FONT_FAMILY,
      fontSize: '34px',
      color: '#e3caff',
      align: 'center',
      stroke: '#1a1025',
      strokeThickness: 5,
      wordWrap: { width: 900 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(45);
    this.merchantAnnouncement = message;
    scene.tweens.add({ targets: message, alpha: 0.45, yoyo: true, repeat: 2, duration: 420 });
    scene.time.delayedCall(2600, () => {
      message.destroy();
      if (this.merchantAnnouncement === message) this.merchantAnnouncement = undefined;
    });
  }
  /** Screen-edge indicator pointing toward the portal while it's off-screen: a small portal icon (one frame of
   *  the same spinning sheet used for the real portals) followed by a ">" chevron, the pair rotating together to
   *  point at the portal — replaces the old hand-drawn arrow graphic. */
  private ensureMerchantArrow(): void {
    if (this.merchantArrow) return;
    const scene = this.host.scene;
    // Enlarged (was 34x38 icon / 30px chevron) — it was getting lost against the busy arena background at the old size.
    const icon = scene.add.sprite(-26, 0, 'portal', 0).setDisplaySize(58, 65).play('portal-spin');
    const chevron = scene.add.text(32, 0, '>', { fontFamily: TITLE_FONT_FAMILY, fontSize: '46px', color: '#ffd868', stroke: '#2b1d00', strokeThickness: 6 }).setOrigin(0.5);
    this.merchantArrow = scene.add.container(0, 0, [icon, chevron]).setScrollFactor(0).setDepth(44).setVisible(false);
  }
  private updateMerchantArrow(): void {
    if (!this.merchantArrow || !this.merchantPortalActive) { this.merchantArrow?.setVisible(false); return; }
    const scene = this.host.scene;
    const view = scene.cameras.main.worldView;
    const screenX = this.merchantPortalPosition.x - view.x;
    const screenY = this.merchantPortalPosition.y - view.y;
    const visible = screenX >= 0 && screenX <= GAME_WIDTH && screenY >= 0 && screenY <= GAME_HEIGHT;
    if (visible) { this.merchantArrow.setVisible(false); return; }
    const x = Phaser.Math.Clamp(screenX, 64, GAME_WIDTH - 64);
    const y = Phaser.Math.Clamp(screenY, 64, GAME_HEIGHT - 64);
    this.merchantArrow.setVisible(true).setPosition(x, y).setRotation(Phaser.Math.Angle.Between(GAME_WIDTH / 2, GAME_HEIGHT / 2, screenX, screenY));
  }
  /** No more "press E" text — getting within range immediately opens the enter/cancel popup (edge-triggered via
   *  merchantEntryPromptShown, so it doesn't reopen itself every frame while the player just stands there,
   *  e.g. right after hitting CANCELAR — only resets once they actually step back out of range). */
  private updateMerchantApproachPrompt(): void {
    const player = this.host.getPlayer();
    const distance = Phaser.Math.Distance.Between(player.x, player.y, this.merchantPortalPosition.x, this.merchantPortalPosition.y);
    const inRange = distance <= 90;
    if (inRange && !this.merchantEntryPromptShown) {
      this.merchantEntryPromptShown = true;
      this.showMerchantEntryPrompt();
    } else if (!inRange) {
      this.merchantEntryPromptShown = false;
    }
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
    // Entering always takes the player to the same fixed, isolated realm — far outside the normal 0..WORLD_SIZE
    // arena, with world/camera bounds locked to just this pocket — rather than building anything relative to
    // whichever edge the portal happened to spawn on. No walkway anymore: the player spawns right at the store
    // entrance, and the old arena is never in scope for the camera to show at all.
    const entrance = new Phaser.Math.Vector2(MERCHANT_REALM_X, MERCHANT_REALM_Y);
    const direction = new Phaser.Math.Vector2(0, 1);
    this.merchantRoomCenter.copy(entrance.clone().add(direction.clone().scale(MERCHANT_ROOM_SIZE / 2)));
    this.merchantRoomEntrance.copy(entrance);
    this.closeMerchantPortal();
    this.merchantReturnPosition.set(player.x, player.y);
    this.isolateMerchantRealm(entrance);
    this.buildOutsideFog();
    this.buildMerchantRoomGround();
    this.buildMerchantShop();
    this.freezeArenaEntities();
    // Spawn inside the room, south of the (now solid) top wall — the entrance no longer has a physical gap to
    // walk through, so spawning north of it like before would leave the player stuck outside. Far enough past
    // the portal's 90px interaction radius that the "buy something" exit prompt doesn't fire immediately on entry.
    player.setPosition(entrance.x, entrance.y + 150);
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
  /** Locks world/camera bounds to just the entrance+room pocket — deliberately does NOT include [0, WORLD_SIZE]
   *  like the old expandWorldBoundsForMerchant did, so the original arena is never reachable by the camera while
   *  inside the merchant realm (it's a separate, isolated space now, not a bounds-expanded view of the same one). */
  private isolateMerchantRealm(entrance: Phaser.Math.Vector2): void {
    const scene = this.host.scene;
    const entrancePad = MERCHANT_ENTRANCE_BUFFER;
    const roomPad = MERCHANT_ROOM_SIZE / 2 + 40;
    const xs = [entrance.x - entrancePad, entrance.x + entrancePad, this.merchantRoomCenter.x - roomPad, this.merchantRoomCenter.x + roomPad];
    const ys = [entrance.y - entrancePad, entrance.y + entrancePad, this.merchantRoomCenter.y - roomPad, this.merchantRoomCenter.y + roomPad];
    // Entrance+room padding alone is much narrower than the camera viewport — bounds that tight left the camera
    // unable to center on the player at all, clamped flush against one edge instead. Widen both axes to
    // comfortably exceed the viewport so the camera can always center normally; the extra bounds space is
    // harmless, it's just fog.
    const [minX, maxX] = this.ensureMinSpan(Math.min(...xs), Math.max(...xs), GAME_WIDTH * 1.4);
    const [minY, maxY] = this.ensureMinSpan(Math.min(...ys), Math.max(...ys), GAME_HEIGHT * 1.4);
    scene.physics.world.setBounds(minX, minY, maxX - minX, maxY - minY);
    scene.cameras.main.setBounds(minX, minY, maxX - minX, maxY - minY);
  }
  private ensureMinSpan(min: number, max: number, minSpan: number): [number, number] {
    if (max - min >= minSpan) return [min, max];
    const center = (min + max) / 2;
    return [center - minSpan / 2, center + minSpan / 2];
  }
  /** Screen-space (scrollFactor 0), not world-space — a huge world-sized tile (tried WORLD_SIZE*3) hit TileSprite
   *  precision/ghosting artifacts once the camera scrolled far from world-origin. Pinning it to the viewport size
   *  instead always exactly covers what's visible, at any camera position, with no world-bounds math involved —
   *  depth sorting still puts the world-space room ground (depth 1+) on top of this regardless of the differing
   *  scroll factors. Covers everything except the room itself, which is all that exists in this pocket now. */
  private buildOutsideFog(): void {
    const scene = this.host.scene;
    const fog = scene.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'mist')
      .setTileScale(MERCHANT_MIST_TILE_SCALE)
      .setTint(MERCHANT_MIST_TINT)
      .setAlpha(0.85)
      .setScrollFactor(0)
      .setDepth(0);
    this.merchantAreaVisuals.push(fog);
  }
  private buildMerchantWallRect(x: number, y: number, width: number, height: number): void {
    const scene = this.host.scene;
    const wall = scene.add.rectangle(x, y, width, height, 0x000000, 0).setDepth(1);
    scene.physics.add.existing(wall, true);
    (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(width, height);
    this.merchantAreaVisuals.push(wall);
    this.merchantColliders.push(scene.physics.add.collider(this.host.getPlayer(), wall));
  }
  private buildMerchantRoomGround(): void {
    const scene = this.host.scene;
    // A single fixed-size image, not a tiled texture — the room is always exactly MERCHANT_ROOM_SIZE square (no
    // variable-length corridor to repeat across like the pathway), and the source art has a centered rune circle
    // that would look wrong repeating anyway. Just scaled to fit.
    const ground = scene.add.image(this.merchantRoomCenter.x, this.merchantRoomCenter.y, 'merchant-store-floor')
      .setDisplaySize(MERCHANT_ROOM_SIZE, MERCHANT_ROOM_SIZE)
      .setDepth(1);
    this.merchantAreaVisuals.push(ground);
    this.buildMerchantRoomWalls();
  }
  private buildMerchantRoomWalls(): void {
    const half = MERCHANT_ROOM_SIZE / 2;
    const cx = this.merchantRoomCenter.x;
    const cy = this.merchantRoomCenter.y;
    const thickness = 20;
    // All 4 sides are now solid, unbroken walls — there's no physical gap to walk through anymore, entry/exit
    // is entirely teleport+E-key driven (see enterMerchantPortal/leaveMerchant), so a real opening isn't needed.
    this.buildMerchantWallRect(cx, cy - half - thickness / 2, MERCHANT_ROOM_SIZE, thickness);
    this.buildRoomWallVisual('top', cx, cy, half);
    this.buildMerchantWallRect(cx, cy + half + thickness / 2, MERCHANT_ROOM_SIZE, thickness);
    this.buildRoomWallVisual('bottom', cx, cy, half);
    this.buildMerchantWallRect(cx - half - thickness / 2, cy, thickness, MERCHANT_ROOM_SIZE);
    this.buildRoomWallVisual('left', cx, cy, half);
    this.buildMerchantWallRect(cx + half + thickness / 2, cy, thickness, MERCHANT_ROOM_SIZE);
    this.buildRoomWallVisual('right', cx, cy, half);
    this.buildEntrancePortalMarker(cy, half);
  }
  /** Wall art sits on top of the (still invisible) collider from buildMerchantWallRect, extending from the room's
   *  true boundary inward — rotated/flipped per side so the art's front face always points into the room, matching
   *  the elevated top-down perspective the source art was drawn in (a back/top ledge + a front face below it). */
  private buildRoomWallVisual(side: 'top' | 'bottom' | 'left' | 'right', cx: number, cy: number, half: number): void {
    const scene = this.host.scene;
    const wallThickness = MERCHANT_WALL_THICKNESS;
    let x: number;
    let y: number;
    let rotation = 0;
    let flipY = false;
    if (side === 'top') { x = cx; y = cy - half + wallThickness / 2; }
    else if (side === 'bottom') { x = cx; y = cy + half - wallThickness / 2; flipY = true; }
    else if (side === 'left') { x = cx - half + wallThickness / 2; y = cy; rotation = -Math.PI / 2; }
    else { x = cx + half - wallThickness / 2; y = cy; rotation = Math.PI / 2; }
    const wall = scene.add.image(x, y, 'merchant-wall')
      .setDisplaySize(MERCHANT_WALL_LENGTH, wallThickness)
      .setRotation(rotation)
      .setFlipY(flipY)
      .setDepth(3);
    this.merchantAreaVisuals.push(wall);
  }
  /** Same portal used in the arena, sitting on the (now solid, unbroken) top wall as a purely decorative/
   *  interactive marker — it doesn't block or need a gap in the wall, entry/exit is entirely distance+E-key
   *  driven (see updateInteraction), not something the player walks through. */
  private buildEntrancePortalMarker(cy: number, half: number): void {
    const scene = this.host.scene;
    const portal = scene.add.sprite(this.merchantRoomEntrance.x, cy - half + MERCHANT_WALL_THICKNESS / 2, 'portal', 0)
      .setDisplaySize(100, 111)
      .setDepth(4)
      .play('portal-spin');
    this.merchantAreaVisuals.push(portal);
  }
  private buildMerchantShop(): void {
    const scene = this.host.scene;
    this.merchantNpcPosition.set(this.merchantRoomCenter.x - 140, this.merchantRoomCenter.y - 20);
    // merchant-character's own content aspect (217x338 ≈ 0.642) preserved here. Static — just one frame from the
    // idle sheet (frames are near-identical anyway), no animation played.
    const npc = scene.add.image(this.merchantNpcPosition.x, this.merchantNpcPosition.y, 'merchant-character', 1)
      .setDisplaySize(64, 100)
      .setDepth(3);
    const npcLabel = scene.add.text(this.merchantNpcPosition.x, this.merchantNpcPosition.y + 60, 'Sergio', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#ffe29a', stroke: '#101015', strokeThickness: 3 }).setOrigin(0.5).setDepth(3);
    this.merchantAreaVisuals.push(npc, npcLabel);

    const tableX = this.merchantRoomCenter.x - 40;
    const tableY = this.merchantRoomCenter.y;
    // merchant-table's own content aspect (331x1299 ≈ 0.255) preserved here — sized a bit bigger than the old
    // placeholder's 44x260 now that setDisplaySize actually maps onto the visible table (see PreloadScene).
    const tableWidth = 76;
    const tableHeight = 300;
    const table = scene.add.image(tableX, tableY, 'merchant-table').setDisplaySize(tableWidth, tableHeight).setDepth(3);
    scene.physics.add.existing(table, true);
    (table.body as Phaser.Physics.Arcade.StaticBody).setSize(tableWidth, tableHeight);
    this.merchantAreaVisuals.push(table);
    this.merchantColliders.push(scene.physics.add.collider(this.host.getPlayer(), table));

    const affinityOption = !this.merchantAffinityTomePurchased && this.availableAffinityFamilies().length > 0 ? MERCHANT_AFFINITY_TOME_OPTION : MERCHANT_FALLBACK_ITEM_OPTION;
    const randomBuffBase = MERCHANT_BASE_ITEM_OPTIONS[Math.floor(Math.random() * MERCHANT_BASE_ITEM_OPTIONS.length)];
    const randomBuffOption: MerchantItemOption = { ...randomBuffBase, cost: MERCHANT_RANDOM_BUFF_COST };
    // Compounding 3x per item already bought this run (any shop visit) — 0 bought is base price, 1 bought is x3, 2 bought is x9, ...
    const priceMultiplier = MERCHANT_PRICE_INFLATION_MULTIPLIER ** this.itemsPurchasedCount;
    const scalePrice = (option: MerchantItemOption): MerchantItemOption => ({ ...option, cost: Math.round(option.cost * priceMultiplier) });
    const itemOptions: MerchantItemOption[] = [MERCHANT_DIVINE_BLESSING_OPTION, MERCHANT_ARCANE_CURSE_OPTION, randomBuffOption, affinityOption].map(scalePrice);
    // Kept tight enough (with the label's height factored in) that the bottom-most slot's label still clears the
    // room's bottom wall (MERCHANT_ROOM_SIZE/2 - MERCHANT_WALL_THICKNESS from center) instead of spilling past it.
    const slotSpacing = 80;
    const iconHeight = 56;
    this.merchantItemSlots = itemOptions.map((option, index) => {
      const x = this.merchantRoomCenter.x + 150;
      const y = this.merchantRoomCenter.y - slotSpacing * 1.5 + index * slotSpacing;
      const marker = scene.add.image(x, y, option.icon).setDepth(3);
      // Icons keep their native aspect (some are wider/narrower medallions) instead of a fixed box, which was
      // stretching them and making neighboring frames look like they overlapped.
      marker.setDisplaySize(iconHeight * (marker.width / marker.height), iconHeight);
      // Cost is deliberately left off this always-visible label — it only shows up in the proximity prompt
      // (see updateInteraction) once the player is actually close enough to consider buying.
      const label = scene.add.text(x, y + iconHeight / 2 + 18, option.name, { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#eafbea', align: 'center', stroke: '#0d1a0d', strokeThickness: 3 }).setOrigin(0.5).setDepth(3);
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
  /** Same card layout as the arena's level-up upgrade choices — name, icon, description — but for a single item
   *  with a price attached, since this is a purchase, not a free pick. Clicking the card is what actually buys
   *  it (see purchaseMerchantItem); CANCELAR backs out without spending anything. */
  private openItemPurchaseConfirm(slot: MerchantItemSlot): void {
    const scene = this.host.scene;
    this.destroyMerchantPrompt();
    this.host.setLevelPending(true);
    scene.physics.pause();
    const x = GAME_WIDTH / 2;
    const veil = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090b12, 0.84).setScrollFactor(0).setDepth(30);
    const card = scene.add.rectangle(x, 380, 280, 300, 0x49326e, 1).setStrokeStyle(3, 0xa888d9, 1).setScrollFactor(0).setDepth(31).setInteractive({ useHandCursor: true });
    const icon = scene.add.image(x, 300, slot.option.icon).setDisplaySize(72, 72).setScrollFactor(0).setDepth(32);
    const name = scene.add.text(x, 365, slot.option.name, { fontFamily: TITLE_FONT_FAMILY, fontSize: '20px', color: '#fff0c2', align: 'center', wordWrap: { width: 240 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    const description = scene.add.text(x, 420, slot.option.description, { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#eee8ff', align: 'center', wordWrap: { width: 240 } }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    const price = scene.add.text(x, 495, `Comprar por ${slot.option.cost} moedas`, { fontFamily: TITLE_FONT_FAMILY, fontSize: '15px', color: '#ffe29a' }).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    this.merchantOverlay = [veil, card, icon, name, description, price];
    card.on('pointerover', () => card.setFillStyle(0x5c3f8a));
    card.on('pointerout', () => card.setFillStyle(0x49326e));
    card.on('pointerup', () => this.confirmItemPurchase(slot));
    this.merchantPromptButton('CANCELAR', 580, () => this.closeItemPurchaseConfirm());
  }
  private closeItemPurchaseConfirm(): void {
    this.merchantOverlay.forEach((object) => object.destroy());
    this.merchantOverlay = [];
    this.host.setLevelPending(false);
    this.host.scene.physics.resume();
  }
  private confirmItemPurchase(slot: MerchantItemSlot): void {
    this.closeItemPurchaseConfirm();
    this.purchaseMerchantItem(slot);
  }
  private purchaseMerchantItem(slot: MerchantItemSlot): void {
    if (slot.purchased || this.host.getCurrency() < slot.option.cost) return;
    this.host.spendCurrency(slot.option.cost);
    this.itemsPurchasedCount += 1;
    slot.purchased = true;
    slot.marker.setTint(0x555555).setAlpha(0.6);
    slot.label.setText(`${slot.option.name}\n(comprado)`);
    this.destroyMerchantPrompt();
    if (slot.option.id === 'affinity-tome') { this.merchantAffinityTomePurchased = true; this.openAffinityTomeChoice(); return; }
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
