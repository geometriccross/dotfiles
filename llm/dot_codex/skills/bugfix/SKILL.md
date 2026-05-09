---
name: bugfix
description: Self-contained workflow for debugging and fixing defects
license: MIT
---

# Bugfix Skill

Guide debugging and fixing reported bugs with evidence, regression coverage, and minimal changes.

Use this for reported defects, regressions, failing tests, production symptoms, and flaky or intermittent failures. Do not use it for new features or pure refactoring.

## Workflow

1. Triage evidence: bug report, stack trace, logs, environment, affected version, and expected vs actual behavior.
2. Reproduce or classify the issue as reproducible locally, intermittent/flaky, or production-only.
3. Do not dismiss a bug just because existing tests pass.
4. Use Red/Green/Refactor: write or identify one failing regression test first when possible; confirm the expected failure; implement only the minimum fix; run tests; refactor only after green.
5. If local reproduction is impossible, write a simulation or characterization test for the suspected condition. If no automated test is feasible, document alternate validation such as manual reproduction steps, log/query evidence, or a narrow smoke check.
6. State the root cause hypothesis and supporting evidence.
7. Do not deploy, mutate production data, run destructive commands, or trigger rollback without explicit user approval and sandbox/permission awareness.
8. Run targeted tests, relevant tests, then the non-long-running full suite when feasible.
9. Keep structural changes separate from the behavioral fix; when not committing, report them as separate change groups.

## Completion

Finish with symptom, root cause hypothesis and evidence, fix or mitigation, regression coverage or alternate validation, tests run, risks, and follow-up.

## Built-in rules

TDD means one failing test at a time, minimum code to pass, then cleanup. Tidy First means structural cleanup is behavior-preserving and separate from the bug fix.
