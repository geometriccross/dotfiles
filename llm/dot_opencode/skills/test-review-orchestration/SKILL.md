---
name: test-review-orchestration
description: Orchestrate reviewer-per-test-file audits, remediation dispatch, stalled-agent recovery, verification, and final audit.
license: MIT
compatibility: opencode
---

# Test Review Orchestration Skill

Use this skill to audit a test suite file-by-file, identify weak or missing black-box coverage, dispatch concise remediation, and verify the repository before reporting completion.

## When to use

Use this when asked to review tests broadly, strengthen coverage, find over-mocked tests, or coordinate multiple reviewer/coder agents across many test files.

Do not use this for a single isolated bug unless the requested work is explicitly a suite-wide test audit.

## Core workflow

1. Confirm the repository root and all relevant paths before dispatching agents. Use exact absolute or repo-relative paths in every prompt, including the test file and any implementation paths reviewers may read.
2. Enumerate all test files in scope. By default, include `test_*.py` files under `tests/`; exclude generated and vendor files unless the user explicitly asks to include them.
3. Maintain a todo list with one item per test file plus remediation and final verification items.
4. Use the smallest useful agent set. Do not invoke every available agent by default; add reviewers, coders, searchers, cracker, or extra audit passes only when they reduce concrete uncertainty, risk, or verification cost.
5. Dispatch one reviewer agent per test file only for files in scope. Use a code-aware reviewer agent if available; if only a generic code-aware agent exists, it may be used in closed-book, read-only mode. Reviewer/static-audit prompts must keep local review read-only and limited to assigned exact paths. Reviewers may request or launch a searcher only for explicitly scoped external research; when used, the searcher may use web search/fetch under the bounded-searcher rules below. Prefer parallel batches, but start with 3–5 reviewer agents per batch unless the user asks for full parallelism or context/tooling allows more.
6. As reviewer reports arrive, merge and filter findings immediately. Dispatch coder agents continuously for independent high/medium `actionable` findings instead of waiting for every reviewer. Do not assign `defer` or `do_not_fix` findings unless the user approves.
7. Batch independent coder tasks in parallel when they touch separate files or clearly separate behavior. Serialize tasks that may touch the same implementation or test files.
8. Require every subagent dispatch to include goal, assigned scope, role-relevant context only, acceptance criteria, stop condition, and expected output. Do not pass full conversation history by default; pass only relevant summaries, constraints, evidence, paths, commands, and research findings needed for that role.
9. Require coders to run targeted tests for their changes and report files, commands, and exact pass/fail output summaries.
10. After all remediation is complete, run final verification using repository-specific commands when documented, such as Pixi wrappers, instead of generic bare commands. For example:
   - `pixi run -e dev ruff check .`
   - `pixi run -e dev pyright`
   - `pixi run -e dev pytest`
11. Ask one reviewer agent for a final audit of all changed work and the unresolved findings ledger, unless the user explicitly asks for per-file final audits. Add cracker or extra review only for high-risk, security-sensitive, regression-prone, or ambiguous cases. Avoid non-improving review loops.
12. Do not commit from this skill workflow. Leave all changes uncommitted and report them. If the user explicitly asks for commits, treat that as a separate follow-up task outside this workflow.

## Reviewer responsibilities

Each reviewer owns exactly one test file. The reviewer must inspect both the test file and imported implementation modules relevant to the tested behavior. The reviewer must also trace bounded instance/data-flow paths used by the tests: follow fixtures, fakes, mocks, constructed instances, and data objects far enough to understand the behavior under test and major production-behavior bypasses, not as an unbounded whole-program trace.

Use a code-aware reviewer agent when available. If a dedicated reviewer agent is unavailable, a generic code-aware agent may be used in primarily closed-book, read-only mode. Every reviewer prompt, including final audit prompts, must include the local read-only and bounded-searcher constraints in the prompt template below.

The reviewer must report:

