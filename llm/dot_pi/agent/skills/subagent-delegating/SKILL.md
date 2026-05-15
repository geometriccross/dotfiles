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
## Agent Delegation
To keep context clean and preserve accuracy, speed, and cost efficiency, proactively delegate yak shaving and work outside the current focus to an appropriate model agent.
- Good example: When asked to implement something, delegate design, review, or behavior verification to other agents.
- Bad example: When encountering a deep-rooted error, trying to solve it yourself without launching a debugging agent.

How to call an agent (left-priority fallback)
```bash
pi --model <provider/model:effort> --fallback-models <provider/model:effort>,... ¥
    -p '<instructions>' 
```
When a delegated task needs a specific skill, specify it in the prompt
```bash
pi ... -p '/skill:<skill-name> <instructions>'
```

You MUST add these format to the prompt instructions
```text
GOAL:
Assigned:
Role Context:
Acceptance Criteria:
Stop Condition:
Expected Output:
```

## Model selection:
Ranked by ability,
Delegate tasks length, complexity

Orchestration:
Top     ->  opencode-go/kimi-k2.6
Middle  ->  zai/glm-5.1
Low     ->  github-copilot/claude-sonnet-4.6

Reviewing:
Top     ->  opencode-go/kimi-k2.6
Middle  ->  zai/glm-5.1
Low     ->  opencode-go/deepseek-v4-pro

Coding:
Top     ->  openai-codex/gpt-5.5
Middle  ->  opencode-go/deepseek-v4-pro
Low     ->  zai/glm-5.1

Searching:
Top     ->  opencode-go/deepseek-v4-flash
Middle  ->  zai/glm-5-turbo
Low     ->  github-copilot/claude-sonnet-4.5
