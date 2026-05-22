# Sub-Agent Delegation

Skill for delegating tasks to sub-agents via CLI pi. Agent definitions live in [agents/](agents/) with frontmatter (model, fallback, thinking, tools). Execution handled by [scripts/delegate.sh](scripts/delegate.sh).

## Language

**Delegation**:
The act of selecting an agent from [agents/](agents/) and assigning a task via `delegate.sh`. The script handles frontmatter parsing, model selection, and fallback.
_Avoid_: dispatch, spawn, fork, handoff

**Agent Definition**:
A markdown file in [agents/](agents/) with frontmatter (`model`, `fallback`, `thinking`, `tools`, `systemPromptMode`) and body (role instructions, rules, output format). Each file is self-contained and the filename must match the agent name.
_Avoid_: agent config, agent spec

**delegate.sh**:
Shell script that reads an agent file, parses frontmatter, builds the `pi -p` command with correct flags (`--model`, `--thinking`, `--tools`, `--append-system-prompt`), and tries fallback models on failure.
_Avoid_: runner, executor

**Fallback**:
Comma-separated model list in agent frontmatter. Tried in order by `delegate.sh` when the primary model fails.
_Avoid_: retry, backup model

**Danger Rule**:
A hardcoded gate: production deletion, schema migration, or architecture change → stop and ask human.
_Avoid_: danger zone, block rule

**Session Lifecycle**:
Sessions are auto-created by `delegate.sh`, persist for multi-turn use, and must be manually cleaned up after task resolution.
_Avoid_: sandbox, namespace

**Timeout Prohibition**:
Bash calls invoking `pi -p` must not specify `timeout`. The agent auto-injects short timeouts (10–60s) which kill sub-agent processes prematurely.
_Avoid_: infinite wait, no-limit
