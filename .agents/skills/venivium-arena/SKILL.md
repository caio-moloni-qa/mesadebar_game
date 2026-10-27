---
name: mesa-arena
description: "Add or change an arena in Mesa de Bar: its layout (zones, lake, trails, ruins, graveyard, camp, guardians) in arenaLayout.ts, its look (ArenaTheme), the arena picker, and how to check the layout against approved concept art. Use for new arenas, map changes or arena visuals."
---

# Add or change an arena

## How arenas work

- `src/config/arenaLayout.ts` holds every arena as an `ArenaLayout` (`GREENFIELD`, `SNOWFIELD`) in game units
  (32 units = 1 m; arenas are 3520 × 3520). They all share one shape: a central clearing (the spawn, kept empty within
  `SPAWN_CLEARING_RADIUS`), five regions on trails, three of them guardian arenas.
- `ArenaMap.generate(seed, layout)` (`src/core/world/ArenaMap.ts`) builds obstacles and decor from a layout and keeps
  it (`map.layout`). **Core code reads the map's own layout** (guardian anchors are `anchor(layout)`, the rotation is
  `guardianRotation(layout)`): the map in play and the "active" layout can differ.
- The module-level exports (`ZONES`, `LAKE`, `TRAILS`, `TEMPLE`... and `ACTIVE_LAYOUT`) are the **active** arena's,
  swapped by `useArenaLayout(layout)`. The renderer's painters and the theme still read those, so switch them together
  with the map. Never cache them at module load.
- The look is an `ArenaTheme` in `src/render/world/arenaTheme.ts` (ground palettes, ice, grass, water, light, mist,
  snow on props, particles), picked by layout id in `activeArenaTheme()` from the `THEMES` map.
- After "Jogar", the start menu shows the **area picker** (`areaStep` in `src/render/StartMenu.ts`): one card per
  `ARENA_LAYOUTS` entry with its text (`AREA_TEXT`), its progress (`arenaProgress`) and, while unfinished, an
  "Em desenvolvimento" badge (`AREAS_IN_DEVELOPMENT`). Choosing one calls `Game3D.useArena(id)` (layout + map +
  scenery) and enters that area's tavern. `?arena=<id>` starts there directly.
- Tavern regulars belong to an area (`AREAS` in `src/config/areas.ts`); an arena with no area entry has an empty
  tavern.

## Adding an arena

1. Approved concept art first (top-down, 2048 px = 3520 units), saved under `art-source/arenas/<id>/`.
2. A new `ArenaLayout` in `arenaLayout.ts`, measured off the art (pixel × 1.71875), and registered in
   `ARENA_LAYOUTS`. Keep doorways in walls wide enough (≥ 150) and the hero's routes open; set `guardians`.
3. An `ArenaTheme` for it in `arenaTheme.ts` and the `THEMES` map.
4. Its card text in `AREA_TEXT` (one line, pt-BR), and `AREAS_IN_DEVELOPMENT` while it isn't finished; regulars, if
   it has its own tavern, in `src/config/areas.ts`.
5. Tests like `src/core/world/Snowfield.test.ts`: over several seeds the spawn clearing is empty and every region,
   guardian arena and trail end is reachable on foot (flood fill over `isWalkable`); special terrain works (walkable
   ice, blocking water); guardians rise in their regions.

## Check the layout against the art

Render the generated obstacles over the concept image and look at it: zones (dashed circles), trails, water, walls
and props must land on what the art shows. A quick way: a throwaway vitest that writes an HTML page with the concept
as an `<image>` and the obstacles as SVG shapes (scale `2048 / ARENA_SIZE`), screenshotted with headless Chrome. Fix
the measurements until it matches, then delete the throwaway test. Post the overlay with the result.

## Check the look

**mesa-verify** with `arena=<id>&at=<zone>` for each region (`meadow`, `ruins`, `forest`, `lake`, `graveyard`,
`camp`), and once through the area picker both ways, so the other arena still looks unchanged.
