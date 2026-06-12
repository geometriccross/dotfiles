---
name: session-workflow
description: A standard workflow for a session. You MUST read this when you start session.
---

1. Load local context first:
   - Read project instructions such as `AGENTS.md` and relevant prompt files.
   - Read handoff files when the user provides one or the task continues prior work.
   - Check `git status` / current diff before editing or committing.
   - Inspect relevant code and tests directly before planning implementation.
2. Receive user instruction and assess scope:
   - **Small** (single file, quick fix, config change) → execute directly with read/edit/write/bash, then run targeted checks.
   - **Unclear design** → ask/grill until the decision is explicit before editing.
   - **Large coding** (multi-file feature, new module) → split into small vertical slices; use TDD when applicable; delegate to coder only when its tools and constraints support the required edits.
   - **Code review / local investigation** → use reviewer via `subagents` when an independent opinion is needed.
   - **Security / adversarial analysis** → use cracker via `subagents`.
   - **External docs/API/web research** → use searcher via `subagents`; do not use searcher for local codebase inspection.
3. Execute, iterate, and commit at logical checkpoints only after verifying the working tree and avoiding unrelated changes.

# Rules

- For independent review, security analysis, or external research, use `subagents` — never self-review when third-party judgement is the task.
- Follow `subagents` danger rules before delegation.
- Prefer local files/git/config for local facts; use web search only for external documentation, APIs, packages, or current public facts.
- Keep changes scoped; avoid broad rewrites unless explicitly requested.
- Run targeted tests/checks first, then broader tests when the risk justifies it.
- Commit only related changes with conventional commit messages; never include unrelated user edits.
- Use the handoff skill to preserve decisions, constraints, and failures across long or interrupted sessions.
