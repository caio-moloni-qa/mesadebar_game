#!/usr/bin/env node
// Looks at the running game the way a player would: opens the 3D build in headless Chrome, optionally drives it with
// a snippet run every 300 ms (pick upgrade cards, spawn a guardian...), samples an expression over time and saves a
// screenshot — so an agent can check its change on screen, not just in the tests. No dependencies (Chrome DevTools
// Protocol over Node's built-in WebSocket).
//
//   node tools/probe/probe.mjs [options] "<query string>"
//
//   query string   appended to /mesadebar_game/play3d.html, e.g. "debug=1&hero=mage&god=1&arena=snowfield&at=ruins"
//                  (debug=1 exposes window.__game; hero= starts a run; god=1 invincible; arena=; at=<zone>; zoom=)
//   --shot <png>   screenshot path (default: none)
//   --drive <js>   a snippet run every 300 ms in the page (`return` is allowed); e.g. auto-pick choices
//   --eval <js>    an expression sampled and printed (as JSON) every 2 s
//   --seconds <n>  how long to watch before the screenshot (default 6)
//   --size <WxH>   window size (default 1920x1080)
//   --port <n>     dev server port (default 5173; start it with `npx vite`)
//   --headful      show the browser
//
// Prints each sample, then the page's console errors/warnings and uncaught exceptions ("problems: none" when clean).
// Chrome is looked for at its default Windows path; set CHROME to override.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const [, value] = args.splice(index, 2);
  return value;
};
const flag = (name) => {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
};
const shot = option('--shot', null);
const drive = option('--drive', '');
const sample = option('--eval', '');
const seconds = Number(option('--seconds', '6'));
const [width, height] = option('--size', '1920x1080').split('x').map(Number);
const port = Number(option('--port', '5173'));
const headful = flag('--headful');
const query = args[0] ?? 'debug=1';
const url = `http://localhost:${port}/mesadebar_game/play3d.html?${query}`;
const chromePath = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const debugPort = 9300 + Math.floor(Math.random() * 500);

const chrome = spawn(chromePath, [
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mesa-probe-'))}`, '--no-first-run',
  '--no-default-browser-check', `--window-size=${width},${height}`, '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  ...(headful ? [] : ['--headless=new', '--use-angle=d3d11', '--enable-gpu']), url
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

try {
  const socket = new WebSocket(await pageSocket());
  const problems = [];
  const pending = new Map();
  let nextId = 1;
  const send = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((done) => pending.set(id, done));
  };
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') problems.push(`EXCEPTION ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) problems.push(`${message.params.type.toUpperCase()} ${message.params.args.map((arg) => arg.value ?? arg.description).join(' ')}`);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  await new Promise((done) => { socket.onopen = done; });
  await send('Runtime.enable');
  await send('Page.reload', { ignoreCache: true });
  await sleep(3000);
  if (drive) await evaluate(`setInterval(() => { try { (() => { ${drive} })(); } catch (error) { console.error('drive: ' + error.message); } }, 300); true`);
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    await sleep(Math.min(2000, Math.max(0, deadline - Date.now())));
    if (sample) console.log(JSON.stringify(await evaluate(`(() => { try { return ${sample}; } catch (error) { return 'eval: ' + error.message; } })()`)));
  }
  if (shot) {
    const image = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(shot, Buffer.from(image.result.data, 'base64'));
    console.log(`screenshot: ${shot}`);
  }
  console.log(`problems: ${problems.length ? [...new Set(problems)].slice(0, 15).join(' || ') : 'none'}`);
  socket.close();
} catch (error) {
  console.log(`probe failed: ${error.message} (is the dev server running on port ${port}?)`);
  process.exitCode = 1;
} finally {
  chrome.kill();
}

async function pageSocket() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = targets.find((target) => target.type === 'page' && target.url.includes('play3d'));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome still starting */ }
    await sleep(250);
  }
  throw new Error('no page target');
}
