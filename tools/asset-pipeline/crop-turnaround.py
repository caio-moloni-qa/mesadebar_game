"""Crop a 3-view turnaround sheet (front / side / back) into one square image per view.

Finds the figures by their difference from the background colour (sampled from the corners), groups the occupied
columns into the three widest runs, and centres each figure on a square canvas of the original background with a
margin. The background is kept (image-to-3D tools remove it themselves; a colour-key cutout here could eat grey
armour that is close to the background tone).

Usage: python crop_turnaround.py <sheet.png> <out_dir> [size]
"""
import sys
from pathlib import Path
from statistics import median

from PIL import Image

sheet_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
image = Image.open(sheet_path).convert("RGB")
width, height = image.size
pixels = image.load()

corners = [pixels[x, y] for x in (2, width - 3) for y in (2, height - 3)]
background = tuple(int(median(channel)) for channel in zip(*corners))
THRESHOLD = 22


def is_figure(x: int, y: int) -> bool:
    r, g, b = pixels[x, y]
    return max(abs(r - background[0]), abs(g - background[1]), abs(b - background[2])) > THRESHOLD


# Column occupancy (ignore a few stray pixels per column).
occupied = [sum(1 for y in range(0, height, 2) if is_figure(x, y)) > 3 for x in range(width)]
runs = []
start = None
for x, filled in enumerate(occupied + [False]):
    if filled and start is None:
        start = x
    elif not filled and start is not None:
        runs.append((start, x))
        start = None
# Merge runs separated by tiny gaps (a tail tip or a fringe can split a figure), then keep the three widest.
merged = []
for run in runs:
    if merged and run[0] - merged[-1][1] < 12:
        merged[-1] = (merged[-1][0], run[1])
    else:
        merged.append(run)
figures = sorted(sorted(merged, key=lambda r: r[1] - r[0], reverse=True)[:3])
if len(figures) != 3:
    raise SystemExit(f"expected 3 figures, found {len(figures)}: {merged}")

out_dir.mkdir(parents=True, exist_ok=True)
for name, (left, right) in zip(("front", "side", "back"), figures):
    rows = [y for y in range(height) if any(is_figure(x, y) for x in range(left, right, 2))]
    top, bottom = rows[0], rows[-1] + 1
    crop = image.crop((left, top, right, bottom))
    side = int(max(crop.width, crop.height) * 1.12)
    canvas = Image.new("RGB", (side, side), background)
    canvas.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    canvas = canvas.resize((size, size), Image.LANCZOS)
    canvas.save(out_dir / f"{name}.png")
    print(f"{name}: columns {left}-{right}, rows {top}-{bottom} -> {out_dir / (name + '.png')}")
print("background", background)
