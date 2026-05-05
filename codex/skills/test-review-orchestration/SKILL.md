---
name: test-review-orchestration
description: Orchestrate reviewer-per-test-file audits, remediation dispatch, stalled-agent recovery, verification, and final audit.
license: MIT
---

# Test Review Orchestration Skill

Audit a test suite file-by-file, identify weak or missing black-box coverage, optionally delegate concise remediation, and verify the repository before reporting completion.

## Core workflow

1. Confirm repository root and exact paths before any optional delegation.
2. Enumerate test files in scope; by default include `test_*.py` under `tests/` and exclude generated/vendor files unless requested.
3. Maintain an in-message checklist and findings ledger with one item per test file plus remediation and final verification items.
4. Use the smallest useful agent set. If Codex agent invocation is available, delegate to `reviewer` or `coder` where useful; one reviewer per test file is optional, not mandatory. If unavailable, review files sequentially in the main session and report delegation unavailable.
5. Reviewers, or the main session fallback, inspect the test file plus assigned implementation paths, trace bounded instance/data-flow, identify mocks/fakes/stubs, and report missing or weak black-box coverage.
6. Merge findings immediately. Delegate or perform remediation only for high/medium `actionable` findings by default; do not assign `defer` or `do_not_fix` without approval.
7. Serialize overlapping coder work; parallelize only independent changes.
8. Run targeted tests for each remediation, then repository-specific final lint/type/test commands.
9. Request one final read-only `reviewer` audit of changed work and unresolved findings if agent invocation is available; otherwise self-audit in the main session and label it as main-session review.
10. Leave changes uncommitted unless the user separately asks for commits.

## Tracking

Use a live in-message findings ledger with id, file, severity, disposition, owner, status, fix summary, files changed, verification results, deferred/skipped reason, and delegation usage/unavailability.
