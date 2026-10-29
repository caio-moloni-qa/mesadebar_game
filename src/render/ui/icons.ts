import { QuestNpcId } from '../../core/systems/QuestSystem';
import { WeaponConfig } from '../../config/weapons';
import { CompanionKind } from '../../core/systems/MiniBossSystem';
import { MerchantItemId } from '../../core/systems/MerchantSystem';

// One static URL literal per file so Vite rewrites each with the base path.
// Upgrade art is the 3D UI's regenerated faceted set.

export const HUD_ART = {
  hpIcon: new URL('../../assets/ui/hud/hp-icon.png', import.meta.url).href,
  tavern: new URL('../../assets/ui/hud/tavern-icon.png', import.meta.url).href,
  hpBarBorder: new URL('../../assets/ui/hud/hp-bar-border.png', import.meta.url).href,
  expBarBorder: new URL('../../assets/ui/hud/exp-bar-border.png', import.meta.url).href,
  gem: new URL('../../assets/pickups/exp-crystal.png', import.meta.url).href,
  parchment: new URL('../../assets/ui/menu/parchment_initial_screen_v2.png', import.meta.url).href,
  woodPanel: new URL('../../assets/ui/theme/wood_plank_background.png', import.meta.url).href,
  button: new URL('../../assets/ui/theme/button_cta.png', import.meta.url).href,
  upgradeCard: new URL('../../assets/ui/theme/upgrade_card_panel_v2.png', import.meta.url).href
};

const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`)}`;

const WEAPON_ICONS: Record<WeaponConfig['id'] | 'banana', string> = {
  staff: new URL('../../assets/weapons/staff-icon.png', import.meta.url).href,
  sword: new URL('../../assets/weapons/sword-icon.png', import.meta.url).href,
  boomerang: new URL('../../assets/weapons/boomerang-icon.png', import.meta.url).href,
  amulet: new URL('../../assets/weapons/aura-amulet-icon.png', import.meta.url).href,
  whip: new URL('../../assets/weapons/whip-icon.png', import.meta.url).href,
  banana: new URL('../../assets/weapons/banana-boomerang-icon.png', import.meta.url).href,
  hammer: new URL('../../assets/weapons/hammer-icon.png', import.meta.url).href,
  bow: new URL('../../assets/weapons/bow-icon.png', import.meta.url).href,
  coins: new URL('../../assets/weapons/coins-icon_v2.png', import.meta.url).href,
  crystal: new URL('../../assets/weapons/crystal-icon_v2.png', import.meta.url).href,
  pack: new URL('../../assets/weapons/pack-icon_v2.png', import.meta.url).href
};

const UPGRADE_ART = {
  damage: new URL('../../assets/upgrades/modern/damage-icon.webp', import.meta.url).href,
  cooldown: new URL('../../assets/upgrades/modern/cooldown-icon.webp', import.meta.url).href,
  speed: new URL('../../assets/upgrades/modern/speed-icon.webp', import.meta.url).href,
  lifeSteal: new URL('../../assets/upgrades/modern/life-steal-icon.webp', import.meta.url).href,
  colossusArms: new URL('../../assets/upgrades/modern/colossus-arms-icon.webp', import.meta.url).href,
  chainedFury: new URL('../../assets/upgrades/modern/chained-fury-icon.webp', import.meta.url).href,
  whirlwind: new URL('../../assets/upgrades/modern/whirlwind-attack-icon.webp', import.meta.url).href,
  arcaneBlessing: new URL('../../assets/upgrades/modern/arcane-blessing-icon.webp', import.meta.url).href,
  arcaneBounce: new URL('../../assets/upgrades/modern/arcane-bounce-icon.webp', import.meta.url).href,
  wideBolt: new URL('../../assets/upgrades/modern/wide-bolt-icon.webp', import.meta.url).href,
  auraRadius: new URL('../../assets/upgrades/modern/aura-radius-icon.webp', import.meta.url).href,
  auraDamage: new URL('../../assets/upgrades/modern/aura-damage-icon.webp', import.meta.url).href,
  auraTickSpeed: new URL('../../assets/upgrades/modern/aura-tick-speed-icon.webp', import.meta.url).href
};

