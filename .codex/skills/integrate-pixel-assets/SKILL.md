---
name: integrate-pixel-assets
description: Generate, prepare, and integrate pixel-art UI assets into a Phaser TypeScript repository. Use when an icon, sprite, projectile, upgrade art, weapon art, or other raster asset must be added to the project with consistent dimensions, transparency, naming, preload registration, and UI mapping.
---

# Integrate Pixel Assets

## Workflow

1. Inspect neighboring assets and their runtime use: directory, dimensions, alpha treatment, Phaser loader type, texture key, animation metadata, and UI display size.
2. Use the applicable image-generation skill for new bitmap art. Specify subject, dimensions, pixel density, transparent final background, no text, and the project palette.
3. Produce one file per runtime asset. If a chroma-key source is necessary, remove only the flat key color and preserve antialiased subject pixels. The raw/uncropped generation almost never has the requested canvas size or a tight crop — measure its actual dimensions and content bounding box (alpha-threshold scan, not eyeballing a viewer render) before deciding the final crop.
4. Save under the repository's established asset category with a descriptive kebab-case filename. Keep the raw/uncropped source alongside the cropped derivative that actually gets loaded (e.g. `thing.png` + `thing-cropped.png`) rather than overwriting it — re-cropping later (tighter padding, a fixed-window fix for an animated sheet, a different aspect) is far cheaper with the source still on disk.
5. Register the file in the preload scene with a stable texture key. Add animation metadata when the asset is a sprite sheet.
6. Map the key to the UI/content metadata that consumes it. Add a fallback when the UI accepts arbitrary asset IDs.
7. Inspect the exported image at target size and run the TypeScript/build validation.

## Guardrails

- Do not use a composite sheet as multiple runtime images without separating and validating each tile.
- Do not leave chroma-key backgrounds in final game assets.
- Do not confuse loading/mapping an asset with implementing its gameplay behavior.
- Preserve existing assets and naming conventions; do not overwrite an established icon without explicit permission.
- **Preserve each icon's native aspect ratio when placing it into a shared UI slot.** Forcing every icon in a set to the same fixed width AND height distorts whichever ones don't match that aspect ratio — icons in the same logical set are rarely pixel-identical in proportions even when they look similar at a glance. Instead, fix one dimension (usually height, for a row of icons) and compute the other from the texture's own native `width / height` ratio, so every icon scales uniformly without stretching or squashing.
- **When swapping an existing asset for a replacement with a very different native resolution, re-check any code that derives sizes from that texture's native pixels, not just the display size.** Two concrete failure modes seen in practice: (1) a single `Image`/`Sprite` object reused across multiple textures via `setTexture()` keeps its previously-computed scale, so a new texture with a different native size renders at the wrong size until `setDisplaySize()` is called again explicitly; (2) Arcade Physics `setCircle(radius, ...)` (and similar body-sizing calls) take the radius in native/unscaled texture pixels, multiplied live by the game object's current display scale — replacing a 32x32 placeholder with a 600px-wide illustration without recomputing that radius silently shrinks (or explodes) the collision body even though nothing about the collision code changed.
- For any generated sprite sheet, apply the fixed-window crop technique from `generate-pixel-character` if per-frame content drifts — this applies to sheets of any subject (effects, environment props, UI elements), not just characters.
- For any generated tileable background/texture, run the seamless-tiling self-test from `generate-pixel-background` before wiring it in — don't rely on the generation prompt's "seamless" request alone.
