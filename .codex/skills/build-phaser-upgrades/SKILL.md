---
name: build-phaser-upgrades
description: Build or refactor complete weapon and player upgrades for Phaser survivor-like games. Use when adding an upgrade, weapon perk, tiered choice, weapon-exclusive effect, upgrade UI card, or when making upgrade selection data-driven in a TypeScript Phaser project.
---

# Build Phaser Upgrades

## Define the contract first

For every upgrade, define `id`, display name, description, tier, eligible weapon types, icon key, stacking rule, and an effect that owns its state. Keep this metadata together so selection and UI do not rely on unrelated string maps or scene-specific conditionals.

## Implementation workflow

1. Inspect weapon config, player/entity state, choice generation, card rendering, preload, and attack resolution.
2. Choose the state owner:
   - Player state for shared combat or movement modifiers.
   - Weapon runtime state for a weapon-specific modifier.
   - Scene/ability controller for timers, projectiles, and target queries.
3. Add an idempotent application path and specify stack behavior explicitly: additive, multiplicative, capped, chance per hit, or cooldown reduction.
4. Generate choices through metadata filters. Roll tiers first, then choose valid upgrades; make mandatory choices and extra-weapon slots explicit rules.
5. Register the icon in preload and map the UI by upgrade metadata, with a safe fallback icon.
6. Update attack/damage code to consume the modifier without weapon-id special cases whenever possible.
7. Validate selection eligibility, stacking, UI display, restart reset, and a representative combat case.

## Guardrails

- Do not implement only art or text when the request is for an upgrade effect.
- Do not let an upgrade appear for an incompatible weapon.
- Avoid hidden state in anonymous scene fields when it belongs to player or weapon runtime state.
- Keep probability rolls independent where the design requires per-projectile or per-enemy behavior.
