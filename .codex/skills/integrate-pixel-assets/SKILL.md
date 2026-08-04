---
name: integrate-pixel-assets
description: Generate, prepare, and integrate pixel-art UI assets into a Phaser TypeScript repository. Use when an icon, sprite, projectile, upgrade art, weapon art, or other raster asset must be added to the project with consistent dimensions, transparency, naming, preload registration, and UI mapping.
---

# Integrate Pixel Assets

## Workflow

1. Inspect neighboring assets and their runtime use: directory, dimensions, alpha treatment, Phaser loader type, texture key, animation metadata, and UI display size.
2. Use the applicable image-generation skill for new bitmap art. Specify subject, dimensions, pixel density, transparent final background, no text, and the project palette.
3. Produce one file per runtime asset. If a chroma-key source is necessary, remove only the flat key color and preserve antialiased subject pixels.
4. Save under the repository's established asset category with a descriptive kebab-case filename.
5. Register the file in the preload scene with a stable texture key. Add animation metadata when the asset is a sprite sheet.
6. Map the key to the UI/content metadata that consumes it. Add a fallback when the UI accepts arbitrary asset IDs.
7. Inspect the exported image at target size and run the TypeScript/build validation.

## Guardrails

- Do not use a composite sheet as multiple runtime images without separating and validating each tile.
- Do not leave chroma-key backgrounds in final game assets.
- Do not confuse loading/mapping an asset with implementing its gameplay behavior.
- Preserve existing assets and naming conventions; do not overwrite an established icon without explicit permission.
