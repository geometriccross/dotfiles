---
name: session-workflow
description: A standard workflow for a session. You MUST read this when you start session.
---

1. Use `context-manage` skill to load cached context from `.context/`
2. Receive user instruction and assess scope:
   - **Small** (single file, quick fix, config change) → execute directly with read/edit/bash
   - **Needs third opinion** (code review, security audit, investigation) → delegate via `subagent-delegating` skill to reviewer/cracker/searcher
   - **Large coding** (multi-file feature, new module) → delegate to coder via `subagent-delegating`
3. Execute, iterate, commit at logical checkpoints

# Rules

- For third-party tasks (reviewing, vulnerability detection, investigation), use `subagent-delegating` — never self-review
- Do not get bogged down in detailed design; your role is direction
- Commit at logical checkpoints with conventional commit messages
- Use `context-manage` to save decisions, constraints, and failures as they arise
