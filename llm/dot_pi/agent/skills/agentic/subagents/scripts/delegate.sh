#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
AGENTS_DIR="$SKILL_DIR/agents"

usage() {
  cat <<EOF
Usage: delegate.sh <agent> <message> [options]

Options:
  --session <path>    Session path (default: auto-generated)
  --continue          Continue existing session
  --no-context        Pass --no-context-files to sub-agent
  --dry-run           Print command without executing

Agents:
$(shopt -s nullglob; for f in "$AGENTS_DIR"/*.md; do basename "$f" .md | sed 's/^/  /'; done)
EOF
  exit 1
}

# --- Args ---
(( $# < 2 )) && usage

AGENT="$1"; shift
MESSAGE="$1"; shift

SESSION=""
CONTINUE=false
NO_CONTEXT=false
DRY_RUN=false

while (( $# )); do
  case "$1" in
    --session)
      if (( $# < 2 )) || [[ "$2" == --* ]]; then
        echo "Error: --session requires a path argument" >&2; exit 1
      fi
      SESSION="$2"; shift 2
      ;;
    --continue)  CONTINUE=true; shift ;;
    --no-context) NO_CONTEXT=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Validate agent name (no path traversal) ---
if [[ ! "$AGENT" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Error: invalid agent name '$AGENT' (alphanumeric, hyphens, underscores only)" >&2
  exit 1
fi

# --- Resolve agent file ---
AGENT_FILE="$AGENTS_DIR/${AGENT}.md"
if [[ ! -f "$AGENT_FILE" ]]; then
  echo "Error: agent '$AGENT' not found at $AGENT_FILE" >&2
  available="$(shopt -s nullglob; for f in "$AGENTS_DIR"/*.md; do basename "$f" .md; done)"
  echo "Available: $available" >&2
  exit 1
fi

# --- Dependencies ---
command -v pi >/dev/null || { echo "Error: pi not found in PATH" >&2; exit 127; }

# --- Parse frontmatter ---
parse_field() {
  sed -n '/^---$/,/^---$/p' "$1" | sed -n "s/^${2}: *//p" | head -1 || true
}

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT INT TERM

# Extract body (everything after frontmatter)
sed '1,/^---$/d' "$AGENT_FILE" > "$BODY_FILE"

PRIMARY_MODEL="$(parse_field "$AGENT_FILE" "model")"
FALLBACK="$(parse_field "$AGENT_FILE" "fallback")"
THINKING="$(parse_field "$AGENT_FILE" "thinking")"
TOOLS="$(parse_field "$AGENT_FILE" "tools")"

if [[ -z "$PRIMARY_MODEL" ]]; then
  echo "Error: no 'model' field in $AGENT_FILE frontmatter" >&2
  exit 1
fi

# --- Build model list (primary + fallbacks) ---
IFS=',' read -ra MODELS <<< "$PRIMARY_MODEL${FALLBACK:+,$FALLBACK}"

# --- Session ---
if [[ -z "$SESSION" ]]; then
  SESSION="/tmp/pi-subagent-${AGENT}-$(date +%s)"
fi

# --- Build + Run ---
LAST_ERROR=""

for model in "${MODELS[@]}"; do
  # Trim whitespace without xargs
  model="${model#"${model%%[![:space:]]*}"}"
  model="${model%"${model##*[![:space:]]}"}"
  [[ -z "$model" ]] && continue

  # Build command array
  cmd=(pi -p)
  cmd+=(--model "$model")
  cmd+=(--append-system-prompt "$BODY_FILE")
  cmd+=(--session "$SESSION")

  [[ -n "$THINKING" ]] && cmd+=(--thinking "$THINKING")
  [[ -n "$TOOLS" ]]    && cmd+=(--tools "$TOOLS")
  $NO_CONTEXT          && cmd+=(--no-context-files)
  $CONTINUE            && cmd+=(--continue)

  cmd+=("$MESSAGE")

  # Execute
  if $DRY_RUN; then
    printf 'DRY RUN:' >&2
    printf ' %q' "${cmd[@]}" >&2
    echo >&2
    exit 0
  fi

  if "${cmd[@]}"; then
    exit 0
  else
    LAST_ERROR="$model failed (exit $?)"
    echo "Fallback: $LAST_ERROR" >&2
  fi
done

echo "Error: all models failed for agent '$AGENT'" >&2
[[ -n "$LAST_ERROR" ]] && echo "Last error: $LAST_ERROR" >&2
echo "Session preserved at: $SESSION" >&2
exit 1
