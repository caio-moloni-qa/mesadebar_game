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
4. Generate choices through metadata filters. Roll tiers first, then choose valid upgrades; make mandatory choices and extra-weapon slots explicit rules. If the project distinguishes owning a weapon from having upgrade rights to it (an affinity/unlock flag), filter each weapon's upgrade pool by that flag, not by mere presence in the player's active-weapon list.
5. Register the icon in preload and map the UI by upgrade metadata, with a safe fallback icon.
6. Update attack/damage code to consume the modifier without weapon-id special cases whenever possible.
7. Validate selection eligibility, stacking, UI display, restart reset, and a representative combat case.

## Guardrails

- Do not implement only art or text when the request is for an upgrade effect.
- Do not let an upgrade appear for an incompatible weapon.
- Do not equate "owns a weapon" with "has upgrade access to it." When a weapon can be acquired independently of progression bonuses (a milestone reward, a random drop), do not let its acquisition silently unlock its upgrade pool — gate that behind a separate, explicit acquired state instead.
- The same rule applies to automatic weapon-exclusive passive effects (a threshold-triggered ability, not a selectable upgrade), not just the selection screen. If a shared/aggregate counter (e.g., total upgrades picked across all owned weapons) drives the threshold, it keeps climbing on a weapon acquired without affinity — check the affinity/unlock flag at the point the passive fires, not only when building upgrade choices.
- Avoid hidden state in anonymous scene fields when it belongs to player or weapon runtime state.
- Keep probability rolls independent where the design requires per-projectile or per-enemy behavior.
