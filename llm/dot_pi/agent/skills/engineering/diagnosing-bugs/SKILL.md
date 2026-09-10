---
name: diagnosing-bugs
description: Evidence-driven workflow for diagnosing bugs, regressions, flakiness, and surprising behavior. Use when debugging reported failures, wrong results, slowness, or intermittent behavior.
---

# Diagnosing Bugs

Use this workflow for incorrect results, failures, crashes, flaky behavior, and performance regressions. Treat the phases as a guide, not a fixed ceremony: scale the depth to the available evidence, risk, and complexity. A simple deterministic bug may need symptom confirmation, one hypothesis and check, a fix, and verification. A hard, intermittent, or performance bug may need a tighter loop, minimisation, competing hypotheses, and more measurements. Do not claim more than the evidence supports.

## Phase 1 — Confirm the symptom and scope

Start with the user's actual symptom, not a nearby error:

1. State the expected and actual behavior in observable terms: wrong value, exact error, missing side effect, latency, frequency, or resource use.
2. Capture the smallest useful context: input, caller, environment, version/build, configuration, and timing. Read `CONTEXT.md` or relevant ADRs when they exist and can change the interpretation of the path; avoid unrelated project history.
3. Try the user's steps or an available artifact when possible. Preserve the exact output, error, trace, or timing. Distinguish the reported symptom, a reproduced symptom, and a different failure.
4. Say what is confirmed and what remains provisional. A report, code reading, or static trace can motivate a hypothesis, but does not by itself confirm a cause.

Code reading and provisional hypotheses may come before a clean reproduction. Use them to choose inputs and seams for a better experiment; a reproduction is evidence to obtain, not a gate that forbids thinking.

## Phase 2 — Build or tighten a feedback loop

When a loop will clarify the issue, build the smallest agent-runnable check that reaches the affected path and asserts the **original symptom**. Depending on the bug, use:

- an existing or new regression/integration test;
- a CLI, HTTP, or fixture-driven command;
- a captured trace or payload replay;
- a browser check;
- a minimal harness; or
- a baseline/profile measurement for a performance issue.

For a straightforward failure, an existing test or command may already be enough; do not manufacture a harness. Tighten a useful loop by making setup faster, assertions specific, data isolated, and time/randomness controlled. A check that only says "it did not crash" is insufficient when the report concerns output, side effects, or speed.

When a reproduction exists, minimise it if that improves the signal: remove one input, caller, configuration value, or step at a time and rerun the check. Keep load-bearing elements. If it is already minimal, or minimisation would remove the workload characteristics of a flaky or performance issue, retain the original scenario instead.

For intermittent behavior, establish a baseline and retry or stress enough to distinguish the plausible explanations. There is no universal retry count, success percentage, or stress duration: choose a bounded, useful sample for the system and communicate attempts and failures when they affect the conclusion. Increase it only when the current evidence cannot distinguish the explanations; fixed seeds, controlled scheduling, or injected delays may make the signal clearer.

If the environment prevents an executable loop, use the strongest available artifact, static path analysis, or targeted measurement, state the limitation, and identify the next useful evidence. Do not call an untested explanation confirmed. Use `scripts/hitl-loop.template.sh` only when human interaction is genuinely unavoidable; prefer automation otherwise.

## Phase 3 — Choose falsifiable hypothesis(es)

Form the smallest set of plausible explanations needed to choose the next check. One well-supported hypothesis is enough when the evidence narrows the cause; add competing hypotheses when the path or evidence is ambiguous, the change is risky, or alternatives would lead to different fixes. Do not pad the list for ceremony.

For each hypothesis worth testing, state:

- the suspected mechanism and the observation motivating it;
- a prediction that would differ if it were true; and
- the cheapest discriminating test or measurement.

Use this shape:

> If **X** is causing the symptom, changing or observing **Y** should produce **Z**; if **X** is not the cause, **Z** should not change (or a different result should appear).

Rank alternatives by evidence, reach, and cost to test. Keep hypotheses distinct from confirmed causes: a plausible mechanism or matching stack frame is not confirmation. Do not wait for approval to run an inexpensive probe.

## Phase 4 — Run discriminating tests and measurements

Test the selected hypothesis or hypotheses rather than collecting undirected evidence:

1. Choose the cheapest probe that separates the remaining explanations.
2. Change one relevant variable at a time where practical, and tie the probe to a stated prediction.
3. Prefer a debugger, REPL, controlled input/configuration, or existing measurement. Add targeted boundary logs only when they answer a specific question; tag temporary logs with a unique prefix such as `[DEBUG-a4f2]` so they can be removed reliably.
4. For a performance issue, measure a comparable baseline before changing code. Use the same workload and environment, inspect distributions or profiles/query plans where relevant, and distinguish noise from a meaningful change.
5. Update the working explanation after each probe. Mark an explanation supported, ruled out, or inconclusive as appropriate, and choose a new probe if the result changes the search.

A cause is confirmed only when the evidence explains the original symptom and a causal change, controlled comparison, or end-to-end test shows the predicted effect. Correlation, a passing shallow test, or a plausible stack frame is not enough. If no cause can be confirmed, say so and preserve the strongest available evidence and next discriminating check in the normal task context.

## Phase 5 — Apply the fix and lock in the behavior

Choose the smallest fix supported by the evidence. Avoid unrelated cleanup and speculative changes.

Where a correct seam exists, encode the minimised original scenario as a regression test before the fix, observe it fail on the old behavior, apply the fix, and observe it pass. The test must exercise the real call chain and assert the user's behavior at a meaningful public seam—not an implementation detail or a shallow caller that cannot reproduce the failure.

If no correct automated seam exists, keep the best runnable probe or measurement and state that limitation in the normal change or task notes; do not create a false-confidence test. Run the focused regression check and relevant surrounding tests after the fix. A test that passes only because the symptom was hidden or the input changed does not establish the fix.

## Phase 6 — Verify the original scenario and clean up

When an intervention or fix is being delivered, return to the unminimised scenario that motivated the work:

- Re-run the check against the original input, caller, configuration, and environment where possible, and assert the original expected behavior—not merely process success.
- For intermittent bugs, use a comparable retry/stress sample and compare it with the baseline. For performance bugs, repeat the comparable measurement and report the observed change and its conditions.
- Check relevant neighboring behavior so the fix did not trade the original symptom for a directly related regression.
- State whether the original symptom is **verified fixed**, **not reproduced but unverified**, or **still present**, with the command and meaningful result. Do not claim more than the evidence supports.
- Remove temporary `[DEBUG-...]` instrumentation, throwaway harnesses, fixtures, and prototypes; retain intentional regression tests and useful permanent diagnostics. Search for the debug prefix and rerun relevant checks after cleanup.

No separate report, postmortem, ledger, or tracking artifact is required. Put a concise outcome in the normal task, review, or handoff only when that context already calls for it: observed symptom, confirmed or unresolved cause, fix, verification, and remaining limitations.
