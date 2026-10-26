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
  stoneGolem: svg('<rect x="12" y="10" width="40" height="44" rx="6" fill="#8f8574"/><rect x="12" y="10" width="40" height="12" fill="#a99f8c"/><rect x="20" y="28" width="9" height="7" fill="#6dff9a"/><rect x="35" y="28" width="9" height="7" fill="#6dff9a"/><rect x="22" y="42" width="20" height="5" fill="#5a5246"/><path d="M12 22 l8 6 M52 20 l-6 9" stroke="#5a5246" stroke-width="2.5"/>')
};

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
