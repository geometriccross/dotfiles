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
   - **Large coding** (multi-file feature, new module) → act as a Herdr orchestrator: split into small vertical slices, create task/report files when useful, start Herdr-managed agents for bounded shards, then parent-inspect reports, `git status`, diffs, and required checks before delegating the next slice.
   - **Parallel worker work** → allowed when edit scopes are disjoint. Every worker task must include allowed edit scope, forbidden paths, report file, verification expectation, and stop condition if another file must change. Do not assume git worktrees.
   - **Code review / local investigation** → use Herdr-managed reviewer/scout agents when an independent opinion is needed; keep them read-only unless explicitly authorized.
   - **Security / adversarial analysis** → use a Herdr-managed cracker/oracle-style agent with read-only scope unless the user explicitly authorizes edits.
   - **Standalone external docs/API/web research** → use a Herdr-managed research agent when useful; do not use it for local codebase edits.
3. Execute and iterate in small checkpoints. When sub-agents are used, each checkpoint should be a separate Herdr agent task rather than a one-shot bundle. Commit only when explicitly requested or authorized.

# Rules

- You MUST read `stop-ai-slop-jp` before starting the session.
- Default stance: you are the orchestrator. Do your own sanity check first, then delegate through Herdr when independent review, security analysis, parallel investigation, parallel implementation, external research, long-running commands, or visible process management is materially valuable.
- Before Herdr orchestration, verify `HERDR_ENV=1`. If not running inside Herdr, do direct work or ask whether to fall back to `pi-crew`; do not pretend Herdr orchestration is available.
- Use Herdr built-ins first: `herdr agent list`, `herdr agent start`, `herdr agent send`, `herdr agent wait`, `herdr agent read`, plus `herdr pane`/`herdr tab`/`herdr workspace` when needed.
- Prefer existing role prompts in `~/.pi/agent/agents/` before inventing ad-hoc role text: `herdr-orchestrator.md`, `herdr-worker.md`, `herdr-planner.md`, `herdr-code-reviewer.md`, `herdr-quality-reviewer.md`, `herdr-cracker.md`, `herdr-oracle.md`, `herdr-scout.md`, and `herdr-reviewer.md`.
- Every Herdr worker task needs a concise task id and a self-contained task file or prompt. Include allowed edit scope, forbidden paths, report file path, verification expectation, and stop condition.
- Herdr-managed agents run asynchronously. Wait with `herdr agent wait` and collect results with `herdr agent read` plus report files; do not rely on pane output alone for durable handoff.
- Keep coding delegation small. After each worker/reviewer checkpoint, parent must inspect `git status`/diff and run required non-test checks, builds, or lint before delegating the next checkpoint.
- Parallel workers are allowed only when their writable scopes are disjoint. Treat package manifests, lockfiles, migrations, schemas, global config, generated files, and shared public API exports as single-owner/orchestrator-owned unless explicitly delegated.
- Use `pi-crew` only when explicitly requested, when Herdr is unavailable and user accepts the fallback, or when a specific pi-crew feature is needed and Herdr cannot cover it.
- Keep changes scoped; avoid broad rewrites unless explicitly requested.
- Run targeted tests/checks first, then broader tests when the risk justifies it.
- Commit only related changes with conventional commit messages after explicit request/authorization; never include unrelated user edits.
- Use the handoff skill to preserve decisions, constraints, and failures across long or interrupted sessions.
