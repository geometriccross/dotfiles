---
name: codebase-design
description: Explore current code and design deep modules. Use when a change needs architectural investigation, a better module interface or seam, a testability improvement, or a focused comparison of design options; scale the process to the size of the decision.
---

# Codebase Design

Use this skill to connect evidence from the current codebase to a design that gives callers leverage and maintainers locality. It combines architecture exploration with deep-module design. Start from the problem and the code that exists, then make the smallest design decision that hides meaningful complexity behind a testable interface.

## Right-size the work

Do not turn every small refactor into a design exercise.

- For a local rename, mechanical move, or small refactor with no meaningful interface or behaviour change, inspect affected callers and tests, make the change, and run focused checks.
- Use the exploration workflow when a change crosses modules, changes a caller contract, introduces or moves a seam, consolidates behaviour, or has unclear coupling or risk.
- Use [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) when materially different interfaces or seam locations have meaningful trade-offs. A clear, low-risk shape can be documented and implemented directly.

## Vocabulary

These definitions make architectural reasoning precise. Use them when they clarify a decision; ordinary domain language can still describe the surrounding problem.

**Module** — anything with an interface and an implementation. This can be a function, class, package, or tier-spanning slice.

**Interface** — everything a caller must know to use the module correctly: the type signature, invariants, ordering constraints, error modes, required configuration, and relevant performance characteristics.

**Implementation** — what is inside a module. An adapter can have a small or large implementation; the term describes its role at a seam, not its size.

**Depth** — leverage at the interface: the amount of behaviour a caller or test can exercise per unit of interface it has to learn. A module is **deep** when substantial behaviour sits behind a small interface and **shallow** when the interface is nearly as complex as the implementation.

**Seam** _(Michael Feathers)_ — a place where behaviour can be altered without editing in that place; the location at which a module's interface lives. Choosing the seam is a design decision separate from what sits behind it.

**Adapter** — a concrete thing that satisfies an interface at a seam. It describes a role: production, test, transport, persistence, or another way of fitting the module into its surroundings.

**Leverage** — what callers get from depth: more capability per unit of interface they learn. One implementation pays back across call sites and tests.

**Locality** — what maintainers get from depth: change, bugs, knowledge, and verification concentrate in one place rather than spreading across callers.

## Explore before proposing a shape

### 1. Frame the problem

State the user-visible problem or architectural decision before proposing an interface. Include:

- the affected domain concept and scope;
- desired behaviour, constraints, and non-goals;
- why the current arrangement creates friction now; and
- decisions that are already load-bearing.

Read the project's domain glossary (`CONTEXT.md` where the project uses it) and relevant ADRs before drawing conclusions. Treat an ADR as context for the decision; revisit it only when current friction is real and the evidence justifies doing so.

### 2. Gather current-code evidence

Explore the code directly. Inspect the entry points, representative call sites, implementations, tests, dependency construction, configuration, and relevant data or error flow. Record concrete paths and symbols rather than describing an imagined architecture. Separate:

- **observed facts** — what the code and tests currently do;
- **inferences** — likely coupling, ownership, or variation points; and
- **open questions** — assumptions that could change the design.

Look especially for duplicated rules, leaked knowledge across a seam, ordering or error behaviour encoded in callers, mutable state, and tests that must reach past an interface. Current-code evidence should make the problem falsifiable: another engineer should be able to inspect the same paths and understand why a candidate exists.

### 3. Find proportionate candidates

A candidate is useful when it concentrates behaviour and knowledge without merely moving files. Look for:

- a shallow module whose callers repeat the implementation's decisions;
- tightly coupled modules that make one concept hard to understand locally;
- a seam where a real variation exists or two adapters are justified;
- logic extracted for testability while the important behaviour remains in its callers; or
- an untested or hard-to-test flow whose observable behaviour could be exercised through one interface.

Apply the deletion test: if deleting a suspected module makes complexity disappear, it was a pass-through; if complexity reappears across callers, it was earning its keep. Do not propose detailed interfaces until the current structure and the desired responsibility are clear.

