---
name: generate-pixel-character
description: Create pixel-art bitmap characters and character assets from user descriptions, including heroes, enemies, NPCs, monsters, portraits, idle poses, animation frames, and sprite sheets. Use when the user asks to generate, design, or export a pixel-art character with a described appearance, class, pose, size such as 16x16, 32x32, 64x64, transparency, facing direction, or game sprite constraints.
---

# Generate Pixel Character

## Workflow

Turn the user's character description into a precise image-generation prompt for a pixel-art bitmap character asset. Use `imagegen` for new images or character edits when available.

1. Extract the character type, size, pose, facing direction, background requirement, and intended use.
2. If size is missing, choose a reasonable default and state it briefly: 32x32 for small game sprites, 64x64 for detailed sprites, 128x128 for portraits or larger enemies.
3. Default to a transparent background for sprites and an opaque simple background for portraits unless the user says otherwise.
4. Ask a concise clarification only when a missing detail materially changes the asset, such as sprite vs portrait, single pose vs sprite sheet, or exact frame count.
5. Generate directly when the request is clear.
6. If working inside a repo, place generated assets in the most appropriate existing asset folder; otherwise use the current workspace.

## Prompt Recipe

Include:

- Exact dimensions or frame size.
- Pixel-art style with crisp square pixels, strong silhouette, readable details, no photorealism, no blur, and no soft brush rendering.
- Character species/class/role, outfit, props, palette, mood, and pose.
- Sprite constraints: centered subject, consistent scale, transparent background, clear facing direction, no text, no logos, no watermark.
- Animation constraints when relevant: rows, columns, frame count, animation names, even spacing, transparent background.

Example prompt:

```text
Create a 32x32 pixel-art hero sprite, front-facing idle pose, medieval tavern warrior with a blue tunic, small sword, leather boots, and readable silhouette. Transparent background, centered character, crisp square-pixel aesthetic, no text, no logos, no photorealism, no blur.
```

## Character Types

- Single sprites: prioritize silhouette, pose clarity, and transparent background.
- Enemies/monsters: exaggerate the unique shape so the character reads at small size.
- Portraits: use larger canvas, head-and-shoulders composition, and a simple non-distracting background unless transparency is requested.
- Sprite sheets: specify frame size, grid layout, animations, direction, and consistent registration point.

## Examples

User: "Make a 32x32 slime enemy sprite"

Action: Generate a centered 32x32 pixel-art slime enemy on a transparent background. Do not ask a clarification.

User: "Create a walking hero sprite sheet"

Action: Ask for frame size and number of directions only if project context does not imply them. Otherwise generate a transparent sprite sheet with evenly spaced frames.
