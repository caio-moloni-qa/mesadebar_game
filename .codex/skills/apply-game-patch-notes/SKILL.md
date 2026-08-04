---
name: apply-game-patch-notes
description: Transform game patch notes into scoped, verified implementation work. Use when a user provides patch notes, a balance document, a feature list, or asks to implement, reconcile, or review game changes against an existing Phaser/TypeScript project.
---

# Apply Game Patch Notes

## Workflow

1. Read the complete patch note and identify the requested section. Treat already-implemented sections as baseline unless the user asks for an audit.
2. Inspect the repository before editing: locate configs, entities, scene state, preload/UI, asset folders, and tests. Check the worktree and preserve unrelated changes.
3. Convert each requirement into an acceptance row: feature, exact value or rule, owning code path, visual/UI need, and validation.
4. Implement data first. Keep tunable stats in config modules; use scene logic only for orchestration and timed state transitions.
5. Use explicit state for multi-step encounters (for example warning, active, shielded, cleanup). Define timer start/end semantics before coding.
6. Integrate required assets and UI only when they are part of the requested change. Do not claim an icon or preload entry implements its gameplay effect.
7. Validate all acceptance rows against the final code. Run TypeScript and the project build when practical; report any environment limitation separately.

## Guardrails

- Preserve units: HP, pixels, milliseconds, percentage points, counts, and probability must not be silently converted.
- For time scaling, calculate at every stated checkpoint rather than approximating with a generic multiplier.
- For cleanup/reward rules, state exactly which active entities count and which are preserved.
- If requirements conflict, surface the conflict and implement only the least-assumptive interpretation.
- Keep the final handoff concise: changed files, fulfilled rules, and verification.
