---
name: context-manage
description: ->
    Manage loading, saving/updating, deleting, and pruning project-local context
    You MUST read this if you start session.
---

# context_manage

Procedures for loading, saving/updating, deleting, and pruning project context directly under `<PROJECT_ROOT>/.context/`.

## When to Use

- Load relevant context before starting non-trivial project work.
- After completing work, save/update reusable decisions, findings, constraints, and patterns.
- During maintenance, safely prune stale, duplicate, or malformed context.

## Setup

- Create `<PROJECT_ROOT>/.context/` if it does not exist.
- Add `.context/` idempotently to `<PROJECT_ROOT>/.gitignore`.
- Use `.context/` as a flat directory; do not create subdirectories.

```bash
mkdir -p <PROJECT_ROOT>/.context/
grep -qxF ".context/" <PROJECT_ROOT>/.gitignore || echo ".context/" >> <PROJECT_ROOT>/.gitignore
```

## Loading

1. Choose 2-4 lowercase English keywords from the task, domain, and related filenames.
2. Search only directly under `.context/`.

```bash
find <PROJECT_ROOT>/.context/ -maxdepth 1 -type f \( -name "*<keyword1>*" -o -name "*<keyword2>*" \)
```

3. If there are zero matches, report "no matches" and search once more after adding adjacent domain terms/synonyms or replacing specific keywords with broader stems. If there are still zero matches, state that you will proceed assuming no existing context is available.
4. If there are multiple matches, read all of them when they are small. If there are many or large files, choose by this priority: task relevance > exact filename match > recency > smaller/readable file. State the selection rationale.
5. Record the filenames loaded and their relevance to the task in working notes or the final report.

## Saving / Updating

- At the end of a task, save only reusable decisions, design patterns, research findings, and constraints.
- Before creating a new file, search for similar names. Do not create a new file if the content can be merged into or updated in an existing file.
- Keep the Markdown readable and always include `name` and `description` in YAML frontmatter.
- After writing, re-read the file and confirm that the frontmatter and body are readable and not malformed.

```markdown
---
name: auth_patterns
description: Reusable design decisions and implementation patterns for authentication
---

## Key Points

- <context_content>
```

## Deleting / Pruning

- Do not delete blindly. First list stale candidates with a dry-run.
- On macOS/BSD and Linux, `find ... -atime +14` often works. On macOS/BSD, use `stat -f` for inspection when you need details. If the OS is unknown, only perform safe listing/reporting, not deletion commands.

```bash
# dry-run: macOS/BSD and Linux
find <PROJECT_ROOT>/.context/ -maxdepth 1 -type f -atime +14 -print

# inspection on macOS/BSD
stat -f '%N %Sa' -t '%Y-%m-%d %H:%M:%S' <PROJECT_ROOT>/.context/*
```

- Delete only files whose exact paths have been reviewed and confirmed to be stale and unrelated to current or in-progress work.
- For destructive operations such as deletion/renaming/merging, follow this sequence: dry-run list → summarize candidates and reasons → explicit user approval → execute only on the approved exact paths → verify/report. Without explicit approval, only report proposed actions; do not delete, rename, or merge.
- Keep malformed context; do not rename/delete it merely because it is malformed. Repair frontmatter only when the intended name/description is obvious from the filename/content. Otherwise, record the path and reason as `manual_review` in the pruning report.
- For duplicate/overlapping names, compare the contents and consider merging, updating, or renaming before deletion.
- Report files that were deleted, merged, or renamed, along with the reasons.

## Format / Naming

- Use one `.md` file per event/topic.
- Store files only directly under `<PROJECT_ROOT>/.context/`.
- The filename stem and frontmatter `name` must use lowercase English segments joined with `_`, with at most 3 segments.
- A readable/valid context has opening/closing `---`, non-empty `name` and `description`, and a `name` matching the filename stem. If they intentionally differ, explain why in the body.
- Examples: `auth_patterns.md`, `api_routes.md`, `login_verifier.md`
- Use broad names for broad context and specific names for narrow context, but do not exceed 3 segments.

## Reporting

In the final answer or task notes, briefly summarize the context files loaded, saved, updated, or deleted, along with the assumptions behind those decisions.
