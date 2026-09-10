---
name: research
description: Investigate a focused question against high-trust primary sources, cite the evidence, and distinguish verified facts from inference. Use when the user wants research, documentation or API facts, or bounded reading before a decision; answer in conversation by default and save Markdown only when requested.
---

Investigate a bounded question and report enough evidence to answer it.

Follow the applicable `AGENTS.md` for routing, environment, permissions, and delegation; this skill does not define a separate orchestration path. Keep research read-only apart from a requested Markdown artifact. Do not change project configuration or global web tooling as part of research.

The research must:

1. Set the question's scope and a stopping condition before exploring. Investigate only what is needed to answer it, and stop when the evidence is sufficient; record relevant limits or open questions instead of expanding into adjacent work.
2. Use **primary sources** — official docs, source code, specs, first-party APIs, or authoritative project artifacts — and follow each material claim back to the source that owns it. Cite sources precisely, using URLs, paths and symbols, versions, commit IDs, or other stable identifiers as available. Use secondary material only to locate primary evidence or when no primary source is available, and label that limitation.
3. Answer in the conversation by default. Do not create a Markdown report merely because this skill was invoked. When the user or active workflow requests an artifact, write one Markdown file in the repository's existing notes location and convention; if none exists, choose a sensible location and say where. A delegated child also returns findings without creating an artifact unless one is explicitly requested.
4. Separate **verified facts**, **inferences or interpretations**, **recommendations**, and **unknowns or limitations**. State what was observed versus concluded, and never present an unverified claim or an unrun check as tested.
