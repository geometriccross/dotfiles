---
name: code-review-orchestration
description: Orchestrate module/file-level production-code audits with reviewer agents, coder remediation, stalled-agent recovery, verification, and final audit.
license: MIT
compatibility: opencode
---

# Code Review Orchestration Skill

Use this skill to coordinate production-code audits across modules or files, merge reviewer findings into a live ledger, dispatch focused coder remediation, recover stalled work safely, and verify the repository before reporting completion.

## When to use

Use this when asked to review, audit, harden, simplify, or remediate production implementation code across one or more source modules/files.

Do not use this for test-suite-only audits. Do not use it for a single isolated bug unless the requested work explicitly asks for reviewer/coder orchestration across production files.

## Scope selection

1. Determine production-code scope from the user request first.
2. If the request is based on current changes, identify changed production files and use those as the default scope.
3. If scope is broad or unspecified, include source files under project source roots such as `src/`, `lib/`, `app/`, package directories, or extension production source directories.
4. Exclude tests, generated files, vendored dependencies, build artifacts, snapshots, lockfiles, and fixture-only files unless the user explicitly asks to include them.
5. Use exact repository paths in every prompt. Prefer repo-relative paths in reports and absolute paths when launching agents if the tool requires them.
6. Use project-specific verification commands from repository documentation, not generic commands, when available.

## Project-specific notes

Prefer repository documentation for project-specific paths, commands, and cautions. For the q2lsp repository specifically:

- Repository root: `/Users/geometriccross/ghq/github.com/geometriccross/q2lsp`
- Verification commands:
  - `pixi run -e dev pytest`
  - `pixi run -e dev ruff check .`
  - `pixi run -e dev ruff format .`
  - `pixi run -e dev pyright`
- During review or remediation, avoid running heavy QIIME 2 non-help commands unless explicitly required and approved.

For other repositories, use their own documented root, source roots, verification wrappers, and domain-specific cautions instead of q2lsp-specific values.

## Core workflow

1. Confirm repository root, source roots, excluded paths, and production files/groups in scope.
2. Group production files into one file per reviewer by default. Use cohesive small groups only when files are tightly coupled and reviewing them separately would obscure the production path.
3. Use the smallest useful agent set. Do not invoke every available agent by default; add reviewers, coders, searchers, cracker, or extra audit passes only when they reduce concrete uncertainty, risk, or verification cost.
4. Dispatch one reviewer per production module/file or cohesive small file group only for files in scope. Reviewer/static-audit dispatch is primarily closed-book: keep local review read-only and limited to assigned exact paths. Reviewers may request or launch a searcher only for explicitly scoped external research; when used, the searcher may use web search/fetch under the bounded-searcher rules below. Prefer 3-5 reviewer agents per parallel batch unless the user requests otherwise or tooling/context constraints require a different size.
5. Require every reviewer to run primarily closed-book and read-only. Every reviewer prompt must include the local read-only and bounded-searcher constraints in the reviewer prompt templates.
6. As reviewer reports arrive, merge and deduplicate findings into a live ledger. Do not wait for all reviewers before dispatching independent coder work.
7. Dispatch coders only for `HIGH` or `MEDIUM` findings with disposition `actionable` by default. Do not assign `LOW`, `INFO`, `defer`, or `do_not_fix` findings without explicit user approval.
8. Serialize coder tasks that touch the same file, collaborator, constructor/factory/provider, cache, global state, or shared data-flow path. Parallelize only independent remediation.
9. Require every subagent dispatch to include goal, assigned scope, role-relevant context only, acceptance criteria, stop condition, and expected output. Do not pass full conversation history by default; pass only relevant summaries, constraints, evidence, paths, commands, and research findings needed for that role.
10. Require coders to run targeted tests/checks and report files, commands, and results.
11. After all remediation is complete, run final verification with repository-specific commands.
12. Ask one reviewer agent for a final audit of changed production code and the unresolved findings ledger. Add cracker or extra review only for high-risk, security-sensitive, regression-prone, or ambiguous cases. Avoid non-improving review loops.
13. Do not commit from this workflow. Leave changes uncommitted and report current status. If the user asks for commits, handle that as a separate follow-up task.

## Reviewer responsibilities

Each reviewer owns exactly one production module/file or cohesive small production file group. The reviewer must inspect enough imported modules and directly exercised dependencies to understand real production behavior without performing an unbounded whole-program audit.

The reviewer must:

