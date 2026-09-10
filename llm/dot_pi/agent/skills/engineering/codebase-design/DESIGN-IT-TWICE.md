# Design It Twice

When a selected deepening candidate has meaningful interface or seam choices, compare materially different designs before committing. The point is to expose depth, locality, and migration trade-offs—not to satisfy a fixed count or make a small refactor ceremonial.

Use the vocabulary in [SKILL.md](SKILL.md) — **module**, **interface**, **seam**, **adapter**, **leverage**, and **locality** — where it makes the comparison precise.

## Process

### 1. Frame the problem space

Before developing alternatives, explain the chosen candidate from the current code:

- the user or system problem and the desired outcome;
- relevant constraints, non-goals, and existing decisions;
- concrete files, symbols, call paths, tests, and current behaviour;
- dependencies and their categories from [DEEPENING.md](DEEPENING.md); and
- a rough illustrative code sketch to make the constraints concrete. The sketch is not yet a proposal.

Separate observed evidence from inference and open questions. Ask for input only when an unresolved decision blocks useful progress.

### 2. Develop proportionate alternatives

Explore a small set of materially different interface shapes when the decision warrants comparison. A local, low-risk change can have a leading design and a counterfactual or can proceed directly when the shape is obvious. A cross-module change with uncertain ownership may need more designs. Choose the amount of exploration from the uncertainty and cost of being wrong; there is no required number.

Execution follows the Execution Mode of AGENTS.md. Use the standard Herdr CLI only when that policy permits it and independent designers are useful; pass an explicit design prompt and the smallest required Pi tool allowlist. Sequential alternatives are not independent reviews. If child execution fails, compare designs directly unless independent designers are required.

For each design, use a technical brief with current file paths, coupling details, dependency category, and what sits behind the seam. For delegated tasks, also supply read scope and stop condition. Choose constraints that expose the relevant trade-offs, such as:

- minimize the interface and maximize leverage per entry point;
- maximize flexibility for real extension points;
- optimize the common caller so its default path is trivial; or
- use ports and adapters when a cross-seam dependency genuinely varies.

Use project domain terms from `CONTEXT.md` or its equivalent when available, and keep architectural terms consistent with [SKILL.md](SKILL.md). Do not make a missing glossary or an unnecessary delegation step a blocker.

For each design, provide:

1. **Interface** — types, methods, parameters, invariants, ordering, error modes, configuration, and relevant performance facts.
2. **Usage** — a representative caller example and what the caller no longer needs to know.
3. **Hidden implementation** — the behaviour and knowledge that move behind the seam.
4. **Dependencies and adapters** — the category, injected dependencies, production/test adapters, and whether the seam is justified.
5. **Trade-offs** — depth, leverage, locality, coupling, flexibility, operational cost, and migration risk.
6. **Migration and verification** — an incremental change order, compatibility considerations, interface tests, adapter/integration checks, and searches or repository checks that establish completion.

### 3. Compare and decide

Compare the designs against the current-code evidence. Discuss depth (capability per interface knowledge), locality (where change and verification concentrate), seam placement, caller complexity, dependency cost, and migration risk. Call out assumptions that still need evidence.

Give a reasoned recommendation, or state why the leading design can proceed without further comparison. If ideas combine cleanly, describe the hybrid and the extra complexity it introduces. Keep the comparison proportional to the decision.