- every test case inspected,
- implementation modules inspected,
- whether black-box tests exist for the behavior under test,
- exact file paths and test names when black-box coverage exists elsewhere,
- all mocks, monkeypatches, stubs, and fakes used,
- instance/data-flow paths inspected, including where test-created objects enter implementation functions/classes, which implementation methods/properties are exercised, whether the path is a real production instance path or only a fake/mock path, and any important production behavior bypassed,
- missing test cases and weak coverage,
- findings tagged with severity and disposition,
- suggested minimal remediation for each `actionable` finding.

Finding ids should use the convention `<test-file-stem>-<severity>-<number>`, for example `test_hover-medium-001`. Use lowercase severity in ids and number findings sequentially per test file and severity.

Severity guidance:

- `HIGH`: behavior can be broken while tests still pass, important user-facing path untested, or tests assert implementation details instead of observable behavior.
- `MEDIUM`: meaningful edge case or integration path missing, excessive mocking weakens confidence, or duplicate tests hide a coverage gap.
- `LOW`: clarity, naming, minor fixture simplification, or non-blocking coverage improvement.
- `INFO`: observations with no requested action.

Disposition guidance:

- `actionable`: small, concrete, behavior-relevant, and safe to fix now.
- `defer`: useful but broad, speculative, optional, nice-to-have, or requires a design/product decision.
- `do_not_fix`: would freeze unspecified behavior, require over-defensive tests, or contradict project constraints.

Severity alone is not enough for assignment. By default, only `HIGH` or `MEDIUM` findings with `actionable` disposition are candidates for coder dispatch. Do not demand tests for undefined behavior unless the finding is to intentionally document current behavior and the planner agrees.

## Reviewer prompt template

```text
You are reviewing exactly one test file for black-box coverage quality.

This is primarily a closed-book local review.
Do not personally use web search, fetch URLs, or inspect external documentation.
You may request or launch a searcher only for explicitly scoped external research; searcher web search/fetch is allowed under the bounded-searcher rules.
Read only the assigned exact local files/paths.
Do not modify files.

Repository root: <repo-root>
Test file: <test-file-path>
Assigned local paths: <test file and implementation paths the reviewer may read>
If required dependencies are missing from Assigned local paths, stop and ask the orchestrator to expand it; do not inspect unassigned paths.

Tasks:
1. Inspect the entire test file and every test case in it.
2. Inspect imported implementation modules that define the behavior under test.
3. Trace bounded instance/data-flow paths relevant to this test file: identify fixtures, fakes, mocks, constructed instances, and data objects; trace where they flow into implementation functions/classes; inspect the implementation methods/properties actually exercised; determine whether the test covers the real production instance path or only a fake/mock path; report gaps where a fake path bypasses important production behavior. Stop once behavior under test and major bypasses are understood; do not perform an unbounded whole-program trace.
4. Determine whether each tested behavior has black-box coverage. If coverage exists elsewhere, report exact file paths and test names.
5. List every mock, monkeypatch, fake, stub, or patched dependency and explain whether it is necessary or weakens coverage.
6. Identify missing cases, weak assertions, implementation-detail assertions, and over-mocked paths.
7. Return findings using both severity HIGH/MEDIUM/LOW/INFO and disposition actionable/defer/do_not_fix. Mark nice-to-have or optional findings as defer.
8. Do not demand tests for undefined behavior unless documenting current behavior is intentional and requires planner agreement.

Constraints:
- Use correct repository paths.
- This is primarily a closed-book local review: no personal web search, URL fetching, or external documentation inspection.
- If external research is explicitly needed, request or launch a searcher with a narrow question and follow the bounded-searcher rules.
- Read only the assigned exact local files/paths.
- If required dependencies are missing from Assigned local paths, stop and ask the orchestrator to expand it; do not inspect unassigned paths.
- Do not modify files.
- Be specific enough that a coder can act without redoing the audit.

Output format:
- Test file reviewed
- Implementation modules inspected
- Test cases inspected
- Instance/data-flow paths inspected: test object/data -> implementation entry point -> exercised methods/properties -> real production path or fake/mock path -> bypassed production behavior, if any
- Black-box coverage found here
- Black-box coverage found elsewhere, with exact files/tests
- Mocks/monkeypatches/fakes/stubs
- Findings, each with id, severity, disposition, evidence, and minimal recommended action for actionable items
- Finding ids using `<test-file-stem>-<severity>-<number>`, e.g. `test_hover-medium-001`
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

Coders implement minimal remediation for assigned `actionable` findings. They must keep changes concise and targeted.

Targeted tests are the smallest relevant pytest node or module plus directly affected lint/type checks. Prefer a specific test node such as `pytest tests/path/test_file.py::test_name`, then the containing module if the change affects multiple tests. Run directly affected lint/type checks when available, using repository-specific wrappers. Report the exact command and a short pass/fail output summary for each command.

Coder constraints:

- Use correct repository paths from the planner prompt.
- Prefer simple black-box tests that exercise observable behavior.
- Reduce fake/mock bypass where feasible by preferring tests that exercise the real production construction, injection, collaborator, and data-flow path when practical.
- Do not overcorrect by removing useful mocks for true external boundaries such as network, filesystem, subprocess, time, or heavyweight third-party services; focus on bypasses that hide implementation behavior.
- If a fake or mock remains necessary, explain why and identify the production behavior that remains untested.
- Keep code concise; do not add over-defensive branches, broad validation, or speculative abstractions.
- Implement only assigned actionable findings; do not expand into optional/deferred findings or freeze undefined behavior.
- Do not broaden scope or implement unrelated architecture changes.
- Do not introduce new inheritance.
- Use built-in generics such as `list[...]` and `dict[...]`.
- Use `collections.abc` for callable/iterable/mapping abstractions instead of deprecated `typing.List`-style imports.
- Legacy paths may be deleted when that is simpler and consistent with the requested behavior.
- Keep structural cleanup separate from behavioral changes when possible.
- Run targeted tests for touched areas.

## Coder prompt template

```text
You are remediating specific actionable test review findings.

