---
name: write-a-skill
description: Design and write focused agent skills with accurate triggers, minimal task-specific instructions, and optional on-demand references or examples. Use when creating, revising, or reviewing a skill's SKILL.md, frontmatter, workflow, or bundled resources.
---

# Writing Skills

Create a skill for a recognizable task, not for a broad topic. The skill should tell an agent when it applies, what to do, and what not to do without making every invocation pay for unrelated detail.

## Define the intended use

Use the request and repository conventions as the source of truth. Before drafting, identify:

- **Task and result** — the concrete work the skill enables and the expected output or changed artifact.
- **Triggers** — phrases, contexts, file types, or project states that should cause the skill to load.
- **Boundaries** — what is out of scope, which decisions belong to the user, and which side effects are not allowed by default.
- **Scenarios** — a representative normal request, a boundary or exception case, and any likely ambiguous or risky request.

Do not ask the user to repeat requirements already present in the request or repository. Ask only questions whose answers would materially change the scope, safety, or expected result; otherwise make a reasonable, visible assumption and continue.

## Draft the core skill

`SKILL.md` is required. Keep its instructions focused on the intended task:

1. Write frontmatter with a `name` matching the skill directory and a description that states the capability and concrete triggers. The description is the discovery surface, so use terms an agent will actually encounter.
2. Put the normal workflow first. Use actionable steps and explicit decision points rather than generic advice about being helpful.
3. State the expected output, important constraints, non-goals, and safety boundaries. Include only stable, task-relevant domain knowledge.
4. Add representative examples when they clarify inputs, choices, or expected results. Mark illustrative examples as such; an example is not evidence that the workflow was executed.

Prefer the smallest complete set of instructions over a catalogue of possibilities. Do not impose arbitrary line-count targets. Split content when doing so improves retrieval, maintenance, or separation of genuinely distinct domains—not merely to meet a size rule.

A description should make both capability and invocation clear. For example:

```yaml
---
name: pdf-extraction
description: Extract text and tables from PDF files and fill or merge PDF documents. Use when working with PDFs, forms, or document extraction.
---
```

## Use progressive disclosure

Keep information needed on every invocation in `SKILL.md`. Put detailed schemas, uncommon branches, long domain notes, and extra examples in optional reference or example files, and link to them from the relevant step so they can be read on demand.

Optional supporting files are justified by the task, not by the template:

- Add references or examples when they keep the core workflow focused or provide detail that is useful only for some requests.
- Add a script or other tool only when a deterministic, repeatable operation genuinely benefits from it.
- Add a subagent, custom tool, or other helper only when the task cannot be handled well without it.
- Do not create placeholder files or require extra files, tools, scripts, or agents just to demonstrate a structure.

Keep links easy to follow and shallow. Every relative link must point to a file that exists in the skill, and optional material must not be required for the basic workflow.

## Check scenarios and side effects

Walk through the draft against concrete scenarios before considering it complete. For each important scenario, record the starting context, the expected action or result, and what must not happen.

- **Normal case:** the common request follows a clear path to the intended result.
- **Boundary case:** missing input, an exception, or an out-of-scope request has an explicit response.
- **Ambiguity:** conflicting or underspecified intent leads to a focused clarification or a safe, stated assumption; it must not silently broaden the task.
- **Unwanted effects:** the skill does not imply unrequested writes, destructive changes, external calls, disclosure, or broad edits. Make confirmation and limits explicit where they matter.

These are design checks, not automatically behavioral tests. Do not present a walkthrough or an illustrative example as proof that the skill works in an actual environment.

## Review and validate

Perform a static review of the finished skill:

- Frontmatter is valid, uses the expected keys, and has a useful capability-plus-trigger description.
- Instructions are specific to the intended task, internally consistent, and free of questions the request already answered.
- Scenarios cover the normal path, meaningful boundaries, ambiguity, and relevant side effects.
- Optional references and examples are discoverable without loading them by default; all relative links resolve.
- Terminology, filenames, and any stated non-goals are consistent.

Static inspection can establish structure, wording, and link correctness only. Execute a scenario or an available test harness only when it actually exists and running it is appropriate; report exactly what was run. If nothing was executed, say so rather than claiming behavioral validation.
