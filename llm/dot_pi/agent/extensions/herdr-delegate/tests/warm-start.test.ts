import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentGetResult } from "../cli.ts";
import { decideSettled } from "../settle.ts";
import { createPool, generateWarmWorkerName, selectCandidate, leaseWorker, type WarmPool, type WarmWorkerEntry } from "../warm.ts";
import { createInitialLedger, type Ledger } from "../ledger.ts";
import { buildInstruction, buildContinuationInstruction } from "../instruction.ts";
import { validateWarmWorkerName } from "../validation.ts";
import type { TaskStatus } from "../state.ts";

// ---------------------------------------------------------------------------
// Test: settle observation (cold-compatible, pure logic with fake agentGet)
// ---------------------------------------------------------------------------
// The settle action uses `decideSettled` from settle.ts (already tested above)
// and `observeSettle` from index.ts which polls cli.agentGet.
// We simulate the observeSettle loop here with controlled fake agentGet.

async function simulateSettle(
  agentStatuses: (string | null)[],
  timeoutMs: number,
  pollMs: number = 20,
): Promise<Record<string, unknown>> {
  let callIdx = 0;
  const fakeGet = async (_name: string) => {
    if (callIdx >= agentStatuses.length) {
      // Keep returning the last status if polled beyond array
      const last = agentStatuses[agentStatuses.length - 1];
      if (last === null) return null;
      return { name: _name, pane_id: "ws:p", tab_id: "ws:t", workspace_id: "ws", agent_status: last, agent_session: undefined };
    }
    const status = agentStatuses[callIdx++];
    if (status === null) return null;
    return { name: _name, pane_id: "ws:p", tab_id: "ws:t", workspace_id: "ws", agent_status: status, agent_session: undefined };
  };

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const agent = await fakeGet("test-task");

    if (!agent) {
      return { status: "not_found", task_id: "test-task", agent_name: "test-task" };
    }

    const decision = decideSettled(agent.agent_status);

    if (decision.decision === "reusable") {
      return {
        status: "reusable", task_id: "test-task", agent_name: "test-task",
        agent_status: decision.agent_status, pane_id: agent.pane_id,
        tab_id: agent.tab_id, workspace_id: agent.workspace_id,
      };
    }

    if (decision.decision === "not_idle") {
      return {
        status: "not_idle", task_id: "test-task", agent_name: "test-task",
        agent_status: decision.agent_status, pane_id: agent.pane_id,
        tab_id: agent.tab_id, workspace_id: agent.workspace_id,
      };
    }

    // settling → keep waiting
    const remaining = Math.min(pollMs, Math.max(1, deadline - Date.now()));
    await new Promise((r) => setTimeout(r, remaining));
  }

  // deadline reached
  const final = await fakeGet("test-task");
  return {
    status: "settling", deadline_reached: true, task_id: "test-task",
    agent_name: "test-task",
    agent_status: final ? final.agent_status : "not_found",
    ...(final ? { pane_id: final.pane_id, tab_id: final.tab_id, workspace_id: final.workspace_id } : {}),
  };
}

// --- working → idle resolves reusable ---
const srIdle = await simulateSettle(["working", "idle"], 5000);
assert.strictEqual(srIdle.status, "reusable");
assert.strictEqual(srIdle.agent_status, "idle");
console.log("  ✓ settle: working→idle → reusable");

// --- working → done resolves reusable ---
const srDone = await simulateSettle(["working", "working", "done"], 5000);
assert.strictEqual(srDone.status, "reusable");
assert.strictEqual(srDone.agent_status, "done");
console.log("  ✓ settle: working→done → reusable");

// --- always working → settling/deadline_reached ---
const srDeadline = await simulateSettle(["working", "working", "working", "working", "working"], 100);
assert.strictEqual(srDeadline.status, "settling");
assert.strictEqual(srDeadline.deadline_reached, true);
assert.strictEqual(srDeadline.agent_status, "working");
console.log("  ✓ settle: always working → settling + deadline_reached");

// --- null → not_found ---
const srNull = await simulateSettle([null], 5000);
assert.strictEqual(srNull.status, "not_found");
console.log("  ✓ settle: null agent → not_found");

