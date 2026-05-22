---
name: context-manage
description: >
    Save and load project decisions, constraints, and failed approaches in
    `.context/`. Use when starting a session, making design decisions,
    discovering non-obvious constraints, or encountering dead ends.
---

# context-manage

Manage project knowledge in `<PROJECT_ROOT>/.context/`.

## Setup

```bash
mkdir -p <PROJECT_ROOT>/.context/
grep -qxF ".context/" <PROJECT_ROOT>/.gitignore || echo ".context/" >> <PROJECT_ROOT>/.gitignore
```

If `.context/CONTEXT.md` does not exist, create it:

```markdown
# Context Index

| file | tags | summary |
|---|---|---|
```

## What to Save

Only three types. Nothing else belongs in `.context/`:

| Type | Trigger |
|---|---|
| **Decision (A)** | You chose one option over others for a specific reason |
| **Constraint (B)** | You discovered a non-obvious fact through investigation, testing, or external sources — things you would not know from casually reading the code (e.g. runtime behavior, undocumented limits, environment-specific quirks, implicit dependencies between systems). Code-level constraints visible from schema/model definitions do NOT belong here. |
| **Failure (C)** | An approach you tried or investigated did not work — includes both "ran code and it failed" and "evaluated an option and found it unusable" |

**Do NOT save:** patterns/conventions (→ project AGENTS.md), glossary terms (→ project CONTEXT.md), in-progress investigations (→ compact).

## Save Procedure

When a trigger fires, **immediately**:

1. Fill the matching template below.
2. Append to an existing file if it covers the **same narrow topic** (e.g. `auth_decisions.md` for auth decisions, not for all auth-related things). When in doubt, create a new file.
3. Update `.context/CONTEXT.md` index.

### Templates

Each entry starts with a heading. Append new entries to the **end** of the file (chronological order).

**Decision:**

```markdown
## Decision: <what was decided> [YYYY-MM-DD]

**Choice:** <what was chosen>
**Alternatives rejected:** <what was rejected>
**Reason:** <why — can be multiple sentences or bullet points>
```

**Constraint:**

```markdown
## Constraint: <short name> [YYYY-MM-DD]

**What:** <the constraint — be specific with values>
**Source:** <how you discovered it — e.g. "API docs §3.2", "runtime test showing 5xx at 6req/s", "ops team confirmation">
```

**Failure:**

```markdown
## Failure: <what was tried> [YYYY-MM-DD]

**Approach:** <what was attempted or investigated>
**Result:** <what happened — error message, behavior, or why it's unusable>
**Cause:** <direct reason it failed, not root cause analysis>
```

### File Naming

- Lowercase English, `_`-separated, max 3 segments.
- Name by **topic**, not by type — a file can contain mixed types if they share the same topic.
- Do NOT include the type in the filename (no `_decisions`, `_constraints`, `_failures`).
- Example: `auth.md`, `external_api.md`, `deployment.md`

### Index Update

After save, add one row to `.context/CONTEXT.md`:

```markdown
| auth_decisions | [auth, jwt, session, cookie] | Chose session cookie over JWT |
```

**Tags** should cover: synonyms, abbreviations, and related terms someone might search for. Include tags from all entries in the file.

Re-read the index after writing and confirm the table is valid (has header separator row `|---|---|---|` and all rows have 3 columns).

## Load Procedure

1. Read `.context/CONTEXT.md`.
2. From the task description and file paths involved, extract 2-4 keywords.
3. Match keywords against **tags** and **summary** columns. A match on any tag is sufficient — err on the side of reading more rather than less.
4. Read all matched files.
5. If no matches at all, state "no relevant context found" and proceed.

## Contradiction Handling

If a loaded context contradicts the current codebase or situation:

1. Report the contradiction to the user with both the context content and the current reality.
2. Ask whether to update, delete, or keep as-is.
3. Do not modify or delete without explicit user approval.
