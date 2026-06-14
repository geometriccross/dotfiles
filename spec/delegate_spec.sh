DELEGATE_SCRIPT="./llm/dot_pi/agent/skills/agentic/subagents/scripts/delegate.sh"

Describe 'delegate.sh'
	It 'invokes pi for an agent with model, tools, and prompt'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit \"\${PI_EXIT_STATUS:-0}\"" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$1" reviewer "review this"; status=$?; cat "$tmp/calls" >&2; session="$(awk "p==\"--session\"{print; exit} {p=\$0}" "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should include '--model'
		The stderr should include 'openai-codex/gpt-5.5'
		The stderr should include '--tools'
		The stderr should include 'read,grep,find,ls'
		The stderr should include 'review this'
	End

	It 'reads a multi-line prompt from --message-file'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; msg="$tmp/message"; printf "line1\nline2\n" > "$msg"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$1" reviewer --message-file "$msg"; status=$?; cat "$tmp/calls" >&2; session="$(awk "p==\"--session\"{print; exit} {p=\$0}" "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should include 'line1'
		The stderr should include 'line2'
	End

	It 'reads a multi-line prompt from stdin when message is dash'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" bash -c "printf \"stdin1\\nstdin2\\n\" | \"\$1\" reviewer -" bash "$1"; status=$?; cat "$tmp/calls" >&2; session="$(awk "p==\"--session\"{print; exit} {p=\$0}" "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should include 'stdin1'
		The stderr should include 'stdin2'
	End

	It 'passes session, continue, and no-context options to pi'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$1" reviewer "review this" --session /tmp/custom-session --continue --no-context; status=$?; cat "$tmp/calls" >&2; rm -rf "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should include '--session'
		The stderr should include '/tmp/custom-session'
		The stderr should include '--continue'
		The stderr should include '--no-context-files'
	End

	It 'creates an auto session directory with mktemp during execution'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "session=\"\"; prev=\"\"; for arg in \"\$@\"; do if [ \"\$prev\" = --session ]; then session=\"\$arg\"; fi; prev=\"\$arg\"; done" "test -d \"\$session\" || exit 77" "printf \"%s\\n\" \"\$session\" >> \"\$PI_CALLS\"" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$1" reviewer "review this"; status=$?; cat "$tmp/calls" >&2; session="$(head -1 "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should include 'pi-subagent-reviewer.'
	End

	It 'does not try fallback models when --no-fallback is set'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit 42" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$1" reviewer "review this" --no-fallback; status=$?; cat "$tmp/calls" >&2; printf "calls=%s\n" "$(grep -c -- "^-p$" "$tmp/calls" | tr -d " ")" >&2; session="$(awk "p==\"--session\"{print; exit} {p=\$0}" "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be failure
		The stderr should include 'openai-codex/gpt-5.5'
		The stderr should include 'calls=1'
		The stderr should not include 'opencode-go/kimi-k2.6'
	End

	It 'parses YAML frontmatter lists and quoted scalars'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir -p "$tmp/scripts" "$tmp/agents" "$tmp/bin"; cp "$1" "$tmp/scripts/delegate.sh"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; printf "%s\n" "---" "name: yamlagent" "description: YAML fixture" "model: \"primary/model\"" "fallback:" "  - \"fallback/one\"" "  - \"fallback/two\"" "thinking: \"low\"" "tools:" "  - read" "  - grep" "---" "" "# Body" > "$tmp/agents/yamlagent.md"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$tmp/scripts/delegate.sh" yamlagent "check yaml"; status=$?; cat "$tmp/calls" >&2; session="$(awk "p==\"--session\"{print; exit} {p=\$0}" "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should include 'primary/model'
		The stderr should include 'low'
		The stderr should include 'read,grep'
	End

	It 'parses YAML without invoking ruby'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "echo ruby should not run >&2" "exit 99" > "$tmp/bin/ruby"; printf "%s\n" "#!/usr/bin/env bash" "printf \"%s\\n\" \"\$@\" >> \"\$PI_CALLS\"" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/ruby" "$tmp/bin/pi"; PI_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" "$1" reviewer "review this"; status=$?; session="$(awk "p==\"--session\"{print; exit} {p=\$0}" "$tmp/calls")"; rm -rf "$session" "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be success
		The stderr should not include 'ruby should not run'
	End

	It 'fails early when the Node yaml package cannot be resolved'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir "$tmp/bin"; printf "%s\n" "#!/usr/bin/env bash" "if [ \"\$1\" = -e ]; then exit 127; fi" "exec \"\$REAL_NODE\" \"\$@\"" > "$tmp/bin/node"; printf "%s\n" "#!/usr/bin/env bash" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/node" "$tmp/bin/pi"; REAL_NODE="$2" PATH="$tmp/bin:$PATH" "$1" reviewer "review this"; status=$?; rm -rf "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT" "$(command -v node)"
		The status should be failure
		The stderr should include "Error: node package 'yaml' is required to parse agent frontmatter"
	End

	It 'reports YAML parser errors instead of replacing them with missing model errors'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir -p "$tmp/scripts" "$tmp/agents" "$tmp/bin"; cp "$1" "$tmp/scripts/delegate.sh"; printf "%s\n" "#!/usr/bin/env bash" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; printf "%s\n" "---" "model: [unterminated" "---" "# Body" > "$tmp/agents/badyaml.md"; PATH="$tmp/bin:$PATH" "$tmp/scripts/delegate.sh" badyaml "check yaml"; status=$?; rm -rf "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be failure
		The stderr should include 'YAMLParseError'
		The stderr should not include "Error: no 'model' field"
	End

	It 'rejects YAML list frontmatter values containing commas'
		When run bash -c 'tmp="$(mktemp -d)"; mkdir -p "$tmp/scripts" "$tmp/agents" "$tmp/bin"; cp "$1" "$tmp/scripts/delegate.sh"; printf "%s\n" "#!/usr/bin/env bash" "exit 0" > "$tmp/bin/pi"; chmod +x "$tmp/bin/pi"; printf "%s\n" "---" "model: primary/model" "tools:" "  - \"read,grep\"" "---" "# Body" > "$tmp/agents/commaagent.md"; PATH="$tmp/bin:$PATH" "$tmp/scripts/delegate.sh" commaagent "check comma"; status=$?; rm -rf "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be failure
		The stderr should include "Error: frontmatter field 'tools' list items must not contain commas"
	End

	It 'rejects --continue without --session'
		When run "$DELEGATE_SCRIPT" reviewer 'review this' --continue
		The status should be failure
		The stderr should include 'Error: --continue requires --session <path>'
	End

	It 'rejects --dry-run as an unknown option'
		When run "$DELEGATE_SCRIPT" reviewer 'review this' --dry-run
		The status should be failure
		The stderr should include 'Unknown option: --dry-run'
	End

	It 'rejects a directory passed as --message-file'
		When run bash -c 'tmp="$(mktemp -d)"; "$1" reviewer --message-file "$tmp"; status=$?; rm -rf "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be failure
		The stderr should include 'Error: message file is not a regular file'
	End

	It 'rejects an empty --message-file'
		When run bash -c 'tmp="$(mktemp)"; "$1" reviewer --message-file "$tmp"; status=$?; rm -f "$tmp"; exit "$status"' bash "$DELEGATE_SCRIPT"
		The status should be failure
		The stderr should include 'Error: message file is empty'
	End

	It 'rejects a missing prompt'
		When run "$DELEGATE_SCRIPT" reviewer
		The status should be failure
		The stderr should include 'Error: message is required unless --message-file is provided'
	End

	It 'rejects invalid agent names before resolving files'
		When run "$DELEGATE_SCRIPT" '../reviewer' 'review this'
		The status should be failure
		The stderr should include "Error: invalid agent name '../reviewer'"
	End
End
