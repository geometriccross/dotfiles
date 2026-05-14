---
name: subagent-delegating
description: The simple rule for delegating tasks to subagents
---

## Agent Delegation
- To keep context clean and preserve accuracy, speed, and cost efficiency, proactively delegate yak shaving and work outside the current focus to an appropriate model agent.
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