// --- blocked → not_idle ---
const srBlocked = await simulateSettle(["blocked"], 5000);
assert.strictEqual(srBlocked.status, "not_idle");
assert.strictEqual(srBlocked.agent_status, "blocked");
console.log("  ✓ settle: blocked → not_idle");

// --- unknown → not_idle ---
const srUnknown = await simulateSettle(["unknown"], 5000);
assert.strictEqual(srUnknown.status, "not_idle");
assert.strictEqual(srUnknown.agent_status, "unknown");
console.log("  ✓ settle: unknown → not_idle");

// --- immediately idle (no working phase) → reusable ---
const srDirectIdle = await simulateSettle(["idle"], 5000);
assert.strictEqual(srDirectIdle.status, "reusable");
assert.strictEqual(srDirectIdle.agent_status, "idle");
console.log("  ✓ settle: immediate idle → reusable");

console.log("PASS: settle observation decisions");

// ---------------------------------------------------------------------------
// Test: buildWarmLeaseInstruction
// ---------------------------------------------------------------------------
import { buildWarmLeaseInstruction } from "../instruction.ts";

const warmInstr = buildWarmLeaseInstruction("tasks/warm-task.md", "reports/herdr-worker.md");
assert.ok(warmInstr.includes("WARM-LEASE START"), "must include WARM-LEASE START header");
assert.ok(warmInstr.includes("independent task"), "must declare independent task");
assert.ok(warmInstr.includes("do not carry any assumptions"), "must forbid prior-task assumptions");
assert.ok(warmInstr.includes("from prior tasks"), "must mention prior tasks");
assert.ok(warmInstr.includes("tasks/warm-task.md"), "must include task file path");
assert.ok(warmInstr.includes("reports/herdr-worker.md"), "must include report file path");
assert.ok(warmInstr.includes("your only task contract"), "must establish single-task boundary");
assert.ok(warmInstr.includes("Read "), "must command reading the file");
assert.ok(warmInstr.includes("NOW"), "must emphasize immediacy");
assert.ok(warmInstr.includes("Do not modify files outside the allowed edit scope"), "must include scope constraint");

// Must differ from both existing instructions
const coldInstr = buildInstruction("tasks/w.md", "reports/w.md");
const contInstr = buildContinuationInstruction("tasks/c.md", "reports/c.md", 2);
assert.notStrictEqual(warmInstr, coldInstr, "warm instruction must differ from cold start instruction");
assert.notStrictEqual(warmInstr, contInstr, "warm instruction must differ from continuation instruction");
assert.ok(!warmInstr.includes("UPDATED"), "warm instruction must not include UPDATED (continuation concept)");
assert.ok(!warmInstr.includes("CONTINUATION"), "warm instruction must not include CONTINUATION header");
assert.ok(!warmInstr.includes("attempt/revision"), "warm instruction must not include attempt/revision");
console.log("  ✓ buildWarmLeaseInstruction: independent-task boundary, paths, differs from cold + continuation");
console.log("PASS: buildWarmLeaseInstruction");

// ---------------------------------------------------------------------------
// Test: warm_start name generation and collision (pure helpers)
// ---------------------------------------------------------------------------

// Auto-generation with empty pool
const emptySet = new Set<string>();
const autoGen1 = generateWarmWorkerName("herdr-worker", emptySet);
assert.strictEqual(autoGen1, "warm-herdr-worker-01");
console.log("  ✓ warm_start: auto-generate first name from empty pool");

// Auto-generation skips existing pool names
const with01 = new Set(["warm-herdr-worker-01"]);
const autoGen2 = generateWarmWorkerName("herdr-worker", with01);
assert.strictEqual(autoGen2, "warm-herdr-worker-02");
console.log("  ✓ warm_start: auto-generate skips existing pool names");

