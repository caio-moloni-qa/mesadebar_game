from PIL import Image, ImageDraw
from pathlib import Path
import json
root=Path('art-source/rooms')
out=Path('src/assets/textures/rooms')
out.mkdir(parents=True,exist_ok=True)
reports=[]
for raw in sorted(root.glob('*/*_raw_v2.png')):
    room=raw.parent.name
    name=raw.name.replace('_raw_v2.png','')
    original=Image.open(raw).convert('RGB')
    im=original.resize((128,128),Image.Resampling.NEAREST)
    px=im.load()
    before_x=sum(abs(px[0,y][c]-px[127,y][c]) for y in range(128) for c in range(3))/384
    before_y=sum(abs(px[x,0][c]-px[x,127][c]) for x in range(128) for c in range(3))/384
    # Narrow periodic edge reconciliation, preserving crisp logical pixels.
    # Both sides approach the same edge sample; no whole-image smoothing.
    for axis in [0,1]:
        for line in range(128):
            def pos(n): return (n,line) if axis==0 else (line,n)
            common=tuple(round((px[pos(0)][c]+px[pos(127)][c])/2) for c in range(3))
            for d in range(4):
                weight=(4-d)/4
                for n in [d,127-d]:
                    old=px[pos(n)]
                    px[pos(n)]=tuple(round(old[c]*(1-weight)+common[c]*weight) for c in range(3))
    final=out/f'{room}_{name}_v2.png'
    im.save(final)
    tiled=Image.new('RGB',(256,256))
    for x in [0,128]:
        for y in [0,128]: tiled.paste(im,(x,y))
    tiled.resize((768,768),Image.Resampling.NEAREST).save(raw.parent/f'{name}_tile2x2_v2.png')
    after_x=max(abs(px[0,y][c]-px[127,y][c]) for y in range(128) for c in range(3))
    after_y=max(abs(px[x,0][c]-px[x,127][c]) for x in range(128) for c in range(3))
    assert after_x==after_y==0
    reports.append(dict(asset=str(final),raw_size=original.size,final_size=im.size,before_edge_mean_rgb=[round(before_x,2),round(before_y,2)],after_edge_max_rgb=[after_x,after_y]))
sheet=Image.new('RGB',(4*320,2*350),'#20242b')
draw=ImageDraw.Draw(sheet)
for i,r in enumerate(reports):
    im=Image.open(r['asset'])
    tile=Image.new('RGB',(256,256))
    for x in [0,128]:
        for y in [0,128]: tile.paste(im,(x,y))
    x=(i%4)*320
    y=(i//4)*350
    sheet.paste(tile.resize((304,304),Image.Resampling.NEAREST),(x+8,y+30))
    draw.text((x+8,y+8),Path(r['asset']).stem,fill='white')
sheet.save(root/'textures_tile2x2_v2.png')
(root/'texture-validation_v2.json').write_text(json.dumps(reports,indent=2))
print(json.dumps(reports,indent=2))
