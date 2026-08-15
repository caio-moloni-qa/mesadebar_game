---
name: generate-pixel-background
description: Create pixel-art bitmap backgrounds and environment assets from user descriptions, including wallpapers, grass fields, dungeon floors, seamless tiles, parallax layers, terrain textures, battle arenas, and game maps. Use when the user asks to generate, design, or export a pixel-art background with a described scene, style, tileability, dimensions such as 1920x1080, or game environment constraints.
---

# Generate Pixel Background

## Workflow

Turn the user's environment description into a precise image-generation prompt for a pixel-art bitmap background. Use `imagegen` for new images or background edits when available.

1. Extract the scene, dimensions, perspective, intended use, and repeat/tile requirements.
2. **Confirm the generation path with the user before producing anything.** Ask whether they want a ready-to-run prompt handed back to execute themselves in an external tool, or whether you should attempt generation directly now — and only attempt direct generation if an image-generation tool is actually available in this environment/session. Don't silently assume either path; this repo's sessions have gone both ways, and confirming first avoids wasted generations and keeps the result aligned with what the user actually wants.
3. **Match the project's existing camera angle, don't default to flat top-down.** Inspect an existing character sprite (or other ground-level prop) before writing the prompt. Many "top-down" game camera actually use a gently elevated 3/4 angle (you can see the front/side face of objects, not just their tops) — a background generated as pure bird's-eye view will visibly clash with characters rendered at that angle, even though both are loosely "top-down." Describe the angle explicitly in the prompt (e.g. "gently elevated 3/4 top-down perspective, like a classic action-RPG ground view — objects show a hint of their front face and a small contact shadow, not just their flat top surface"), and add soft per-object contact shadows if the reference perspective has them.
4. If dimensions are missing, choose a reasonable default and state it briefly: 1920x1080 for desktop/game backgrounds, 512x512 for square environment plates, 256x256 for terrain textures, 32x32 or 64x64 for tiles. **Expect the generator to ignore the exact number anyway** — image tools in practice tend to return a fixed set of canvas sizes (commonly ~1024x1024, 1536x1024, or 1024x1536) regardless of what's requested. Always measure the actual returned dimensions before doing any downstream math (tiling, cropping, frame slicing) instead of trusting the prompt's requested size.
5. Ask a concise clarification only when a missing detail materially changes the asset, especially tileable vs non-tileable, top-down vs side-view, or exact size.
6. Generate directly when the request is clear.
7. If working inside a repo, place generated assets in the most appropriate existing asset folder; otherwise use the current workspace.

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

## Seamless Tiling: Verify, Then Repair If Needed

Asking for "seamless edges" in the prompt is necessary but not sufficient — image generators routinely come back close but not pixel-perfect at the wrap boundary (a few percent average color mismatch is common, with occasional much larger spikes where an object like a rock or flower got clipped on only one side). Never trust the "seamless" claim at face value.

1. **Verify by rendering a self-tile test.** Programmatically tile the generated image 2x2 (or larger) into one image and inspect it — a real seam shows up as a visible line or color jump running through the middle of the render, even when the source image looks fine in isolation. Also worth a quick numeric check: compare the left column's pixels against the right column's (and top row against bottom row) and look at the average/max color difference — a healthy seamless texture reads near zero; tens-out-of-255 average with much higher spikes means there's a real seam to fix.
2. **If there's a seam, repair with the offset-and-blend technique** rather than regenerating and hoping for better luck:
   - Roll the image by half its width and half its height (with wraparound). This moves the problematic seam from the four outer edges to a cross running through the *center* of the image, where it's surrounded by real content on every side instead of just one.
   - Apply a narrow, gently-feathered blur only in a thin band straddling that center cross (horizontal blur across the vertical seam band, vertical blur across the horizontal seam band), tapering the blend weight to zero at the band's edges so it merges invisibly into untouched texture.
   - **Keep the band and blur radius small.** A wide band with a strong blur radius creates an obvious soft/blurry stripe that reads far worse than the original faint seam — this is a real failure mode, not a hypothetical one. Start narrow (roughly 20-25px band, single-digit blur radius on a ~1200px-square texture) and only widen if the seam is still visible in the 2x2 test.
   - The image's outer edges are never touched by this process — they now correspond to what used to be the middle of the original image, which was never a wrap boundary and needs no repair.
3. Re-run the 2x2 tile test after repair to confirm the fix actually helped before wiring the asset into the game.

## Self-Contained Panel/Scroll Backdrops

Some "backgrounds" aren't tileable environment art at all — they're a single self-contained shaped asset meant to fill one exact screen region (a parchment scroll side panel, a full-screen character-select backdrop, a decorative frame). These follow different rules than tileable textures:

- **Generate at the target region's own aspect ratio**, computed before writing the prompt, so the asset displays at its native proportions (`setDisplaySize` to that same ratio) instead of stretching to fill an arbitrary rectangle.
- **If the asset must fill its region completely with no gaps** (e.g. a full-screen backdrop), explicitly require the artwork to extend flush to all four canvas edges with zero border/margin — a generator will often leave a vignette or padding around the "subject" by default, which then shows as a visible gap or mismatched-color margin once placed at the target size.
- **Request genuine alpha transparency, not a baked-in solid color, for anything with an irregular silhouette** (scroll dowels with rounded finials, a beveled-corner card) that will sit over other content — read the actual alpha channel at the shape's outer corners to confirm (same caveat as the character/upgrade skills: a viewer can render alpha=0 as a solid gray/black fill that looks opaque at a glance).

## Examples

User: "I want a grass background with 1920x1080 pixel shape"

Action: Generate a 1920x1080 opaque pixel-art grass background. Do not ask a clarification.

User: "Create dungeon floor tiles"

Action: Ask for tile size or infer 32x32 if the surrounding project already uses that size. Generate seamless top-down floor tiles.
