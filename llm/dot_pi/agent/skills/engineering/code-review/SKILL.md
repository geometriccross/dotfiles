---
name: code-review
description: Review a requested change scope for missing requirements, actionable correctness bugs, and regression risks, and return one prioritized evidence-backed findings list. Use when the user asks to review a branch, commit range, pull request, work in progress, staged changes, or changes since a ref.
---

# Code review

Review the behavior of the requested change, not the repository in the abstract. Start from requirements, trace concrete execution paths, and report only findings that someone can act on. A review with no findings is valid. The response is the review artifact; do not create a report file, ledger, or other mandatory side product.

## 1. Establish the exact scope

Classify the request before reading the implementation. Preserve an explicit baseline, staged-only request, or path restriction; never broaden it silently.

### Branch or fixed-point review

When the user names a commit, branch, tag, `main`, `HEAD~5`, or another fixed point:

1. Confirm it resolves with `git rev-parse --verify <fixed-point>^{commit}`.
2. Capture the comparison once as `git diff <fixed-point>...HEAD -- [pathspec...]`. The three dots compare from the merge-base.
3. Capture `git log <fixed-point>..HEAD --oneline -- [pathspec...]` when commits are useful evidence.
4. Confirm the scoped diff is non-empty before analyzing it. A bad ref or empty scope is a scope result, not a reason to fall back to a different baseline.

A branch review covers committed history only. Do not mix in dirty working-tree changes; mention them as outside the review unless the user explicitly requests a working-tree review too.

### Working-tree review

For the default WIP/uncommitted scope:

- Run `git status --short --untracked-files=all -- [pathspec...]`.
- If `HEAD` exists, use `git diff HEAD -- [pathspec...]` for tracked staged and unstaged changes together.
- Enumerate untracked files separately with `git ls-files --others --exclude-standard -- [pathspec...]`; read each relevant untracked file because it is not in `git diff HEAD`.
- If `HEAD` does not exist, inspect `git diff --cached -- [pathspec...]`, `git diff -- [pathspec...]`, and the untracked-file list separately.

For an explicit **staged-only** scope, use `git diff --cached -- [pathspec...]` and include only index contents. An untracked file is not staged and is excluded unless the user explicitly includes untracked files. For an explicit unstaged-only scope, use `git diff -- [pathspec...]`; include untracked files only when the request includes them. Never stage files to make them reviewable.

Apply every path restriction after `--`, including status, diff, log, and untracked-file enumeration. Do not report an out-of-scope change. Read an out-of-scope file only as context, and label it as context rather than as reviewed change.

If the request does not identify a review mode or baseline, ask only for that missing scope. If a scoped WIP review has no changes, say so instead of silently reviewing a branch.

### Detect drift

Record the initial mode, pathspec, resolved `HEAD`, status, tracked diff, commit list, and untracked-file list in working notes. Before reporting, recheck the relevant `HEAD`/ref, status, diff, and untracked list. If a file, index entry, ref, or untracked file changed during review, disclose the drift and either review the new state or limit findings to the captured state. Never imply that a moving working tree was a stable snapshot.

## 2. Build the requirements and evidence base

Use requirements in this order, combining them rather than inventing a second report:

1. The current request, including stated acceptance criteria, constraints, and required behavior.
2. An issue, PRD, spec path, or text supplied by the user.
3. References in the selected commits and matching local project documentation, tests, callers, and public interfaces.
4. Existing behavior inferred from code, only when clearly labeled as an existing contract rather than a requested feature.

An external issue or spec is helpful but not required for a correctness review. If it is absent or inaccessible, review against the current request and observable local contracts; state that requirements basis in the result and do not stop merely because no external document exists. If `docs/agents/issue-tracker.md` exists, follow its configured lookup method; its absence does not justify installing or configuring a tracker.

Read the diff and relevant surrounding code, callers, data/configuration boundaries, and tests. For each requirement, check whether the changed path fulfills it for normal, boundary, failure, and compatibility cases. Check regression risks where relevant: changed defaults, state transitions, error handling, persistence, permissions, concurrency, resource limits, performance, and public interfaces. Run the smallest relevant existing tests, type checks, linters, or reproductions when available; do not treat a passing check as proof that untested behavior is correct. Do not add tests or artifacts just to conduct the review.

Do not use a fixed smell checklist or produce generic style, refactoring, or architecture suggestions. A documented project rule matters when the change violates a behaviorally relevant contract or creates a concrete risk; taste alone is not a finding.

## 3. Gate and prioritize findings

Report a finding only when it is:

- within the requested change or a direct consequence of it;
- a missing, incorrect, or regressed behavior, or a concrete risk of one;
- supported by a precise code location and evidence from the diff, surrounding code, a requirement, or a check; and
- actionable, with a specific repair or decision needed.

For a risk that is not reproduced, name the triggering condition and likely impact and label it as a risk rather than stating it as a confirmed bug. Do not report hypothetical concerns without a path to failure, missing tests without a concrete unprotected behavior, or duplicate findings for one root cause.

Prioritize one list by user impact and likelihood:

- **P0** — release-blocking security, data-loss, or system-wide failure.
- **P1** — likely serious breakage of a core path or requirement.
- **P2** — bounded correctness or regression issue with a meaningful impact.
- **P3** — lower-impact but still concrete and actionable issue.

Each item must include a priority, `path:line` anchor (prefer changed lines), concise problem and impact, evidence, and the concrete fix or verification needed. Quote only enough requirement or code to make the claim checkable.

## 4. Be honest about review independence

Reviewing changes authored in the same context is self-review. Changing checklists, making sequential passes, or running tests does not make it independent. Use the standard Herdr CLI only when the execution policy permits it, with a bounded read-only task and the smallest useful Pi `--tools` allowlist; delegation is optional, not a prerequisite. If child execution is unavailable, continue directly unless independent review is explicitly required; then say so and distinguish the available self-review. Call a result independent only when a genuinely separate context performed and returned a bounded review; never imply that self-review was independent. Children need not create files or reports and must not delegate again.

## Output

Give relevant scope, evidence, and verification limits briefly, followed by one prioritized findings list. Do not split findings by category or axis. Adapt this example to the request rather than filling every field mechanically:

```markdown
## Review context
- Scope: <mode, baseline, and paths; include the reviewed revision/status>
- Requirements: <sources used, or why current request/local contracts were sufficient>
- Checks: <commands and results, including anything not run>
- Drift: <none, or what changed and how scope was limited>

## Findings
1. **[P1] `path/to/file:line` — short title**
   - **Impact:** ...
   - **Evidence:** ...
   - **Fix:** ...
```

If no issue meets the gate, write `No findings.` under `## Findings`. Do not add a compensating recommendation or claim that unrun checks passed.