Repository root: <repo-root>
Assigned findings:
<paste high/medium actionable findings with severity and disposition>

Relevant files:
<test and implementation paths>

Tasks:
1. Make the smallest changes that resolve only the assigned actionable findings.
2. Prefer black-box tests of observable behavior over mocks or implementation-detail assertions.
3. Reduce fake/mock bypass where feasible. Prefer tests that exercise the real production construction, injection, collaborator, and data-flow path when practical.
4. Do not overcorrect by removing useful mocks for true external boundaries such as network, filesystem, subprocess, time, or heavyweight third-party services; focus on avoiding bypasses that hide implementation behavior.
5. If a fake or mock remains necessary, explain why and what production behavior remains untested.
6. Keep code concise and avoid over-defensive additions.
7. Do not expand into optional/deferred findings, `do_not_fix` findings, or tests that freeze undefined behavior.
8. Do not introduce new inheritance.
9. Use `list[...]`/`dict[...]` and `collections.abc` style types, not deprecated `typing.List` style.
10. Run targeted tests for the changed files or behavior: the smallest relevant pytest node/module plus directly affected lint/type checks, using repository-specific verification commands when documented.

Report:
- Findings addressed
- Files changed
- Commands run
- Test/type/lint results
- Exact pass/fail output summaries for targeted tests and checks
- Any remaining risk or intentionally deferred item
```

## Batching and tracking

- Use parallel tool calls where possible for independent reviewer or coder dispatch.
- Avoid overwhelming context: prefer batches sized by report complexity, not just file count. Start with 3–5 reviewer agents per batch unless the user asks for full parallelism or context/tooling allows more.
- Use adaptive routing: add agents only when a specific uncertainty, risk, or verification burden remains. Default to one final reviewer pass; add cracker for adversarial failure/test design only when risk warrants it.
- Keep a live todo list with states such as `pending review`, `reviewing`, `needs remediation`, `coding`, `needs verification`, `done`, and `blocked`.
- Merge duplicate findings before dispatching coders, then assign only high/medium `actionable` findings by default.
- Do not assign `defer` or `do_not_fix` findings unless the user approves; record skipped/deferred findings with rationale in the unresolved-findings ledger.
- If two findings touch the same implementation path, assign them to one coder or serialize them.
- Maintain an unresolved-findings ledger for every finding not fully fixed. Track finding id, file, severity, disposition, owner, status, fix summary, files changed, and deferred/skipped reason when not fixed. Do not track commit hashes. This workflow leaves changes uncommitted; if the user explicitly asks for commits, handle that as a separate follow-up task outside this workflow.

## Final verification and audit

Final reviewer audit prompt:

```text
You are performing a final read-only audit of test-review remediation.

