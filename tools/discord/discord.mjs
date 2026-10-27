#!/usr/bin/env node
// The agents' only door to Discord: one text channel in one server, through a bot of their own (Discord's REST API,
// no other service). Claude Code and Codex each run this from their own session while they work the channel (see
// tools/discord/PROTOCOL.md).
//
//   node tools/discord/discord.mjs <agent> check               who the bot is, and that the channel is the right one
//   node tools/discord/discord.mjs <agent> read [count]         the last messages (default 20), oldest first
//   node tools/discord/discord.mjs <agent> wait [seconds]       blocks until new messages arrive (default 240 s)
//   node tools/discord/discord.mjs <agent> send <text...>       posts a message (long ones are split)
//   node tools/discord/discord.mjs <agent> send --file <path>   posts a file's text
//
// <agent> is `claude` or `codex`. Settings come from the environment or the repo's .env (never committed):
//   DISCORD_GUILD_ID, DISCORD_CHANNEL_ID   the server and the text channel to work in
//   DISCORD_OWNER_ID                       the one person whose messages are instructions
//   DISCORD_TOKEN_CLAUDE, DISCORD_TOKEN_CODEX   each agent's bot token
//   DISCORD_LEAD                           who splits unaddressed tasks (claude by default)
//
// Output is JSON, one object per line, for the agent to read. `wait` remembers the last message it showed (per agent,
// in tools/discord/.state/, ignored by git), so each call returns only what's new; the first call starts from now.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
// DISCORD_API_BASE only points the script at a stand-in for testing; it defaults to Discord's own API.
const API = process.env.DISCORD_API_BASE || 'https://discord.com/api/v10';
const MAX_MESSAGE = 2000;
const POLL_MS = 2500;
const STOP_WORDS = ['!parar', '!stop'];

loadEnv(join(ROOT, '.env'));

const [agent, command = 'check', ...args] = process.argv.slice(2);
if (!['claude', 'codex'].includes(agent)) fail('Primeiro argumento: claude ou codex.');
const token = process.env[`DISCORD_TOKEN_${agent.toUpperCase()}`];
const guildId = process.env.DISCORD_GUILD_ID;
const channelId = process.env.DISCORD_CHANNEL_ID;
const ownerId = process.env.DISCORD_OWNER_ID;
if (!token) fail(`Falta DISCORD_TOKEN_${agent.toUpperCase()} no .env.`);
if (!guildId || !channelId) fail('Faltam DISCORD_GUILD_ID e DISCORD_CHANNEL_ID no .env.');
if (!ownerId) fail('Falta DISCORD_OWNER_ID no .env (o seu ID de usuário do Discord).');

const stateFile = join(HERE, '.state', `${agent}.json`);

// ── Commands ─────────────────────────────────────────────────────────────────────────────────────────────────────

async function check() {
  const me = await whoAmI();
  const channel = await guardChannel();
  out({ ok: true, agent, bot: me.username, botId: me.id, guild: guildId, channel: channel.name, channelId, owner: ownerId, lead: process.env.DISCORD_LEAD || 'claude' });
}

async function read([count = '20']) {
  await guardChannel();
  const me = await whoAmI();
  const messages = await api(`/channels/${channelId}/messages?limit=${clamp(Number(count) || 20, 1, 100)}`);
  messages.reverse().forEach((message) => out(view(message, me)));
}

async function wait([seconds = '240']) {
  await guardChannel();
  const me = await whoAmI();
  const deadline = Date.now() + clamp(Number(seconds) || 240, 5, 590) * 1000;
  let after = loadState().after;
  if (!after) {
    // First wait: start from the channel's newest message (history is `read`'s job).
    const [latest] = await api(`/channels/${channelId}/messages?limit=1`);
    after = latest?.id ?? '0';
    saveState({ after });
  }
  while (Date.now() < deadline) {
    const messages = (await api(`/channels/${channelId}/messages?after=${after}&limit=100`)).reverse();
    if (messages.length > 0) {
      after = messages[messages.length - 1].id;
      saveState({ after });
      // The bot's own posts aren't news to it.
      const fresh = messages.filter((message) => message.author.id !== me.id);
      if (fresh.length > 0) {
        fresh.forEach((message) => out(view(message, me)));
        return;
      }
    }
    await sleep(POLL_MS);
  }
  out({ timeout: true, hint: 'Nada novo. Chame wait de novo.' });
}

