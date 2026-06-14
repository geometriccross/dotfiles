#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
AGENTS_DIR="$SKILL_DIR/agents"

usage() {
  cat <<EOF
Usage: delegate.sh <agent> [message|-] [options]

Options:
  --session <path>       Session path (default: auto-generated directory)
  --continue             Continue existing session
  --no-context           Pass --no-context-files to sub-agent
  --message-file <path>  Read message from file (overrides <message|->)
  --no-fallback          Try only the primary model

Agents:
$(shopt -s nullglob; for f in "$AGENTS_DIR"/*.md; do basename "$f" .md | sed 's/^/  /'; done)
EOF
  exit 1
}

parse_args() {
  (( $# < 1 )) && usage

  AGENT="$1"; shift
  MESSAGE=""
  if (( $# )) && [[ "$1" != --* ]]; then
    MESSAGE="$1"; shift
  fi

  SESSION=""
  CONTINUE=false
  NO_CONTEXT=false
  MESSAGE_FILE=""
  NO_FALLBACK=false

  while (( $# )); do
    case "$1" in
      --session)
        require_option_arg "$@"
        SESSION="$2"; shift 2
        ;;
      --continue) CONTINUE=true; shift ;;
      --no-context) NO_CONTEXT=true; shift ;;
      --message-file)
        require_option_arg "$@"
        MESSAGE_FILE="$2"; shift 2
        ;;
      --no-fallback) NO_FALLBACK=true; shift ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
}

require_option_arg() {
  if (( $# < 2 )) || [[ "$2" == --* ]]; then
    echo "Error: $1 requires a path argument" >&2
    exit 1
  fi
}

validate_agent_name() {
  if [[ ! "$AGENT" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Error: invalid agent name '$AGENT' (alphanumeric, hyphens, underscores only)" >&2
    exit 1
  fi
}

validate_session_options() {
  if $CONTINUE && [[ -z "$SESSION" ]]; then
    echo "Error: --continue requires --session <path>" >&2
    exit 1
  fi
}

validate_message_file() {
  local path="$1"

  if [[ ! -e "$path" ]]; then
    echo "Error: message file not found: $path" >&2
    exit 1
  fi
  if [[ ! -f "$path" ]]; then
    echo "Error: message file is not a regular file: $path" >&2
    exit 1
  fi
  if [[ ! -r "$path" ]]; then
    echo "Error: message file is not readable: $path" >&2
    exit 1
  fi
  if [[ ! -s "$path" ]]; then
    echo "Error: message file is empty: $path" >&2
    exit 1
  fi
}

resolve_message() {
  if [[ -n "$MESSAGE_FILE" ]]; then
    validate_message_file "$MESSAGE_FILE"
    MESSAGE="$(cat "$MESSAGE_FILE")"
  elif [[ "$MESSAGE" == "-" ]]; then
    MESSAGE="$(cat)"
  elif [[ -z "$MESSAGE" ]]; then
    echo "Error: message is required unless --message-file is provided" >&2
    exit 1
  fi
}

resolve_agent_file() {
  AGENT_FILE="$AGENTS_DIR/${AGENT}.md"
  if [[ ! -f "$AGENT_FILE" ]]; then
    echo "Error: agent '$AGENT' not found at $AGENT_FILE" >&2
    available="$(shopt -s nullglob; for f in "$AGENTS_DIR"/*.md; do basename "$f" .md; done)"
    echo "Available: $available" >&2
    exit 1
  fi
}

require_dependencies() {
  command -v pi >/dev/null || { echo "Error: pi not found in PATH" >&2; exit 127; }
  command -v node >/dev/null || { echo "Error: node not found in PATH" >&2; exit 127; }
  node -e 'require.resolve("yaml")' >/dev/null 2>&1 || {
    echo "Error: node package 'yaml' is required to parse agent frontmatter" >&2
    exit 127
  }
}

prepare_body_file() {
  BODY_FILE="$(mktemp)"
  trap 'rm -f "$BODY_FILE"' EXIT INT TERM
  sed '1,/^---$/d' "$AGENT_FILE" > "$BODY_FILE"
}

read_frontmatter() {
  node - "$AGENT_FILE" <<'NODE'
const file = process.argv[2];
let YAML;
try {
  YAML = require('yaml');
} catch (error) {
  console.error("Error: node package 'yaml' is required to parse agent frontmatter");
  process.exit(127);
}

const fs = require('fs');
const text = fs.readFileSync(file, 'utf8');
const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
let data = {};

try {
  data = match ? (YAML.parse(match[1]) || {}) : {};
} catch (error) {
  console.error(`${error.name}: ${error.message}`);
  process.exit(1);
}

for (const key of ['model', 'fallback', 'thinking', 'tools']) {
  const raw = data[key];
  let value = '';

  if (Array.isArray(raw)) {
    const values = raw
      .filter((item) => item !== undefined && item !== null)
      .map((item) => String(item));

    if (values.some((item) => item.includes(','))) {
      console.error(`Error: frontmatter field '${key}' list items must not contain commas`);
      process.exit(1);
    }

    value = values.join(',');
  } else if (raw !== undefined && raw !== null) {
    value = String(raw);
  }

  if (value.includes('\n')) {
    console.error(`Error: frontmatter field '${key}' must not contain newlines`);
    process.exit(1);
  }

  console.log(`${key}=${value}`);
}
NODE
}

load_agent_frontmatter() {
  local frontmatter_output
  PRIMARY_MODEL=""
  FALLBACK=""
  THINKING=""
  TOOLS=""

  frontmatter_output="$(read_frontmatter)" || exit $?

  while IFS='=' read -r key value; do
    case "$key" in
      model) PRIMARY_MODEL="$value" ;;
      fallback) FALLBACK="$value" ;;
      thinking) THINKING="$value" ;;
      tools) TOOLS="$value" ;;
    esac
  done <<< "$frontmatter_output"

  if [[ -z "$PRIMARY_MODEL" ]]; then
    echo "Error: no 'model' field in $AGENT_FILE frontmatter" >&2
    exit 1
  fi
}

build_model_list() {
  if $NO_FALLBACK; then
    MODELS=("$PRIMARY_MODEL")
  else
    IFS=',' read -ra MODELS <<< "$PRIMARY_MODEL${FALLBACK:+,$FALLBACK}"
  fi
}

ensure_session() {
  local base_dir

  if [[ -z "$SESSION" ]]; then
    base_dir="${TMPDIR:-/tmp}"
    base_dir="${base_dir%/}"
    SESSION="$(mktemp -d "$base_dir/pi-subagent-${AGENT}.XXXXXXXXXX")"
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

build_command() {
  local model="$1"

  CMD=(pi -p)
  CMD+=(--model "$model")
  CMD+=(--append-system-prompt "$BODY_FILE")
  CMD+=(--session "$SESSION")

  [[ -n "$THINKING" ]] && CMD+=(--thinking "$THINKING")
  [[ -n "$TOOLS" ]] && CMD+=(--tools "$TOOLS")
  $NO_CONTEXT && CMD+=(--no-context-files)
  $CONTINUE && CMD+=(--continue)

  CMD+=("$MESSAGE")
}

run_models() {
  local model
  local exit_status
  LAST_ERROR=""

  for model in "${MODELS[@]}"; do
    model="$(trim "$model")"
    [[ -z "$model" ]] && continue

    build_command "$model"

    if "${CMD[@]}"; then
      exit 0
    else
      exit_status=$?
      LAST_ERROR="$model failed (exit $exit_status)"
      if (( ${#MODELS[@]} > 1 )); then
        echo "Fallback: $LAST_ERROR" >&2
      else
        echo "$LAST_ERROR" >&2
      fi
    fi
  done
}

fail_all_models() {
  echo "Error: all models failed for agent '$AGENT'" >&2
  [[ -n "$LAST_ERROR" ]] && echo "Last error: $LAST_ERROR" >&2
  echo "Session preserved at: $SESSION" >&2
  exit 1
}

main() {
  parse_args "$@"
  validate_session_options
  validate_agent_name
  resolve_message
  resolve_agent_file
  require_dependencies
  prepare_body_file
  load_agent_frontmatter
  build_model_list
  ensure_session
  run_models
  fail_all_models
}

main "$@"
