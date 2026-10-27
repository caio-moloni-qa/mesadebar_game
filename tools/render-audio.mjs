/** Run Vite first, then node tools/render-audio.mjs [path-to-playwright-core].
 * Renders our original Web Audio composition and combat cues to standard PCM WAV files.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'index.mjs')).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.routeWebSocket('**', () => {});
  await page.goto('http://127.0.0.1:5173/mesadebar_game/');
  const files = await page.evaluate(async () => {
    const { composeScore, SCORE_SECONDS } = await import('/mesadebar_game/src/audio/score.ts');
    const { SOUND_NAMES, synthesizeSound } = await import('/mesadebar_game/src/audio/soundbank.ts');
    function wav(channels, sampleRate) {
      const frames = channels[0].length, count = channels.length;
      const data = new ArrayBuffer(44 + frames * count * 2), view = new DataView(data);
      const text = (offset, str) => [...str].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
      view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, frames * count * 2, true);
      for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) view.setInt16(44 + (i * count + c) * 2, Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), true);
      const bytes = new Uint8Array(data); let binary = '';
      for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      return btoa(binary);
    }
    const sampleRate = 32000;
    const frames = Math.round(SCORE_SECONDS * sampleRate);
    const ctx = new OfflineAudioContext(2, frames + sampleRate * 4, sampleRate);
    composeScore(ctx, ctx.destination);
    const rendered = await ctx.startRendering();
    // Fold the final reverb/held-note tails into the beginning, preserving an actual seamless loop.
    const channels = [0, 1].map(c => {
      const source = rendered.getChannelData(c), output = source.slice(0, frames);
      for (let i = frames; i < source.length; i++) output[i - frames] += source[i];
      return output;
    });
    let peak = 0, square = 0;
    for (const channel of channels) for (const value of channel) { peak = Math.max(peak, Math.abs(value)); square += value * value; }
    const gain = .78 / Math.max(.001, peak);
    channels.forEach(channel => { for (let i = 0; i < channel.length; i++) channel[i] *= gain; });
    const files = [{ name: 'src/assets/audio/the-last-watch.wav', data: wav(channels, sampleRate) }];
    const metrics = { title: 'The Last Watch', bpm: 92, seconds: frames / sampleRate, channels: 2, sampleRate, peak: .78, rms: Math.sqrt(square / (frames * 2)) * gain, seam: channels.map(ch => Math.abs(ch[0] - ch[ch.length - 1])), effects: [] };
    for (const name of SOUND_NAMES) {
      const samples = synthesizeSound(name, 22050);
      const peak = samples.reduce((max, n) => Math.max(max, Math.abs(n)), 0);
      if (!Number.isFinite(peak) || peak < .001) throw Error(`Bad audio: ${name}`);
      files.push({ name: `art-source/audio/effects/${name}.wav`, data: wav([samples], 22050) });
      metrics.effects.push({ name, seconds: samples.length / 22050, peak });
    }
    files.push({ name: 'art-source/audio/render-metrics.json', json: JSON.stringify(metrics, null, 2) });
    return files;
  });
  for (const file of files) {
    await mkdir(resolve(file.name, '..'), { recursive: true });
    await writeFile(file.name, file.json ?? Buffer.from(file.data, 'base64'));
    console.log(file.name);
  }
} finally { await browser.close(); }