/** Upgrade id → icon. Unknown ids fall back to the damage icon. */
const UPGRADE_ICONS: Record<string, string> = {
  damage: UPGRADE_ART.damage,
  cooldown: UPGRADE_ART.cooldown,
  speed: UPGRADE_ART.speed,
  'boomerang-count': WEAPON_ICONS.boomerang,
  'sword-life-steal': UPGRADE_ART.lifeSteal,
  'projectile-extra-count': UPGRADE_ART.arcaneBlessing,
  'projectile-ricochet': UPGRADE_ART.arcaneBounce,
  'projectile-wide-bolt': UPGRADE_ART.wideBolt,
  'melee-range': UPGRADE_ART.colossusArms,
  'melee-extra-attack': UPGRADE_ART.chainedFury,
  'melee-whirlwind': UPGRADE_ART.whirlwind,
  'aura-radius': UPGRADE_ART.auraRadius,
  'aura-damage': UPGRADE_ART.auraDamage,
  'aura-tick-speed': UPGRADE_ART.auraTickSpeed
};

/** Generated companion portraits shared by joining and strengthening reward cards. */
const COMPANION_ICONS: Record<CompanionKind, string> = {
  frostKnight: new URL('../../assets/ui/markers/frostKnight-head.png', import.meta.url).href,
  iceSerpent: new URL('../../assets/ui/markers/iceSerpent-head.png', import.meta.url).href,
  bellringer: new URL('../../assets/ui/markers/bellringer-head.png', import.meta.url).href,
  ancientYeti: new URL('../../assets/ui/markers/ancientYeti-head.png', import.meta.url).href,
  gravedigger: new URL('../../assets/ui/companions/gravedigger-portrait.png', import.meta.url).href,
  waterFairy: new URL('../../assets/ui/companions/water-fairy-portrait.png', import.meta.url).href,
  stoneGolem: new URL('../../assets/ui/companions/stone-golem-portrait.png', import.meta.url).href
};

/** The tavern regulars' portraits (dialogue panel). */
const NPC_FACES: Partial<Record<QuestNpcId, string>> = {
  // Brom: iron cap, red braided beard.
  brom: svg('<path d="M12 26 Q32 4 52 26 Z" fill="#8a8f99"/><rect x="10" y="24" width="44" height="5" fill="#6f737c"/><circle cx="32" cy="34" r="13" fill="#e0a882"/><rect x="25" y="31" width="4" height="4" fill="#1a1410"/><rect x="35" y="31" width="4" height="4" fill="#1a1410"/><path d="M17 36 Q32 70 47 36 Q40 44 32 44 Q24 44 17 36 Z" fill="#c0502a"/><rect x="24" y="40" width="16" height="3" fill="#c0502a"/><rect x="26" y="52" width="3" height="9" fill="#c0502a"/><rect x="35" y="52" width="3" height="9" fill="#c0502a"/>'),
  // Lyra: green hood, golden hair, long ears.
  lyra: svg('<path d="M10 58 Q12 12 32 8 Q52 12 54 58 Z" fill="#2f5a36"/><path d="M18 50 Q18 22 32 18 Q46 22 46 50 Z" fill="#e8d27a"/><ellipse cx="32" cy="34" rx="11" ry="13" fill="#f0d0b0"/><path d="M21 32 L8 22 L22 36 Z M43 32 L56 22 L42 36 Z" fill="#f0d0b0"/><rect x="26" y="31" width="4" height="3" fill="#2a5a3a"/><rect x="34" y="31" width="4" height="3" fill="#2a5a3a"/><rect x="29" y="41" width="6" height="2" fill="#b07a6a"/>'),
  // Grimbo: green, huge ears, top hat, yellow eyes.
  grimbo: svg('<rect x="22" y="4" width="20" height="16" fill="#1e1a24"/><rect x="22" y="15" width="20" height="4" fill="#c9963f"/><rect x="14" y="19" width="36" height="4" fill="#1e1a24"/><path d="M20 36 L2 24 L20 30 Z M44 36 L62 24 L44 30 Z" fill="#7fb04a"/><circle cx="32" cy="38" r="15" fill="#7fb04a"/><rect x="24" y="33" width="5" height="5" fill="#ffe14a"/><rect x="35" y="33" width="5" height="5" fill="#ffe14a"/><path d="M30 38 L32 48 L34 38 Z" fill="#6a9a3a"/><path d="M24 50 Q32 55 40 50" stroke="#2a3a1a" stroke-width="2" fill="none"/>'),
  // Madame Zora: golden headscarf, hoop earrings, a crystal ball glow.
  zora: svg('<circle cx="32" cy="58" r="10" fill="#9fe8ff" opacity=".7"/><circle cx="32" cy="32" r="14" fill="#c8946a"/><path d="M16 30 Q32 6 48 30 Q40 22 32 22 Q24 22 16 30 Z" fill="#d4a83a"/><path d="M44 26 Q54 40 50 50" stroke="#d4a83a" stroke-width="5" fill="none"/><circle cx="18" cy="40" r="4" fill="none" stroke="#ffd25a" stroke-width="2"/><circle cx="46" cy="40" r="4" fill="none" stroke="#ffd25a" stroke-width="2"/><rect x="25" y="30" width="5" height="3" fill="#2a1a2a"/><rect x="34" y="30" width="5" height="3" fill="#2a1a2a"/><rect x="29" y="39" width="6" height="2" fill="#8a2a4a"/>')
};