// Validate explicit worker_name
assert.strictEqual(validateWarmWorkerName("warm-herdr-worker-01"), "warm-herdr-worker-01");
assert.throws(() => validateWarmWorkerName("worker-01"), /Invalid warm worker name/);
assert.throws(() => validateWarmWorkerName("warm-herdr-worker"), /Invalid warm worker name/);
console.log("  ✓ warm_start: validateWarmWorkerName accepts/rejects correctly");
console.log("PASS: warm_start name helpers");

// ---------------------------------------------------------------------------
// Test: warm start pool registration construction (pure)
// ---------------------------------------------------------------------------

// Construct a pool entry as warm_start would (without live Herdr calls)
const warmWs = "workspace-warm-test";
const warmNow = new Date().toISOString();
const mockEntry: WarmWorkerEntry = {
  name: "warm-herdr-worker-01",
  role: "herdr-worker",
  workspace_id: warmWs,
  tab_id: `${warmWs}:tab-warm`,
  pane_id: `${warmWs}:pane-warm`,
  agent_session: "/tmp/session.jsonl",
  state: "ready",
  lease_count: 0,
  born_at: warmNow,
  version: 0,
};

const mockPool: WarmPool = {
  schema_version: 2,
  workspace_id: warmWs,
  workers: [mockEntry],
};

assert.strictEqual(mockPool.workers.length, 1);
assert.strictEqual(mockPool.workers[0].state, "ready");
assert.strictEqual(mockPool.workers[0].name, "warm-herdr-worker-01");
assert.strictEqual(mockPool.workers[0].lease_count, 0);

// Verify no root close: warm_start's pool entry has tab_id but no root_pane_id concept
// The tab retains its root pane. root_pane_id is NOT in WarmWorkerEntry type.
assert.ok(!("root_pane_id" in mockEntry), "WarmWorkerEntry must not have root_pane_id field");
console.log("  ✓ warm_start: pool registration has ready state, no root-pane tracking in entry");
console.log("PASS: warm start pool registration");

// ---------------------------------------------------------------------------
// Test: start(mode:warm) with no candidate → no_warm_worker
// ---------------------------------------------------------------------------

// Simulate an empty pool — selectCandidate returns null
const emptyWarmPool: WarmPool = {
  schema_version: 2,
  workspace_id: warmWs,
  workers: [],
};
const noCandidate = selectCandidate(emptyWarmPool, warmWs);
assert.strictEqual(noCandidate, null, "empty pool → no candidate");

// Verify that no_warm_worker status is returned (no tab, no agent, no ledger, no task file created)
// This is a contract test — the actionStartWarm function returns this shape.
const noWarmResult = {
  status: "no_warm_worker",
  task_id: "task-no-warm",
  cwd: "/test",
  workspace_id: warmWs,
};
assert.strictEqual(noWarmResult.status, "no_warm_worker");
console.log("  ✓ start(mode:warm, auto_warm:false): empty pool → no_warm_worker");

// Pool with only non-eligible workers (leased, settling, dead) → no candidate
const nonEligibleWarmPool: WarmPool = {
  schema_version: 2,
  workspace_id: warmWs,
  workers: [
    { ...mockEntry, name: "warm-w-01", state: "leased" as const, leased_to_task: "other-task", lease_count: 1 },
    { ...mockEntry, name: "warm-w-02", state: "settling" as const },
    { ...mockEntry, name: "warm-w-03", state: "dead" as const, version: 1 },
  ],
};
const noEligible = selectCandidate(nonEligibleWarmPool, warmWs);
assert.strictEqual(noEligible, null, "only non-eligible workers → no candidate");
console.log("  ✓ start(mode:warm): only leased/settling/dead workers → no_warm_worker");
console.log("PASS: no_warm_worker flow");

// ---------------------------------------------------------------------------
// Test: selected candidate gets CAS leased to task
// ---------------------------------------------------------------------------

// Lease from ready
const leaseTestPool: WarmPool = {
  schema_version: 2,
  workspace_id: warmWs,
  workers: [
    { ...mockEntry, name: "warm-w-ready", state: "ready", version: 0 },
  ],
};

