/** Run Vite in the main checkout, then node art-source/audio/snowfield/verify-game-music.mjs [port].
 * Exercises real encounters and the decoded music bus; reports technical playback, not an auditory review.
 */
import { chromium } from 'file:///C:/training-playwright/node_modules/playwright-core/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const port = process.argv[2] ?? '5186';
const folder = 'tools/discord/.state';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], records = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://localhost:${port}/mesadebar_game/play3d.html?debug=1&hero=mage&arena=snowfield&god=1&seed=724`);
  await page.waitForFunction(() => window.__game);
  await page.keyboard.press('Shift');
  await page.evaluate(() => {
    setInterval(() => {
      const g = window.__game;
      if (g.tipDialog.open) g.tipDialog.close();
      const choice = g.session.pendingChoice;
      if (choice?.upgrades?.length) g.session.chooseUpgrade(choice.upgrades[0].id);
    }, 100);
    __game.session.skeletonSpawnEnabled = __game.session.variantSpawnEnabled = false;
  });
  const check = async (expected, label) => {
    await page.waitForFunction(name => __game.audio.current?.name === name && __game.audio.context?.state === 'running', expected, { timeout: 20000 });
    await page.waitForTimeout(1800);
    const result = await page.evaluate(async () => {
      const a = __game.audio, current = a.current, ctx = a.context;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
      current.gain.connect(analyser);
      await new Promise(resolve => setTimeout(resolve, 100));
      const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
      current.gain.disconnect(analyser); analyser.disconnect();
      return { track: current.name, seconds: current.source.buffer.duration, channels: current.source.buffer.numberOfChannels,
        loop: current.source.loop, rms: Math.sqrt(data.reduce((sum, x) => sum + x*x, 0) / data.length),
        context: ctx.state, inside: __game.session.merchant.inside, hub: __game.session.merchant.hub };
    });
    if (!result.loop || result.rms < .0001 || result.channels !== 2) throw Error(JSON.stringify(result));
    records.push({ label, ...result }); console.log(JSON.stringify(records.at(-1)));
  };
  await check('arena', 'snowy arena');
  for (const [kind, track] of [['frostKnight', 'guardian-frost-knight'], ['iceSerpent', 'guardian-ice-serpent'],
    ['bellringer', 'guardian-bellringer'], ['ancientYeti', 'guardian-ancient-yeti']]) {
    await page.evaluate(kind => {
      const s = __game.session;
      s.miniBosses.clear(); s.spawnMiniBoss(kind);
      s.miniBosses.pending.inMs = 0; s.miniBosses.update(17);
    }, kind);
    await check(track, kind);
  }
  await page.evaluate(() => { __game.session.miniBosses.clear(); __game.session.bosses.spawnExtraBoss(); });
  await check('boss-winter-king', 'winter king phase one');
  await page.screenshot({ path: `${folder}/snowfield-music-king.png` });
  await page.evaluate(() => { __game.session.bosses.bosses[0].phaseTwo = true; });
  await check('boss-winter-king-enraged', 'winter king phase two');
  await page.evaluate(() => { const s = __game.session; s.merchant.enterShelter({ x: s.player.x, y: s.player.y }); });
  await check('igloo', 'shelter takes priority over the living king');
  await page.evaluate(() => __game.session.merchant.leave());
  await check('boss-winter-king-enraged', 'leaving restores the fight');
  await page.evaluate(() => __game.enterHub());
  await check('igloo', 'snowy base between runs');
  await page.screenshot({ path: `${folder}/snowfield-music-igloo.png` });
  // Decode every new file and play across the loop boundary with an analyser on its output.
  const loops = await page.evaluate(async () => {
    const a = __game.audio, ctx = a.context, result = [];
    for (const [url, promise] of a.decoded) {
      if (!url.includes('/snowfield/') || !url.endsWith('.mp3')) continue;
      const buffer = await promise, source = ctx.createBufferSource(), analyser = ctx.createAnalyser();
      source.buffer = buffer; source.loop = true; source.connect(analyser);
      const silent = ctx.createGain(); silent.gain.value = 0; analyser.connect(silent).connect(ctx.destination);
      source.start(0, buffer.duration - .15);
      await new Promise(resolve => setTimeout(resolve, 450));
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x*x, 0) / samples.length);
      result.push({ file: url.split('/').at(-1), seconds: buffer.duration, rmsAfterWrap: rms });
      source.stop(); source.disconnect(); analyser.disconnect(); silent.disconnect();
    }
    return result;
  });
  if (loops.length !== 7 || loops.some(loop => loop.rmsAfterWrap < .0001)) throw Error(JSON.stringify(loops));
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(`${folder}/snowfield-music-verification.json`, JSON.stringify({ errors, records, loops }, null, 2));
  console.log('Seven MP3s decoded, played and wrapped; encounter transitions passed; console clean.');
} finally { await browser.close(); }
