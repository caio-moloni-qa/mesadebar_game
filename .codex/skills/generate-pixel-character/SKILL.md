---
name: generate-pixel-character
description: Create pixel-art bitmap characters and character assets from user descriptions, including heroes, enemies, NPCs, monsters, portraits, idle poses, animation frames, and sprite sheets. Use when the user asks to generate, design, or export a pixel-art character with a described appearance, class, pose, size such as 16x16, 32x32, 64x64, transparency, facing direction, or game sprite constraints.
---

# Generate Pixel Character

## Workflow

Turn the user's character description into a precise image-generation prompt for a pixel-art bitmap character asset. Use `imagegen` for new images or character edits when available.

1. Extract the character type, size, pose, facing direction, background requirement, and intended use.
2. **Confirm the generation path with the user before producing anything.** Ask whether they want a ready-to-run prompt handed back to execute themselves in an external tool, or whether you should attempt generation directly now — and only attempt direct generation if an image-generation tool is actually available in this environment/session. Don't silently assume either path; confirming first avoids wasted generations and keeps the result aligned with what the user actually wants.
3. If size is missing, choose a reasonable default and state it briefly: 32x32 for small game sprites, 64x64 for detailed sprites, 128x128 for portraits or larger enemies.
4. Default to a transparent background for sprites and an opaque simple background for portraits unless the user says otherwise.
5. Ask a concise clarification only when a missing detail materially changes the asset, such as sprite vs portrait, single pose vs sprite sheet, or exact frame count.
6. Generate directly when the request is clear.
7. If working inside a repo, place generated assets in the most appropriate existing asset folder; otherwise use the current workspace.
8. For sprite sheets, inspect the generated sheet before wiring it into code. Fix alignment, transparency, and loose-pixel issues in the asset first.

## Prompt Recipe

Include:

- Exact dimensions or frame size.
- Pixel-art style with crisp square pixels, strong silhouette, readable details, no photorealism, no blur, and no soft brush rendering.
- Character species/class/role, outfit, props, palette, mood, and pose.
- Sprite constraints: centered subject, consistent scale, transparent background, clear facing direction, no text, no logos, no watermark.
- Animation constraints when relevant: rows, columns, frame count, animation names, even spacing, transparent background.
- Registration constraints for animation: each frame must stay inside its cell, body center and feet baseline must be consistent per row, and neighboring-row/neighboring-column pixels must never leak into another frame.

Example prompt:

```text
Create a 32x32 pixel-art hero sprite, front-facing idle pose, medieval tavern warrior with a blue tunic, small sword, leather boots, and readable silhouette. Transparent background, centered character, crisp square-pixel aesthetic, no text, no logos, no photorealism, no blur.
```

## Character Types

- Single sprites: prioritize silhouette, pose clarity, and transparent background.
- Enemies/monsters: exaggerate the unique shape so the character reads at small size.
- Portraits: use larger canvas, head-and-shoulders composition, and a simple non-distracting background unless transparency is requested.
- Sprite sheets: specify frame size, grid layout, animations, direction, and consistent registration point.

## Sprite Sheet Quality Rules

Use these rules for walk cycles and other animation sheets:

