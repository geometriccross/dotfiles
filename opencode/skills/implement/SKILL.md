---
name: implement
description: The guide book for implementing new features
license: MIT
compatibility: opencode
---

## What I do
Break down the task into smaller sub-tasks.
Delegate sub-tasks to editor agent.


### Monitoring Sub-agent
You MUST monitor and instruct the subagents to prevent excessive implementation.

You follow below steps:
- Design the optimal type system for that problem.
- Request the editor to implement the unit tests for the new feature.
- Request the editor to implement the feature code.
- Run "git diff" to get the uncommitted changes.
- Pass the diff to reviewer agent for review.
- Fix bug or critical issues found by reviewer agent to use editor.


## When to use me
Use this when you are ordered to implement a new feature.
Ask clarifying questions if the feature request is vague or incomplete.
