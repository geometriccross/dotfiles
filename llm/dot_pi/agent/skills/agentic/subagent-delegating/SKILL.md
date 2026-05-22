---
name: subagent-delegating
description: Delegate tasks to sub-agents via CLI pi. Selects models by difficulty and role, generates structured prompts, and executes via `pi -p`. Use after estimating task difficulty with estimate-task-diff, or when delegating work to another agent instance.
---

## Input Contract

Task difficulty must already be estimated by `estimate-task-diff`.
Expected input:
```json
{
  "difficulty": "low|medium|high|ex-high|danger",
  "required_actions": []
}
```

Do not recompute difficulty.
Do not redefine checkpointing, review-loop, or human-approval policy.

## Danger Level

**danger = no delegation.** Present the task to the human for explicit approval before any action. Do not auto-delegate.

## Model Selection

Ranked by ability, delegate by task length and complexity.

| role | low | medium | high | ex-high |
|---|---|---|---|---|
| orchestration | github-copilot/claude-sonnet-4.6 | zai/glm-5.1 | opencode-go/kimi-k2.6 | opencode-go/kimi-k2.6 |
| coding | opencode-go/deepseek-v4-flash | zai/glm-5.1 | opencode-go/deepseek-v4-pro | openai-codex/gpt-5.5 |
| reviewing | github-copilot/claude-sonnet-4.6 | zai/glm-5.1 | opencode-go/kimi-k2.6 | openai-codex/gpt-5.5 |
| searching | github-copilot/claude-haiku-4.5 | opencode-go/deepseek-v4-flash | zai/glm-5.1 | opencode-go/kimi-k2.6 |

Fallback: use next lower tier when cost, quota, or availability is a concern.
Escalate: use next higher tier only when the assigned agent fails or produces low-confidence output.

## Delegation Workflow

1. Determine role from `required_actions` (orchestration / coding / reviewing / searching)
2. Select model from table using `difficulty` + role
3. Build prompt using [DELEGATION.md](DELEGATION.md) template
4. Execute via bash:

```bash
pi -p --model <model> --append-system-prompt <this directory>/DELEGATION.md --session <session_path> "<message>"
```

5. Parse stdout for result
6. If multi-turn needed, continue:

```bash
pi -p --continue --session <session_path> "<follow-up message>"
```

## Timeout Rule

**Do not specify a `timeout` on bash calls that invoke `pi -p`.**
The agent tends to auto-inject short timeouts (10–60s) which kill long-running sub-agents.
`pi -p` will terminate on its own when the LLM completes. Rely on task decomposition
(not timeouts) to keep individual calls short.

## Session Paths

Use `--session /tmp/pi-subagent-<role>-<timestamp>` to isolate sub-agent sessions.
Clean up sessions after task completion.
