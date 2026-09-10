# Engineering

Locally maintained Pi skills. AGENTS.md owns shared execution policy; skills provide task-specific methods. See [UPSTREAM.md](UPSTREAM.md) before importing updates.

## Investigation, design, and verification

- [codebase-design](codebase-design/SKILL.md): evidence-backed architecture exploration, interface design, trade-offs, and migration. Small refactors do not require a full design process.
- [code-review](code-review/SKILL.md): requirements, actionable bugs, and regression risks in one prioritized findings list; preserves branch/WIP/staged/path scope.
- [diagnosing-bugs](diagnosing-bugs/SKILL.md): choose discriminating checks from available evidence; scale investigation to the bug rather than enforcing fixed phases or hypothesis counts.
- [tdd](tdd/SKILL.md): explicit test-first work using red–green–refactor and useful public-behavior tests.
- [research](research/SKILL.md): source-backed answers with uncertainty distinguished from verified facts; file output only when requested.
- [env-repair](env-repair/SKILL.md): diagnose dependency/runtime mismatches and restore reproducibly.
- [resolving-merge-conflicts](resolving-merge-conflicts/SKILL.md): resolve an in-progress merge or rebase without losing intended changes.
- [prototype](prototype/SKILL.md): throwaway executable or UI experiments for concrete design questions.
- [domain-modeling](domain-modeling/SKILL.md): clarify domain language and record relevant architectural decisions.
- [write-a-skill](write-a-skill/SKILL.md): author task-specific instructions and validate triggers and behavior against representative scenarios.

## Explicitly invoked workflows

These skills use `disable-model-invocation: true`. They are not prerequisites to ordinary coding work.

- [grill-with-docs](grill-with-docs/SKILL.md): stress-test a design through an interview and domain documentation.
- [zoom-out](zoom-out/SKILL.md): explain broader context.
- [triage](triage/SKILL.md): classify and investigate requested issues or external PRs.
- [to-spec](to-spec/SKILL.md): turn an agreed discussion into a requested specification.
- [to-tickets](to-tickets/SKILL.md): split requested work into dependency-aware tickets.
- [wayfinder](wayfinder/SKILL.md): organize a large, uncertain effort on a requested tracker.
- [setup-matt-pocock-skills](setup-matt-pocock-skills/SKILL.md): configure tracker/domain conventions only when setup is requested.
