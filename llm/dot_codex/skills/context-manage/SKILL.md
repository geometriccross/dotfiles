---
name: context-manage
description: Manage loading, saving/updating, deleting, and pruning project-local context
---

# context-manage

Procedures for loading, saving/updating, deleting, and pruning project context directly under `<PROJECT_ROOT>/.context/`.

## Safety

- Only create, update, delete, or prune `.context/` files after the user has requested context management or explicitly approved the proposed write/delete.
- Respect the current sandbox and approval mode. If writing or deleting is not permitted, report the intended change instead of attempting it.
- For deletion/pruning, ask the user to approve exact paths before acting; do not treat a broad approval as permission to delete unspecified files.

## Setup

- Create `<PROJECT_ROOT>/.context/` if it does not exist, but only after user request or approval.
- Add `.context/` idempotently to `<PROJECT_ROOT>/.gitignore` only after user request or approval.
- Use `.context/` as a flat directory; do not create subdirectories.

## Loading

Choose 2-4 lowercase English keywords from the task, domain, and related filenames. Search only directly under `.context/`. If there are zero matches, report no matches and try one adjacent-domain search. If there are many matches, select by task relevance, exact filename match, recency, then readability. Record filenames loaded and why.

## Saving / updating

Save only reusable decisions, design patterns, research findings, constraints, and durable validation notes. Before creating a new file, search for similar names and merge when possible. Markdown context files must have YAML frontmatter with non-empty `name` and `description`.

## Deleting / pruning

Never delete blindly. Use a dry-run list first, summarize exact candidate paths and reasons, request explicit user approval for those exact paths, execute only approved exact paths within sandbox limits, then verify and report. Keep malformed context unless repair is obvious and approved.

## Format

Use one `.md` file per event/topic, directly under `.context/`. Filename stem and frontmatter `name` use lowercase English segments joined with `_`, with at most 3 segments.
