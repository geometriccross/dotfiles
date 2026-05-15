---
name: coding-workflow
description: >-
    Step-by-step process for implementing a feature using TDD.
    Covers the order of operations
    `coding-style` skill is a pair skill of this
---

## TDD WORKFLOW

1. Write a simple failing test for a small part of the feature. **(Red)**
2. Implement the bare minimum to make it pass. **(Green)**
3. Run tests to confirm they pass.
4. If structural improvements are needed, apply them now (**Tidy First**), running tests after each.
5. Add another test for the next small increment of functionality.
6. Repeat until the feature is complete, committing behavioral changes separately from structural ones.

## RULES

- Always write one test at a time, make it pass, then improve structure.
- Always run all the tests (except long-running tests) each time.
- Never mix structural and behavioral changes in the same commit.
