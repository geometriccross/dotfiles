# Available Agents

Use this file when selecting which sub-agent to delegate to.

## coder

Use for implementation work:
- write code
- implement features
- fix bugs
- write or update tests

Do not use for independent review of its own output.

### Coder + TDD

Use this only when:
- delegating to coder
- implementation work is required
- the user or task explicitly requests TDD

This is **coder-only** and **not part of the common delegation format**.

Parent agent responsibility:
- frame the goal
- define observable acceptance criteria
- describe constraints
- request evidence needed for evaluation
- avoid prescribing implementation steps, code snippets, imports, private helper names, or detailed workflow

Coder responsibility:
- use the tdd skill
- own the implementation workflow
- design and run tests
- implement the change
- report evidence for evaluation

Additional evaluation evidence to request for TDD work:
- RED evidence: failing test command and result before implementation
- GREEN evidence: passing test command and result after implementation
- added or changed tests
- changed files
- residual risks

## reviewer

Use for critical review:
- review code changes
- review plans and architecture
- check correctness, maintainability, and edge cases
- identify risks before implementation or merge

Do not use for writing the implementation being reviewed.

## cracker

Use for security-focused analysis:
- vulnerability detection
- exploitability assessment
- attacker-perspective review
- security risks in code, configuration, or dependency usage

Do not use for general code review unless the primary concern is security.

## orchestration

Use for planning and coordination:
- break down large tasks
- propose execution order
- identify dependencies between work items
- create structured plans for multi-step work

Do not use for direct implementation.

## searcher

Use for information gathering:
- find facts in the codebase
- inspect documentation
- research web or external references
- return structured findings with sources

Do not use when the answer requires code changes rather than investigation.
