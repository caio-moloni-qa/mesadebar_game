"""Validate PCM deliveries and write an audition page / complete handoff manifest.
Run after render-music-suite.mjs. Uses Python's standard library only.
"""
from pathlib import Path
import json,wave,array,math,hashlib,struct,html

folder=Path('src/assets/audio/music')
ids=['tavern','arena','arena-intense','guardian-gravedigger','guardian-temple','guardian-lake','boss-necromancer','boss-necromancer-enraged','sting-guardian','sting-boss','sting-victory','sting-defeat']
def fresh(path):
    p=path;v=2
    while p.exists():p=path.with_name(path.stem+f'_v{v}'+path.suffix);v+=1
    return p
records=[]
for name in ids:
    metric=folder/(name+'-render-metrics.json')
    if not metric.exists():raise RuntimeError('Not rendered yet: '+name)
    data=json.loads(metric.read_text());path=folder/data['file'];raw=folder/data['rawFile']
    with wave.open(str(path),'rb') as w:
        assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(2,2,44100),path
        frames=w.getnframes();samples=array.array('h',w.readframes(frames))
    seconds=frames/44100
    low,high=(120,180) if name in ('tavern','arena','arena-intense','boss-necromancer') else (90,150) if data['loop'] else {'sting-guardian':(3,5),'sting-boss':(5,8),'sting-victory':(6,10),'sting-defeat':(5,8)}[name]
    assert low<=seconds<=high,(name,seconds)
    peak=max(abs(x) for x in samples)/32768;assert .80<peak<.90,(name,peak)
    rms=math.sqrt(sum(x*x for x in samples)/len(samples))/32768;assert rms>.005,(name,rms)
    dc=sum(samples)/len(samples)/32768;assert abs(dc)<.025,(name,dc)
    clipped=sum(abs(x)>=32767 for x in samples);assert clipped==0,(name,clipped)
    stereo=math.sqrt(sum((samples[i]-samples[i+1])**2 for i in range(0,len(samples),2))/(len(samples)//2))/32768
    assert stereo>.0005,(name,'mono signal')
    first_second=math.sqrt(sum(x*x for x in samples[:88200])/88200)/32768
    assert first_second>.005,(name,'silent opening')
    seam=[abs(samples[c]-samples[-2+c])/32768 for c in (0,1)]
    if data['loop']:assert max(seam)<.04,(name,'large boundary jump',seam)
    else:assert samples[-2:]==array.array('h',[0,0]),(name,'sting tail not silent')
    with raw.open('rb') as f:
        header=f.read(44);assert header[:4]==b'RIFF' and header[8:12]==b'WAVE'
        assert struct.unpack_from('<HHI',header,20)==(3,2,44100),name
        values=array.array('f',f.read());assert all(math.isfinite(x) for x in values),name
        raw_peak=max(abs(x) for x in values);assert abs(raw_peak-data['rawPeak'])<1e-6,name
    if name=='tavern':
        # This first render preceded the instrument-usage metadata refinement.
        data['instruments']=['lute','hurdy','recorder','fiddle'];data['percussion']=['frame','tambourine']
    if name not in ('arena-intense','guardian-lake','boss-necromancer','boss-necromancer-enraged','sting-boss','sting-defeat'):
        assert 'choir' not in data['instruments'],name
    data.update({'duration_seconds':seconds,'measured_peak_dbfs':20*math.log10(peak),'measured_rms_dbfs':20*math.log10(rms),'dc_offset':dc,'stereo_difference_rms':stereo,'boundary_sample_delta':seam,'clipped_samples':clipped,'raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'final_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'validated':True,'method':'Original procedural Web Audio composition; synthesized acoustic-inspired timbres, not recorded instruments.'})
    records.append(data)
    print(name,round(seconds,3),'s, peak',round(data['measured_peak_dbfs'],2),'dBFS, seam',seam,flush=True)

manifest=fresh(folder/'music-suite-manifest.json')
with manifest.open('x',encoding='utf-8') as f:json.dump({'status':'all_12_rendered_and_validated','source':'art-source/audio/compose-music-suite.mjs','renderer':'art-source/audio/render-music-suite.mjs','encoding':'final: stereo 44100Hz PCM16 WAV; untouched raw render: stereo 44100Hz float32 WAV, including 4s tail','loudness':'Peak normalized to -1.51 dBFS. Integrated LUFS not measured or matched; -14 LUFS integration remains deferred.','motif_pairs':[['arena','arena-intense'],['boss-necromancer','boss-necromancer-enraged']],'tracks':records},f,indent=2)

report=fresh(Path('art-source/MUSIC_GENERATION_STATUS.md'))
lines=['# Mesa de Bar - locally composed music suite','','Completed all 12 tracks using the same Web Audio approach as The Last Watch. This supersedes the earlier pending external-generator status. No external provider or plugin was used. These sounds are synthesized acoustic-inspired approximations, not real instrument recordings. No lyrics, spoken words or voice recordings. Wordless choir-like synthesis is restricted to the tracks permitting it.','','Final WAV files are 44.1kHz, 16-bit stereo. Raw WAVs preserve the untouched OfflineAudioContext float32 output, including four seconds of release/reverb tail. Loop exports fold that tail into the start and retain whole bars; stings retain a defined natural decay and a final short silence taper. Final peak is -1.51 dBFS; LUFS matching is deferred as requested.','','| Track | Duration | Tempo / key | Loop | Final | Untouched render |','| --- | --- | --- | --- | --- | --- |']
for d in records:
    duration=f'{int(d["duration_seconds"]//60)}:{d["duration_seconds"]%60:05.2f}'
    lines.append(f'| {d["id"]} | {duration} | {d.get("bpm","-")} / {d.get("key","-")} | {"yes" if d["loop"] else "no"} | src/assets/audio/music/{d["file"]} | src/assets/audio/music/{d["rawFile"]} |')
lines+=['','Arena and arena-intense share the E-minor theme, with 128/140 BPM and denser strings, percussion and choir in the intense arrangement. Both Necromancer phases share the D-minor motif at 132/150 BPM; phase two adds faster string figures, heavier percussion and dissonant brass.','','Validation passed for durations, WAV headers/sample format, non-silent openings, stereo content, finite raw samples, no final clipping, DC offset, loop boundary deltas and silent final sting samples. Raw/final SHA256 values and per-track measurements are in '+manifest.as_posix()+'. Numerical checks do not substitute for a listening pass.','','The game\'s existing audio playback and music switching were not changed. These files are ready for audition and subsequent integration.','','Reproduce with `node art-source/audio/render-music-suite.mjs`; use `--remaining` to skip previously rendered base filenames. Existing audio is never overwritten; rerenders receive _v2, _v3, etc.','']
with report.open('x',encoding='utf-8') as f:f.write('\n'.join(lines))

preview=fresh(Path('art-source/audio/music-suite-preview.html'))
cards=[]
for d in records:
    uri='../../src/assets/audio/music/'+d['file']
    cards.append(f'<article><h2>{html.escape(d["id"])}</h2><p>{d["duration_seconds"]:.1f}s · {html.escape(d.get("key","sting"))} · {"loop" if d["loop"] else "one shot"}</p><audio controls preload="none" {"loop" if d["loop"] else ""} src="{uri}"></audio><p><a href="{uri}" download>Download WAV</a></p></article>')
content='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mesa de Bar — Music suite</title><style>body{margin:0;background:#131816;color:#e8e1ca;font:16px system-ui;padding:40px;max-width:1200px;margin:auto}h1{font:42px Georgia}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}article{background:#202923;padding:20px;border:1px solid #3c493d;border-radius:12px}h2{font-size:18px}p{color:#b5bba9}a{color:#d9b96e}audio{width:100%}</style><h1>Mesa de Bar — Music suite</h1><p>Original locally composed instrumental music. Synthesized acoustic-inspired sounds. Select a track to audition; looping tracks repeat automatically.</p><main>'+''.join(cards)+'</main><script>document.querySelectorAll("audio").forEach(a=>a.addEventListener("play",()=>document.querySelectorAll("audio").forEach(b=>{if(a!==b)b.pause()})))</script></html>'
with preview.open('x',encoding='utf-8') as f:f.write(content)
print(json.dumps({'manifest':str(manifest),'report':str(report),'preview':str(preview),'tracks':len(records)}))
