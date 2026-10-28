from pathlib import Path
from PIL import Image,ImageDraw
import json
root=Path('art-source/rooms/tavern-v3');out=Path('src/assets/textures/rooms')
shared='Seamless tileable pixel-art texture for a low-poly fantasy game, top-down flat view, 128x128 look, crisp hard-edged pixels, limited palette of 8-12 colours, soft top-left light, no text, no letters, no symbols, no border, warm high-fantasy tavern. Square opaque image, texture fills canvas edge to edge, absolutely no perspective. '
prompts={'island':'Thick carved dark-oak panels with vertical grain, a thin brass inlay band near the top, small carved leaf-and-vine relief.','flagstone':'Irregular worn grey-brown flagstones with dark mortar, a little moss in a few cracks, warm tint.','fur':'Thick brown and cream animal fur, soft clumped strands, no visible edge (the rug shape comes from geometry).'}
report=[];sheet=Image.new('RGB',(768,282),'#252034');draw=ImageDraw.Draw(sheet)
for i,(name,prompt) in enumerate(prompts.items()):
 (root/f'{name}_prompt.txt').write_text(shared+prompt,encoding='utf-8')
 raw=Image.open(root/f'{name}_raw.png');im=raw.convert('RGB').resize((128,128),Image.Resampling.NEAREST);px=im.load()
 before=[sum(abs(px[0,y][c]-px[127,y][c]) for y in range(128) for c in range(3))/384,sum(abs(px[x,0][c]-px[x,127][c]) for x in range(128) for c in range(3))/384]
 for axis in [0,1]:
  for line in range(128):
   def pos(n):return (n,line) if axis==0 else (line,n)
   common=tuple(round((px[pos(0)][c]+px[pos(127)][c])/2) for c in range(3))
   for d in range(3):
    w=(3-d)/3
    for n in [d,127-d]:
     old=px[pos(n)];px[pos(n)]=tuple(round(old[c]*(1-w)+common[c]*w) for c in range(3))
 im=im.quantize(colors=12,dither=Image.Dither.NONE).convert('RGB');px=im.load()
 edge=[max(abs(px[0,y][c]-px[127,y][c]) for y in range(128) for c in range(3)),max(abs(px[x,0][c]-px[x,127][c]) for x in range(128) for c in range(3))]
 assert edge==[0,0]
 final=out/f'tavern_{name}_v2.png';assert not final.exists(),final
 assert not (root/f'{name}.png').exists()
 im.save(final);im.save(root/f'{name}.png')
 tile=Image.new('RGB',(256,256))
 for x in [0,128]:
  for y in [0,128]:tile.paste(im,(x,y))
 tile.save(root/f'{name}_tile2x2.png');sheet.paste(tile,(i*256,26));draw.text((i*256+8,8),name,fill='white')
 report.append(dict(asset=final.as_posix(),raw_size=raw.size,final_size=im.size,mode=im.mode,colors=len(im.getcolors(16384)),before_edge_mean_rgb=before,after_edge_max_rgb=edge))
sheet.save(root/'textures_tile2x2.png');(root/'texture-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
