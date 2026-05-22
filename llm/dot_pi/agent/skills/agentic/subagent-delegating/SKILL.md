---
name: subagent-delegating
description: Delegate tasks to sub-agents via CLI pi. Selects agent from [agents/](agents/) directory, parses frontmatter, and executes via `pi -p` with automatic fallback. Use when delegating work to another agent instance.
---

## Danger Rule

If the task involves **production data deletion, schema migration, or irreversible architecture changes**, stop. Present to human for approval. Do not delegate.

For all other tasks, proceed.

## Workflow

1. **Check danger** — Production deletion / schema migration / architecture change → ask human
2. **Select agent** — Pick from [agents/](agents/) based on task nature:

| Agent | When to use |
|---|---|
| coder | Write code, implement features, fix bugs |
| reviewer | Review code, plans, architecture for correctness |
| cracker | Security audit, vulnerability detection |
| orchestration | Plan and break down work into structured steps |
| searcher | Find specific information, investigate topics, synthesize reports |

3. **Execute** — Use [scripts/delegate.sh](scripts/delegate.sh):

```bash
./<this dir>/scripts/delegate.sh <agent> "<message>" [--no-context] [--session <path>] [--continue] [--dry-run]
```

The script reads agent frontmatter, builds the `pi -p` command, and handles fallback automatically.

4. Parse stdout for result

## Timeout Rule

**Do not specify a `timeout` on bash calls that invoke `pi -p`.**
The agent auto-injects short timeouts (10–60s) which kill long-running sub-agents.
`pi -p` terminates on its own. Rely on task decomposition, not timeouts.

## Session Lifecycle

- `delegate.sh` auto-generates `--session /tmp/pi-subagent-<agent>-<timestamp>`
- Sessions persist after task completion for multi-turn use (`--continue`)
- Clean up manually when the task is fully resolved: `rm /tmp/pi-subagent-<agent>-*`
