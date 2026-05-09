---
name: code-review-orchestration
description: Orchestrate module/file-level production-code audits with reviewer agents, coder remediation, stalled-agent recovery, verification, and final audit.
license: MIT
---

# Code Review Orchestration Skill

Coordinate production-code audits across modules/files, merge reviewer findings into an in-message ledger, optionally delegate focused remediation, recover stalled work safely, and verify before reporting completion.

## Core workflow

1. Confirm repository root, source roots, excluded paths, and production files/groups in scope.
2. Group production files into review units that are small enough to reason about; one file per reviewer is optional, not mandatory.
3. Use the smallest useful agent set. If Codex agent invocation is available, delegate to `reviewer`, `coder`, or `searcher` only where it reduces risk. If unavailable, perform the workflow sequentially in the main session and report delegation unavailable.
4. When delegating, assign one review unit per reviewer or cohesive group. Reviews are closed-book, read-only, and limited to assigned exact local paths. External research, when needed, may go through a narrowly scoped `searcher`; if no `searcher` is available, do it in the main session within the same external-only boundary.
5. Merge and deduplicate findings into a live ledger as reports arrive.
6. Delegate or perform remediation only for `HIGH` or `MEDIUM` findings with disposition `actionable` by default.
7. Serialize coder tasks touching the same file, collaborator, constructor/factory/provider, cache, global state, or shared data-flow path.
8. Every delegated request includes goal, assigned scope, role-relevant context only, acceptance criteria, stop condition, and expected output.
9. After remediation, run repository-specific verification commands and request one final read-only `reviewer` audit of changed production code and unresolved findings if agent invocation is available; otherwise self-audit in the main session and label it as main-session review.
10. Do not commit from this workflow unless the user asks separately.

## Ledger

Track finding id, source reviewer or main-session review, production file/group, severity, disposition, evidence, risk, recommended fix, duplicate-of, owner, status, files changed, verification results, final audit result, deferred/skipped reason, and delegation usage/unavailability.

## Severity and disposition

`HIGH` means likely production bug/security/data loss/resource/concurrency/architecture risk. `MEDIUM` means meaningful correctness or boundary risk. `LOW` is clarity or local maintainability. `INFO` is observation only. Use `actionable`, `defer`, or `do_not_fix` disposition to control remediation.