async function send(args) {
  await guardChannel();
  let text = args[0] === '--file' ? readFileSync(resolve(args[1]), 'utf8') : args.join(' ');
  text = text.trim();
  if (!text) fail('Mensagem vazia.');
  const sent = [];
  for (const part of split(text)) {
    // Mentions only reach people the message names on purpose; never @everyone/@here.
    const message = await api(`/channels/${channelId}/messages`, { method: 'POST', body: { content: part, allowed_mentions: { parse: ['users'] } } });
    sent.push(message.id);
  }
  // What we just said shouldn't come back from the next wait.
  saveState({ after: maxId(loadState().after, sent[sent.length - 1]) });
  out({ sent: sent.length, ids: sent });
}

// ── Discord ──────────────────────────────────────────────────────────────────────────────────────────────────────

let cachedMe = null;
async function whoAmI() {
  cachedMe ??= await api('/users/@me');
  return cachedMe;
}

/** The channel must be the configured one, a text channel, in the configured server. */
async function guardChannel() {
  const channel = await api(`/channels/${channelId}`);
  if (channel.guild_id !== guildId) throw new Error(`O canal ${channelId} não pertence ao servidor ${guildId}.`);
  if (channel.type !== 0 && channel.type !== 5) throw new Error('DISCORD_CHANNEL_ID não é um canal de texto.');
  return channel;
}

async function api(path, { method = 'GET', body } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(API + path, {
      method,
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (mesadebar-agents, 1.0)' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 429) {
      const { retry_after: retryAfter = 1 } = await response.json().catch(() => ({}));
      await sleep(Math.ceil(retryAfter * 1000) + 100);
      continue;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const hint = response.status === 401 ? ' (token inválido?)' : response.status === 403 ? ' (o bot não tem acesso a esse canal?)' : '';
      throw new Error(`Discord ${response.status}${hint}: ${detail.slice(0, 300)}`);
    }
    return response.status === 204 ? null : response.json();
  }
  throw new Error('Discord: limite de requisições excedido várias vezes seguidas.');
}

/** What the agent needs from a message: who, whether to take it as an instruction, and the text. */
function view(message, me) {
  const fromOwner = message.author.id === ownerId;
  const content = message.content ?? '';
  return {
    id: message.id,
    at: message.timestamp,
    author: message.author.global_name ?? message.author.username,
    authorId: message.author.id,
    from: fromOwner ? 'owner' : message.author.bot ? 'bot' : 'other',
    mentionsMe: (message.mentions ?? []).some((user) => user.id === me.id),
    stop: fromOwner && STOP_WORDS.some((word) => content.toLowerCase().includes(word)),
    content,
    attachments: (message.attachments ?? []).map((file) => file.url),
    replyTo: message.message_reference?.message_id ?? null
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

function split(text) {
  const parts = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE) {
    // Break at a line, else a space, before the limit.
    let cut = rest.lastIndexOf('\n', MAX_MESSAGE);
    if (cut < MAX_MESSAGE / 2) cut = rest.lastIndexOf(' ', MAX_MESSAGE);
    if (cut < MAX_MESSAGE / 2) cut = MAX_MESSAGE;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function maxId(a, b) {
  if (!a) return b;
  if (!b) return a;
  return BigInt(a) > BigInt(b) ? a : b;
}

function loadState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state));
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function out(object) {
  process.stdout.write(`${JSON.stringify(object)}\n`);
}

function fail(message) {
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const commands = { check, read, wait, send };
if (!commands[command]) fail(`Comando desconhecido: ${command}. Use check, read, wait ou send.`);
// A failed request reports and sets the exit code without forcing the exit (an abrupt exit while a connection is
// still closing crashes Node on Windows).
await commands[command](args).catch((error) => {
  out({ error: error.message });
  process.exitCode = 1;
});
