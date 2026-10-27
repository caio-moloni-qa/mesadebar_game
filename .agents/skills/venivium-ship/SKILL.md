---
name: venivium-ship
description: "Ship work in Venivium: branch per change, conventional commits, worktrees when another agent shares the repo, PR title and description, patch notes, and reporting the result in the team channel with screenshots. Use when the owner asks to commit, push, open a PR, write patch notes or report a delivery."
---

# Ship a change

The full house rules are in `.codex/skills/git-feature-flow/SKILL.md`; this is the short version plus what we
learned working two agents in one repo.

## Git

- **Never commit to `main`.** Branch from an up-to-date `origin/main`: `<type>/<kebab-description>`
  (`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `style/`, `perf/`).
- **One responsibility per branch.**
- **Commit, push or open a PR only when the owner asks.** No force push; no `reset --hard`, `clean`, `amend`,
  interactive rebase.
- **Another agent works in this repo too.** Work in your own git worktree (`git worktree add ../mesadebar_game-<you>
  -b <branch> origin/main`) and never touch files you didn't change — if the main folder has someone else's
  uncommitted work, leave it alone. A new worktree has no `node_modules`: link the main one
  (`mklink /J node_modules ..\mesadebar_game\node_modules` on Windows) and no `.env`: copy it if you need it.
- Add specific files (`git add path/a path/b`), never `git add .` or `git add src`.
- Commit messages: Conventional Commits, English, imperative subject; a body that says what changed and why; end
  with the attribution line your tool requires.

## Pull request

`gh` is not installed: push the branch and give the owner
`https://github.com/caio-moloni-qa/mesadebar_game/pull/new/<branch>`, with a ready-to-paste title and description:

```markdown
## Resumo / Summary
## Alterações / Changes        (by area: core, render, UI, tests)
## Validação / Validation      (- [x] only for what you actually ran: tsc, vitest count, build, browser check)
## Como testar / How to test   (numbered steps, with the query string or sandbox button)
## Observações / Notes         (known limits, what's left)
```

Write it in the language the owner asks for (default pt-BR).

## Patch notes

Player-facing, pt-BR, in the style of the earlier `PATCH_NOTES_*.md` in the main folder's root (not versioned:
emoji section headings, tables for numbers).
Take every number from the code, not from memory, and list only what is merged or about to be.

## Reporting in the team channel

- One short message: what was done, how it was checked (test count, build), what's left, the PR link.
- Attach screenshots from **venivium-verify** (`node tools/discord/discord.mjs <agent> send --attach a.png --attach b.png "..."`).
- Say plainly what was *not* checked or what looks off.
