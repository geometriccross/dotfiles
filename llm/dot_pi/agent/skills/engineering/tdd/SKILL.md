---
name: tdd
description: Use when the user explicitly asks for test-first development, TDD, or a red-green-refactor workflow. Do not apply it merely because a task includes integration tests.
---

# Test-Driven Development

TDD is the red → green → refactor loop. This skill keeps each cycle focused on one useful behavioral slice, with tests that protect public observable outcomes and provide meaningful regression detection. Avoid redundant, tautological, or implementation-coupled coverage. This skill applies when the user asks for test-first work; it does not require TDD for integration-test work that is unrelated to test-first development.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests should remain valid when the behavior does not change. A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists — and survives refactors because it doesn't care about internal structure. Prefer coverage that would catch a meaningful regression, and avoid duplicating tests without a distinct behavior or failure signal.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Choose a public seam deliberately.** Test through the narrowest public interface that demonstrates the behavior; do not reach into internals. You do not need user approval for every seam. If behavior and scope are clear, choose the seam and proceed. Ask only when a material ambiguity remains, such as conflicting public contracts or uncertainty about which behavior the request intends to preserve.

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological** — the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec.
- **Mock-tautological** — a test asserts only that a mock returned its configured value or that an internal call occurred, without checking an externally meaningful result. Mock boundaries only when needed and assert the resulting public behavior.
- **Redundant** — several tests exercise the same contract and would fail for the same reason, adding no new boundary, outcome, or regression signal. Keep the smallest set that meaningfully protects behavior.
- **Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead — one useful behavioral slice at a time, with each cycle informed by what the last one taught you.

## Red-Green-Refactor loop

- **Red before green.** Write a focused failing test for the intended behavior first, then only enough code to pass it. Don't anticipate future behavior or add speculative features.
- **One useful slice at a time.** Complete one vertical behavioral slice before starting the next. A slice may need closely related assertions to express one outcome, but do not add redundant cases.
- **Refactor after green.** Once the behavior is green, improve the implementation or test design when useful. Preserve public observable outcomes unless the requested change intentionally changes them, keep cleanup separate from new behavior, and rerun the relevant tests.
- **Ask only when needed.** Proceed when expected behavior and scope are clear; ask the user only about material ambiguity.
