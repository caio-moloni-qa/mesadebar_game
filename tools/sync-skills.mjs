#!/usr/bin/env node
// The project's agent skills have one source: .agents/skills/<name>/SKILL.md. This copies each one to where each agent
// looks for skills — .claude/skills/<name>/SKILL.md (Claude Code) and .codex/skills/<name>/SKILL.md plus its
// agents/openai.yaml (Codex) — so both work from the same text.
//
//   node tools/sync-skills.mjs           copy (run after editing a skill)
//   node tools/sync-skills.mjs --check   exit 1 if a copy is missing or stale (nothing written)
//
// Only the skills in .agents/skills are touched; other skills in .claude/ or .codex/ are left alone.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, '.agents', 'skills');
const check = process.argv.includes('--check');

/** The skills in the canonical folder: name, description, title and text. */
export function readSkills(root = ROOT) {
  const source = join(root, '.agents', 'skills');
  if (!existsSync(source)) return [];
  return readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, 'SKILL.md')))
    .map((entry) => {
      const path = join(source, entry.name, 'SKILL.md');
      const text = readFileSync(path, 'utf8');
      const field = (key) => text.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, 'm'))?.[1].replace(/\\"/g, '"') ?? '';
      return { name: field('name') || entry.name, description: field('description'), title: text.match(/^#\s+(.+)$/m)?.[1] ?? entry.name, text, path };
    });
}

function codexYaml(skill) {
  const short = skill.description.split(/(?<=\.)\s/)[0].replace(/"/g, "'");
  return `interface:\n  display_name: "${skill.title.replace(/"/g, "'")}"\n  short_description: "${short}"\n  default_prompt: "Use $${skill.name} for this task."\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const skills = readSkills();
  if (skills.length === 0) {
    console.log(`No skills in ${SOURCE}.`);
    process.exit(0);
  }
  const stale = [];
  for (const skill of skills) {
    const targets = [
      [join(ROOT, '.claude', 'skills', skill.name, 'SKILL.md'), skill.text],
      [join(ROOT, '.codex', 'skills', skill.name, 'SKILL.md'), skill.text],
      [join(ROOT, '.codex', 'skills', skill.name, 'agents', 'openai.yaml'), codexYaml(skill)]
    ];
    for (const [target, content] of targets) {
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (current === content) continue;
      stale.push(target);
      if (check) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  const relative = (path) => path.slice(ROOT.length + 1).replace(/\\/g, '/');
  if (check) {
    if (stale.length > 0) {
      console.log(`Out of sync (run node tools/sync-skills.mjs):\n${stale.map((path) => `  ${relative(path)}`).join('\n')}`);
      process.exit(1);
    }
    console.log(`${skills.length} skills in sync.`);
  } else {
    console.log(stale.length > 0 ? `Updated:\n${stale.map((path) => `  ${relative(path)}`).join('\n')}` : `${skills.length} skills already in sync.`);
  }
}