This is primarily a closed-book local review.
Do not personally use web search, fetch URLs, or inspect external documentation.
You may request or launch a searcher only for explicitly scoped external research; searcher web search/fetch is allowed under the bounded-searcher rules.
Read only the assigned exact local files/paths.
Do not modify files.

Repository root: <repo-root>
Changed files: <exact paths>
Assigned local paths: <changed test files, implementation files, and ledger/check result paths the reviewer may read>
If required dependencies are missing from Assigned local paths, stop and ask the orchestrator to expand it; do not inspect unassigned paths.
Unresolved findings ledger: <ledger entries>
Verification commands/results: <commands and summaries>

Tasks:
1. Inspect changed tests, implementation files, and directly relevant assigned dependencies.
2. Verify assigned high/medium actionable findings were fixed or explicitly deferred with rationale.
3. Verify coders did not implement defer, do_not_fix, optional, or unrelated findings without approval.
4. Verify instance/data-flow findings were fixed or explicitly deferred with rationale.
5. Report accept/reject with exact blocking issues if rejected.

Output:
- Audit scope
- Findings verified fixed
- Findings correctly deferred/skipped
- New issues introduced, if any
- Verification confidence and gaps
- Final decision: accept / reject
```

## Recovery from stalled or stopped agents

Detect stalled, aborted, or incomplete agents by missing reports, timeouts, tool errors, incomplete output, or an agent that stopped after making edits.

If an agent stalls, stops, or returns an incomplete report:

1. Inspect the task status and determine exactly which test file or finding was incomplete.
2. Run `git status --short`, then inspect staged and unstaged diffs plus touched files before relaunching any coder.
3. Correct duplicated or wrong repository paths in prompts and reports before redispatch.
4. Do not rerun the full batch.
5. Relaunch only the stopped task with the exact repository path, exact file/finding context, and the previous context needed to continue.
6. Do not launch overlapping coders until partial edits are understood.
7. If a coder stopped after partial edits, ask the next coder to continue from the current state rather than restarting from stale assumptions.
8. After recovery, rerun targeted tests for the recovered changes, then run final full verification.
9. Record the recovery action in the todo list and final report.

If the same failure pattern repeats twice, stop retrying that route. Report the repeated pattern, current evidence, and blocked scope, then revise the plan or route to a different agent type with narrower context.

## Stop criteria

Stop only when all are true:

- No `HIGH` or `MEDIUM` `actionable` findings remain, or remaining items are explicitly documented as deferred with rationale.
- Final repository-specific lint command passes, for example `pixi run -e dev ruff check .`.
- Final repository-specific typecheck command passes, for example `pixi run -e dev pyright`.
- Final repository-specific test command passes, for example `pixi run -e dev pytest`.
- Final single reviewer audit accepts all changed work and the unresolved findings ledger, including verification that instance/data-flow findings were fixed or explicitly deferred with rationale and no `defer`/`do_not_fix` findings were implemented without approval, unless the user asked for per-file audits.

## Final report expectations

The final response should include:

- test files reviewed,
- number of reviewer reports completed,
- high/medium actionable findings fixed,
- low/info findings deferred or noted,
- files changed,
- final verification commands and results,
- final reviewer audit result and scope,
- unresolved-findings ledger entries with finding id, file, severity, disposition, owner, status, fix summary, files changed, and deferred/skipped reason when not fixed,
- current git status summary,
- an explicit note that changes are uncommitted,
- recovery actions taken, if any,
- assumptions and remaining risks.
