"""Outline the title's original Cinzel 900 V; preserve the title palette."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib.removeOverlaps import removeOverlaps

root = Path(__file__).resolve().parent
font = instantiateVariableFont(TTFont(root / 'Cinzel-wght.ttf'), {'wght': 900})
removeOverlaps(font, glyphNames=[font.getBestCmap()[ord('V')]])
glyphs = font.getGlyphSet()
glyph = glyphs[font.getBestCmap()[ord('V')]]
pen = SVGPathPen(glyphs)
glyph.draw(pen)
bounds = BoundsPen(glyphs)
glyph.draw(bounds)
x0, y0, x1, y1 = bounds.bounds
scale = min(790 / (x1 - x0), 790 / (y1 - y0))
tx = 512 - (x0 + x1) * scale / 2
ty = 495 + (y0 + y1) * scale / 2
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Venivium — V em Cinzel 900">
<defs>
  <linearGradient id="title-gold" x1="0" y1="1" x2="0" y2="0">
    <stop offset="7%" stop-color="#f4d599"/><stop offset="38%" stop-color="#e5a05d"/><stop offset="75%" stop-color="#ba5441"/>
  </linearGradient>
  <path id="letter" d="{pen.getCommands()}" transform="translate({tx} {ty}) scale({scale} {-scale})"/>
</defs>
<use href="#letter" transform="translate(0 22)" fill="#291c23" stroke="#291c23" stroke-width="8" stroke-linejoin="round"/>
<use href="#letter" transform="translate(0 15)" fill="#4b2426" stroke="#4b2426" stroke-width="6" stroke-linejoin="round"/>
<use href="#letter" transform="translate(0 8)" fill="#773831" stroke="#773831" stroke-width="5" stroke-linejoin="round"/>
<use href="#letter" fill="url(#title-gold)" stroke="#f1cc80" stroke-width="4" stroke-linejoin="round"/>
</svg>'''
output = root / 'venivium-v-icon_v2.svg'
if output.exists():
    raise SystemExit('Asset exists; increment the version before regenerating.')
output.write_text(svg, encoding='utf-8')
print(output)
