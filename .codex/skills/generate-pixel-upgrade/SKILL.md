---
name: generate-pixel-upgrade
description: Create pixel-art bitmap upgrade and perk assets from user descriptions, including upgrade icons, level-up choice cards, passive ability icons, stat boost symbols, cooldown, damage, speed, armor, healing, pickup range, magic, and survivor-like upgrade UI art. Use when the user asks to generate, design, or export pixel-art art for game improvements/upgrades with sizes such as 32x32, 48x48, 64x64, transparent background, medieval fantasy styling, or Phaser UI constraints.
---

# Generate Pixel Upgrade

## Workflow

Turn the user's upgrade description into a precise image-generation prompt for a readable pixel-art UI asset. Use `imagegen` for new bitmap assets when available.

1. Extract upgrade effect, intended use, size, palette, and background requirement.
2. If size is missing, choose `64x64` for level-up cards, `48x48` for compact card icons, or `32x32` for tiny HUD/list icons.
3. Default to a transparent background. In built-in image generation, request a flat chroma-key background and remove it locally before saving to the repo.
4. Ask a concise clarification only when the effect is ambiguous enough to change the symbol, such as damage vs spell damage or speed vs attack speed.
5. Generate directly when the request is clear.
6. Save repo-bound outputs under `src/assets/upgrades` unless the project has a more specific existing UI asset folder.

## Prompt Recipe

Include:

- Exact dimensions or intended final size.
- Pixel-art style with crisp square pixels, strong silhouette, readable shape, no photorealism, no blur, and no soft brush rendering.
- Upgrade effect represented as a symbol: sword burst for damage, hourglass/runes for cooldown, boots/wind for speed, shield for armor, heart/cross for healing, magnet/gem for pickup range, book/spark for magic.
- Medieval fantasy UI styling: aged metal, parchment, gems, runes, small ornamentation, restrained glow.
- Constraints: centered subject, generous padding, transparent final output, no text, no letters, no numbers, no logos, no watermark.

For transparent assets, prompt the source like this:

```text
Create the upgrade icon on a perfectly flat solid #00ff00 chroma-key background for background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Do not use #00ff00 anywhere in the subject.
```

Use `#ff00ff` instead of `#00ff00` when the icon itself is green, such as healing, poison, nature, or pickup-range effects.

## Upgrade Icon Types

- Damage: sharp impact, red/orange burst, blade or arcane strike.
- Cooldown or attack speed: hourglass, clock rune, quick spark, blue/gold motion marks.
- Movement speed: boots, wind trail, feather, green/yellow motion accents.
- Armor or defense: shield, plate, stone/iron rim, silver/blue palette.
- Healing or max health: heart, plus, vial, green/red glow.
- Pickup range or magnetism: gem pulled by rings, magnet, teal/cyan aura.
- Magic or spell power: book, staff head, starburst, violet/blue runes.

## Examples

User: "Create an icon for +25% damage"

Action: Generate a 64x64 transparent pixel-art upgrade icon showing a medieval blade strike or red arcane impact, save it under `src/assets/upgrades/damage-icon.png`.

User: "Create icons for all current upgrades"

Action: Inspect `src/systems/UpgradeSystem.ts`, generate one stable icon per upgrade id, and save them under `src/assets/upgrades` with names such as `damage-icon.png`, `cooldown-icon.png`, and `speed-icon.png`.

User: "Make a healing upgrade icon"

Action: Generate a 64x64 transparent pixel-art green/red medieval healing icon. Use magenta chroma key if the subject is green.
