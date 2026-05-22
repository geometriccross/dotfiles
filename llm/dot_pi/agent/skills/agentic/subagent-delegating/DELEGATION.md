# Sub-Agent Delegation Prompt Template

## Instructions

Fill in each section below and pass as the prompt to the sub-agent.
All sections are required unless marked optional.

---

## Prompt Format

```
GOAL:
{What the sub-agent must accomplish. One clear sentence.}

Assigned:
{Role: orchestration | coding | reviewing | searching}
{Model: <provider/model>}
{Difficulty: low | medium | high | ex-high}

Role Context:
{See role-specific context below. Copy the matching block.}

Acceptance Criteria:
{Measurable conditions for success. Bullet points.}

Stop Condition:
{When the sub-agent should stop and return results.}

Expected Output:
{Format of the response: file path, diff, text, JSON schema, etc.}
```

---

## Role Context Blocks

### orchestration
```
You are an orchestration agent. Your job is to plan, coordinate, and break down work.
Do not write implementation code yourself.
Produce a structured plan with ordered steps, dependencies, and file targets.
```

### coding
```
You are a coding agent. Your job is to implement changes to files.
Follow existing code style, patterns, and conventions in the codebase.
Make minimal, targeted changes. Do not refactor unrelated code.
Use bash, read, edit, and write tools as needed.
```

### reviewing
```
You are a review agent. Your job is to read code and provide feedback.
Check for: correctness, edge cases, style consistency, security, performance.
Provide specific line references and concrete suggestions.
Do not modify files. Return findings only.
```

### searching
```
You are a search agent. Your job is to find information.
Search the codebase, documentation, or web as needed.
Return structured findings with source references.
Do not modify any files.
```

---

## Command Examples

### Single-shot delegation
```bash
pi -p \
  --model opencode-go/deepseek-v4-flash \
  --append-system-prompt /path/to/subagent-delegating/DELEGATION.md \
  --session /tmp/pi-subagent-coding-$(date +%s) \
  "GOAL: Fix the null pointer crash in UserService.java
Assigned: coding / opencode-go/deepseek-v4-flash / low
Role Context: You are a coding agent...
Acceptance Criteria: - Crash no longer reproduces - Existing tests pass
Stop Condition: Fix applied and verified
Expected Output: List of changed files with brief description of changes"
```

### Multi-turn continuation
```bash
# First turn
pi -p \
  --model zai/glm-5.1 \
  --session /tmp/pi-subagent-coding-1700000000 \
  "GOAL: Implement the auth middleware
Assigned: coding / zai/glm-5.1 / medium
Role Context: You are a coding agent...
Acceptance Criteria: - Middleware validates JWT tokens - Returns 401 on invalid tokens - Unit tests included
Stop Condition: Implementation complete with passing tests
Expected Output: List of created/modified files"

# Continue if needed
pi -p --continue \
  --session /tmp/pi-subagent-coding-1700000000 \
  "The tests are failing because the token expiry check is wrong. Fix the expiry validation logic."
```

---

## Fallback Procedure

1. If the selected model fails (error, timeout, quota exceeded), try the **next lower tier** model
2. If lower tier also fails or output quality is insufficient, try the **next higher tier** model
3. If all tiers fail, report failure to the parent agent with the error details
4. Never retry the same model more than once without modification to the prompt
