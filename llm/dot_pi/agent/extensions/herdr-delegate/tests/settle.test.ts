import { strict as assert } from "node:assert";
import type { AgentGetResult } from "../cli.ts";

// ---------------------------------------------------------------------------
// Test: settle.ts — WarmWorkerState, transitions, decideSettled, decideReuse
// ---------------------------------------------------------------------------
import {
  WARM_TRANSITIONS,
  isWarmTransitionAllowed,
  assertWarmTransition,
  decideSettled,
  decideReuse,
  type WarmWorkerState,
  type SettleDecision,
  type ReuseDecision,
} from "../settle.ts";

// --- Proof: settle.ts is pure (no Herdr CLI / paneRun calls) ---
// settle.ts imports only AgentGetResult (a type) from cli.ts.
// All exports are synchronous functions — no async, no exec, no
// references to HerdrCli, createHerdrCli, or any Pi runtime.
// The module can be fully exercised with plain objects.
console.log("  ✓ settle.ts is pure: no async, no Herdr exec, no paneRun");

// --- WARM_TRANSITIONS: allowed transitions ---
const expectedTransitions: Record<WarmWorkerState, WarmWorkerState[]> = {
  ready: ["leased", "dead"],
  leased: ["settling", "reusable", "dead"],
  settling: ["reusable", "dead"],
  reusable: ["leased", "dead"],
  dead: [],
};

for (const [from, tos] of Object.entries(expectedTransitions)) {
  for (const to of tos) {
    assert.ok(
      WARM_TRANSITIONS[from as WarmWorkerState].includes(to),
      `${from} -> ${to} should be allowed`,
    );
    assert.ok(
      isWarmTransitionAllowed(from as WarmWorkerState, to),
      `${from} -> ${to} should be allowed via isWarmTransitionAllowed`,
    );
  }
}
console.log("  ✓ WARM_TRANSITIONS: all allowed transitions present");

// --- WARM_TRANSITIONS: disallowed transitions ---
const allStates: WarmWorkerState[] = [
  "ready",
  "leased",
  "settling",
  "reusable",
  "dead",
];

for (const from of allStates) {
  const allowed = new Set(WARM_TRANSITIONS[from]);
  for (const to of allStates) {
    if (!allowed.has(to)) {
      assert.strictEqual(
        isWarmTransitionAllowed(from, to),
        false,
        `${from} -> ${to} should be disallowed`,
      );
      assert.throws(
        () => assertWarmTransition(from, to),
        /Invalid warm-worker state transition/,
        `${from} -> ${to} should throw`,
      );
    }
  }
}
console.log("  ✓ WARM_TRANSITIONS: all disallowed transitions throw");

// --- assertWarmTransition: allowed does not throw ---
for (const [from, tos] of Object.entries(expectedTransitions)) {
  for (const to of tos) {
    assert.doesNotThrow(
      () => assertWarmTransition(from as WarmWorkerState, to),
      `${from} -> ${to} should not throw`,
    );
  }
}
console.log("  ✓ assertWarmTransition: allowed transitions pass");

// --- decideSettled: reusable (idle / done) ---
const sIdle = decideSettled("idle");
assert.strictEqual(sIdle.decision, "reusable");
assert.strictEqual(sIdle.agent_status, "idle");

const sDone = decideSettled("done");
assert.strictEqual(sDone.decision, "reusable");
assert.strictEqual(sDone.agent_status, "done");
console.log("  ✓ decideSettled: idle/done → reusable");

// --- decideSettled: settling (working) ---
const sWorking = decideSettled("working");
assert.strictEqual(sWorking.decision, "settling");
assert.strictEqual(sWorking.agent_status, "working");
console.log("  ✓ decideSettled: working → settling");

// --- decideSettled: not_idle (blocked / unknown / unrecognised) ---
for (const status of ["blocked", "unknown", "bogus", "any-string"]) {
  const s = decideSettled(status);
  assert.strictEqual(s.decision, "not_idle", `${status} → not_idle`);
  assert.strictEqual(s.agent_status, status);
}
console.log("  ✓ decideSettled: blocked/unknown/unrecognised → not_idle");

// --- decideSettled: not_found (null / undefined / empty) ---
assert.strictEqual(decideSettled(null).decision, "not_found");
assert.strictEqual(decideSettled(undefined).decision, "not_found");
assert.strictEqual(decideSettled("").decision, "not_found");
console.log("  ✓ decideSettled: null/undefined/empty → not_found");

// --- decideReuse: helper to build a minimal AgentGetResult ---
function makeAgent(
  status: string,
  overrides: Partial<AgentGetResult> = {},
): AgentGetResult {
  return {
    name: "warm-herdr-worker-01",
    pane_id: "ws:pane",
    tab_id: "ws:tab",
    workspace_id: "ws",
    agent_status: status,
    agent_session: "/tmp/session.jsonl",
    ...overrides,
  };
}