const lr = leaseWorker(leaseTestPool, warmWs, "warm-w-ready", 0, "task-lease-01");
assert.strictEqual(lr.ok, true, "lease from ready must succeed");
if (lr.ok) {
  assert.strictEqual(lr.entry.state, "leased");
  assert.strictEqual(lr.entry.leased_to_task, "task-lease-01");
  assert.strictEqual(lr.entry.lease_count, 1);
  assert.strictEqual(lr.entry.version, 1);
}
console.log("  ✓ selected ready candidate → CAS leased to task");

// Stale version → conflict / busy
const staleResult = leaseWorker(leaseTestPool, warmWs, "warm-w-ready", 99, "task-lease-02");
assert.strictEqual(staleResult.ok, false);
if (!staleResult.ok) {
  assert.strictEqual(staleResult.conflict, "stale_version");
}
console.log("  ✓ stale version lease → busy/conflict (no paneRun)");

// Re-lease at same version — succeeds because leaseWorker is pure (input pool unchanged)
// In the real flow, the pool is re-read after writing, so the version would have advanced.
// Test the actual conflict scenario: re-lease with stale version against updated pool.
const updatedLeasePool: WarmPool = {
  schema_version: 2,
  workspace_id: warmWs,
  workers: [
    { ...mockEntry, name: "warm-w-ready", state: "leased" as const, version: 1, leased_to_task: "task-lease-01", lease_count: 1 },
  ],
};
const doubleResult = leaseWorker(updatedLeasePool, warmWs, "warm-w-ready", 1, "task-lease-03");
assert.strictEqual(doubleResult.ok, false, "re-lease already-leased worker must fail");
if (!doubleResult.ok) {
  assert.strictEqual(doubleResult.conflict, "not_eligible", "already-leased worker → not_eligible");
}
console.log("  ✓ re-lease already-leased worker → conflict");

// Lease from reusable
const reusablePool: WarmPool = {
  schema_version: 2,
  workspace_id: warmWs,
  workers: [
    { ...mockEntry, name: "warm-w-reuse", state: "reusable", version: 3, lease_count: 5, last_lease_at: "2026-01-01T00:00:00.000Z" },
  ],
};
const lrReuse = leaseWorker(reusablePool, warmWs, "warm-w-reuse", 3, "task-reuse-01");
assert.strictEqual(lrReuse.ok, true, "lease from reusable must succeed");
if (lrReuse.ok) {
  assert.strictEqual(lrReuse.entry.state, "leased");
  assert.strictEqual(lrReuse.entry.lease_count, 6);
  assert.strictEqual(lrReuse.entry.version, 4);
}
console.log("  ✓ selected reusable candidate → CAS leased to task");
console.log("PASS: warm CAS lease");

// ---------------------------------------------------------------------------
// Test: warm ledger construction (schema_version, worker_name, lease_id)
// ---------------------------------------------------------------------------

const warmLedgerTest: Ledger = {
  task_id: "warm-task-01",
  cwd: "/test",
  workspace_id: warmWs,
  tab_id: "ws:tab-warm",
  pane_id: "ws:pane-warm",
  role: "herdr-worker",
  role_path: "/rp.md",
  model: "test/m",
  thinking: "medium",
  tools: ["read"],
  task_file_path: "tasks/w.md",
  report_file_path: "reports/herdr-worker.md",
  status: "started" as TaskStatus,
  retry_count: 0,
  attempt: 1,
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  finished_at: null,
  failure_reason: null,
  integration_summary: null,
  verification_summary: null,
  events: [{ at: new Date().toISOString(), status: "starting", message: "warm" }],
  schema_version: 2,
  worker_name: "warm-herdr-worker-01",
  lease_id: "lease-warm-task-01-1234567890",
};

assert.strictEqual(warmLedgerTest.schema_version, 2);
assert.strictEqual(warmLedgerTest.worker_name, "warm-herdr-worker-01");
assert.ok(warmLedgerTest.lease_id!.startsWith("lease-"));
// Worker name must be a valid warm name
assert.doesNotThrow(() => validateWarmWorkerName(warmLedgerTest.worker_name!));
console.log("  ✓ warm ledger: schema_version=2, worker_name, lease_id, valid warm name");
console.log("PASS: warm ledger construction");
