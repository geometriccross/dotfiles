---
name: efficient-search
description: Targeted search technique for efficient codebase and documentation exploration
license: MIT
---

# Efficient Search Skill

Use this for targeted exploration of codebases and documentation. It turns vague research into high-yield searches, selective reading, and evidence-based stopping. Do not modify files or run destructive commands.

## Method

1. Write 1-3 search hypotheses: likely evidence location, exact handles, and sufficient stop result.
2. Search from most specific to broadest within the source boundaries for the current role. If acting as `searcher`, apply `research-policy`: external sources only, no local project inspection, and no implementation-change recommendations. If a separate searcher is unavailable, do applicable searching in the main session and report delegation unavailable. Otherwise, inspect local files directly and use external docs only when needed.
3. Classify candidates before deep reading: primary, secondary, ignore.
4. Read progressively: locate names/headings/config first, skim nearby lines, deep-read only primary sources that determine the answer.
5. Satisfy the smallest evidence set: implementation plus caller/test/config for behavior; current config plus authoritative syntax source for configuration; package version plus official or Context7/MCP docs when available for dependency/API usage; error text plus named code path plus reproduction for bugs.
6. Perform one contradiction check for a likely alternative pattern.
7. Stop when the evidence set is sufficient and no blocker appears.

Use commands only when they materially improve search accuracy or validation, and avoid destructive or state-mutating commands unless explicitly approved and safe in the current sandbox.

Report inspected files/docs/commands and key evidence, separating confirmed facts from assumptions and uncertainty.
