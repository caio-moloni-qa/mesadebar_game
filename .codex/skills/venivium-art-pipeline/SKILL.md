---
name: venivium-art-pipeline
description: "Bring art into Venivium: concept and turnaround prompts, image-to-3D exports processed into game-ready low-poly GLBs (tools/asset-pipeline), rigging, icons and marker heads, and the never-overwrite rule. Use when generating, converting or wiring any 2D or 3D asset."
---

# Art pipeline

## Rules that never bend

- **Never overwrite an asset.** A regeneration is `name_v2.png`, `raw_v2.glb`, ... An overwritten untracked file is
  gone for good.
- Source art lives in `art-source/` (versioned, not bundled). The game only loads what is in `src/assets/`.
- Generated images: transparent background (chroma key `#00ff00`, or `#ff00ff` when the subject is green) unless the
  asset is a full scene (maps, panels). Save the prompt next to the image (`*-generation-prompt.txt`).

## 3D characters and bosses

Per character, `art-source/3d/<id>/` (see `art-source/3d/README.md`):

1. `turnaround.png`: front / right side / back, A-pose, empty hands, flat light, plain grey background.
2. Crop the views: `python tools/asset-pipeline/crop-turnaround.py art-source/3d/<id>/turnaround.png art-source/3d/<id>/views`.
3. Image-to-3D (Tripo / Meshy / Hunyuan3D) from `views/front.png` → save the untouched export as
   `art-source/3d/<id>/raw.glb` (or `.fbx`).
4. Process it into the game's faceted, vertex-coloured low-poly mesh:
   ```bash
   cd tools/asset-pipeline
   node process-character.mjs ../../art-source/3d/<id>/raw.glb ../../src/assets/3d/<characters|bosses>/<id>.glb <triangles> <heightMeters> [--figure 0] [--flip-facing]
   ```
   `--figure 0` when the tool built every view of the sheet side by side. It prints bounds and a width-by-height
   profile for placing joints.
5. Look at it without a browser: `node preview.mjs <out.glb> view.ppm front|side|back` (convert the PPM to PNG with
   PIL).
6. Rig: joint positions (`JointSpec` lists with side, minY, maxY, minAbsX, rest) and the hip height go in
   `src/render/models/importedRig.ts` (heroes) or `importedBosses.ts` (bosses); register the URL; the model builder
   (`heroes.ts`, `zoneActors.ts`) uses the GLB when loaded and falls back to its procedural model.
7. **venivium-verify**: the character select (`__game.menu.showCharacters('<id>')`) and in a run, from several angles.

## 2D: icons, markers, portraits

- Weapon and upgrade icons in `src/assets/weapons/`, `src/assets/upgrades/`; wired in `src/render/ui/icons.ts`
  (`WEAPON_ICONS`, `UPGRADE_ART`, `STORE_ICONS`).
- Off-screen marker faces are **heads cut from the concept art** (`art-source/3d/<boss>/views/front.png`, background
  flood-filled) → `src/assets/ui/markers/<id>-head.png`, registered in `MARKER_FACES`.
- NPC portraits: `src/assets/characters/npcs/<name>-portrait.png` (picked up automatically by `npcPortrait`).

## When you can't generate images yourself

Write the full prompt (subject, size, view, background, style: low-poly, faceted, readable at small size) and hand
it to the agent that can, in the team channel — or build a placeholder procedurally and say it's a placeholder.
