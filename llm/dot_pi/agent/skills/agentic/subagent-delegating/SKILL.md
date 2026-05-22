---
name: subagent-delegating
description: The simple rule for delegating tasks to subagents
---

## Input Contract

This skill assumes the task difficulty has already been estimated by `estimate-task-diff`.
Expected input:
```json
{
  "difficulty": "low|medium|high|ex-high|danger",
  "required_actions": []
}
```

Do not recompute difficulty.
Do not redefine checkpointing, review-loop, or human-approval policy.
Use `difficulty` and `required_actions` only to select delegated roles and models.

## Model selection:
Ranked by ability,
Delegate tasks length, complexity

| role | low | medium | high | ex-high |
|---|---|---|---|---|
| orchestration | github-copilot/claude-sonnet-4.6 | zai/glm-5.1 | opencode-go/kimi-k2.6 | opencode-go/kimi-k2.6 |
| coding | opencode-go/deepseek-v4-flash | zai/glm-5.1  | opencode-go/deepseek-v4-pro | openai-codex/gpt-5.5 |
| reviewing | github-copilot/claude-sonnet-4.6 | zai/glm-5.1 | opencode-go/kimi-k2.6 | openai-codex/gpt-5.5 |
| searching | github-copilot/claude-haiku-4.5 | opencode-go/deepseek-v4-flash | zai/glm-5.1 | opencode-go/kimi-k2.6 |

Use the selected model as primary.
Use the next lower tier as fallback when cost, quota, or availability is a concern.
Use the next higher tier only when the assigned agent fails or produces low-confidence output.

## Agent Delegation
Use pi-subagent and pi-intercom extensions to delegate tasks to other agents.


You MUST add these format to the prompt instructions
```text
GOAL:
Assigned:
Role Context:
Acceptance Criteria:
Stop Condition:
Expected Output:
```
