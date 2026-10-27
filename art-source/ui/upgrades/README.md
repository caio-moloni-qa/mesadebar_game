# Modern upgrade icons

Thirteen upgrade illustrations generated with the built-in `image_gen` tool for the Three.js UI.
The original PNGs retain the generated alpha channel. Exact prompts are recorded in `prompts.json`;
`damage-icon.png` supplied the material and lighting reference for the other twelve icons.

Runtime exports live in `src/assets/upgrades/modern/`: transparent 256 × 256 WebP images,
with the visible artwork fitted into a centered 224 × 224 area for consistent padding.
The 3D renderer's `src/render/ui/icons.ts` maps these images to the existing upgrade IDs.

Art direction: faceted fantasy equipment and crystals, aged brass, cream edge highlights,
warm red melee/power accents, cyan projectile accents, and jade aura accents. No baked-in text,
frames, or backgrounds.
