"""Verify selected deliveries, write an audition page and integration handoff."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, html, json, re, subprocess

ROOT=Path(__file__).resolve().parents[3]
HERE=ROOT/'art-source/audio/tower'
FFMPEG=ROOT/'tmp/audio-deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
music=json.loads((HERE/'music-delivery_v1.json').read_text(encoding='utf-8'))['tracks']
sfx=json.loads((HERE/'sfx-delivery_v1.json').read_text(encoding='utf-8'))['records']
assert len(music)==20 and sum(m['loop'] for m in music)==14
assert sum(not r['speech'] for r in sfx)==367 and sum(r['speech'] for r in sfx)==8

def check(m):
    path=ROOT/m['final']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==m['sha256']
    result=subprocess.run([str(FFMPEG),'-hide_banner','-i',str(path),'-af','astats=metadata=0:reset=0','-f','null','-'],check=True,capture_output=True)
    log=result.stderr.decode(errors='replace')
    frames=int(re.findall(r'Number of samples:\s+(\d+)',log)[-1])
    assert frames==m['frames'],(m['id'],frames,m['frames'])
    assert '44100 Hz, stereo' in log
    assert all(float(n)==0 for n in re.findall(r'Number of (?:NaNs|Infs):\s+([\d.]+)',log))
    return {'id':m['id'],'decoded_frames':frames,'duration_seconds':frames/44100,'sha256_verified':True}

with ThreadPoolExecutor(max_workers=3) as pool: checks=list(pool.map(check,music))
with (HERE/'music-decode-audit_v1.json').open('x',encoding='utf-8') as f: json.dump(checks,f,indent=2)

pending=[r for r in sfx if r['speech']]
lines=['# Entrega de áudio procedural — 2026-11-11','','14 loops novos + 6 vinhetas + 367 SFX, para 21 personagens e eventos comuns.',
       'Método autorizado pelo dono: mesmo motor Web Audio das músicas existentes (osciladores, ruído, envelopes e IR).',
       'Timbres acústicos e vozes não verbais são aproximações sintéticas. Não são gravações nem vozes naturais.',
       'Os 19 replacements opcionais dos prompts não foram necessários: as trilhas existentes continuam disponíveis.',
       '', '## Arquivos para integração','',
       '- `music-delivery_v1.json`: 20 escolhas finais, WAV/bruto, prompt, seed, hash, LUFS e pico após MP3.',
       '- `sfx-delivery_v1.json`: 367 escolhas finais e 8 falas pendentes. Respeitar `file`; algumas escolhas usam `_v2`.',
       '- `preview_v1.html`: player para revisão auditiva, aberto diretamente no navegador.',
       '- `AUDIO_PROMPTS_v1.md`: cópia permanente do pacote original de prompts.',
       '', '## Música','', '| ID | MP3 final | LUFS | dBTP |', '|---|---|---|---|']
for m in music:
    a=m['loudness_after_mp3']
    lines.append(f"| {m['id']} | {m['final']} | {a['input_i']} | {a['input_tp']} |")
lines+=['','## Falas pendentes (TTS/voz necessário)','']
for r in pending: lines.append(f"- {r['character']}/{r['event']}: {r['prompt']}")
lines+=['','## Verificação e limites','',
        '20 MP3s de música decodificados em estéreo/44,1 kHz, com número de amostras exato (metadados gapless preservados).',
        'Loops com compassos inteiros e caudas dobradas no início; delta entre amostras da emenda < 0,04 no WAV.',
        'Música medida após compressão: aproximadamente −14 LUFS; true peak abaixo de −1,5 dBTP.',
        '367 MP3s SFX decodificados em mono/44,1 kHz, com duração exata, sinal finito, sem clipping e true peak ≤ −1,5 dBTP.',
        'Identidades de SFX têm seeds e arquivos distintos; uma variação por evento. Não houve seleção entre 2–4 takes por escuta.',
        'Brutos e primeiros encodes preservados. O manifesto final escolhe versões corrigidas; não integrar por glob de pasta.',
        'QA numérico aprovado; revisão auditiva e mixagem no jogo ainda pendentes. Não houve mudança no código ou no roteamento de áudio do jogo.',
        'SAPI/TTS local foi consultado, mas GetInstalledVoices falhou nesta sessão; nenhuma fala fabricada ou silenciosa foi entregue.',
        'Sem commit/push/PR. Pasta principal e branch compartilhada feature/tavern-difficulty-bosses preservadas.',
        '', '## Reprodução','',
        '1. `node art-source/audio/tower/render-tower.mjs --remaining` (Chrome + playwright-core, caminhos no renderer).',
        '2. `python art-source/audio/tower/render-character-sfx.py` (stdlib + FFmpeg no caminho declarado).',
        '3. `python art-source/audio/tower/export-music.py`.',
        '4. `python art-source/audio/tower/audit-sfx.py` e `python art-source/audio/tower/prepare-handoff.py`.',
        'As saídas são exclusivas: reexecuções precisam de nomes novos para os relatórios; nenhum asset é sobrescrito.',
        'Guardiões e chefes das arenas mantêm os loops existentes conforme a seção 0 dos prompts; Claude cuida da integração.', '']
with (HERE/'HANDOFF_v1.md').open('x',encoding='utf-8') as f: f.write('\n'.join(lines))

def player(label,file,loop=False):
    src=html.escape('../../../'+file,quote=True)
    return f'<p>{html.escape(label)}<br><audio controls preload="none" {"loop" if loop else ""} src="{src}"></audio></p>'

content='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Venivium — áudio procedural</title>
<style>body{max-width:900px;margin:36px auto;padding:20px;background:#192019;color:#efdfbc;font:16px system-ui}audio{width:100%;max-width:550px}details{padding:12px;border:1px solid #675d40;margin:12px 0}summary{cursor:pointer;font-size:20px}p{line-height:1.6}</style>
<h1>Venivium — áudio procedural</h1><p>Mesmo sintetizador das trilhas existentes. 14 loops, 6 vinhetas, 367 efeitos. Timbres e vozes sintéticos sem palavras. QA de arquivos aprovado; escuta e integração pendentes. 8 falas PT-BR ainda precisam de TTS.</p><details open><summary>Músicas</summary>'''
content+=''.join(player(m['id'],m['final'],m['loop']) for m in music)+'</details>'
for character in dict.fromkeys(r['character'] for r in sfx):
    content+=f'<details><summary>{html.escape(character)}</summary>'
    content+=''.join(player(r['event'],r['file']) for r in sfx if r['character']==character and not r['speech'])+'</details>'
content+='<script>document.querySelectorAll("audio").forEach(a=>a.addEventListener("play",()=>document.querySelectorAll("audio").forEach(b=>{if(a!==b)b.pause()})))</script></html>'
with (HERE/'preview_v1.html').open('x',encoding='utf-8') as f: f.write(content)
print(json.dumps({'music_decoded':len(checks),'sfx_decoded':367,'speech_pending':len(pending),'handoff':str(HERE/'HANDOFF_v1.md')}))
