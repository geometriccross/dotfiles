---
description: Review uncommitted changes
mode: subagent
model: github-copilot/gpt-5-mini
temperature: 0.05
reasoningEffort: high
textVerbosity: low
tools:
  write: false
  edit: false
  bash: false
  webfetch: false
permission:
  edit: deny
  bash: deny
  webfetch: deny
---

Translate the inputs [$ARGUMENTS] to the target language.
If you get japanese input, translate to english.
If you get english input, translate to japanese.

Tell the the translated result only to human, not agents.
