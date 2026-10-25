# 3D source art

Source material for the 3D models. Versioned, but **not** bundled into the game: the game loads the optimized
`.glb` files generated from here into `src/assets/3d/`.

One folder per character (`fabri/`, `barbarian/`, ...):

| File | What it is |
|---|---|
| `turnaround.png` | Codex turnaround sheet: front / right side / back, A-pose, empty hands, flat light, grey background |
| `views/front.png`, `views/side.png`, `views/back.png` | Views cropped from the sheet, used as input for the image-to-3D tool |
| `raw.fbx` (or `raw.glb`) | Untouched export from the image-to-3D tool (Tripo / Meshy / Hunyuan3D) |
| `mixamo/<character>.fbx` | Rigged model from Mixamo, downloaded **With Skin** |
| `mixamo/idle.fbx`, `run.fbx`, `attack.fbx`, `hit.fbx`, `death.fbx` | Mixamo animations, **Without Skin**, FBX Binary, 30 fps, "In Place" |

Never overwrite a file: save a regeneration as `turnaround_v2.png`, `raw_v2.fbx`, etc. (an overwrite of an
untracked/unpushed file is unrecoverable).
