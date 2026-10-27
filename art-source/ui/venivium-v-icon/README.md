# Venivium V icon

Final: venivium-v-icon_v2.svg and venivium-v-icon_v2.png (1024x1024 RGBA, transparent).
Original Cinzel 900 glyph matches .game-wordmark in src/play3d.css; gold/copper colors and burgundy extrusion follow the title. SVG uses paths, requires no fonts. Font and OFL license preserved here.
Deterministic vector generation, not AI image generation. V1 is an intermediate draft; V2 fixes contour overlaps and gradient direction.

Reproduction: fonttools, skia-pathops, resvg-py, Pillow; increment output versions, run build-icon.py and export-icon.py. Scripts refuse to overwrite assets.
Validated final raster visually, dimensions, RGBA and transparent corner. Final PNG rendered with resvg.

The favicon in index.html loads src/assets/icons/venivium-v-icon_v2.svg, a byte-for-byte copy of the final source SVG. The previous game-icon.svg is preserved. The runtime SVG uses outlined paths and does not load the font or PNG.
