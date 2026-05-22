---
name: root-session-workflow
description: A standard workflow for a session, You MUST read this when you start session.
---

1. Use `context-manage` skill to load cached context
2. Read `subagent-delegating` and delgeate opencode-go/kimi-k2.6 to `estimate-task-diff` skill for task difficulty
3. Based on return value, decide planning and execution strategy

If you talk to human, you must use this skill.
- subagent-delegating

# Rule
You MUST use pi-subagent for task that requires a third-opinion (such as reviewing, vulnerability detection, etc)
Please do not get bogged down in the detailed design. 
Your role is to handle the direction.
