---
name: code-review
description: Review changes along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Reviews both axes with isolated context where possible and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of a diff:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

Execution follows the Execution Mode of AGENTS.md. By default, review Standards and Spec sequentially and keep their evidence and findings separate; this does not provide independent contexts. Delegate only when that policy permits it and the required tools are available. Use `herdr_delegate` with `herdr-reviewer` and an explicit axis-specific task contract; correctness-only roles do not cover this skill's standards review. Children must not delegate again. If delegation fails, continue directly only when independent review is not required; otherwise report the blocker. Never describe self-review as independent review.

Use `docs/agents/issue-tracker.md` if present. Its absence does not require installing or configuring an issue tracker to review local changes.

## Process

### 1. Pin the review target

Two modes:

- **Branch review** — the user supplies a fixed point (commit SHA, branch name, tag, `main`, `HEAD~5`). Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`. Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here — not inside two isolated review contexts.
- **Working-tree review** — the user asks to review uncommitted changes (work-in-progress). Run `git status --short`, use `git diff HEAD` for tracked changes (staged and unstaged together), and enumerate untracked files with `git ls-files --others --exclude-standard`. Read relevant untracked files separately: they are not included in `git diff HEAD`. If HEAD does not exist yet, inspect staged additions with `git diff --cached` and unstaged changes with `git diff`, plus untracked files. Do not stage files for review. If there are no changes, say so instead of silently falling back to a branch review.

If the request does not identify a review mode or baseline, ask only for the missing scope. Preserve any explicit staged-only or path-limited scope. Record the reviewed revision/status and report changes to that state during review rather than implying a stable snapshot.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the selected commits (`#123`, `Closes #45`, GitLab `!67`, etc.), when reviewing a branch — fetch through the configured tracker if available.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** axis will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Run both axes

Run each axis with the briefs below, in isolated contexts when delegating, or sequentially (Standards, then Spec) when working directly.

**Standards axis brief** — include:

- The review mode, diff commands, relevant untracked file list, and commit list if applicable.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full — the isolated runner has no other access to it.
- The brief: "Report only actionable, evidence-backed findings; no findings is valid. For documented-standard violations, cite the standard (file + rule). For baseline smells, name the heuristic, quote the hunk, and explain a concrete maintenance cost; omit taste-based changes. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec axis brief** — include:

- The review mode, diff commands, relevant untracked file list, and commit list if applicable.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec axis and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
