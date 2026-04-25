---
name: bugfix
description: Self-contained workflow for debugging and fixing defects
license: MIT
compatibility: opencode
---

# Bugfix Skill

Guide debugging and fixing reported bugs with evidence, regression coverage, and minimal changes.

## When to use

Use this for reported defects, regressions, failing tests, production symptoms, and flaky or intermittent failures.

Do not use this for new features or pure refactoring.

## Non-negotiable workflow

1. Triage evidence: bug report, stack trace, logs, environment, affected version, and expected vs actual behavior.
2. Reproduce or classify the issue as one of:
   - reproducible locally
   - intermittent or flaky
   - production-only or not locally reproduced
3. Do not dismiss a bug just because existing tests pass.
4. Write or identify a failing regression test first when possible. If local reproduction is impossible, write a test or simulation for the suspected condition, or document why that is not possible and define alternate validation.
5. Confirm the expected failure before changing code. If the new test passes unexpectedly, adjust the test or slice, or record that the behavior is already covered.
6. State the root cause hypothesis and the evidence supporting it.
7. Implement the minimum fix for the root cause. Do not refactor before tests are green.
8. Do not deploy, mutate production data, run destructive commands, or trigger rollback without explicit user approval.
9. Run targeted tests, then relevant tests, then the non-long-running full suite.
10. Refactor only after tests are green, and keep structural changes separate from the behavioral fix.

## Scenario guidance

- Reproducible bug: create or identify the failing test, find the root cause, apply the minimal fix, add edge-case coverage, then run the full relevant test set.
- Flaky or intermittent bug: use repeated runs, logs, and metrics to distinguish product bugs from flaky tests or infrastructure; document the classification and evidence. Simulate timing, concurrency, or external latency; add a defensive fix and monitoring when relevant.
- Production-only bug: use read-only logs, metrics, and data inspection unless explicitly authorized. Add a simulation plus staging or approved production validation and a rollback plan.

Alternate validation examples: log query, staging replay, synthetic test, feature-flag or canary metric, manual reproduction checklist.

## Root cause and scope control

- Keep the current root cause hypothesis explicit and update it when evidence changes.
- Avoid broad rewrites; fix only the failing behavior.
- If the cause is a dependency, configuration, or data issue, document the owner and validation path.

## Completion criteria

- A regression test or alternate validation exists.
- The bug symptom no longer reproduces, or the mitigation is justified.
- Tests pass, or unrelated and blocking failures are explained.
- Edge cases were considered.
- Assumptions, risks, and monitoring or rollback steps are summarized when relevant.
- Final report includes symptom, root cause hypothesis and evidence, fix or mitigation, regression coverage or alternate validation, tests run, and risks or follow-up.

## References

- Workflow: ~/.config/dotfiles/prompts/coding_workflow.md
- Style/TDD/Tidy First: ~/.config/dotfiles/prompts/coding_style.md
