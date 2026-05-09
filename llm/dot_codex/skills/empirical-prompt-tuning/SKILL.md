---
name: empirical-prompt-tuning
description: Empirically improve agent-facing instructions by running unbiased executors, measuring results, and iterating until improvement plateaus.
---

# Empirical Prompt Tuning

Use this after creating or substantially revising agent-facing instructions such as skills, commands, task prompts, or code-generation prompts, or when agent behavior suggests instruction ambiguity.

The core idea: the author cannot reliably judge their own prompt. When Codex agent invocation is available, have a fresh executor run realistic scenarios, evaluate both the executor's self-report and fixed instruction-side metrics, then make the smallest prompt change and repeat until improvement plateaus. If unavailable, perform only a static/simulation audit in the main session, report delegation unavailable, and do not claim empirical validation.

## Workflow

0. Check that frontmatter `description` and body scope match before empirical runs.
1. Prepare 2-3 realistic scenarios and a fixed requirements checklist for each. Include at least one `[critical]` item per scenario.
2. If Codex agent invocation is available, use a fresh, unbiased executor for each scenario. Do not substitute self-review for empirical evaluation.
3. Ask the executor to follow the target prompt and return: output, checklist achievement, unclear points, discretionary choices, and retries.
4. Evaluate success/failure, checklist accuracy, steps/tool use when available, elapsed duration when available, retries, unclear points, and discretionary choices.
5. Apply the smallest prompt change that addresses a concrete failure or ambiguity. State which checklist criterion the change targets.
6. Re-run with fresh executors. Do not reuse a previous executor as the empirical signal.
7. If executor delegation is unavailable, stop empirical runs immediately, run a static/simulation audit in the main session if useful, label results `simulation-only: empirical evaluation skipped because delegation unavailable`, and avoid claims based on real execution.
8. Otherwise, stop after two consecutive iterations with no new unclear points and only small metric movement.

## Output format

For each iteration, report scenario results, success/failure, accuracy, steps/duration when available, retries, new unclear points, discretionary choices, next prompt change, convergence status, and whether results are empirical or simulation-only.