For each candidate, capture:

- files and representative call paths;
- the current interface and what it exposes;
- the concrete friction and its evidence;
- dependencies and their category from [DEEPENING.md](DEEPENING.md);
- what responsibility could become local; and
- meaningful risks, constraints, and unknowns.

### 4. Compare the decision in plain language

Present enough detail for a decision without requiring a particular report format. For each serious candidate, explain:

- **Problem** — the current-code evidence and the cost of the friction;
- **Direction** — the responsibility that would become local and the likely seam;
- **Benefits** — expected leverage, locality, and test-surface changes;
- **Trade-offs** — added concepts, coupling, operational cost, migration risk, or cases where the interface becomes thinner or broader;
- **Migration** — an order of changes that keeps the code usable and makes obsolete modules safe to remove; and
- **Verification** — tests and checks that distinguish preserved behaviour from accidental success.

If candidates conflict with an ADR, surface the conflict only when the observed friction is substantial enough to justify reopening it. If a choice is unresolved, ask the smallest question that blocks progress; otherwise continue with the strongest evidence-backed direction.

## Deep-module principles

**Deep module** = a small interface with substantial implementation behind it. The interface is the test surface: callers and tests cross the same seam, and tests should assert observable behaviour rather than internal state.

**Shallow module** = a large interface with little implementation behind it. When the interface mostly repeats implementation structure, the module provides little leverage and callers carry the complexity.

- **Depth is a property of the interface, not the implementation.** A deep module can contain small, mockable, swappable internal parts; those parts need not become part of the external interface.
- **The deletion test** distinguishes a pass-through from a module that hides complexity.
- **One adapter means a hypothetical seam. Two adapters means a real one.** Introduce a seam when variation is real, typically with production and test adapters, rather than adding indirection for its own sake.
- **The interface is the test surface.** If a test must reach past it, reconsider the module's shape or make that seam explicitly internal.
- **Depth produces leverage for callers and locality for maintainers.** A change, bug, or piece of verification should have one natural place to live.
- A module's external seam is its interface; internal seams can remain private to the implementation when they help its own tests or composition.

The relationships are deliberate: depth is measured at a module's interface, an adapter satisfies that interface at a seam, and depth produces leverage for callers and locality for maintainers.

When designing an interface, ask:

- Can the number of entry points or parameters shrink?
- Which ordering, error, configuration, and performance facts should the interface own?
- Can more complexity move behind the seam without hiding a necessary caller decision?
- Does the proposed seam have real variation, and are its adapters worth the cost?

## Migration and verification

A design is incomplete until it explains how to get from the observed code to the target shape and how to know the move is safe. Adapt the sequence to the repository, but consider:

1. Capture characterization tests or other observations for behaviour that must remain stable.
2. Define the target responsibility, interface, seam, and dependency strategy.
3. Move behaviour behind the seam in a small, reviewable step; keep compatibility code only while it serves a concrete migration need.
4. Update callers to use the target interface and remove duplicated decisions.
5. Replace tests of obsolete shallow modules with tests through the deep module's interface; keep adapter or integration checks for real external effects.
6. Delete pass-through modules and temporary compatibility paths once call-site and test searches show they are no longer needed.

Verify observable outcomes, including ordering, errors, configuration, persistence or transport effects, and relevant performance characteristics. Run focused interface tests first, then adapter/integration tests and the repository's type, lint, build, or broader test checks as applicable. Search for remaining callers and old seams, and record unresolved risks rather than implying a behavioural improvement that was not measured.

## Testing for depth

Good interfaces make testing natural:

1. **Accept dependencies, don't create them.**

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results instead of forcing incidental side effects.**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Keep the surface small.** Fewer methods and parameters reduce setup and the number of behaviours callers must learn.

The detailed dependency categories, seam guidance, and replace-don't-layer testing strategy are in [DEEPENING.md](DEEPENING.md). For alternative interface shapes and their comparison, use [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
