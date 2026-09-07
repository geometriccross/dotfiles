---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork done before deciding something.
---

Investigate the question and capture durable findings.

Execution follows the Execution Mode of AGENTS.md, including its environment and permission requirements. Research directly by default; use `herdr_delegate` only when that policy permits it. Children must not delegate again. If delegation fails, continue directly only when independent investigation is not required; otherwise report the blocker. Never reimplement orchestration manually.

Before delegating, confirm the selected role's tools and scope support the sources and required report. A local read-only scout is not automatically equipped for web research. Keep source collection read-only; explicitly allow the requested report artifact. Do not change project configuration as part of research.

Whether delegated or direct, the research must:

1. Investigate against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
4. Separate verified facts, interpretations, and recommendations. Never present an unverified claim as tested.