/** Generated portrait art (src/assets/characters/npcs/<name>-portrait.png) where it exists; the SVG faces above
 *  stand in for any that don't yet. */
const NPC_PORTRAITS = import.meta.glob<string>('../../assets/characters/npcs/*-portrait.png', { query: '?url', import: 'default', eager: true });

/** Portraits redrawn after a character's design changed (art is never overwritten, so the new one is a `_vN`). */
const NPC_PORTRAIT_REVISIONS: Partial<Record<QuestNpcId, string>> = {
  // Joe is now a plain ice cube (concept v5), no face or scarf.
  joe: new URL('../../assets/characters/npcs/joe-portrait_v2.png', import.meta.url).href
};

export function npcPortrait(name: QuestNpcId | 'sergio' | 'eskimo'): string | undefined {
  return NPC_PORTRAIT_REVISIONS[name as QuestNpcId] ?? NPC_PORTRAITS[`../../assets/characters/npcs/${name}-portrait.png`];
}

export function npcFace(id: QuestNpcId): string {
  return npcPortrait(id) ?? NPC_FACES[id] ?? '';
}

export function companionIcon(kind: CompanionKind): string {
  return COMPANION_ICONS[kind];
}

export function weaponIcon(id: WeaponConfig['id'] | 'banana'): string {
  return WEAPON_ICONS[id];
}

export function upgradeIcon(id: string): string {
  return UPGRADE_ICONS[id] ?? UPGRADE_ART.damage;
}

/** The life-steal art doubles as the Aura Podre "healing cut" status icon. */
export const LIFE_STEAL_ICON = UPGRADE_ART.lifeSteal;

