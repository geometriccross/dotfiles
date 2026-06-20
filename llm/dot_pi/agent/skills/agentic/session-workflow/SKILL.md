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
   - **Large coding** (multi-file feature, new module) → split into small vertical slices; use `pi-crew` (`crew_spawn`) for each checkpoint/slice, then parent-inspect the diff and run required checks before delegating the next slice. Use TDD when applicable; delegate to `coder`/`worker` only when its tools and constraints support the required edits.
   - **Code review / local investigation** → use `pi-crew` (`crew_spawn` with `reviewer`, `code-reviewer`, or `quality-reviewer`) when an independent opinion is needed.
   - **Security / adversarial analysis** → use `pi-crew` (`crew_spawn` with `cracker` or `oracle`).
   - **Standalone external docs/API/web research** → use `pi-crew` (`crew_spawn` with `searcher` or `scout`); do not use them for local codebase inspection.
3. Execute and iterate in small checkpoints. When sub-agents are used, each checkpoint should be a separate spawn rather than a one-shot bundle. Commit only when explicitly requested or authorized.

# Rules

- You MUST read `stop-ai-slop-jp` before starting the session.
- Do your own sanity check first; use `pi-crew` when independent review, security analysis, or external research is requested or materially valuable.
- Before spawning, call `crew_list` to discover available agents. Override bundled agents with your custom definitions in `~/.pi/agent/agents/` when appropriate.
- Follow `pi-crew` danger rules before delegation: production data deletion, schema migration, or irreversible architecture change → ask human first.
- Every `crew_spawn` needs a concise `brief` (label) and a self-contained `task`. Do not restate role boilerplate or mechanical repo/Git state.
- Subagents run asynchronously. Wait for results as steering messages; do not poll with `crew_list`.
- Keep coding delegation small: delegate one implementation checkpoint/slice at a time. After each coder/worker delegation, parent must inspect `git status`/diff and run required non-test checks, builds, or lint before delegating the next checkpoint.
- Use `crew_abort` only when an active subagent becomes obsolete, wrong, or cancelled.
- Keep changes scoped; avoid broad rewrites unless explicitly requested.
- Run targeted tests/checks first, then broader tests when the risk justifies it.
- Commit only related changes with conventional commit messages after explicit request/authorization; never include unrelated user edits.
- Use the handoff skill to preserve decisions, constraints, and failures across long or interrupted sessions.
