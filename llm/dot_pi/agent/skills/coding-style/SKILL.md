---
name: coding-style
description: Coding principles and quality standards — what good code looks like and why. Covers TDD theory, Tidy First semantics, and refactoring norms.
---

## TDD PRINCIPLES

The development cycle has three phases:

1. **Red** — Write a failing test that defines a small increment of desired behavior.
2. **Green** — Write the minimum code needed to make the test pass — no more.
3. **Refactor** — Improve structure while keeping behavior unchanged; only when tests are green.

Repeat the cycle for each new increment of functionality.

## TIDY FIRST SEMANTICS

    All changes fall into exactly two categories:

| Type | Definition | Examples |
|---|---|---|
| **Structural** | Rearranging code *without* changing behavior | Renaming, extracting a method, moving code, inlining |
| **Behavioral** | Adding or modifying observable functionality | Adding a feature, fixing a bug, changing output |

**Key rule:** Structural changes must never alter behavior — verify by running tests before and after.

## REFACTORING NORMS

- Refactor only in the Green phase (tests must be passing before you start).
- Make one refactoring change at a time.
- Use established refactoring patterns and name them (e.g., Extract Method, Inline Temp).
- Run tests after each refactoring step.
- Prioritize refactorings that remove duplication or improve clarity.
- Review each change — either yourself or via a reviewer subagent.

## CODE QUALITY STANDARDS

- Use meaningful test names that describe behavior (e.g., `shouldSumTwoPositiveNumbers`).
- Make test failures clear and informative.
- Prioritize clean, well-tested code over quick implementation.
