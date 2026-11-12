"""Deterministic procedural Foley and nonverbal voice approximations, no recordings/TTS.

Uses the same noise/oscillator/envelope method as src/audio/soundbank.ts.
Spoken Portuguese prompts are reported as pending, never replaced with fake speech.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import array, hashlib, json, math, random, re, subprocess, wave

ROOT = Path(__file__).resolve().parents[3]
FFMPEG = ROOT / 'tmp/audio-deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
SOURCE = ROOT / 'art-source/audio/tower/AUDIO_PROMPTS_v1.md'
RATE = 44100
REPORT = ROOT / 'art-source/audio/tower/sfx-manifest_v1.json'

def fresh(path):
    version = 1
    out = path
    while out.exists() or out.with_suffix('.wav').exists() or out.with_name(out.stem+'-raw.wav').exists():
        version += 1
        out = path.with_name(path.stem+f'_v{version}'+path.suffix)
    return out

def parse():
    character = None
    active = False
    records = []
    for line in SOURCE.read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('### 3.1 '): active = True; character = 'common'
        if line.startswith('## 4'): active = False
        heading = re.match(r'#### `([^`]+)`', line)
        if active and heading: character = heading[1]
        if not active or not line.startswith('|'): continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) != 4: continue
        file = re.fullmatch(r'`([\w-]+\.mp3)`', cells[1])
        duration = re.match(r'([\d,\.]+)', cells[2])
        if file and duration:
            records.append(dict(character=character, event=file[1][:-4], seconds=float(duration[1].replace(',','.')),
                                prompt=cells[3].strip('`'), speech='[PT-BR]' in cells[0] or 'Brazilian Portuguese' in cells[3]))
    assert len({(r['character'],r['event']) for r in records}) == len(records)
    return records

def render(r):
    if r['speech']: return {**r, 'status':'pending-spoken-pt-BR', 'reason':'Local oscillator synthesis cannot articulate the requested words.'}
    character, event, duration = r['character'], r['event'], r['seconds']
    seed = int.from_bytes(hashlib.sha256(f'{character}/{event}/v1'.encode()).digest()[:4], 'little')
    rng = random.Random(seed)
    text = (event+' '+r['prompt']).lower()
    voice = event.startswith('bark-') or any(s in text for s in ['war cry','hiccup','burp','grunt','groan','incantation'])
    metallic = any(s in text for s in ['parry','metal','clang','pan ','anvil','steel','coin','bell','clink'])
    magic = any(s in text for s in ['magic','crystal','heal','ice','frost','shimmer','spell','curse','spirit','soul'])
    whoosh = any(s in text for s in ['dodge','whoosh','swish','wind','arrow','swirl','flight','throw'])
    fluid = any(s in text for s in ['water','beer','gulp','glug','splash','pour','bubbl'])
    heavy = any(s in text for s in ['heavy','massive','crush','explosion','barrel','charge-release'])
    roll = any(s in text for s in ['roll','rattl','dice','volley','three','four','cascade','rain'])
    quiet = character=='common' and any(s in event for s in ['ui-','courage-','turn-start','intent-','tick'])
    pitches = dict(barbarian=93,mage=145,reliquia=173,fabri=240,brom=83,lyra=235,grimbo=330,zora=185,sergio=118,
                   eskimo=110,frostKnight=76,iceSerpent=62,bellringer=70,ancientYeti=49,winterKing=85,
                   frostSkeleton=160,frostSpirit=310,gravedigger=125,templeGuardian=42,lakeSpirit=65,finalBoss=73)
    f0 = pitches.get(character,120)
    # Each identity has a stable pitch/formant signature; event envelopes express effort/hurt/KO.
    formant = 550 if character in ['lyra','zora','frostSpirit'] else 390
    falling = any(s in event for s in ['ko','hurt','lost','weaken','broken'])
    phase = low = 0.0
    values = array.array('f')
    for i in range(round(duration*RATE)):
        t = i/RATE; x = t/duration
        n = rng.uniform(-1,1); low += .08*(n-low); high = n-low
        env = min(1,t/.002,(duration-t)/.035)
        if voice:
            pitch = f0*(1+(.2 if falling else .12)*math.sin(math.pi*x)-(.35*x if falling else 0))
            phase += 2*math.pi*pitch/RATE
            harmonics = sum(math.sin(phase*h)*(.4/h+math.exp(-((h*pitch-formant)/190)**2)*.3) for h in range(1,9))
            pulses = (.5+.5*math.sin(2*math.pi*(7 if 'laugh' in text else 3)*t)) if 'laugh' in text or 'cackl' in text else 1
            v = (harmonics*.5+low*.4+high*.04)*math.sin(math.pi*x)**.6*pulses
        else:
            u = t % (duration/4) if roll else t
            hit = math.exp(-u/(.07 if heavy else .025))
            v = (low*.6+math.sin(2*math.pi*(62 if heavy else 150)*u)*.22)*hit
            if metallic:
                v += sum(math.sin(2*math.pi*(900+(seed%350))*ratio*u)*.14/(j+1) for j,ratio in enumerate([1,1.414,2.31,3.19]))*math.exp(-u/.13)
            if magic:
                for j, f in enumerate([587.33,880,1174.66]):
                    dt=t-j*duration*.18
                    if dt>=0: v += math.sin(2*math.pi*f*(1+(seed%20)*.001)*dt)*.16*math.exp(-dt/(duration*.24))
            if whoosh: v += (high*.25+low*.65)*math.sin(math.pi*x)**2*(.8+.2*math.sin(2*math.pi*17*t))
            if fluid: v += (low*.5+math.sin(2*math.pi*(350+90*math.sin(2*math.pi*13*t))*t)*.07)*(.5+.5*math.sin(2*math.pi*19*t))*math.sin(math.pi*x)
            if 'charge-start' in event or 'carregado' in event: v += (low*.4+math.sin(2*math.pi*(60*t+90*t*t))*.2)*math.sin(math.pi*x)
        values.append(v*max(0,env))
    mean = sum(values)/len(values)
    values = array.array('f', (v-mean for v in values))
    # A second 2 ms edge taper removes the tiny DC-correction edge step.
    for i in range(len(values)):
        values[i] *= min(1,i/(RATE*.002),(len(values)-1-i)/(RATE*.01))
    peak = max(abs(v) for v in values)
    rms = math.sqrt(sum(v*v for v in values)/len(values))
    gain = min(.84/peak, (10**((-24 if quiet else -18)/20))/rms)
    final = array.array('h',(round(v*gain*32767) for v in values))
    folder = ROOT / 'src/assets/audio/sfx' / character; folder.mkdir(parents=True,exist_ok=True)
    path = fresh(folder/(event+'.mp3'))
    raw = path.with_name(path.stem+'-raw.wav')
    wav = path.with_suffix('.wav')
    def save(file,samples):
        with file.open('xb') as stream:
            with wave.open(stream,'wb') as w:
                w.setparams((1,2,RATE,0,'NONE','not compressed')); w.writeframes(samples.tobytes())
    save(raw,array.array('h',(round(max(-1,min(1,v))*32767) for v in values)))
    save(wav,final)
    subprocess.run([str(FFMPEG),'-v','error','-n','-i',str(wav),'-c:a','libmp3lame','-b:a','128k',str(path)],check=True,capture_output=True)
    provenance = {**r,'seed':seed,'method':'Original deterministic noise / harmonic oscillator synthesis; acoustic and nonverbal voice approximations only, not recordings or TTS.',
                  'source':'art-source/audio/tower/render-character-sfx.py','date':'2026-11-11','status':'rendered-awaiting-audition',
                  'file':path.relative_to(ROOT).as_posix(),'raw':raw.relative_to(ROOT).as_posix(),'wav':wav.relative_to(ROOT).as_posix(),
                  'peak':max(abs(v) for v in final)/32768,'rms':math.sqrt(sum(v*v for v in final)/len(final))/32768,
                  'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    assert provenance['peak']>0.005 and provenance['peak']<.85
    with path.with_name(path.stem+'-generation-prompt.txt').open('x',encoding='utf-8') as f: json.dump(provenance,f,ensure_ascii=False,indent=2)
    return provenance

if __name__=='__main__':
    records=parse()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=[]
        for result in pool.map(render,records):
            results.append(result)
            if len(results)%25==0: print(f'{len(results)}/{len(records)} SFX processed',flush=True)
    path=fresh(REPORT)
    with path.open('x',encoding='utf-8') as f: json.dump({'method':'Procedural synthesis, no speech generator. Listening review pending.', 'records':results},f,ensure_ascii=False,indent=2)
    print(json.dumps({'parsed':len(records),'rendered':sum(r['status'].startswith('rendered') for r in results),'speech_pending':sum(r['speech'] for r in results),'manifest':str(path)}))
