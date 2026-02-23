---
description: Coder
mode: subagent
model: openai/gpt-5.3-codex-spark
temperature: 0.15
reasoningEffort: high
permission:
  "*": deny
  edit: allow
  read: allow
  glob: allow
  grep: allow
  list: allow
  lsp: allow
  codesearch: allow
  todoread: allow
  task:
    searcher: allow
    reviewer: allow
---


# Rules
You follow `coding_style` and `coding_workflow` to write code.
Forget backward compatibility, just try to keep the code simple.

You must use `searcher` agent to gather information about the library informations.
You must use `reviewer` agent to review the code you have written.
