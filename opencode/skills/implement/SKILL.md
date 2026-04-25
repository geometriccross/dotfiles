---
name: implement
description: Workflow for implementing product behavior changes with sub-agents, TDD, and Tidy First.
license: MIT
compatibility: opencode
---

# What this skill is for

Use this skill when implementing or changing product behavior. Do not use it for pure research, planning-only tasks, or trivial one-line edits where the full workflow would add noise.

# Non-negotiable workflow

1. Start by dispatching a `searcher` sub-agent to inspect the codebase and relevant dependency docs. Ask it to return existing patterns, test commands, likely files to edit, risks/unknowns, and the smallest safe first slice.
2. Before coding, reflect: is the chosen slice the smallest reversible behavior change? If not, narrow it.
3. Use TDD in the smallest slices:
   - Write one failing test.
   - Run it and confirm the expected failure.
   - If the new test unexpectedly passes, do not implement; choose a different/narrower test that fails for the intended missing behavior, or record that the behavior already exists and adjust the slice.
   - Implement only enough behavior for that test; do not build future slices early.
   - Run the relevant tests, then the non-long-running full suite.
   - Refactor only after green.
   - Repeat until complete.
4. Apply Tidy First: separate structural changes from behavioral changes. When structural work is needed, do it first, preserve behavior, and verify with tests. Do not mix structural and behavioral changes in the same commit/change phase; when not committing, keep them in separate implementation passes and separate final-summary bullets.
5. Use `reviewer` after meaningful code changes when available. If no reviewer sub-agent is available, apply the same checklist yourself and state that reviewer dispatch was unavailable. Use `runner` only for executing commands.

# Sub-agent handoff contract

When dispatching `searcher`, provide the user goal and ask for:

- Existing implementation and test patterns.
- Relevant dependency/API documentation findings.
- Test commands and any long-running commands to avoid.
- Likely files to edit, with rationale.
- Risks, unknowns, and hidden assumptions.
- The smallest safe first implementation slice.

When dispatching `reviewer`, ask it to check correctness, TDD fit, Tidy First separation, missed edge cases, and whether the implementation exceeds the current slice. If dispatch is unavailable, perform and report this review yourself.

# Measurable review terms

- Smallest safe first slice: one observable behavior, reversible, and no premature future behavior.
- Relevant tests: tests directly covering changed behavior plus nearby affected tests; then the non-long-running full suite when feasible.
- Meaningful code changes: behavior, public API, data model, control flow, dependency, or non-trivial refactor changes.
- Unrelated/blocking failure explanation: include the command, failing test/error, why it is unrelated or blocking, and the follow-up needed in the final response, PR/commit message when applicable, or implementation notes.

# Handling ambiguity and missing tests

If requirements are vague, do not start broad implementation. Ask at most one essential clarification when blocked; otherwise record assumptions in the final response, PR/commit message when applicable, or implementation notes, then choose the smallest reversible slice.

If no test framework exists, first inspect whether tests can be added consistently. If not, create the smallest executable characterization/smoke test, or explicitly report why automated testing is blocked before implementation.

# Completion criteria

Finish only when:

- All planned slices are implemented.
- Relevant tests and the non-long-running full suite pass, or failures are explained as unrelated/blocking.
- Structural and behavioral changes are separated and documented.
- Assumptions, risks, and deferred work are summarized.
- Reviewer feedback is addressed or explicitly rejected with rationale.

# References

- Workflow: `~/.config/dotfiles/prompts/coding_workflow.md`
- Style/TDD/Tidy First: `~/.config/dotfiles/prompts/coding_style.md`
