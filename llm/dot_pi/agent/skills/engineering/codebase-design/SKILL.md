---
name: codebase-design
description: Investigate architecture, module boundaries, caller contracts, and design trade-offs. Use for cross-module restructuring or substantive interface/testability decisions, not local renames, mechanical moves, or routine fixes.
---

# Codebase Design

Start from the problem and the current code. Choose a design that concentrates meaningful complexity without adding interfaces or process merely for consistency. A clear local refactor can proceed directly with affected callers and tests checked.

## Design from evidence

1. Identify the behavior or responsibility that needs to change. Inspect the relevant entry points, callers, implementations, tests, and dependency flow. Read existing domain terms and ADRs when they affect the decision.
2. Locate concrete friction: duplicated rules, caller knowledge of internals, ordering constraints, scattered ownership, or a hard-to-test behavior. Distinguish observed facts from assumptions that could change the design.
3. Choose where that responsibility should live. Compare alternatives only when they have meaningful trade-offs; [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) can help with an unresolved interface or seam choice.
4. Explain the consequential trade-offs and how to migrate and verify the change. The amount of explanation should fit the decision; no candidate inventory, glossary, report, or approval phase is required by this skill.

## Useful design concepts

- **Module:** an interface and its implementation, from a function to a tier-spanning slice.
- **Interface:** everything callers must know, including invariants, ordering, errors, configuration, and relevant performance constraints.
- **Depth:** substantial behavior behind a small interface. It gives callers leverage and keeps changes, knowledge, and verification local.
- **Seam:** a place where behavior can be varied without editing the caller. An **adapter** supplies a concrete implementation at that seam.

Look for opportunities to reduce what callers must know. Do not measure depth by implementation size or assume every small module needs merging.

The **deletion test** is useful for a suspected pass-through: if removing it eliminates complexity, it may be unnecessary; if complexity spreads into callers, it was hiding something valuable.

Introduce seams for concrete needs such as dependency isolation, ownership, or an actual variant. Production and test adapters can demonstrate a useful seam, but a fixed adapter count is not a design requirement. Internal seams need not become public interfaces.

Use [DEEPENING.md](DEEPENING.md) when dependency placement or test doubles are central to the decision.

## Migration and verification

Preserve the behavior that must remain stable, move responsibility, update callers, and remove obsolete paths. Choose the order from compatibility and deployment needs; avoid temporary layers that have no migration purpose.

Verify observable behavior across the changed interface, including relevant failures and external effects. Keep useful internal or adapter tests when they protect behavior that interface tests miss. Remove old tests only when their contract is obsolete or their coverage is genuinely replaced.

Check for remaining callers before deleting an old interface. Report unresolved migration risks and unverified behavior rather than claiming an unmeasured architectural or performance improvement.
