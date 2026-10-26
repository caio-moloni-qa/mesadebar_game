import { QuestNpcId } from '../../core/systems/QuestSystem';
import { WeaponConfig } from '../../config/weapons';
import { CompanionKind } from '../../core/systems/MiniBossSystem';

// One static URL literal per file so Vite rewrites each with the base path.
// Upgrade art is the 3D UI's regenerated faceted set; other art is shared with Phaser.

export const HUD_ART = {
  hpIcon: new URL('../../assets/ui/hud/hp-icon.png', import.meta.url).href,
  hpBarBorder: new URL('../../assets/ui/hud/hp-bar-border.png', import.meta.url).href,
  expBarBorder: new URL('../../assets/ui/hud/exp-bar-border.png', import.meta.url).href,
  gem: new URL('../../assets/pickups/exp-crystal.png', import.meta.url).href,
  parchment: new URL('../../assets/ui/menu/parchment_initial_screen_v2.png', import.meta.url).href,
  woodPanel: new URL('../../assets/ui/theme/wood_plank_background.png', import.meta.url).href,
  button: new URL('../../assets/ui/theme/button_cta.png', import.meta.url).href,
  upgradeCard: new URL('../../assets/ui/theme/upgrade_card_panel_v2.png', import.meta.url).href
};

const WEAPON_ICONS: Record<WeaponConfig['id'] | 'banana', string> = {
  staff: new URL('../../assets/weapons/staff-icon.png', import.meta.url).href,
  sword: new URL('../../assets/weapons/sword-icon.png', import.meta.url).href,
  boomerang: new URL('../../assets/weapons/boomerang-icon.png', import.meta.url).href,
  amulet: new URL('../../assets/weapons/aura-amulet-icon.png', import.meta.url).href,
  whip: new URL('../../assets/weapons/whip-icon.png', import.meta.url).href,
  banana: new URL('../../assets/weapons/banana-boomerang-icon.png', import.meta.url).href
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

/** Upgrade id → icon (Phaser: GameScene UPGRADE_ICON_KEYS). Unknown ids fall back to the damage icon, like there. */
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

/** Placeholder companion portraits (inline SVG) until there's art: a bow over a skull, a stone face with glowing eyes. */
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`)}`;
const COMPANION_ICONS: Record<CompanionKind, string> = {
  skeletonArcher: svg('<path d="M14 8 Q44 32 14 56" fill="none" stroke="#8a5a32" stroke-width="5"/><line x1="14" y1="8" x2="14" y2="56" stroke="#e9dfc4" stroke-width="1.5"/><circle cx="38" cy="30" r="13" fill="#e9dfc4"/><rect x="31" y="39" width="14" height="8" fill="#b9ab8c"/><rect x="31" y="26" width="5" height="6" fill="#1c1420"/><rect x="40" y="26" width="5" height="6" fill="#1c1420"/><line x1="16" y1="32" x2="58" y2="32" stroke="#c9b89a" stroke-width="2.5"/><path d="M58 32 l-7 -4 v8z" fill="#cfd6dc"/>'),
  waterFairy: svg('<ellipse cx="20" cy="26" rx="14" ry="9" fill="#9fe8ff" opacity=".75" transform="rotate(-30 20 26)"/><ellipse cx="44" cy="26" rx="14" ry="9" fill="#9fe8ff" opacity=".75" transform="rotate(30 44 26)"/><ellipse cx="32" cy="36" rx="7" ry="11" fill="#6fd3ff"/><circle cx="32" cy="22" r="7" fill="#e6f6ff"/><circle cx="32" cy="22" r="11" fill="none" stroke="#e6f6ff" stroke-opacity=".5" stroke-width="1.5"/><path d="M28 52 q4 6 8 0" stroke="#6fd3ff" stroke-width="2" fill="none"/>'),
  stoneGolem: svg('<rect x="12" y="10" width="40" height="44" rx="6" fill="#8f8574"/><rect x="12" y="10" width="40" height="12" fill="#a99f8c"/><rect x="20" y="28" width="9" height="7" fill="#6dff9a"/><rect x="35" y="28" width="9" height="7" fill="#6dff9a"/><rect x="22" y="42" width="20" height="5" fill="#5a5246"/><path d="M12 22 l8 6 M52 20 l-6 9" stroke="#5a5246" stroke-width="2.5"/>')
};

/** The tavern regulars' portraits (dialogue panel). */
const NPC_FACES: Record<QuestNpcId, string> = {
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

export function npcPortrait(name: QuestNpcId | 'sergio'): string | undefined {
  return NPC_PORTRAITS[`../../assets/characters/npcs/${name}-portrait.png`];
}

export function npcFace(id: QuestNpcId): string {
  return npcPortrait(id) ?? NPC_FACES[id];
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

/** The life-steal art doubles as the Aura Podre "healing cut" status icon (Phaser: GameHud.rottenHealIcon). */
export const LIFE_STEAL_ICON = UPGRADE_ART.lifeSteal;

/** Faces for the off-screen markers (a portrait in a ring, the arrow on its rim): who you're being pointed to. */
export type MarkerKind = 'boss' | 'gravedigger' | 'templeGuardian' | 'lakeSpirit' | 'end' | 'continue' | 'merchant' | 'barrel';
const MARKER_FACES: Record<MarkerKind, string> = {
  // The Necromancer: a crowned skull with green fire in the sockets.
  boss: svg('<path d="M14 20 l6 -10 l6 8 l6 -12 l6 12 l6 -8 l6 10 z" fill="#b8923a"/><circle cx="32" cy="36" r="16" fill="#d8cfb4"/><rect x="22" y="31" width="8" height="8" fill="#0c0a10"/><rect x="34" y="31" width="8" height="8" fill="#0c0a10"/><rect x="24" y="33" width="4" height="4" fill="#6dff9a"/><rect x="36" y="33" width="4" height="4" fill="#6dff9a"/><rect x="25" y="46" width="14" height="6" fill="#a89c80"/><rect x="27" y="46" width="2" height="4" fill="#f0e8d0"/><rect x="31" y="46" width="2" height="4" fill="#f0e8d0"/><rect x="35" y="46" width="2" height="4" fill="#f0e8d0"/>'),
  // O Coveiro: a skull deep in a ragged hood, green pin-prick eyes.
  gravedigger: svg('<path d="M32 6 L54 46 L10 46 Z" fill="#2a2a24"/><circle cx="32" cy="38" r="12" fill="#e2d8bd"/><rect x="25" y="34" width="6" height="6" fill="#120e16"/><rect x="33" y="34" width="6" height="6" fill="#120e16"/><rect x="27" y="36" width="2" height="2" fill="#6dff9a"/><rect x="35" y="36" width="2" height="2" fill="#6dff9a"/><rect x="27" y="46" width="10" height="5" fill="#b3a685"/>'),
  // Guardião do Templo: a carved stone face, cyan runes, gold crest.
  templeGuardian: svg('<path d="M32 4 L40 16 L24 16 Z" fill="#b8923a"/><rect x="14" y="16" width="36" height="38" rx="3" fill="#9a8f7c"/><rect x="14" y="16" width="36" height="8" fill="#6f675a"/><rect x="20" y="30" width="9" height="6" fill="#7fe3ff"/><rect x="35" y="30" width="9" height="6" fill="#7fe3ff"/><rect x="22" y="44" width="20" height="4" fill="#5a5246"/><rect x="30" y="38" width="4" height="4" fill="#7fe3ff"/>'),
  // O Espírito do Lago: a face of water under a crown of water spikes.
  lakeSpirit: svg('<path d="M18 22 l4 -12 l4 10 l6 -14 l6 14 l4 -10 l4 12 z" fill="#e6f6ff"/><ellipse cx="32" cy="36" rx="18" ry="18" fill="#8fdcff"/><ellipse cx="32" cy="44" rx="12" ry="7" fill="#4fb3e0"/><rect x="22" y="31" width="8" height="5" fill="#ffffff"/><rect x="34" y="31" width="8" height="5" fill="#ffffff"/><path d="M14 50 q9 -6 18 0 q9 6 18 0" stroke="#e6f6ff" stroke-width="3" fill="none"/>'),
  end: svg('<circle cx="32" cy="32" r="18" fill="none" stroke="#9fb4ff" stroke-width="6"/><circle cx="32" cy="32" r="9" fill="#9fb4ff" opacity=".6"/><path d="M26 32 h12 m-5 -5 l5 5 l-5 5" stroke="#ffffff" stroke-width="3" fill="none"/>'),
  // Sergio, the merchant: a wide hat over a grey beard, a gold coin at the brim.
  merchant: svg('<rect x="8" y="22" width="48" height="5" rx="2" fill="#3a2a1e"/><path d="M20 22 L32 6 L44 22 Z" fill="#3a2a1e"/><circle cx="32" cy="34" r="11" fill="#d9a77e"/><rect x="26" y="31" width="4" height="4" fill="#1a1410"/><rect x="34" y="31" width="4" height="4" fill="#1a1410"/><path d="M21 38 L43 38 L32 58 Z" fill="#cfc8bb"/><circle cx="46" cy="18" r="5" fill="#ffc65a" stroke="#b8923a" stroke-width="2"/>'),
  // One of Brom's lost barrels.
  barrel: svg('<ellipse cx="32" cy="14" rx="16" ry="5" fill="#c9963f"/><path d="M16 14 Q12 32 16 50 L48 50 Q52 32 48 14 Z" fill="#8a5a32"/><rect x="13" y="22" width="38" height="4" fill="#4a4a52"/><rect x="13" y="40" width="38" height="4" fill="#4a4a52"/><ellipse cx="32" cy="50" rx="16" ry="5" fill="#6a4226"/>'),
  continue: svg('<circle cx="32" cy="32" r="18" fill="none" stroke="#7dffa0" stroke-width="6"/><circle cx="32" cy="32" r="9" fill="#7dffa0" opacity=".6"/><path d="M32 24 v16 M24 32 h16" stroke="#ffffff" stroke-width="3"/>')
};

export function markerFace(kind: MarkerKind): string {
  if (kind === 'merchant') return npcPortrait('sergio') ?? MARKER_FACES.merchant;
  return MARKER_FACES[kind];
}
