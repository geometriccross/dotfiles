---
name: subagents
description: Delegate tasks to sub-agents via CLI pi. Selects agent from [agents/](agents/) directory, parses frontmatter, and executes via `pi -p` with automatic fallback. Use when delegating work to another agent instance.
---

## Danger Rule

If the task involves **production data deletion, schema migration, or irreversible architecture changes**, stop. Present to human for approval. Do not delegate.

For all other tasks, proceed.

## Workflow

1. **Check danger** — Production data deletion / schema migration / irreversible architecture change → ask human. Reviewing or planning such work is allowed; executing it requires approval.
2. **Select agent** — Read [AVAILABLE_AGENTS.md](AVAILABLE_AGENTS.md), then pick from [agents/](agents/) based on task nature.

3. **Execute** — Use [scripts/delegate.sh](scripts/delegate.sh):

```bash
./<this dir>/scripts/delegate.sh <agent> "<message>" [--no-context] [--session <path>] [--continue] [--dry-run]
./<this dir>/scripts/delegate.sh <agent> - < task.md
./<this dir>/scripts/delegate.sh <agent> --message-file task.md
```

The script reads agent frontmatter, builds the `pi -p` command, and handles fallback automatically.
Use `-` or `--message-file` for multi-line prompts to avoid shell quoting mistakes.
Parsed frontmatter fields (`model`, `fallback`, `thinking`, `tools`) must be single-line scalars.
Sub-agents run normal `pi -p` skill discovery because `delegate.sh` does not pass `--no-skills`; however, full skill loading usually requires `read`, so agents without `read` should not be assigned skill-dependent tasks.
For coding tasks, keep delegation small because automatic fallback can run after partial edits; inspect the resulting diff before continuing.

4. Parse stdout for result

## Timeout Rule

**Do not specify a `timeout` on bash calls that invoke `pi -p`.**
The agent auto-injects short timeouts (10–60s) which kill long-running sub-agents.
`pi -p` terminates on its own. Rely on task decomposition, not timeouts.

## Session Lifecycle

- `delegate.sh` auto-generates `--session /tmp/pi-subagent-<agent>-<timestamp>-<pid>-<random>`
- Sessions persist after task completion for multi-turn use (`--continue`)
- Clean up manually when the task is fully resolved: `rm /tmp/pi-subagent-<agent>-*`
