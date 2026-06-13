# Available Agents

Use this file when selecting which sub-agent to delegate to.

Skill-dependent tasks require an agent with `read` so it can load full `SKILL.md` instructions. Do not assign skill-dependent tasks to agents without `read`.

## coder

Use for scoped implementation work:
- write code
- implement features
- fix bugs
- write or update tests

Do not use for independent review of its own output.
Keep tasks small: `delegate.sh` may automatically fallback after partial edits, so the parent must inspect `git status`/diff and run non-test checks after coder returns.

### Coder + TDD

Use this when implementation requires TDD because the user, parent task, or repository workflow asks for it.

Parent agent responsibility:
- frame the goal
- define observable acceptance criteria
- describe constraints
- request evidence needed for evaluation
- avoid prescribing implementation details unless necessary

Coder responsibility:
- use the `tdd` skill when required
- own the implementation workflow
- design and run tests
- implement the change
- report evidence for evaluation

Evidence to request:
- failing test command/result before implementation when doing TDD
- passing test command/result after implementation
- added or changed tests
- changed files
- residual risks and parent-side checks needed

## reviewer

Use for independent local/static review:
- review code changes, plans, and architecture
- check correctness, maintainability, tests, and edge cases
- identify risks before implementation or merge

Do not use for implementation.
Do not use for external documentation or web research.

## cracker

Use for adversarial/security-focused analysis:
- vulnerability detection
- exploitability assessment
- abuse-case and failure-mode review
- high-risk regression analysis
- security risks in code, configuration, or dependency usage

Do not use for general review unless the primary concern is security, adversarial behavior, or concrete failure modes.

## orchestration

Use for planning and coordination:
- break down large tasks
- propose execution order
- identify dependencies between work items
- assign work to parent/coder/reviewer/cracker/searcher

Do not use for direct implementation.
Do not use for external research.

## searcher

Use for standalone external information gathering only:
- inspect external dependency/API documentation
- research packages, standards, release notes, advisories, or web references
- return structured findings with sources

Do not use searcher to inspect, search, read, or summarize local codebase/project files; use the parent agent or reviewer for local investigation.
Do not use when the answer requires code changes rather than investigation.
