# Sub-Agent Delegation Prompt Template

## Prompt Format

Include these sections in the message to the sub-agent:

```
GOAL:
{What the sub-agent must accomplish. One clear sentence.}

Acceptance Criteria:
{Measurable conditions for success. Bullet points.}

Stop Condition:
{When the sub-agent should stop and return results.}

Expected Output:
{Format of the response: file path, diff, text, JSON schema, etc.}
```

## Execution Examples

### Single-shot delegation
```bash
/path/to/scripts/delegate.sh coder \
  "GOAL: Fix the null pointer crash in UserService.java
Acceptance Criteria: - Crash no longer reproduces - Existing tests pass
Stop Condition: Fix applied and verified
Expected Output: List of changed files with brief description"
```

### Without parent context
```bash
/path/to/scripts/delegate.sh reviewer \
  "GOAL: Review SKILL.md for clarity
Acceptance Criteria: - All sections checked - Concrete suggestions
Stop Condition: Review complete
Expected Output: Numbered findings with severity" \
  --no-context
```

### Multi-turn continuation
`--continue` requires an explicit existing `--session <path>`.

```bash
/path/to/scripts/delegate.sh coder \
  "The tests are failing because the token expiry check is wrong. Fix the expiry validation." \
  --session /tmp/pi-subagent-coder.ABC123xyz0 --continue
```

## Multiline Prompts

For long prompts, use a heredoc or temp file:
```bash
MSG=$(cat <<'EOF'
GOAL: Implement auth middleware
Acceptance Criteria:
- JWT validation works
- 401 on invalid tokens
- Unit tests included
Stop Condition: Tests pass
Expected Output: List of created/modified files
EOF
)
/path/to/scripts/delegate.sh coder "$MSG"
```
