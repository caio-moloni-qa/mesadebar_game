---
name: generate-pixel-weapon
description: Create pixel-art bitmap weapon assets from user descriptions, including swords, staffs, wands, axes, bows, daggers, shields, spell focuses, weapon icons, pickups, inventory items, and equipment art. Use when the user asks to generate, design, or export a pixel-art weapon with a described type, style, size such as 32x32, 64x64, 96x96, transparency, game UI use, pickup use, or Phaser asset constraints.
---

# Generate Pixel Weapon

## Workflow

Turn the user's weapon description into a precise image-generation prompt for a pixel-art bitmap asset. Use `imagegen` for new images or weapon edits when available.

1. Extract weapon type, size, intended use, orientation, palette, and background requirement.
2. **Confirm the generation path with the user before producing anything.** Ask whether they want a ready-to-run prompt handed back to execute themselves in an external tool, or whether you should attempt generation directly now — and only attempt direct generation if an image-generation tool is actually available in this environment/session. Don't silently assume either path; confirming first avoids wasted generations and keeps the result aligned with what the user actually wants.
3. If size is missing, choose a practical default and state it briefly: 64x64 for inventory icons, 96x96 for detailed pickups/equipment previews, 32x32 for tiny UI icons. **The generator won't return that exact canvas size** — expect a fixed canvas (commonly ~1024x1024 or 1536x1024) with the subject centered in padding, and crop toward the target size afterward.
4. Default to requesting a transparent background directly for game assets — many image tools can output genuine alpha transparency without a chroma-key step. Verify by reading the actual alpha channel at background pixels (an image viewer rendering transparent areas as flat gray/dark is not the same as an opaque background — check alpha=0 programmatically before assuming otherwise). Only fall back to the chroma-key recipe below if the output truly comes back opaque.
5. Ask a concise clarification only when a missing detail materially changes the asset, such as icon vs pickup, exact size, or whether the weapon must match an existing character.
6. Generate directly when the request is clear.
7. Save repo-bound outputs under `src/assets/weapons` unless the project has a more specific existing asset folder.

## Prompt Recipe

Include:

- Exact dimensions or intended final size.
- Pixel-art style with crisp square pixels, strong silhouette, readable details, no photorealism, no blur, and no soft brush rendering.
- Weapon type, fantasy tier, material, palette, ornamentation, condition, and magical effects when requested.
- Orientation: diagonal icon, side-view pickup, top-down pickup, or character-held angle.
- Constraints: centered subject, generous padding, transparent final output, no text, no logos, no watermark.

For transparent assets, prompt the source like this:

```text
Create the weapon on a perfectly flat solid #00ff00 chroma-key background for background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Do not use #00ff00 anywhere in the weapon.
```

## Weapon Types

- Icons: prioritize silhouette, centered framing, readable shape, and transparent background.
- Pickups: use a slightly angled or top-down view that matches the game map perspective.
- Character-held weapons: match the character's 3/4 top-down gameplay perspective and keep the weapon scale plausible.
- Magical weapons: keep glow/effects compact so the asset remains readable on the map and in UI.

## Examples

User: "Create a pixel-art staff for the mage"

Action: Generate a transparent pixel-art magic staff, 64x64 by default, with blue/purple arcane accents matching the mage palette.

User: "Create weapon art for every weapon in the project"

Action: Inspect `src/config/weapons.ts`, generate one asset per weapon, save them under `src/assets/weapons`, and keep naming stable such as `staff-icon.png` and `sword-icon.png`.

User: "Make a 32x32 sword icon"

Action: Generate a centered 32x32 transparent pixel-art sword icon with a strong silhouette. Do not ask a clarification.
