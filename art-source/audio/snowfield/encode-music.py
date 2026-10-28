"""Encode the approved Snowfield loops, matching the game's -14 LUFS music bus.

Run from the repository root: python art-source/audio/snowfield/encode-music.py --ffmpeg <executable>
Existing outputs are refused. WAVs are preserved; only MP3s and measurements ship.
"""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
folder = Path('src/assets/audio/music/snowfield')
tracks = ['igloo', 'guardian-frost-knight', 'guardian-ice-serpent', 'guardian-bellringer',
          'guardian-ancient-yeti', 'boss-winter-king', 'boss-winter-king-enraged']
report = folder / 'integration-loudness.json'
if report.exists() or any((folder / f'{name}.mp3').exists() for name in tracks):
    raise SystemExit('Existing outputs: choose versioned names before rendering again.')


def run(*options):
    result = subprocess.run([args.ffmpeg, '-hide_banner', '-nostdin', *options],
                            capture_output=True, text=True, check=True)
    return result.stderr


def measurements(output):
    return json.loads(output[output.rfind('{'):output.rfind('}') + 1])


results = []
for name in tracks:
    source = folder / f'{name}.wav'
    first = measurements(run('-i', str(source), '-af',
                             'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'))
    settings = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={first['input_i']}:"
                f"measured_TP={first['input_tp']}:measured_LRA={first['input_lra']}:"
                f"measured_thresh={first['input_thresh']}:offset={first['target_offset']}:linear=true")
    target = folder / f'{name}.mp3'
    run('-n', '-i', str(source), '-af', settings, '-ar', '44100', '-ac', '2',
        '-c:a', 'libmp3lame', '-b:a', '160k', str(target))
    final = measurements(run('-i', str(target), '-af',
                             'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'))
    if abs(float(final['input_i']) + 14) > 1 or float(final['input_tp']) > -.5:
        raise RuntimeError(f'Unexpected loudness/peak: {name}: {final}')
    entry = {'track': name, 'source': source.name, 'file': target.name,
             'bytes': target.stat().st_size, 'source_lufs': float(first['input_i']),
             'mp3_lufs': float(final['input_i']), 'mp3_true_peak_dbfs': float(final['input_tp'])}
    results.append(entry)
    print(json.dumps(entry), flush=True)
with report.open('x', encoding='utf-8') as out:
    json.dump({'method': 'FFmpeg two-pass EBU R128, -14 LUFS, -1.5 dBTP, 160 kbps stereo MP3',
               'tracks': results}, out, indent=2)
