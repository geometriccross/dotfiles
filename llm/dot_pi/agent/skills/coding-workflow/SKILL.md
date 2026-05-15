---
name: coding-workflow
description: Step-by-step TDD workflow for implementing features.
---

## TDD Workflow

1. Use a searcher subagent **only** for external dependency/API docs and non-local sources.
   It must not inspect or summarize the local codebase — do that yourself.
2. Write a simple failing test for a small part of the feature. **(Red)**
3. Implement the bare minimum to make it pass. **(Green)**
4. Run tests to confirm they pass.
5. Make any necessary structural changes (Tidy First), running tests after each.
6. Commit structural changes separately.
7. Add another test for the next small increment of functionality.
8. Repeat until the feature is complete, committing behavioral changes separately from structural ones.

## Rules

- Always write one test at a time, make it run, then improve structure.
- Always run all the tests (except long-running tests) each time.
- Prioritize clean, well-tested code over quick implementation.
