"""Two-pass R128 MP3 export and numerical QA for the newly composed score.
Final tracks go to their prompt-defined folders; source WAVs stay in tower/.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, re, subprocess

ROOT=Path(__file__).resolve().parents[3]
FOLDER=ROOT/'src/assets/audio/music/tower'
FFMPEG=ROOT/'tmp/audio-deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
PROMPTS=ROOT/'art-source/audio/tower/AUDIO_PROMPTS_v1.md'

def fresh(path):
    v=1; out=path
    while out.exists():
        v+=1; out=path.with_name(path.stem+f'_v{v}'+path.suffix)
    return out

def run(args):
    return subprocess.run([str(FFMPEG),'-hide_banner','-nostdin',*args],check=True,capture_output=True).stderr.decode('utf-8',errors='replace')

def measure(path):
    text=run(['-i',str(path),'-af','loudnorm=I=-14:TP=-2.5:LRA=11:print_format=json','-f','null','-'])
    return json.loads(text[text.rfind('{'):text.rfind('}')+1])

def export(metric_path):
    m=json.loads(metric_path.read_text())
    src=FOLDER/m['file']
    raw=FOLDER/m['rawFile']
    assert m['rate']==44100 and m['rawSamplesAboveOne']==0
    assert 0.005<m['rms']<.5 and m['peak']<=.85
    if m['loop']:
        assert 90<=m['seconds']<=180 and max(m['seam'])<.04
        assert abs(m['frames']/44100-m['bars']*m['meter']*60/m['bpm'])<1/44100
    else: assert m['end']==[0,0]
    target=ROOT/'src/assets/audio/music'
    if m['id'].startswith('arena-snowfield'): target=target/'snowfield'
    elif m['id']!='menu': target=target/'tower'
    target.mkdir(parents=True,exist_ok=True)
    for saved in target.glob(m['id']+'*-generation-prompt.txt'):
        existing=json.loads(saved.read_text(encoding='utf-8'))
        if existing.get('wav')==src.relative_to(ROOT).as_posix() and existing.get('status')=='numerical-QA-passed-awaiting-listening-review':
            assert hashlib.sha256((ROOT/existing['final']).read_bytes()).hexdigest()==existing['sha256']
            return existing
    out=fresh(target/(m['id']+'.mp3'))
    before=measure(src)
    filt='loudnorm=I=-14:TP=-2.5:LRA=11:linear=true:print_format=json'+''.join(':'+k+'='+before[v] for k,v in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
    run(['-n','-i',str(src),'-af',filt,'-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','160k',str(out)])
    after=measure(out)
    if abs(float(after['input_i'])+14)>=.6:
        correction=-14-float(after['input_i'])
        # Keep the first encode; correct loudness from the lossless master.
        previous=out; out=fresh(target/(m['id']+'.mp3'))
        run(['-n','-i',str(src),'-af',filt+f',volume={correction}dB','-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','160k',str(out)])
        after=measure(out)
    assert abs(float(after['input_i'])+14)<.6,(out,after)
    assert float(after['input_tp'])<=-1.45,(out,after)
    text=PROMPTS.read_text(encoding='utf-8-sig')
    section=re.search(r'#### M\d+ — `'+re.escape(m['id'])+r'`.*?```\s*\n(.*?)\n```',text,re.S)
    if section: prompt=section[1]
    else:
        line=next(l for l in text.splitlines() if l.startswith('| `'+m['id']+'`'))
        prompt=line.split('|')[-2].strip().strip('`')
    record={**m,'status':'numerical-QA-passed-awaiting-listening-review','final':out.relative_to(ROOT).as_posix(),
            'wav':src.relative_to(ROOT).as_posix(),'raw':raw.relative_to(ROOT).as_posix(),
            'prompt':prompt,'source':'art-source/audio/tower/compose-tower.mjs',
            'method':'Same Web Audio oscillator/IR/percussion engine as the existing score; new arrangements. Synthesized timbres, no real instrument or voice recordings.',
            'date':'2026-11-11','loudness_before':before,'loudness_after_mp3':after,
            'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
    with out.with_name(out.stem+'-generation-prompt.txt').open('x',encoding='utf-8') as f: json.dump(record,f,ensure_ascii=False,indent=2)
    print(m['id'],after['input_i']+' LUFS',after['input_tp']+' dBTP',flush=True)
    return record

if __name__=='__main__':
    latest={}
    for path in FOLDER.glob('*-render-metrics*.json'):
        m=json.loads(path.read_text())
        v=re.search(r'_v(\d+)\.json$',path.name)
        version=int(v[1]) if v else 1
        if m['id'] not in latest or version>latest[m['id']][0]: latest[m['id']]=(version,path)
    assert len(latest)==20, f'Expected 14 loops + 6 stings, found {len(latest)}'
    with ThreadPoolExecutor(max_workers=3) as pool: records=list(pool.map(export,[p for v,p in latest.values()]))
    manifest=fresh(ROOT/'art-source/audio/tower/music-delivery_v1.json')
    with manifest.open('x',encoding='utf-8') as f: json.dump({'status':'Numerical QA passed. Listening and game integration pending.','tracks':records},f,ensure_ascii=False,indent=2)
    print(manifest)