/** Faces for the off-screen markers (a portrait in a ring, the arrow on its rim): who you're being pointed to. */
export type MarkerKind = 'iceSerpent' | 'bellringer' | 'ancientYeti' | 'boss' | 'winterKing' | 'gravedigger' | 'templeGuardian' | 'lakeSpirit' | 'frostKnight' | 'end' | 'continue' | 'merchant' | 'barrel' | 'fragment' | 'eskimo';
const MARKER_FACES: Record<MarkerKind, string> = {
  // The Necromancer and the zone guardians: their heads, cut from the concept art (art-source/3d/<boss>/views/front.png).
  boss: new URL('../../assets/ui/markers/boss-head.png', import.meta.url).href,
  gravedigger: new URL('../../assets/ui/markers/gravedigger-head.png', import.meta.url).href,
  templeGuardian: new URL('../../assets/ui/markers/templeGuardian-head.png', import.meta.url).href,
  lakeSpirit: new URL('../../assets/ui/markers/lakeSpirit-head.png', import.meta.url).href,
  // The Campo Nevado's guardians and its Winter King, cut the same way.
  iceSerpent: new URL('../../assets/ui/markers/iceSerpent-head.png', import.meta.url).href,
  bellringer: new URL('../../assets/ui/markers/bellringer-head.png', import.meta.url).href,
  ancientYeti: new URL('../../assets/ui/markers/ancientYeti-head.png', import.meta.url).href,
  frostKnight: new URL('../../assets/ui/markers/frostKnight-head.png', import.meta.url).href,
  winterKing: new URL('../../assets/ui/markers/winterKing-head.png', import.meta.url).href,
  end: svg('<circle cx="32" cy="32" r="18" fill="none" stroke="#9fb4ff" stroke-width="6"/><circle cx="32" cy="32" r="9" fill="#9fb4ff" opacity=".6"/><path d="M26 32 h12 m-5 -5 l5 5 l-5 5" stroke="#ffffff" stroke-width="3" fill="none"/>'),
  // Sergio, the merchant: a wide hat over a grey beard, a gold coin at the brim.
  merchant: svg('<rect x="8" y="22" width="48" height="5" rx="2" fill="#3a2a1e"/><path d="M20 22 L32 6 L44 22 Z" fill="#3a2a1e"/><circle cx="32" cy="34" r="11" fill="#d9a77e"/><rect x="26" y="31" width="4" height="4" fill="#1a1410"/><rect x="34" y="31" width="4" height="4" fill="#1a1410"/><path d="M21 38 L43 38 L32 58 Z" fill="#cfc8bb"/><circle cx="46" cy="18" r="5" fill="#ffc65a" stroke="#b8923a" stroke-width="2"/>'),
  // One of Brom's lost barrels.
  barrel: svg('<ellipse cx="32" cy="14" rx="16" ry="5" fill="#c9963f"/><path d="M16 14 Q12 32 16 50 L48 50 Q52 32 48 14 Z" fill="#8a5a32"/><rect x="13" y="22" width="38" height="4" fill="#4a4a52"/><rect x="13" y="40" width="38" height="4" fill="#4a4a52"/><ellipse cx="32" cy="50" rx="16" ry="5" fill="#6a4226"/>'),
  // One of Joe's memory fragments: a shard of glowing blue ice.
  fragment: svg('<path d="M32 6 L46 26 L38 58 L26 58 L18 26 Z" fill="#7fe3ff"/><path d="M32 6 L38 58 L26 58 Z" fill="#c9f4ff"/><path d="M18 26 L46 26" stroke="#3aa8d8" stroke-width="2"/><circle cx="32" cy="30" r="5" fill="#ffffff" opacity=".8"/>'),
  // The Esquimó: his fur-ringed hood, from his concept art.
  eskimo: new URL('../../assets/ui/markers/eskimo-head.png', import.meta.url).href,
  continue: svg('<circle cx="32" cy="32" r="18" fill="none" stroke="#7dffa0" stroke-width="6"/><circle cx="32" cy="32" r="9" fill="#7dffa0" opacity=".6"/><path d="M32 24 v16 M24 32 h16" stroke="#ffffff" stroke-width="3"/>')
};

export function markerFace(kind: MarkerKind): string {
  if (kind === 'merchant') return HUD_ART.tavern;
  return MARKER_FACES[kind];
}

/** Sergio's store between runs: art for each permanent upgrade and each consumable. */
const STORE_ICONS: Record<string, string> = {
  vitalidade: HUD_ART.hpIcon,
  forca: UPGRADE_ART.damage,
  agilidade: UPGRADE_ART.speed,
  ima: HUD_ART.gem,
  bolsa: WEAPON_ICONS.coins,
  escolha: UPGRADE_ART.arcaneBlessing,
  segundaChance: new URL('../../assets/upgrades/merchant/merchant-divine-blessing-icon.png', import.meta.url).href,
  elixir: new URL('../../assets/upgrades/merchant/merchant-vitality-elixir-icon.png', import.meta.url).href,
  pedra: new URL('../../assets/upgrades/merchant/merchant-sharp-blade-icon.png', import.meta.url).href,
  botas: new URL('../../assets/upgrades/merchant/merchant-swift-boots-icon.png', import.meta.url).href,
  saco: WEAPON_ICONS.coins,
  tomo: new URL('../../assets/upgrades/merchant/merchant-affinity-tome-icon.png', import.meta.url).href,
  fenix: new URL('../../assets/upgrades/merchant/merchant-heal-potion-icon.png', import.meta.url).href
};
export function storeIcon(id: string): string {
  return STORE_ICONS[id] ?? UPGRADE_ART.damage;
}

/** The merchant's item art, one static URL per file for Vite. */
const ITEM_ICONS: Record<MerchantItemId, string> = {
  'polar-stew': new URL('../../assets/upgrades/merchant/igloo-polar-stew-icon.png', import.meta.url).href,
  'glacier-fish': new URL('../../assets/upgrades/merchant/igloo-glacier-fish-icon.png', import.meta.url).href,
  'tundra-roast': new URL('../../assets/upgrades/merchant/igloo-tundra-roast-icon.png', import.meta.url).href,
  'berry-tea': new URL('../../assets/upgrades/merchant/igloo-berry-tea-icon.png', import.meta.url).href,
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