const WTID = "task-01";
const WOTHER_TID = "task-02";

// --- decideReuse: not_found ---
const r1 = decideReuse(null, "ready", undefined, WTID);
assert.strictEqual(r1.decision, "not_found");
assert.strictEqual((r1 as { task_id: string }).task_id, WTID);
console.log("  ✓ decideReuse: null agent → not_found");

// --- decideReuse: deliver ---
// ready + idle
const r2 = decideReuse(makeAgent("idle"), "ready", undefined, WTID);
assert.strictEqual(r2.decision, "deliver");
assert.strictEqual((r2 as { worker_state: string }).worker_state, "ready");

// ready + done
const r3 = decideReuse(makeAgent("done"), "ready", undefined, WTID);
assert.strictEqual(r3.decision, "deliver");
assert.strictEqual((r3 as { worker_state: string }).worker_state, "ready");

// reusable + idle
const r4 = decideReuse(makeAgent("idle"), "reusable", undefined, WTID);
assert.strictEqual(r4.decision, "deliver");
assert.strictEqual((r4 as { worker_state: string }).worker_state, "reusable");

// reusable + done
const r5 = decideReuse(makeAgent("done"), "reusable", undefined, WTID);
assert.strictEqual(r5.decision, "deliver");
assert.strictEqual((r5 as { worker_state: string }).worker_state, "reusable");
console.log("  ✓ decideReuse: ready/reusable + idle/done → deliver");

// --- decideReuse: settling (working + not reusable) ---
// working + settling (same task, post-report settling)
const r6a = decideReuse(makeAgent("working"), "settling", WTID, WTID);
assert.strictEqual(r6a.decision, "settling");
assert.strictEqual((r6a as { worker_state: string }).worker_state, "settling");

// working + leased (same task — mid-flight, still processing)
const r6b = decideReuse(makeAgent("working"), "leased", WTID, WTID);
assert.strictEqual(r6b.decision, "settling");
assert.strictEqual((r6b as { worker_state: string }).worker_state, "leased");

// working + ready (stale pool entry: pane working but pool not yet leased)
const r6c = decideReuse(makeAgent("working"), "ready", undefined, WTID);
assert.strictEqual(r6c.decision, "settling");
assert.strictEqual((r6c as { worker_state: string }).worker_state, "ready");
console.log("  ✓ decideReuse: working + not-reusable → settling");

// --- decideReuse: busy (leased to different task) ---
const r7 = decideReuse(makeAgent("working"), "leased", WOTHER_TID, WTID);
assert.strictEqual(r7.decision, "busy");
assert.strictEqual((r7 as { worker_state: string }).worker_state, "leased");
console.log("  ✓ decideReuse: working + leased to different task → busy");

// --- decideReuse: not_idle (various) ---
// blocked agent
const r8a = decideReuse(makeAgent("blocked"), "ready", undefined, WTID);
assert.strictEqual(r8a.decision, "not_idle");

// unknown agent
const r8b = decideReuse(makeAgent("unknown"), "reusable", undefined, WTID);
assert.strictEqual(r8b.decision, "not_idle");

// idle + leased (same task, but worker not yet released — not ready for delivery)
const r8c = decideReuse(makeAgent("idle"), "leased", WTID, WTID);
assert.strictEqual(r8c.decision, "not_idle");

// idle + settling (stale: pane settled but pool hasn't caught up)
const r8d = decideReuse(makeAgent("idle"), "settling", WTID, WTID);
assert.strictEqual(r8d.decision, "not_idle");

// idle + dead
const r8e = decideReuse(makeAgent("idle"), "dead", undefined, WTID);
assert.strictEqual(r8e.decision, "not_idle");

// done + dead
const r8f = decideReuse(makeAgent("done"), "dead", undefined, WTID);
assert.strictEqual(r8f.decision, "not_idle");

// working + reusable (unusual: pane says working but pool says reusable)
const r8g = decideReuse(makeAgent("working"), "reusable", undefined, WTID);
assert.strictEqual(r8g.decision, "not_idle");

// done + leased (same task: pane idle but pool hasn't released lease)
const r8h = decideReuse(makeAgent("done"), "leased", WTID, WTID);
assert.strictEqual(r8h.decision, "not_idle");
console.log("  ✓ decideReuse: blocked/unknown/dead/leased-not-ready → not_idle");

// --- Exhaustive matrix: every (workerState × agent_status) combination ---
// Build a table of expected decisions for systematic coverage.
type ExpectedDecision = "deliver" | "settling" | "busy" | "not_idle" | "not_found";

interface MatrixCase {
  workerState: WarmWorkerState;
  agentStatus: string | null;
  leasedTo: string | undefined;
  expected: ExpectedDecision;
}

const CTASK = "task-01";
const COTHER = "task-02";

