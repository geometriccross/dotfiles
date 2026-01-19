---
name: implement
description: The workflow for implementing new features via sub-agents.
license: MIT
compatibility: opencode
---

## What I do
Break down the task into smaller sub-tasks.
Delegate sub-tasks to editor agent.

1. Design Types:    Define the type system or interface for the requested feature.
2. Implement Tests: Instruct `editor` to write unit tests based on the design.
3. Implement Code:  Instruct `editor` to write the code to pass the tests.
4. Review:
   - Run `git diff` to capture changes.
   - Ask `reviewer` to check the diff.
   - If bugs are found, instruct `editor` to fix them.


## When to use me
Use this when you are ordered to implement a new feature.
Ask clarifying questions if the feature request is vague or incomplete.
