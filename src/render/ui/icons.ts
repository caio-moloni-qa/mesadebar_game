import { WeaponConfig } from '../../config/weapons';

// The Phaser build's 2D art, reused by the DOM UI. One static URL literal per file so Vite rewrites each with the
// base path (a computed `new URL` would lose it).

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
  damage: new URL('../../assets/upgrades/core/damage-icon.png', import.meta.url).href,
  cooldown: new URL('../../assets/upgrades/core/cooldown-icon.png', import.meta.url).href,
  speed: new URL('../../assets/upgrades/core/speed-icon.png', import.meta.url).href,
  lifeSteal: new URL('../../assets/upgrades/core/life-steal-icon.png', import.meta.url).href,
  colossusArms: new URL('../../assets/upgrades/core/colossus-arms-icon.png', import.meta.url).href,
  chainedFury: new URL('../../assets/upgrades/core/chained-fury-icon.png', import.meta.url).href,
  whirlwind: new URL('../../assets/upgrades/core/whirlwind-attack-icon.png', import.meta.url).href,
  arcaneBlessing: new URL('../../assets/upgrades/core/arcane-blessing-icon.png', import.meta.url).href,
  arcaneBounce: new URL('../../assets/upgrades/core/arcane-bounce-icon.png', import.meta.url).href,
  wideBolt: new URL('../../assets/upgrades/core/wide-bolt-icon.png', import.meta.url).href,
  auraRadius: new URL('../../assets/upgrades/core/aura-radius-icon.png', import.meta.url).href,
  auraDamage: new URL('../../assets/upgrades/core/aura-damage-icon.png', import.meta.url).href,
  auraTickSpeed: new URL('../../assets/upgrades/core/aura-tick-speed-icon.png', import.meta.url).href
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

export function weaponIcon(id: WeaponConfig['id'] | 'banana'): string {
  return WEAPON_ICONS[id];
}

export function upgradeIcon(id: string): string {
  return UPGRADE_ICONS[id] ?? UPGRADE_ART.damage;
}

/** The life-steal art doubles as the Aura Podre "healing cut" status icon (Phaser: GameHud.rottenHealIcon). */
export const LIFE_STEAL_ICON = UPGRADE_ART.lifeSteal;
