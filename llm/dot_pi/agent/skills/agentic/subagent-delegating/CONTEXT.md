# Sub-Agent Delegation

Skill for delegating tasks to sub-agent instances via CLI pi. Defines model selection, prompt templates, and execution workflow.

## Language

**Delegation**:
Assigning a task to a separate pi instance via `pi -p` with a structured prompt and dedicated session.
_Avoid_: dispatch, spawn, fork, handoff

**Difficulty Level**:
A pre-estimated classification (low / medium / high / ex-high / danger) that determines which model and safeguards apply. Estimated by `estimate-task-diff` before delegation.
_Avoid_: severity, priority, complexity

**danger (difficulty)**:
The highest difficulty tier. Delegation is prohibited; the task must be presented to the human for explicit approval before any action.
_Avoid_: critical, blocked

**Role**:
The functional category of a delegation target: orchestration, coding, reviewing, or searching. Determines the model selection column and the Role Context block in the prompt.
_Avoid_: agent type, worker type

**Fallback**:
Stepping down one tier in the model selection table when the primary model fails (cost, quota, availability).
_Avoid_: retry, backup

**Escalation**:
Stepping up one tier in the model selection table when the assigned model produces low-confidence or failed output.
_Avoid_: upgrade, promotion

**Session Isolation**:
Each sub-agent invocation uses a unique `--session` path (`/tmp/pi-subagent-<role>-<timestamp>`) so multiple delegations don't interfere.
_Avoid_: sandbox, namespace

**Multi-turn Delegation**:
Continuing a sub-agent session with `--continue --session <path>` for follow-up messages within the same task.
_Avoid_: conversation, chain

**Prompt Template (DELEGATION.md)**:
A structured prompt format (GOAL / Assigned / Role Context / Acceptance Criteria / Stop Condition / Expected Output) loaded via `--append-system-prompt`.
_Avoid_: system prompt, instruction file

**Model Selection Table**:
A difficulty × role matrix that maps each combination to a specific provider/model string (e.g. `opencode-go/deepseek-v4-flash`).
_Avoid_: model map, routing table

**Timeout Prohibition**:
The rule that bash calls invoking `pi -p` must not specify a `timeout` parameter. The agent auto-injects short timeouts (10–60s) which kill sub-agent processes prematurely. Task decomposition, not timeouts, controls call duration.
_Avoid_: infinite wait, no-limit