- inspect imported modules and directly exercised dependencies relevant to the file/module,
- trace instance/object/data-flow paths relevant to public and important internal behavior,
- identify constructors, factories, providers, dependency injection points, caches, registries, singletons, environment/config access, and other global state used,
- determine whether code follows the production path or bypasses important collaborators,
- inspect public API behavior, internal helpers, error handling, resource management, concurrency/async behavior, type boundaries, security/trust boundaries, and architecture/import boundaries,
- identify missing tests only as evidence for a concrete code risk, not as an idealistic wishlist,
- report severity and disposition for each finding,
- mark optional, broad, speculative, or nice-to-have findings as `defer`,
- mark findings that would freeze undefined behavior or encourage over-defensive code as `do_not_fix`.

Finding ids must use `<file-stem>-<severity>-<number>`, for example `server-high-001` or `command_parser-medium-001`. Use lowercase severity in ids and number findings sequentially per reviewed file/group and severity.

Severity guidance:

- `HIGH`: likely production bug, security/trust-boundary issue, data loss/corruption risk, resource leak with user impact, serious concurrency bug, or architecture boundary violation that can break supported behavior.
- `MEDIUM`: meaningful correctness risk, important edge path mishandled, type boundary mismatch, error handling that hides actionable failures, resource/concurrency concern with bounded impact, or collaborator bypass that can produce wrong behavior.
- `LOW`: clarity, local simplification, minor maintainability issue, small non-blocking type/API improvement.
- `INFO`: observation with no requested action.

Disposition guidance:

- `actionable`: concrete, production-relevant, safe to fix now, and small enough for focused remediation.
- `defer`: useful but broad, speculative, optional, requires design/product decision, or would be better handled in a separate planned change.
- `do_not_fix`: would freeze undefined behavior, add over-defensive code, conflict with project constraints, or address a non-problem.

## Reviewer prompt template

```text
You are reviewing production code for concrete implementation risks.

This is primarily a closed-book local review.
Do not personally use web search, fetch URLs, or inspect external documentation.
You may request or launch a searcher only for explicitly scoped external research; searcher web search/fetch is allowed under the bounded-searcher rules.
Read only the assigned exact local files/paths.
Do not modify files.

Repository root: <repo-root>
Production file/group under review: <exact paths>
Assigned local paths: <production file/group and directly relevant dependency paths the reviewer may read>
If required dependencies are missing from Assigned local paths, stop and ask the orchestrator to expand it; do not inspect unassigned paths.
Source roots: <source roots>
Excluded paths: <tests/generated/vendor/build paths unless explicitly in scope>

Tasks:
1. Inspect the entire assigned production file/module or cohesive file group.
2. Inspect imported modules and directly exercised dependencies needed to understand production behavior. Do not perform an unbounded whole-program review.
3. Trace relevant instance/object/data-flow paths: input or caller -> public API or internal entry point -> constructors/factories/providers/caches/global state -> collaborator calls -> returned value, side effect, error, resource, or concurrency behavior.
4. Determine whether each important path follows the real production path or bypasses important collaborators.
5. Inspect public API, internal helpers, error handling, resource/concurrency behavior, type boundaries, security/trust boundaries, and architecture/import boundaries.
6. Identify missing tests only when they are evidence for a concrete production-code risk. Do not produce wishlist coverage findings.
7. Return findings with severity HIGH/MEDIUM/LOW/INFO and disposition actionable/defer/do_not_fix. Mark optional or nice-to-have items as defer.
8. Recommend a minimal production-code fix only for actionable findings.

Constraints:
- Use the correct repository root. Use exact absolute paths when launching tools and exact repo-relative paths in findings/reports unless absolute paths are required.
- This is primarily a closed-book local review: no personal web search, URL fetching, or external documentation inspection.
- If external research is explicitly needed, request or launch a searcher with a narrow question and follow the bounded-searcher rules.
- Read only the assigned exact local files/paths.
- If required dependencies are missing from Assigned local paths, stop and ask the orchestrator to expand it; do not inspect unassigned paths.
- Do not modify files.
- Be specific enough that a coder can act without redoing the audit.
- Do not recommend freezing undefined behavior unless the finding explicitly requires an intentional behavior decision.

Output format:
- Production file/group reviewed
- Imported modules and directly exercised dependencies inspected
- Instance/data-flow paths inspected
- Constructors/factories/providers/caches/global state identified
- Production path coverage/bypasses
- Mocks/fakes/stubs if relevant
- Findings, each with:
  - id using `<file-stem>-<severity>-<number>`
  - severity
  - disposition
  - evidence with exact paths/symbols
  - risk
  - recommended fix for actionable findings
- Overall recommendation: remediate now / defer / no action
```

## Bounded searcher use