- Keep every frame fully contained inside its exact cell. Add explicit prompt language such as "no pixels crossing into neighboring cells" and "generous transparent padding inside each frame."
- Keep a stable registration point. For each direction row, normalize frame centers around the same x position and align feet to the same baseline. A large sprite magnifies even tiny frame drift into visible shaking.
- Animate the pose, not the whole body. Head, torso, shoulders, and primary held items should stay visually stable unless the animation intentionally demands otherwise.
- Make side-walk legs readable. For left/right rows, show clear foot alternation: neutral, front foot extended, neutral, back foot extended. If a robe, cloak, tail, or dress hides the feet, ask for the garment to open or sway enough to reveal the legs.
- Make front/down walking readable too. Do not accept a cycle where the character only bobs or shakes; the lower body should alternate legs/feet like the main playable characters.
- Match animation speed to movement speed. Slow, huge enemies often look better at lower frame rates such as 4 FPS, while normal characters can use 8 FPS. Too many animation frames per second on a slow character can read as jitter.
- Use consistent scale across all frames. A character that becomes smaller or larger in one frame will feel like it is pulsing rather than walking.
- Prefer replacing a bad row over patching many individual pixels. Small manual fixes are good for cleanup, but a row with poor leg motion or a cut-off head usually needs a regenerated row or sheet.
- **Design animations around a static anchor element when the concept allows it.** A sheet where most of the silhouette stays fixed and only a small inner/secondary part animates (e.g. a portal ring that stays put while only the inner energy swirls, or a held object's glow pulsing while the pose stays still) is dramatically easier to keep aligned than a sheet where the whole silhouette moves every frame (a door swinging open, a full walk cycle). If the subject supports it, prefer that design — it also makes the fixed-window crop technique below trivially reliable.
- **The generator will not honor an exact requested canvas size.** Expect a fixed set of returned canvas sizes (commonly ~1024x1024, 1536x1024, or 1024x1536) regardless of the requested frame/grid dimensions. Always measure the actual returned image and compute the real per-frame grid math from that, not from the prompt's requested numbers.

## Loose Pixel And Frame-Leak Cleanup

After generating or editing a sprite sheet:

- Inspect each cell independently. Search for connected components that are not attached to the main character silhouette.
- Remove small detached components at the bottom, top, or frame edges when they look like leaked parts of another frame, such as bits of head, staff, robe, weapon, spell glow, or shadow.
- Do not remove legitimate separated body parts unless they are intentionally separate and still belong in that frame. For example, a staff head can be disconnected by transparent gaps, but a tiny duplicate staff piece below the feet is usually a leak.
- Check neighboring rows after cleanup. Removing a leaked piece from one row may reveal that the original frame in the adjacent row was cut off and needs to be moved lower or regenerated with padding.
- Remove fake transparency. If the image generator outputs checkerboard, black, white, or chroma-key background pixels as real pixels, convert only the background/matte to alpha and validate transparent corners.
- **Don't judge transparency by how an image viewer renders it.** Many viewers paint transparent regions as a flat gray, dark, or checkerboard fill that can look deceptively like an opaque background at a glance. Always read the actual alpha channel value at a handful of corner/background pixels programmatically before concluding a background is (or isn't) opaque — a flat gray render with alpha=0 underneath is genuinely transparent and fine to use as-is.
- Avoid aggressive cleanup that deletes internal highlights. When filling transparent holes inside the body, fill only small enclosed holes using nearby colors; keep exterior background transparent.
- Validate by viewing the sheet at original size and by testing it in-game at the actual display scale. Large bosses expose issues that are invisible at thumbnail size.

## Fixing Frame Drift: Fixed-Window Crop

Even a well-crafted prompt asking for "identical framing in every cell" often doesn't fully deliver — per-frame content can still drift by a meaningful number of pixels between cells (double-digit pixel drift on a ~250px frame is a realistic outcome, not a worst case). Don't chase a perfect prompt indefinitely; treat this as an expected post-processing step:

1. After generating, measure each frame's own alpha-content bounding box (min/max x/y where alpha exceeds a low threshold) independently.
2. If the boxes disagree noticeably between frames, **do not crop each frame to its own bounding box** — that guarantees the animation will visibly jitter/tremble in-game, since the subject's position shifts frame to frame relative to the crop.
3. Instead, pick one shared, fixed crop rectangle (the same absolute pixel coordinates) and apply it identically to every frame. This guarantees zero positional jitter regardless of the underlying art's inconsistency, at the acceptable cost of sometimes including a little extra background or clipping a decorative edge slightly on the frames that drifted most.
4. When the sheet has a static anchor element (see above), it's fine and often better to pick the fixed window so it deliberately excludes an inconsistent decorative fringe (e.g. an outer frame/corner-post) if that fringe is redundant with something else already rendered in-game (another sprite layered behind/around it) — the fixed window only needs to keep the part that actually needs to read as animating.

## Examples

User: "Make a 32x32 slime enemy sprite"

Action: Generate a centered 32x32 pixel-art slime enemy on a transparent background. Do not ask a clarification.

User: "Create a walking hero sprite sheet"

Action: Ask for frame size and number of directions only if project context does not imply them. Otherwise generate a transparent sprite sheet with evenly spaced frames.
