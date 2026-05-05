---
name: implement
description: Workflow for implementing product behavior changes with sub-agents, TDD, and Tidy First.
license: MIT
---

# Implement Skill

Use this when implementing or changing product behavior. Do not use it for pure research, planning-only tasks, or trivial one-line edits where the full workflow would add noise.

## Workflow

1. If Codex agent invocation is available, use a `searcher` only for external dependency/API documentation, official docs, release notes, external source repositories, schemas, and other non-local sources. Do not ask `searcher` to inspect local project files. If unavailable, perform needed external-doc checks in the main session and report delegation unavailable.
2. Reflect before coding: is the slice the smallest reversible behavior change? If not, narrow it.
3. Use TDD: write one failing test, confirm the expected failure, implement only enough to pass, run relevant tests, then the non-long-running full suite when feasible.
4. Refactor only after green.
5. Apply Tidy First: keep structural changes separate from behavioral changes; structural work is behavior-preserving and verified by tests.
6. If Codex agent invocation is available, ask a `reviewer` to check correctness, TDD fit, Tidy First separation, edge cases, and over-implementation after meaningful code changes. If unavailable, perform the same review in the main session and report delegation unavailable.

## Completion

Finish only when planned slices are implemented, tests pass or failures are explained, structural and behavioral changes are separated, and assumptions/risks/deferred work are summarized.

## Built-in rules

TDD is Red/Green/Refactor in the smallest reversible slices. Tidy First separates structural cleanup from behavioral changes; when commits are not requested, keep separation visible in the work log and final summary.