Reviewer and final-audit agents may request or launch a searcher only for explicitly scoped external research. Searcher agents may use web search and web fetch for that scope, but must:

- answer a narrow, explicit research question,
- prefer official documentation or source when possible,
- avoid open-ended browsing,
- default to at most 5 sources, 8 total search/fetch attempts, and 1 retry per stalled source,
- use at most 12 sources and 15 total attempts only for explicitly research-heavy tasks,
- skip stalled fetches instead of waiting indefinitely,
- stop and return partial findings plus uncertainty if search/fetch stalls, repeats, or is inconclusive,
- never inspect local project files.

Reviewers and final auditors remain read-only for local project files. Coder remediation remains separate.

## Coder responsibilities

Coders implement only assigned `HIGH` or `MEDIUM` findings with disposition `actionable`. They must keep changes concise and targeted.

Coder constraints:

- Use the correct repository root and exact paths from the planner prompt. Use exact absolute paths when launching tools and exact repo-relative paths in reports unless absolute paths are required.
- Implement only assigned findings; do not expand into optional, deferred, low/info, or `do_not_fix` items.
- If the assigned finding requires broader behavior or architecture changes than described, stop and report blocked instead of expanding scope.
- Keep code concise. Avoid over-defensive branches, broad validation, speculative abstractions, or unrelated architecture changes.
- Do not introduce new inheritance.
- Use built-in generic types such as `list[...]` and `dict[...]`.
- Use `collections.abc` for callable, iterable, mapping, sequence, and set abstractions instead of deprecated `typing.List`-style imports.
- Legacy functions, classes, or modules may be deleted when deletion simplifies the code and behavior is preserved or intentionally changed by the assigned finding.
- Do not freeze or change undefined behavior unless the assigned finding explicitly requires it.
- Preserve architecture/import boundaries unless the assigned finding is specifically about that boundary.
- Run targeted tests/checks for touched behavior using repository-specific wrappers and commands.
- Report exact files changed, commands run, and pass/fail summaries.

## Coder prompt template

```text
You are remediating assigned production-code review findings.

Repository root: <repo-root>
Assigned findings:
<paste only high/medium actionable findings with id, severity, disposition, evidence, risk, recommended fix>

Relevant files and paths:
<exact production paths and directly relevant tests/checks if known>

Project-specific verification commands:
<commands from repository docs, e.g. lint/type/test wrappers>

Tasks:
1. Make the smallest production-code changes that resolve only the assigned actionable findings.
2. Keep code concise and avoid over-defensive or speculative changes.
3. Do not implement deferred, do_not_fix, low/info, optional, or unrelated findings.
4. Do not introduce new inheritance.
5. Use built-in generics and collections.abc style types.
6. Delete legacy functions/classes/modules only if doing so simplifies the code and preserves behavior or intentionally changes behavior required by the assigned finding.
7. Do not freeze or change undefined behavior unless explicitly assigned.
8. Run targeted tests/checks for the changed behavior with repository-specific commands.
9. If the assigned finding requires broader behavior or architecture changes than described, stop and report blocked instead of expanding scope.

Path constraints:
- Use the correct repository root above.
- Use exact absolute paths when launching tools.
- Use exact repo-relative paths in reports unless absolute paths are required.

Report:
- Findings addressed
- Files changed
- Implementation summary
- Behavior changed/preserved
- Commands run, with exit status for each command
- Test/type/lint results, with exact pass/fail result for each command
- Relevant failure output if any command failed
- Remaining risk or intentionally deferred item
```

## Ledger and dispatch tracking

Maintain a live findings ledger. Merge duplicates before dispatching coders. Keep enough detail that final audit can verify every disposition.

Ledger fields:

- finding id
- source reviewer
- production file/group
- severity
- disposition
- evidence paths/symbols
- risk
- recommended fix
- duplicate-of, if merged
- owner
- status: `new`, `assigned`, `coding`, `fixed`, `verified`, `deferred`, `do_not_fix`, `blocked`
- files changed
- verification commands/results
- final audit result
- deferred/skipped reason when not fixed

Dispatch rules:

- Use adaptive routing: add agents only when a specific uncertainty, risk, or verification burden remains. Default to one final reviewer pass; add cracker for adversarial failure/test design only when risk warrants it.
- Default coder candidates are only `HIGH` or `MEDIUM` with disposition `actionable`.
- Assign related findings in the same production path to one coder, or serialize them.
- Do not run overlapping coders on the same file or shared collaborator until prior edits are understood.
- Record every deferred or skipped finding with rationale.

## Recovery from stalled or stopped agents

