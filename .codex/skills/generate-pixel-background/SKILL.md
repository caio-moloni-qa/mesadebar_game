---
name: generate-pixel-background
description: Create pixel-art bitmap backgrounds and environment assets from user descriptions, including wallpapers, grass fields, dungeon floors, seamless tiles, parallax layers, terrain textures, battle arenas, and game maps. Use when the user asks to generate, design, or export a pixel-art background with a described scene, style, tileability, dimensions such as 1920x1080, or game environment constraints.
---

# Generate Pixel Background

## Workflow

Turn the user's environment description into a precise image-generation prompt for a pixel-art bitmap background. Use `imagegen` for new images or background edits when available.

1. Extract the scene, dimensions, perspective, intended use, and repeat/tile requirements.
2. If dimensions are missing, choose a reasonable default and state it briefly: 1920x1080 for desktop/game backgrounds, 512x512 for square environment plates, 256x256 for terrain textures, 32x32 or 64x64 for tiles.
3. Ask a concise clarification only when a missing detail materially changes the asset, especially tileable vs non-tileable, top-down vs side-view, or exact size.
4. Generate directly when the request is clear.
5. If working inside a repo, place generated assets in the most appropriate existing asset folder; otherwise use the current workspace.

## Prompt Recipe

Include:

- Exact dimensions and aspect ratio.
- Pixel-art style with crisp square pixels, readable clusters, no photorealism, no blur, and no soft brush rendering.
- Environment subject, perspective, mood, biome, era, and gameplay purpose.
- Composition constraints such as open gameplay space, UI-safe margins, no characters, no text, no logos, and no watermark.
- Tile constraints when relevant: seamless edges, repeatable pattern, orthographic/top-down view, consistent lighting, no unique landmarks crossing tile boundaries.

Example prompt:

```text
Create a 1920x1080 pixel-art grass background for a fantasy survival game. Top-down meadow field with varied grass clusters, small flowers, dirt flecks, and subtle natural color variation. Leave broad readable open areas for gameplay. Crisp square-pixel aesthetic, no characters, no text, no logos, no photorealism, no blur. Opaque background.
```

## Background Types

- Full backgrounds: emphasize composition, readable focal areas, and room for UI or gameplay when mentioned.
- Tiles/textures: specify square canvas, seamless edges, and consistent lighting.
- Parallax layers: specify transparent background if only a foreground/midground layer is requested.
- Battle arenas/maps: keep obstacles and landmarks intentional; avoid clutter that hides characters.

## Examples

User: "I want a grass background with 1920x1080 pixel shape"

Action: Generate a 1920x1080 opaque pixel-art grass background. Do not ask a clarification.

User: "Create dungeon floor tiles"

Action: Ask for tile size or infer 32x32 if the surrounding project already uses that size. Generate seamless top-down floor tiles.
