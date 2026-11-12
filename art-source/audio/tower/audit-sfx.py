"""Decode every MP3; check shape, identity, clipping, edges and loudness.
Does not claim a listening review. Requires the generated sfx manifest.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import array, hashlib, json, math, re, subprocess, wave

ROOT=Path(__file__).resolve().parents[3]
FFMPEG=ROOT/'tmp/audio-deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
MANIFEST=ROOT/'art-source/audio/tower/sfx-manifest_v1.json'

def audit(r):
    if r['speech']: return r
    path=ROOT/r['file']
    with wave.open(str(ROOT/r['wav']),'rb') as w:
        assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,44100)
        frames=w.getnframes()
        assert abs(frames/44100-r['seconds'])<1/44100
        pcm=array.array('h',w.readframes(frames))
        assert pcm[0]==pcm[-1]==0
        assert max(abs(x) for x in pcm)<32767
    cmd=[str(FFMPEG),'-hide_banner','-i',str(path),'-af','ebur128=peak=true','-f','f32le','-ar','44100','-ac','1','-']
    result=subprocess.run(cmd,check=True,capture_output=True)
    decoded=array.array('f',result.stdout)
    assert len(decoded)==frames,(r['file'],len(decoded),frames)
    assert all(math.isfinite(x) for x in decoded)
    peak=max(abs(x) for x in decoded)
    rms=math.sqrt(sum(x*x for x in decoded)/frames)
    assert .003<peak<1 and rms>.001,(r['file'],peak,rms)
    assert abs(sum(decoded)/frames)<.025
    assert hashlib.sha256(path.read_bytes()).hexdigest()==r['sha256']
    true_peak=float(re.findall(r'Peak:\s+([-\d.]+) dBFS',result.stderr.decode(errors='replace'))[-1])
    if true_peak > -1.5:
        # Preserve the first encode, write a quieter version from the PCM master.
        version=2; out=path.with_name(path.stem+'_v2.mp3')
        while out.exists():
            version+=1; out=path.with_name(path.stem+f'_v{version}.mp3')
        db=-2.5-true_peak
        subprocess.run([str(FFMPEG),'-v','error','-n','-i',str(ROOT/r['wav']),'-af',f'volume={db}dB','-c:a','libmp3lame','-b:a','128k',str(out)],check=True,capture_output=True)
        updated={**r,'file':out.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
                 'encoding_gain_db':db,'supersedes':r['file']}
        with out.with_name(out.stem+'-generation-prompt.txt').open('x',encoding='utf-8') as f: json.dump(updated,f,ensure_ascii=False,indent=2)
        return audit(updated)
    return {**r,'decode_valid':True,'decoded_peak_dbfs':20*math.log10(peak),'true_peak_dbtp':true_peak,'decoded_rms_dbfs':20*math.log10(rms)}

if __name__=='__main__':
    data=json.loads(MANIFEST.read_text(encoding='utf-8'))
    with ThreadPoolExecutor(max_workers=4) as pool: rows=list(pool.map(audit,data['records']))
    rendered=[r for r in rows if not r['speech']]
    assert len(set(r['sha256'] for r in rendered))==len(rendered)
    out=ROOT/'art-source/audio/tower/sfx-delivery_v1.json'
    summary={'decoded':len(rendered),'characters':len(set(r['character'] for r in rows))-1,
             'pending_speech':sum(r['speech'] for r in rows),'max_decoded_peak_dbfs':max(r['decoded_peak_dbfs'] for r in rendered),
             'max_true_peak_dbtp':max(r['true_peak_dbtp'] for r in rendered),
             'listening_review':False,'records':rows}
    with out.open('x',encoding='utf-8') as f: json.dump(summary,f,ensure_ascii=False,indent=2)
    print(json.dumps({k:v for k,v in summary.items() if k!='records'}))