Detect stalled, aborted, or incomplete agents by missing report, timeout, tool error, incomplete output, partial edits, or output that does not follow the required report format.

If a reviewer stalls or returns incomplete output:

1. Identify the exact file/group whose review is incomplete.
2. Relaunch only that reviewer task with the same exact paths and any missing context.
3. Do not rerun the full reviewer batch unless scope changed.
4. If the same failure pattern repeats twice, stop retrying that route. Report the repeated pattern, current evidence, and blocked scope, then revise the plan or route to a different agent type with narrower context.

If a coder stalls, errors, or stops after edits:

1. Run `git status --short`, `git diff --`, and `git diff --staged --` and inspect staged/unstaged diffs and touched files before launching another coder.
2. Determine whether partial edits are correct, incomplete, or unrelated.
3. Do not launch overlapping coders until partial edits are understood.
4. Relaunch only the stopped coder task with the exact assigned finding ids, current file state context, and correct paths.
5. Ask the replacement coder to continue from the current state, not from stale assumptions.
6. Run targeted tests/checks after recovery.
7. Record the recovery action in the ledger and final report.
8. If the same failure pattern repeats twice, stop retrying that route. Report the repeated pattern, current evidence, and blocked scope, then revise the plan or route to a different agent type with narrower context.

If an agent uses a wrong or duplicated repository path:

1. Stop that task immediately.
2. Verify the real repository root from project documentation, the current workspace, or an explicit user-provided path.
3. Discard assumptions, findings, edits, and path-based conclusions made from the wrong path unless independently revalidated in the real repository.
4. Run `git status --short`, `git diff --`, and `git diff --staged --` in the real repository root to understand any actual changes before relaunching work.
5. Relaunch only that task with the corrected repository root and exact absolute or repo-relative paths.

## Final verification and audit

After all assigned remediation is complete:

1. Run repository-specific verification commands documented by the project. Examples may include lint, format check, typecheck, unit tests, integration tests, or package-specific checks. Use exact project wrappers such as `pixi run`, `pnpm`, `uv`, `tox`, `nox`, `cargo`, or `npm` when documented.
2. Run the smallest relevant targeted checks first if not already run, then broader verification appropriate to the scope.
3. Ask one reviewer agent for a final read-only audit of changed production files and the unresolved findings ledger.

Final reviewer audit prompt:

```text
You are performing a final read-only audit of production-code remediation.

This is primarily a closed-book local review.
Do not personally use web search, fetch URLs, or inspect external documentation.
You may request or launch a searcher only for explicitly scoped external research; searcher web search/fetch is allowed under the bounded-searcher rules.
Read only the assigned exact local files/paths.
Do not modify files.

Repository root: <repo-root>
Changed production files: <exact paths>
Assigned local paths: <changed production files and directly relevant dependency paths the reviewer may read>
If required dependencies are missing from Assigned local paths, stop and ask the orchestrator to expand it; do not inspect unassigned paths.
Unresolved findings ledger: <ledger entries>
Verification commands/results: <commands and summaries>

Tasks:
1. Inspect changed production code and directly relevant dependencies.
2. Verify assigned high/medium actionable findings were fixed or explicitly deferred with rationale.
3. Verify coders did not implement deferred, do_not_fix, optional, or unrelated findings without approval.
4. Verify no new over-defensive code, speculative abstractions, unrelated architecture changes, or new inheritance were introduced.
5. Verify important instance/data-flow paths, production collaborators, constructors/factories/providers/caches/global state, resource/concurrency behavior, type boundaries, security/trust boundaries, and architecture/import boundaries remain sound.
6. Report accept/reject with exact blocking issues if rejected.

Output:
- Audit scope
- Findings verified fixed
- Findings correctly deferred/skipped
- New issues introduced, if any
- Verification confidence and gaps
- Final decision: accept / reject
```

## Stop criteria

Stop only when all are true:

- No `HIGH` or `MEDIUM` `actionable` findings remain, or remaining items are explicitly documented as deferred with rationale.
- Final repository-specific verification commands pass, or unrelated/blocking failures are documented with evidence.
- Final reviewer audit accepts the changed work and unresolved findings ledger.
- All recovery actions, if any, are recorded.

## Final report expectations

The final response should include:

- production files/groups reviewed,
- number of reviewer reports completed,
- high/medium actionable findings fixed,
- deferred, do_not_fix, low, or info findings summarized,
- files changed,
- verification commands and results,
- final reviewer audit result and scope,
- unresolved findings ledger entries with key fields,
- current git status summary,
- explicit note that changes are uncommitted,
- recovery actions taken, if any,
- assumptions and remaining risks.
