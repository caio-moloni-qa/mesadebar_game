"""Validate Snowfield WAV assets and produce a player plus a short Discord sampler.
No game files or existing assets are changed. Run from the repository root after rendering.
"""
from pathlib import Path
import array, hashlib, html, json, math, struct, wave

folder=Path('src/assets/audio/music/snowfield')
source=Path('art-source/audio/snowfield')
ids=['guardian-frost-knight','guardian-ice-serpent','guardian-bellringer','guardian-ancient-yeti','boss-winter-king','boss-winter-king-enraged']

def write_new(path, data):
    with path.open('x',encoding='utf-8') as f:f.write(data)

records=[]
sampler=array.array('h')
for name in ids:
    data=json.loads((folder/(name+'-render-metrics.json')).read_text())
    data['title']={'guardian-ancient-yeti':'Yeti Anci\u00e3o','boss-winter-king-enraged':'Rei do Inverno - Coroa Partida'}.get(name,data['title'])
    path=folder/data['file'];raw=folder/data['rawFile']
    with wave.open(str(path),'rb') as f:
        assert (f.getnchannels(),f.getsampwidth(),f.getframerate())==(2,2,44100),name
        frames=f.getnframes();samples=array.array('h',f.readframes(frames))
    seconds=frames/44100
    assert 115<=seconds<=155,(name,seconds)
    assert abs(seconds-data['seconds'])<1/44100,(name,'duration')
    peak=max(abs(x) for x in samples)/32768
    rms=math.sqrt(sum(x*x for x in samples)/len(samples))/32768
    dc=sum(samples)/len(samples)/32768
    stereo=math.sqrt(sum((samples[i]-samples[i+1])**2 for i in range(0,len(samples),2))/(len(samples)//2))/32768
    clipped=sum(abs(x)>=32767 for x in samples)
    seam=[abs(samples[c]-samples[-2+c])/32768 for c in (0,1)]
    opening=math.sqrt(sum(x*x for x in samples[:88200])/88200)/32768
    assert .80<peak<.90 and rms>.005,(name,peak,rms)
    assert abs(dc)<.025 and stereo>.0005 and clipped==0,(name,dc,stereo,clipped)
    assert max(seam)<.04 and opening>.005,(name,seam,opening)
    assert 'choir' not in data['instruments'],name
    with raw.open('rb') as f:
        head=f.read(44)
        assert struct.unpack_from('<HHI',head,20)==(3,2,44100),name
        values=array.array('f',f.read())
    assert all(math.isfinite(x) for x in values),name
    assert abs(max(abs(x) for x in values)-data['rawPeak'])<1e-6,name
    data.update(validated=True,duration_seconds=seconds,measured_peak_dbfs=20*math.log10(peak),measured_rms_dbfs=20*math.log10(rms),dc_offset=dc,stereo_difference_rms=stereo,clipped_samples=clipped,boundary_sample_delta=seam,final_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),raw_sha256=hashlib.sha256(raw.read_bytes()).hexdigest())
    records.append(data)
    # 12 seconds per boss, stereo 22.05 kHz, with a 15 ms transition taper.
    # Averaging adjacent frames applies a basic low-pass before downsampling.
    start=16*44100;count=12*22050;fade=330
    for j in range(count):
        gain=min(1,j/fade,(count-1-j)/fade)
        for c in (0,1):
            i=(start+j*2)*2+c
            sampler.append(round((samples[i]+samples[i+2])*.5*gain))
    print(name,round(seconds,3),'s; peak',round(20*math.log10(peak),2),'dBFS; seam',seam,flush=True)

manifest={'status':'six_tracks_rendered_and_technically_validated','method':'Original procedural Web Audio synthesis, acoustic-inspired timbres. No external generator, instrument recordings or voices.','integration':'Staged assets only; GameAudio and boss systems unchanged.','loudness':'Peak normalization to 0.84 (-1.51 dBFS). LUFS matching and subjective listening pending.','tracks':records}
write_new(source/'snowfield-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with (source/'snowfield-sampler.wav').open('xb') as handle:
    with wave.open(handle,'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(22050);f.writeframes(sampler.tobytes())
cards=[]
for d in records:
    uri='../../../src/assets/audio/music/snowfield/'+d['file']
    cards.append('<article><h2>'+html.escape(d['title'])+'</h2><p>'+str(round(d['duration_seconds'],1))+' s — '+str(d['bpm'])+' BPM — '+html.escape(d['key'])+'</p><audio controls loop preload="metadata" src="'+uri+'"></audio><p><a href="'+uri+'" download>Baixar WAV completo</a></p></article>')
page='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Venivium — Campo Nevado</title><style>body{margin:30px auto;max-width:1100px;padding:20px;background:#101b2b;color:#e5eefc;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}article{padding:20px;border:1px solid #415d7e;border-radius:12px;background:#1a2b41}h1{font:36px Georgia}h2{font-size:20px}audio{width:100%}a{color:#9bdcff}</style><h1>Campo Nevado — temas dos chefes</h1><p>Primeiras versões procedurais instrumentais. Timbres sintetizados; prontas para ouvir e revisar. Ainda sem integração no jogo.</p><main>'+''.join(cards)+'</main><script>document.querySelectorAll("audio").forEach(a=>a.addEventListener("play",()=>document.querySelectorAll("audio").forEach(b=>{if(b!==a)b.pause()})))</script></html>'
write_new(source/'preview.html',page)
lines=['# Campo Nevado — músicas dos chefes','','Seis primeiras versões instrumentais geradas localmente pelo motor de síntese da suíte existente. Os timbres lembram instrumentos acústicos; não são gravações reais nem downloads de um gerador externo. Sem vozes.','','| Chefe | Arquivo | Duração | Identidade |','| --- | --- | --- | --- |']
identities=['Marcha de castelo: metais, violoncelo e cristal.','Movimento serpenteante em 6/4: harpa, flauta e gelo.','Valsa fúnebre em 3/4: órgão e três badaladas.','Peso tribal: tambores, pedra e metais graves.','Realeza ameaçadora: cordas, metais e cristal.','Mesmo motivo do Rei, mais rápido e com percussão mais densa.']
for d,identity in zip(records,identities):lines.append('| '+d['title']+' | '+d['file']+' | '+str(round(d['duration_seconds'],2))+' s | '+identity+' |')
lines+=['','Abra `preview.html` para ouvir os WAVs completos. `snowfield-sampler.wav` reúne 12 segundos de cada faixa, na ordem da tabela (72 segundos no total). O sampler é reduzido para 22,05 kHz; os WAVs completos são estéreo PCM16 a 44,1 kHz. Os brutos float32 preservam a cauda de 4 segundos; os loops dobram essa cauda no início.','','Validação técnica: cabeçalhos, duração, pico, RMS, estéreo, DC, amostras finitas, ausência de clipping e salto na emenda. Hashes e medições: `snowfield-manifest.json`. A checagem numérica não substitui revisão auditiva. Normalização por pico a -1,51 dBFS; LUFS e aprovação musical pendentes.','','Sem alteração em GameAudio ou mecânicas. Vincular ao encontro correto quando os bosses estiverem implementados; frostKnight já existe, os demais nomes são de assets planejados.','','Reproduzir da raiz: `node art-source/audio/snowfield/render-snowfield.mjs`; depois `python art-source/audio/snowfield/audit-snowfield.py`. O renderer versiona WAVs existentes; a auditoria recusa sobrescrever relatórios/sampler. Para nova rodada, use arquivos de relatório versionados.','','Git: criação de branch/sincronização bloqueada nesta sessão por acesso negado a `.git/FETCH_HEAD`. Arquivos novos ficaram separados na cópia principal; nenhum commit/push/PR.','']
write_new(source/'README.md','\n'.join(lines))
