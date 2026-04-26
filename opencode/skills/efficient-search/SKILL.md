---
name: efficient-search
description: Targeted search technique for efficient codebase and documentation exploration
license: MIT
compatibility: opencode
---

# Efficient Search Skill

Use this skill for practical, targeted exploration of codebases and documentation. It helps turn a vague research task into a short sequence of high-yield searches, selective reading, and evidence-based stopping.

This is a research/search technique only: do not modify files, implement code, or run destructive commands. Avoid commands that mutate project, user, production, or remote state.

## What this skill is for

- Finding relevant code, docs, config, tests, errors, commands, and examples quickly.
- Reducing broad keyword searching by starting from likely exact evidence.
- Deciding what to read deeply and when enough evidence has been gathered.

## Relationship to research-policy

- Use this skill under the boundaries and evidence priorities defined by `research-policy`.
- This skill does not decide whether a source is in scope or authoritative; it improves how to search already-allowed sources.
- If source scope or priority is unclear, apply `research-policy` first.

## Search hypotheses

Before searching, write 1-3 brief hypotheses:

- Likely evidence: where the answer should appear, such as implementation, docs, tests, config, logs, schema, lockfile, or command.
- Exact search handles: names, imports, config keys, route names, command names, package names, error text, or stack frames.
- Sufficient stop result: what evidence would be enough to answer without broader searching.

Revise hypotheses when early evidence disproves them.

## Query order

Search from most specific to broadest within the source boundaries and priority tier selected by `research-policy`:

1. Exact names from the user request.
2. Domain + role terms, such as `auth middleware`, `formatter config`, or `deploy command`.
3. Imports, package names, config keys, error text, route names, command names, exported symbols, and filenames.
4. Broad keywords only if targeted searches fail.

Prefer several precise searches over one broad search.

## Candidate classification

Classify results before reading deeply:

- Primary: likely determines the answer directly, such as current implementation, schema, official docs, test, or active config.
- Secondary: supports interpretation, such as callers, sibling examples, old docs, changelogs, or nearby utilities.
- Ignore: duplicates, generated output, unrelated matches, stale examples, or files outside the allowed scope.

Read primary candidates first. Use secondary candidates only to confirm usage, context, or contradictions.

## Read depth

Read progressively:

1. Locate filenames, imports, exports, headings, config keys, route definitions, and command definitions.
2. Skim nearby lines to understand the local pattern.
3. Deep-read only primary files or docs that determine the answer.

Do not deep-read every match. Escalate depth only when the current evidence cannot answer the question.
Do not deep-read additional primary candidates once one primary source plus required supporting evidence answers the question and the contradiction check finds no blocker.

## Minimum evidence sets

Use the smallest evidence set that supports the answer:

The listed evidence sets are sufficiency targets, not exhaustive checklists. Prefer the first authoritative source that determines the answer. In `A or B`, one is enough unless it conflicts or cannot answer the question.

- Behavior/pattern: implementation + caller/use site + test/config when available.
- Configuration syntax: current config + one authoritative syntax source, such as local schema/docs or a sibling config, + consuming command/script.
- Dependency/API usage: package version + Context7/MCP or version-aware official docs per `research-policy` + local usage.
- Bug/error: error text/log/stack trace + named code path + reproduction/test command when available. If stack-trace lines do not match source, do not infer missing code; treat it as possible stale build, transpilation, source-map, or version mismatch, then inspect the smallest bridge evidence such as generated output, source maps, build config, or the direct/indirect caller chain.

If part of the ideal set is unavailable, state the gap and the best next verification step.

## Contradiction check

Before finalizing, perform one targeted check for a likely alternative pattern or conflicting source.

Examples:

- JWT vs session authentication.
- Config A vs config B.
- Old API vs new API.
- Runtime command vs test command.
- Local wrapper vs direct dependency usage.

If a contradiction appears, inspect the minimum additional evidence needed to explain it.

## Stop rule

Stop when the minimum evidence set is satisfied and the contradiction check found no blocker. Do not continue broad searching only to increase confidence.

If the evidence remains incomplete, stop with a clear uncertainty and name the next best check instead of searching indefinitely.

## Output notes

- Report inspected files, docs, commands, and key evidence, not a raw search transcript.
- Separate confirmed facts from assumptions and uncertainties.
- Mention ignored or secondary evidence only when it affects confidence or contradicts the answer.
- Keep the answer concise and actionable.
