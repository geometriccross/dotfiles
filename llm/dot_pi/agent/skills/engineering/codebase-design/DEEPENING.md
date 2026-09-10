# Deepening

How to deepen a cluster of shallow modules safely, given its dependencies. Assumes the vocabulary in [SKILL.md](SKILL.md) — **module**, **interface**, **seam**, **adapter**.

## Dependency categories

Use these categories when dependency placement affects the design or its tests. They suggest options, not mandatory architecture.

### 1. In-process

Pure computation, in-memory state, no I/O. Behavior can usually be tested directly without an adapter. Merge modules only when that reduces caller knowledge or scattered responsibility.

### 2. Local-substitutable

Dependencies with local test stand-ins (PGLite for Postgres, in-memory filesystem) can often stay internal. Use a stand-in when it reproduces the relevant behavior; retain real-integration checks for differences that matter.

### 3. Remote but owned (Ports & Adapters)

Your own services across a network boundary may benefit from an injected port that keeps transport details out of business logic. An in-memory adapter can test the logic; transport and contract tests cover what it cannot.

### 4. True external (Mock)

For third-party services (Stripe, Twilio, etc.), isolate the dependency where useful. A mock or fake can exercise local decisions and failures; it does not verify the real service contract.

## Seam discipline

- Justify a seam with a concrete boundary or variation need, not an adapter quota. A second adapter is useful evidence, not a prerequisite.
- **Internal seams vs external seams.** A deep module can have internal seams (private to its implementation, used by its own tests) as well as the external seam at its interface. Don't expose internal seams through the interface just because tests use them.

## Testing strategy

Prefer observable behavior at the relevant interface. Remove obsolete or redundant tests after checking that important coverage is preserved; internal tests can still protect useful behavior. A test changing during a refactor is a reason to inspect its contract, not automatic evidence that it should be deleted.