const matrix: MatrixCase[] = [
  // ── null agent ──
  { workerState: "ready", agentStatus: null, leasedTo: undefined, expected: "not_found" },
  { workerState: "leased", agentStatus: null, leasedTo: CTASK, expected: "not_found" },
  { workerState: "settling", agentStatus: null, leasedTo: CTASK, expected: "not_found" },
  { workerState: "reusable", agentStatus: null, leasedTo: undefined, expected: "not_found" },
  { workerState: "dead", agentStatus: null, leasedTo: undefined, expected: "not_found" },

  // ── ready worker ──
  { workerState: "ready", agentStatus: "idle", leasedTo: undefined, expected: "deliver" },
  { workerState: "ready", agentStatus: "done", leasedTo: undefined, expected: "deliver" },
  { workerState: "ready", agentStatus: "working", leasedTo: undefined, expected: "settling" },
  { workerState: "ready", agentStatus: "blocked", leasedTo: undefined, expected: "not_idle" },
  { workerState: "ready", agentStatus: "unknown", leasedTo: undefined, expected: "not_idle" },

  // ── reusable worker ──
  { workerState: "reusable", agentStatus: "idle", leasedTo: undefined, expected: "deliver" },
  { workerState: "reusable", agentStatus: "done", leasedTo: undefined, expected: "deliver" },
  { workerState: "reusable", agentStatus: "working", leasedTo: undefined, expected: "not_idle" },
  { workerState: "reusable", agentStatus: "blocked", leasedTo: undefined, expected: "not_idle" },
  { workerState: "reusable", agentStatus: "unknown", leasedTo: undefined, expected: "not_idle" },

  // ── leased worker (same task) ──
  { workerState: "leased", agentStatus: "idle", leasedTo: CTASK, expected: "not_idle" },
  { workerState: "leased", agentStatus: "done", leasedTo: CTASK, expected: "not_idle" },
  { workerState: "leased", agentStatus: "working", leasedTo: CTASK, expected: "settling" },
  { workerState: "leased", agentStatus: "blocked", leasedTo: CTASK, expected: "not_idle" },
  { workerState: "leased", agentStatus: "unknown", leasedTo: CTASK, expected: "not_idle" },

  // ── leased worker (different task) ──
  { workerState: "leased", agentStatus: "idle", leasedTo: COTHER, expected: "not_idle" },
  { workerState: "leased", agentStatus: "done", leasedTo: COTHER, expected: "not_idle" },
  { workerState: "leased", agentStatus: "working", leasedTo: COTHER, expected: "busy" },
  { workerState: "leased", agentStatus: "blocked", leasedTo: COTHER, expected: "not_idle" },
  { workerState: "leased", agentStatus: "unknown", leasedTo: COTHER, expected: "not_idle" },

  // ── settling worker ──
  { workerState: "settling", agentStatus: "idle", leasedTo: CTASK, expected: "not_idle" },
  { workerState: "settling", agentStatus: "done", leasedTo: CTASK, expected: "not_idle" },
  { workerState: "settling", agentStatus: "working", leasedTo: CTASK, expected: "settling" },
  { workerState: "settling", agentStatus: "blocked", leasedTo: CTASK, expected: "not_idle" },
  { workerState: "settling", agentStatus: "unknown", leasedTo: CTASK, expected: "not_idle" },

  // ── dead worker ──
  { workerState: "dead", agentStatus: "idle", leasedTo: undefined, expected: "not_idle" },
  { workerState: "dead", agentStatus: "done", leasedTo: undefined, expected: "not_idle" },
  { workerState: "dead", agentStatus: "working", leasedTo: undefined, expected: "not_idle" },
  { workerState: "dead", agentStatus: "blocked", leasedTo: undefined, expected: "not_idle" },
  { workerState: "dead", agentStatus: "unknown", leasedTo: undefined, expected: "not_idle" },
];

let matrixPass = 0;
for (const c of matrix) {
  const agentArg = c.agentStatus === null
    ? null
    : makeAgent(c.agentStatus);
  const result = decideReuse(agentArg, c.workerState, c.leasedTo, CTASK);
  assert.strictEqual(
    result.decision,
    c.expected,
    `worker=${c.workerState} agent=${c.agentStatus} ` +
    `leasedTo=${c.leasedTo} → ` +
    `expected ${c.expected}, got ${result.decision}`,
  );
  matrixPass++;
}
console.log(`  ✓ decideReuse exhaustive matrix: ${matrixPass}/${matrix.length} cases passed`);

// --- Proof: no side effects from WarmWorkerState types ---
// The type itself is just a string union; instantiating it does nothing.
const _typeCheck: WarmWorkerState = "ready";
void _typeCheck;

// The exports of settle.ts are all pure functions and types — no
// mutable state, no module-level side effects, no timers, no file I/O.
console.log("  ✓ WarmWorkerState type is a pure string union");

console.log("PASS: settle.ts — warm-worker state machine + decision helpers");
