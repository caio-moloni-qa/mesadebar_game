---
name: audit-game-balance
description: Audit a Phaser/TypeScript game's balance values against patch notes or design specs. Use when checking enemy, weapon, boss, spawn, scaling, cooldown, damage, experience, or timing values; default to a read-only evidence-backed report unless implementation is explicitly requested.
---

# Audit Game Balance

## Workflow

1. Read the supplied balance spec completely and collect every numeric rule with its unit.
2. Locate all sources of runtime truth: balance config, scene constants, entity defaults, weapon configs, and call-site overrides.
3. Build a comparison table with spec value, effective code value, source location, and status: match, mismatch, ambiguous, or unimplemented.
4. Derive checkpoints for timelines and cycles. Verify initial state and at least the first three increments for scaling, hordes, spawns, and cooldowns.
5. Trace damage and rewards through the actual runtime path, including shields, invulnerability, drops, caps, and cleanup behavior.
6. Report only evidence-backed findings. Do not edit code unless the user also asks for a fix.

## Audit rules

- Prefer effective values over declarations: an override or multiplier can supersede a config default.
- Keep milliseconds, seconds, pixels, and percentages distinct.
- Flag rules split between config and scene code because they are likely to drift.
- For boss phases, verify timer origins, pause behavior, cancellation, and entity counting.
- Include untracked worktree changes only when comparing current state to a branch; say so explicitly.
