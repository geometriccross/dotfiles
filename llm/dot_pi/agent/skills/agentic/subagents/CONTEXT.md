# Sub-Agent Delegation

Skill for delegating tasks to sub-agents via CLI pi. Agent definitions live in [agents/](agents/) with frontmatter (model, fallback, thinking, tools). Execution handled by [scripts/delegate.sh](scripts/delegate.sh).

## Language

**Delegation**:
The act of selecting an agent from [agents/](agents/) and assigning a task via `delegate.sh`. The script handles frontmatter parsing, model selection, and fallback.
_Avoid_: dispatch, spawn, fork, handoff

**Agent Definition**:
A markdown file in [agents/](agents/) with YAML frontmatter and body (role instructions, rules, output format). Each file is self-contained and the filename must match the agent name. `delegate.sh` parses `model`, `fallback`, `thinking`, and `tools`; `name` and `description` document intent but are not passed to `pi -p`. Parsed fields use `require.resolve("yaml")` and the Node `yaml` package; scalar strings and YAML lists are supported for `fallback` and `tools`. YAML list items for parsed fields must not contain commas because the shell wrapper normalizes lists to comma-separated values for `pi -p`.
_Avoid_: agent config, agent spec

**delegate.sh**:
Shell script that reads an agent file, parses frontmatter with the Node `yaml` package, builds the `pi -p` command with correct flags (`--model`, `--thinking`, `--tools`, `--append-system-prompt`), and tries fallback models on failure unless `--no-fallback` is set. `--continue` requires an explicit `--session <path>`.
_Avoid_: runner, executor

**Fallback**:
Comma-separated string or YAML list in agent frontmatter. Tried in order by `delegate.sh` when the primary model fails. `--no-fallback` disables fallback and tries only the primary model.
_Avoid_: retry, backup model

**Skill Access**:
Sub-agents are normal `pi -p` processes. `delegate.sh` does not pass `--no-skills`, so Pi skill discovery still applies. `delegate.sh` does not parse any `inheritSkills` field. Full skill loading usually requires the agent to have `read`; agents without `read` should not receive skill-dependent tasks.
_Avoid_: inherited skills, shared skill state

**Danger Rule**:
A parent-agent gate: production data deletion, schema migration, or irreversible architecture change → stop and ask human. Reviewing or planning such work is allowed; executing it requires approval.
_Avoid_: danger zone, block rule

**Session Lifecycle**:
Sessions are auto-created by `delegate.sh` with `mktemp -d` as `${TMPDIR:-/tmp}/pi-subagent-<agent>.XXXXXXXXXX`, persist for multi-turn use, and must be manually cleaned up after task resolution. Continuing a session requires `--continue --session <path>`.
_Avoid_: sandbox, namespace

**Timeout Prohibition**:
Bash calls invoking `pi -p` must not specify `timeout`. The agent auto-injects short timeouts (10–60s) which kill sub-agent processes prematurely.
_Avoid_: infinite wait, no-limit
