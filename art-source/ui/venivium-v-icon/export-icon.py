"""Rasterize the outlined SVG with resvg; requires resvg-py and Pillow."""
from pathlib import Path
import resvg_py
from PIL import Image

root = Path(__file__).resolve().parent
output = root / 'venivium-v-icon_v2.png'
if output.exists():
    raise SystemExit('Asset exists; increment the version before exporting again.')
output.write_bytes(resvg_py.svg_to_bytes(svg_path=str(root / 'venivium-v-icon_v2.svg')))
image = Image.open(output)
assert image.size == (1024, 1024)
assert image.mode == 'RGBA'
assert image.getpixel((0, 0))[3] == 0
print(f'{output}: {image.size}, {image.mode}, transparent corners; bounds={image.getbbox()}')
