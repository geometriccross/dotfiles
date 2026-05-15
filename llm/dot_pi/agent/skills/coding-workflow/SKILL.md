---
name: coding-workflow
description: Step-by-step process for implementing a feature using TDD. Covers the order of operations, when to commit, and when to use subagents.
---

## TDD WORKFLOW

1. Use a searcher subagent **only** for external dependency/API docs and non-local sources.
   It must not inspect or summarize the local codebase — do that yourself.
2. Write a simple failing test for a small part of the feature. **(Red)**
3. Implement the bare minimum to make it pass. **(Green)**
4. Run tests to confirm they pass.
5. If structural improvements are needed, apply them now (**Tidy First**), running tests after each. See `coding-style` skill for the definition of structural vs. behavioral changes.
6. Add another test for the next small increment of functionality.
7. Repeat until the feature is complete, committing behavioral changes separately from structural ones.

## RULES

- Always write one test at a time, make it pass, then improve structure.
- Always run all the tests (except long-running tests) each time.
- Never mix structural and behavioral changes in the same commit.
