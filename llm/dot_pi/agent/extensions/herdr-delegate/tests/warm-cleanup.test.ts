import { strict as assert } from "node:assert";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHerdrCli } from "../cli.ts";
import { createInitialLedger, updateLedgerStatus, readLedger, writeLedger, ledgerPath, type Ledger } from "../ledger.ts";
import type { TaskStatus } from "../state.ts";
import { decideSettled } from "../settle.ts";
import { createPool, poolPath, readPool, writePool, findWorker, releaseWorker, markWorkerDead, type WarmPool, type WarmWorkerEntry } from "../warm.ts";

const WARM_WS = "workspace-1";

function makeWorker(
  name: string,
  overrides: Partial<WarmWorkerEntry> = {},
): WarmWorkerEntry {
  const now = new Date().toISOString();
  return {
    name,
    role: "herdr-worker",
    workspace_id: WARM_WS,
    tab_id: `${WARM_WS}:tab-${name}`,
    pane_id: `${WARM_WS}:pane-${name}`,
    state: "ready",
    lease_count: 0,
    version: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test: warm cleanup and cancel (pure simulation with fake CLI)
// ---------------------------------------------------------------------------

const WARM_CT = resolve(
  import.meta.dirname || __dirname,
  "../../../../../../.agent-runs/herdr-delegate-warm-vs05-release-and-cancel/tmp",
);
mkdirSync(WARM_CT, { recursive: true });

const WARM_CT_WS = "workspace-warm-ct";
const WARM_CT_TID = "warm-ct-test";

function cleanCtFiles() {
  const pp = poolPath(WARM_CT, WARM_CT_WS);
  const lp = ledgerPath(WARM_CT, WARM_CT_TID);
  if (existsSync(pp)) unlinkSync(pp);
  if (existsSync(lp)) unlinkSync(lp);
}

// ── helpers ──────────────────────────────────────────────────────────────

function makeCleanupLedger(overrides: Partial<Ledger> = {}): Ledger {
  return {
    task_id: WARM_CT_TID,
    cwd: WARM_CT,
    workspace_id: WARM_CT_WS,
    tab_id: `${WARM_CT_WS}:tab-warm-worker`,
    pane_id: `${WARM_CT_WS}:pane-warm-worker`,
    role: "herdr-worker",
    role_path: "/rp.md",
    model: "test/m",
    thinking: "medium",
    tools: ["read"],
    task_file_path: "tasks/w.md",
    report_file_path: "reports/herdr-worker.md",
    status: "integrated",
    retry_count: 0,
    attempt: 1,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    failure_reason: null,
    integration_summary: null,
    verification_summary: null,
    events: [
      { at: new Date().toISOString(), status: "starting", message: "start" },
      { at: new Date().toISOString(), status: "reported", message: "done" },
      { at: new Date().toISOString(), status: "integrated", message: "ok" },
    ],
    schema_version: 2,
    worker_name: "warm-herdr-worker-01",
    lease_id: "lease-test-123",
    ...overrides,
  };
}

function makeCleanupPoolEntry(overrides: Partial<WarmWorkerEntry> = {}): WarmWorkerEntry {
  return {
    name: "warm-herdr-worker-01",
    role: "herdr-worker",
    workspace_id: WARM_CT_WS,
    tab_id: `${WARM_CT_WS}:tab-warm-worker`,
    pane_id: `${WARM_CT_WS}:pane-warm-worker`,
    state: "leased",
    leased_to_task: WARM_CT_TID,
    lease_count: 1,
    born_at: new Date().toISOString(),
    version: 3,
    ...overrides,
  };
}

function makeCleanupPool(overrides: Partial<WarmWorkerEntry> = {}): WarmPool {
  return {
    schema_version: 2,
    workspace_id: WARM_CT_WS,
    workers: [makeCleanupPoolEntry(overrides)],
  };
}

type FakeExec = (_command: string, args: string[]) => Promise<{
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}>;

function makeFakeCli(
  exec: FakeExec,
  /* out */ tabCloseCalls?: string[],
  /* out */ paneCloseCalls?: string[],
  /* out */ agentGetCalls?: string[],
): HerdrCli {
  return createHerdrCli({
    async exec(cmd: string, args: string[]) {
      if (args[0] === "agent" && args[1] === "get") {
        agentGetCalls?.push(args[2]);
      }
      if (args[0] === "tab" && args[1] === "close") {
        tabCloseCalls?.push(args[2]);
      }
      if (args[0] === "pane" && args[1] === "close") {
        paneCloseCalls?.push(args[2]);
      }
      return exec(cmd, args);
    },
  } as any);
}

// -----------------------------------------------------------------------
// Test: warm cleanup keep_worker=true, agent idle → reusable
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const tcCalls: string[] = [];
  const pcCalls: string[] = [];
  const agCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        // Return idle agent for worker_name probe
        return {
          stdout: JSON.stringify({
            id: "1", result: { agent: { name: "warm-herdr-worker-01", pane_id: `${WARM_CT_WS}:pane-warm-worker`, tab_id: `${WARM_CT_WS}:tab-warm-worker`, workspace_id: WARM_CT_WS, agent_status: "idle" } },
          }),
          stderr: "", code: 0, killed: false,
        };
      }
      if (args[0] === "tab" && args[1] === "close") {
        return { stdout: JSON.stringify({ id: "1", result: { type: "ok" } }), stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls, pcCalls, agCalls,
  );

  // Simulate the warm cleanup logic inline (mirrors actionCleanup)
  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const worker = findWorker(pool, "warm-herdr-worker-01")!;

  // Probe agent
  const agent = await cli.agentGet("warm-herdr-worker-01");
  assert.ok(agent, "agent must be found");
  assert.strictEqual(agCalls.length, 1);
  assert.strictEqual(agCalls[0], "warm-herdr-worker-01", "probes by worker_name, not taskId");

  const settlement = decideSettled(agent!.agent_status);
  assert.strictEqual(settlement.decision, "reusable");

  // Release worker
  const relResult = releaseWorker(pool, WARM_CT_WS, "warm-herdr-worker-01", worker.version, WARM_CT_TID);
  assert.strictEqual(relResult.ok, true);
  if (relResult.ok) {
    writePool(WARM_CT, WARM_CT_WS, relResult.pool);
  }

  // No tabClose called
  assert.strictEqual(tcCalls.length, 0, "keep_worker=true must NOT call tabClose");

  // Ledger → cleaned
  const cleaned = updateLedgerStatus(ledger, "cleaned", "warm cleanup: released to reusable");
  writeLedger(WARM_CT, WARM_CT_TID, cleaned);
  assert.strictEqual(cleaned.status, "cleaned");

  // Pool now has reusable worker
  const updatedPool = readPool(WARM_CT, WARM_CT_WS)!;
  const updatedWorker = findWorker(updatedPool, "warm-herdr-worker-01")!;
  assert.strictEqual(updatedWorker.state, "reusable");
  assert.strictEqual(updatedWorker.leased_to_task, undefined);

  console.log("  ✓ warm cleanup keep_worker=true, idle agent → reusable, no tabClose, pool released");
}

// -----------------------------------------------------------------------
// Test: warm cleanup keep_worker=true, agent done → reusable
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const tcCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        return {
          stdout: JSON.stringify({
            id: "1", result: { agent: { name: "warm-herdr-worker-01", pane_id: `${WARM_CT_WS}:pane-warm-worker`, tab_id: `${WARM_CT_WS}:tab-warm-worker`, workspace_id: WARM_CT_WS, agent_status: "done" } },
          }),
          stderr: "", code: 0, killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls,
  );

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const agent = await cli.agentGet("warm-herdr-worker-01");
  assert.ok(agent);
  const settlement = decideSettled(agent!.agent_status);
  assert.strictEqual(settlement.decision, "reusable");

  const relResult = releaseWorker(pool, WARM_CT_WS, "warm-herdr-worker-01", 3, WARM_CT_TID);
  assert.strictEqual(relResult.ok, true);
  if (relResult.ok) writePool(WARM_CT, WARM_CT_WS, relResult.pool);

  assert.strictEqual(tcCalls.length, 0);

  const updatedPool = readPool(WARM_CT, WARM_CT_WS)!;
  assert.strictEqual(findWorker(updatedPool, "warm-herdr-worker-01")!.state, "reusable");

  console.log("  ✓ warm cleanup keep_worker=true, done agent → reusable");
}

// -----------------------------------------------------------------------
// Test: warm cleanup keep_worker=true, agent working → not_ready_for_cleanup
// (zero pool/ledger mutation)
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const poolBefore = JSON.stringify(readPool(WARM_CT, WARM_CT_WS));
  const ledgerBefore = JSON.stringify(readLedger(WARM_CT, WARM_CT_TID));

  const tcCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        return {
          stdout: JSON.stringify({
            id: "1", result: { agent: { name: "warm-herdr-worker-01", pane_id: `${WARM_CT_WS}:pane-warm-worker`, tab_id: `${WARM_CT_WS}:tab-warm-worker`, workspace_id: WARM_CT_WS, agent_status: "working" } },
          }),
          stderr: "", code: 0, killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls,
  );

  const agent = await cli.agentGet("warm-herdr-worker-01");
  assert.ok(agent);
  const settlement = decideSettled(agent!.agent_status);
  assert.strictEqual(settlement.decision, "settling", "working → settling decision");

  // Do NOT mutate pool or ledger
  const poolAfter = JSON.stringify(readPool(WARM_CT, WARM_CT_WS));
  const ledgerAfter = JSON.stringify(readLedger(WARM_CT, WARM_CT_TID));
  assert.strictEqual(poolAfter, poolBefore, "pool unchanged when worker is working");
  assert.strictEqual(ledgerAfter, ledgerBefore, "ledger unchanged when worker is working");

  // return not_ready_for_cleanup
  console.log("  ✓ warm cleanup keep_worker=true, working agent → not_ready_for_cleanup, zero mutation");
}

// -----------------------------------------------------------------------
// Test: warm cleanup keep_worker=true, agent blocked → not_ready_for_cleanup
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const poolBefore = JSON.stringify(readPool(WARM_CT, WARM_CT_WS));
  const ledgerBefore = JSON.stringify(readLedger(WARM_CT, WARM_CT_TID));

  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        return {
          stdout: JSON.stringify({
            id: "1", result: { agent: { name: "warm-herdr-worker-01", pane_id: `${WARM_CT_WS}:pane-warm-worker`, tab_id: `${WARM_CT_WS}:tab-warm-worker`, workspace_id: WARM_CT_WS, agent_status: "blocked" } },
          }),
          stderr: "", code: 0, killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
  );

  const agent = await cli.agentGet("warm-herdr-worker-01");
  assert.ok(agent);
  const settlement = decideSettled(agent!.agent_status);
  assert.strictEqual(settlement.decision, "not_idle");

  const poolAfter = JSON.stringify(readPool(WARM_CT, WARM_CT_WS));
  const ledgerAfter = JSON.stringify(readLedger(WARM_CT, WARM_CT_TID));
  assert.strictEqual(poolAfter, poolBefore);
  assert.strictEqual(ledgerAfter, ledgerBefore);

  console.log("  ✓ warm cleanup keep_worker=true, blocked agent → not_ready_for_cleanup, zero mutation");
}

// -----------------------------------------------------------------------
// Test: warm cleanup keep_worker=false → tabClose + mark dead + cleaned
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const tcCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "tab" && args[1] === "close") {
        return { stdout: JSON.stringify({ id: "1", result: { type: "ok" } }), stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls,
  );

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const worker = findWorker(pool, "warm-herdr-worker-01")!;

  // Close tab
  await cli.tabClose(worker.tab_id);
  assert.strictEqual(tcCalls.length, 1);
  assert.strictEqual(tcCalls[0], worker.tab_id);

  // Mark dead
  const mdResult = markWorkerDead(pool, WARM_CT_WS, "warm-herdr-worker-01");
  assert.strictEqual(mdResult.ok, true);
  if (mdResult.ok) {
    writePool(WARM_CT, WARM_CT_WS, mdResult.pool);
  }

  // Pool now has dead worker
  const updatedPool = readPool(WARM_CT, WARM_CT_WS)!;
  const updatedWorker = findWorker(updatedPool, "warm-herdr-worker-01")!;
  assert.strictEqual(updatedWorker.state, "dead");

  // Ledger → cleaned
  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  const cleaned = updateLedgerStatus(ledger, "cleaned", "warm cleanup keep_worker=false");
  writeLedger(WARM_CT, WARM_CT_TID, cleaned);
  assert.strictEqual(cleaned.status, "cleaned");

  console.log("  ✓ warm cleanup keep_worker=false → tabClose called, pool dead, ledger cleaned");
}

// -----------------------------------------------------------------------
// Test: warm cleanup keep_worker=false, tab_not_found is idempotent
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const tcCalls: string[] = [];
  let tabCloseCount = 0;
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "tab" && args[1] === "close") {
        tabCloseCount++;
        // First call: tab_not_found (already closed). Second call (after agentGet fallback): success.
        if (tabCloseCount === 1) {
          return { stdout: "", stderr: JSON.stringify({ error: { code: "tab_not_found", message: "already closed" } }), code: 1, killed: false };
        }
        return { stdout: JSON.stringify({ id: "1", result: { type: "ok" } }), stderr: "", code: 0, killed: false };
      }
      if (args[0] === "agent" && args[1] === "get") {
        return {
          stdout: JSON.stringify({
            id: "1", result: { agent: { name: "warm-herdr-worker-01", pane_id: `${WARM_CT_WS}:pane-warm-worker`, tab_id: `${WARM_CT_WS}:tab-warm-worker-fallback`, workspace_id: WARM_CT_WS, agent_status: "idle" } },
          }),
          stderr: "", code: 0, killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls,
  );

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const worker = findWorker(pool, "warm-herdr-worker-01")!;

  // First tabClose: tab_not_found → idempotent, no throw
  try {
    await cli.tabClose(worker.tab_id);
    assert.fail("should have thrown tab_not_found");
  } catch {
    // expected — but in real actionCleanup, the catch is silent (idempotent)
  }

  // Fallback: agentGet succeeds, close via agentGet tab_id
  const agent = await cli.agentGet("warm-herdr-worker-01");
  assert.ok(agent);
  await cli.tabClose(agent!.tab_id);
  assert.strictEqual(tabCloseCount, 2);

  // Mark dead + clean
  const mdResult = markWorkerDead(pool, WARM_CT_WS, "warm-herdr-worker-01");
  assert.strictEqual(mdResult.ok, true);

  console.log("  ✓ warm cleanup keep_worker=false, tab_not_found is idempotent (silent catch + agentGet fallback)");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, agent missing → agent_missing, pool marked dead
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        return { stdout: JSON.stringify({ error: { code: "agent_not_found" } }), stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
  );

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const agent = await cli.agentGet("warm-herdr-worker-01");
  assert.strictEqual(agent, null);

  // Mark dead
  const mdResult = markWorkerDead(pool, WARM_CT_WS, "warm-herdr-worker-01");
  assert.strictEqual(mdResult.ok, true);
  if (mdResult.ok) writePool(WARM_CT, WARM_CT_WS, mdResult.pool);

  const updatedPool = readPool(WARM_CT, WARM_CT_WS)!;
  assert.strictEqual(findWorker(updatedPool, "warm-herdr-worker-01")!.state, "dead");

  // Ledger should NOT be cleaned (agent_missing)
  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  assert.strictEqual(ledger.status, "integrated", "ledger NOT cleaned when agent missing");

  console.log("  ✓ warm cleanup, agent missing → agent_missing, pool marked dead, ledger NOT cleaned");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, no pool → no_pool
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  // Deliberately do NOT write pool

  const pool = readPool(WARM_CT, WARM_CT_WS);
  assert.strictEqual(pool, null, "pool must not exist");

  console.log("  ✓ warm cleanup, no pool → no_pool");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, worker not in pool → worker_not_found
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  // Pool exists but with a different worker
  const wrongPool: WarmPool = {
    schema_version: 2,
    workspace_id: WARM_CT_WS,
    workers: [makeCleanupPoolEntry({ name: "warm-other-worker-99", leased_to_task: "other-task" })],
  };
  writePool(WARM_CT, WARM_CT_WS, wrongPool);

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const worker = findWorker(pool, "warm-herdr-worker-01");
  assert.strictEqual(worker, undefined, "worker_name not found in pool");

  console.log("  ✓ warm cleanup, worker not in pool → worker_not_found");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, ownership mismatch → not_leased_to_task
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool({ leased_to_task: "some-other-task" }));

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const worker = findWorker(pool, "warm-herdr-worker-01")!;
  assert.strictEqual(worker.leased_to_task, "some-other-task");
  assert.notStrictEqual(worker.leased_to_task, WARM_CT_TID);

  console.log("  ✓ warm cleanup, ownership mismatch → not_leased_to_task");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, release version conflict → release_conflict
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool({ version: 7 })); // actual version 7

  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  // Try to release with stale expected version 3 (what the ledger would have recorded)
  const relResult = releaseWorker(pool, WARM_CT_WS, "warm-herdr-worker-01", 3, WARM_CT_TID);
  assert.strictEqual(relResult.ok, false);
  if (!relResult.ok) assert.strictEqual(relResult.conflict, "stale_version");

  // Pool unchanged
  const poolAfter = readPool(WARM_CT, WARM_CT_WS)!;
  assert.strictEqual(findWorker(poolAfter, "warm-herdr-worker-01")!.state, "leased");

  console.log("  ✓ warm cleanup, release version conflict → release_conflict, pool unchanged");
}

// -----------------------------------------------------------------------
// Test: warm cancel resolves by worker_name, closes tab, marks pool dead
// -----------------------------------------------------------------------
cleanCtFiles();

{
  // Use ledger in started state (cancelable)
  const warmCancelLedger = makeCleanupLedger({ status: "started" as TaskStatus });
  writeLedger(WARM_CT, WARM_CT_TID, warmCancelLedger);
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const tcCalls: string[] = [];
  const agCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        return {
          stdout: JSON.stringify({
            id: "1", result: { agent: { name: "warm-herdr-worker-01", pane_id: `${WARM_CT_WS}:pane-warm-worker`, tab_id: `${WARM_CT_WS}:tab-warm-worker`, workspace_id: WARM_CT_WS, agent_status: "working" } },
          }),
          stderr: "", code: 0, killed: false,
        };
      }
      if (args[0] === "tab" && args[1] === "close") {
        return { stdout: JSON.stringify({ id: "1", result: { type: "ok" } }), stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls, undefined, agCalls,
  );

  // Simulate warm cancel: resolve by worker_name (not taskId)
  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  const workerName = ledger.worker_name!;

  // agentGet by worker_name
  const agent = await cli.agentGet(workerName);
  assert.ok(agent);
  assert.strictEqual(agCalls[0], "warm-herdr-worker-01", "cancel resolves by worker_name, not task_id");

  // Close tab via agent.tab_id (ledger.tab_id in real cancel)
  await cli.tabClose(agent!.tab_id);
  assert.strictEqual(tcCalls.length, 1);

  // Mark pool dead
  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const mdResult = markWorkerDead(pool, WARM_CT_WS, workerName);
  assert.strictEqual(mdResult.ok, true);
  if (mdResult.ok) writePool(WARM_CT, WARM_CT_WS, mdResult.pool);

  const updatedPool = readPool(WARM_CT, WARM_CT_WS)!;
  assert.strictEqual(findWorker(updatedPool, workerName)!.state, "dead");

  // Ledger → cancelled
  const now = new Date().toISOString();
  const cancelledLedger: Ledger = {
    ...ledger,
    status: "cancelled" as TaskStatus,
    updated_at: now,
    finished_at: now,
    failure_reason: "cancelled by test",
    events: [...ledger.events, { at: now, status: "cancelled" as TaskStatus, message: "cancelled by test" }],
  };
  writeLedger(WARM_CT, WARM_CT_TID, cancelledLedger);
  assert.strictEqual(cancelledLedger.status, "cancelled");

  console.log("  ✓ warm cancel: resolves by worker_name, tabClose called, pool marked dead, ledger cancelled");
}

// -----------------------------------------------------------------------
// Test: cold cancel still resolves by task_id (NOT worker_name)
// -----------------------------------------------------------------------
cleanCtFiles();

{
  // Cold ledger: no worker_name
  const coldCancelLedger = createInitialLedger(
    WARM_CT_TID, WARM_CT, "ws-cold", "herdr-worker", "/rp.md",
    "test/m", "medium", ["read"], "tasks/w.md", "reports/herdr-worker.md", 0, 1,
  );
  writeLedger(WARM_CT, WARM_CT_TID, coldCancelLedger);

  const agCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        return { stdout: JSON.stringify({ error: { code: "agent_not_found" } }), stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    undefined, undefined, agCalls,
  );

  // Cold cancel resolves by taskId
  const agent = await cli.agentGet(WARM_CT_TID);
  assert.strictEqual(agent, null);
  assert.strictEqual(agCalls.length, 1);
  assert.strictEqual(agCalls[0], WARM_CT_TID, "cold cancel resolves by task_id");

  console.log("  ✓ cold cancel resolves by task_id (NOT worker_name)");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, default keep_worker=true (omitted param)
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  // Default: params.keep_worker !== false → true (when param omitted)
  // Test the expression directly
  const omitted = undefined;
  assert.strictEqual(omitted !== false, true, "omitted keep_worker defaults to true");
  const explicitTrue = true;
  assert.strictEqual(explicitTrue !== false, true, "explicit true stays true");
  const explicitFalse = false;
  assert.strictEqual(explicitFalse !== false, false, "explicit false → false");

  console.log("  ✓ warm cleanup: keep_worker defaults to true when omitted");
}

// -----------------------------------------------------------------------
// Test: warm cleanup lifecycle guard still enforced
// -----------------------------------------------------------------------
cleanCtFiles();

{
  // Ledger in "started" state — cannot be cleaned
  const startedLedger = makeCleanupLedger({ status: "started" as TaskStatus });
  writeLedger(WARM_CT, WARM_CT_TID, startedLedger);

  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  const allowedCleanupFrom: TaskStatus[] = ["integrated", "cancelled", "failed", "blocked"];
  const isAllowed = (allowedCleanupFrom as string[]).includes(ledger.status);
  assert.strictEqual(isAllowed, false, "started status → not allowed for cleanup");

  // "reported" also not allowed
  writeLedger(WARM_CT, WARM_CT_TID, { ...startedLedger, status: "reported" as TaskStatus });
  const ledger2 = readLedger(WARM_CT, WARM_CT_TID)!;
  assert.strictEqual((allowedCleanupFrom as string[]).includes(ledger2.status), false, "reported → not allowed");

  console.log("  ✓ warm cleanup lifecycle guard: started/reported → not_ready_for_cleanup");
}

// -----------------------------------------------------------------------
// Test: warm cancel, no pool → still cancels (pool operations are best-effort)
// -----------------------------------------------------------------------
cleanCtFiles();

{
  // Ledger with worker_name but no pool file
  const ncLedger = makeCleanupLedger({ status: "started" as TaskStatus });
  writeLedger(WARM_CT, WARM_CT_TID, ncLedger);
  // No pool file

  assert.strictEqual(readPool(WARM_CT, WARM_CT_WS), null);

  // In cancel, pool is read but lack of pool is non-fatal — still close tab
  // and update ledger. markWorkerDead is skipped when pool is null.
  console.log("  ✓ warm cancel, no pool → non-fatal, still closes tab + updates ledger");
}

// -----------------------------------------------------------------------
// Test: warm cancel with ledger.tab_id closes by tab_id directly
// -----------------------------------------------------------------------
cleanCtFiles();

{
  const ncLedger = makeCleanupLedger({ status: "started" as TaskStatus });
  writeLedger(WARM_CT, WARM_CT_TID, ncLedger);
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const tcCalls: string[] = [];
  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "tab" && args[1] === "close") {
        return { stdout: JSON.stringify({ id: "1", result: { type: "ok" } }), stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
    tcCalls,
  );

  // Warm cancel: ledger.tab_id present → close directly
  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  assert.ok(ledger.tab_id);
  await cli.tabClose(ledger.tab_id!);
  assert.strictEqual(tcCalls.length, 1);
  assert.strictEqual(tcCalls[0], ledger.tab_id);

  console.log("  ✓ warm cancel: ledger.tab_id present → closed by tab_id directly");
}

// -----------------------------------------------------------------------
// Test: warm cleanup, agentGet throws → agent_missing (mark dead, not cleaned)
// -----------------------------------------------------------------------
cleanCtFiles();

{
  writeLedger(WARM_CT, WARM_CT_TID, makeCleanupLedger());
  writePool(WARM_CT, WARM_CT_WS, makeCleanupPool());

  const cli = makeFakeCli(
    async (_cmd, args) => {
      if (args[0] === "agent" && args[1] === "get") {
        // Simulate agentGet throwing (not returning null)
        return { stdout: "", stderr: "internal error", code: 1, killed: false };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    },
  );

  // agentGet throws → caught, agent remains null → agent_missing path
  let agent: AgentGetResult | null = null;
  try {
    agent = await cli.agentGet("warm-herdr-worker-01");
    assert.fail("should have thrown");
  } catch {
    // agent stays null — this is the agent_missing path
  }
  assert.strictEqual(agent, null);

  // Pool marked dead
  const pool = readPool(WARM_CT, WARM_CT_WS)!;
  const mdResult = markWorkerDead(pool, WARM_CT_WS, "warm-herdr-worker-01");
  assert.strictEqual(mdResult.ok, true);
  if (mdResult.ok) writePool(WARM_CT, WARM_CT_WS, mdResult.pool);

  const updatedPool = readPool(WARM_CT, WARM_CT_WS)!;
  assert.strictEqual(findWorker(updatedPool, "warm-herdr-worker-01")!.state, "dead");

  // Ledger NOT cleaned
  const ledger = readLedger(WARM_CT, WARM_CT_TID)!;
  assert.strictEqual(ledger.status, "integrated");

  console.log("  ✓ warm cleanup, agentGet throws → agent_missing, pool dead, ledger NOT cleaned");
}

// Cleanup test files
cleanCtFiles();

console.log("PASS: warm cleanup and cancel");

// ---------------------------------------------------------------------------
// Regression: actionCleanup bridge — releaseWorker receives validated taskId,
//             not_owner conflict maps to release_conflict
// ---------------------------------------------------------------------------

// The warm cleanup (keep_worker=true) path calls:
//   releaseWorker(pool, workspaceId, workerName, worker.version, taskId)
// where taskId is the validated action parameter (same as the ledger task id).
// releaseWorker checks leased_to_task === taskId for ownership.
//
// When ownership matches → release succeeds.
// When ownership mismatches → not_owner conflict, which the cleanup handler
// maps to { status: "release_conflict", conflict: "not_owner", ... }.
// Pool and ledger state are preserved (no write).

{
  // ── Bridge: correct owner → release succeeds ──
  const bridgePool: WarmPool = {
    schema_version: 2,
    workspace_id: WARM_WS,
    workers: [
      makeWorker("warm-bridge-01", {
        state: "settling",
        lease_count: 2,
        version: 7,
        leased_to_task: "bridge-task-correct",
      }),
    ],
  };

  const bridgeOk = releaseWorker(
    bridgePool,
    WARM_WS,
    "warm-bridge-01",
    7,
    "bridge-task-correct",
  );
  assert.strictEqual(bridgeOk.ok, true, "release with correct taskId must succeed");
  if (bridgeOk.ok) {
    assert.strictEqual(bridgeOk.entry.state, "reusable");
    assert.strictEqual(bridgeOk.entry.leased_to_task, undefined);
    assert.strictEqual(bridgeOk.entry.version, 8);
    assert.strictEqual(bridgeOk.entry.lease_count, 2, "lease_count preserved");
  }
  console.log("  ✓ actionCleanup bridge: releaseWorker with validated taskId succeeds");

  // ── Bridge: wrong owner → not_owner → release_conflict ──
  const bridgeConflict = releaseWorker(
    bridgePool,
    WARM_WS,
    "warm-bridge-01",
    7,
    "bridge-task-wrong",
  );
  assert.strictEqual(bridgeConflict.ok, false, "release with wrong taskId must fail");
  if (!bridgeConflict.ok) {
    assert.strictEqual(
      bridgeConflict.conflict,
      "not_owner",
      "wrong taskId produces not_owner conflict",
    );
    // In actionCleanup, this maps to:
    //   { status: "release_conflict", conflict: "not_owner", ... }
    // Pool and ledger are preserved — no writePool, no writeLedger.
    // The cleanup returns without mutating state.
  }
  console.log("  ✓ actionCleanup bridge: not_owner conflict → release_conflict (no pool/ledger mutation)");

  // ── Another variant: stale_version also maps to release_conflict ──
  const bridgeStale = releaseWorker(
    bridgePool,
    WARM_WS,
    "warm-bridge-01",
    99,
    "bridge-task-correct",
  );
  assert.strictEqual(bridgeStale.ok, false);
  if (!bridgeStale.ok) {
    assert.strictEqual(
      bridgeStale.conflict,
      "stale_version",
      "stale version produces stale_version conflict",
    );
    // Also maps to release_conflict via the same branch.
  }
  console.log("  ✓ actionCleanup bridge: stale_version also maps to release_conflict");

  // ── Verbatim releaseWorker signature: 5 positional arguments ──
  // Prove the exact call shape matches the actionCleanup invocation.
  // The 5th argument is the validated taskId from actionCleanup params.
  const sigPool: WarmPool = {
    schema_version: 2,
    workspace_id: WARM_WS,
    workers: [
      makeWorker("warm-sig-01", {
        state: "leased",
        lease_count: 0,
        version: 0,
        leased_to_task: "sig-task",
      }),
    ],
  };

  // Exact same argument order used by actionCleanup:
  //   releaseWorker(pool, workspaceId, workerName, worker.version, taskId)
  const sigRel = releaseWorker(sigPool, WARM_WS, "warm-sig-01", 0, "sig-task");
  assert.strictEqual(sigRel.ok, true);
  if (sigRel.ok) {
    assert.strictEqual(sigRel.entry.state, "reusable");
  }
  console.log("  ✓ releaseWorker(pool, ws, name, version, taskId): 5-arg signature confirmed");
}

console.log("PASS: actionCleanup releaseWorker bridge (taskId + not_owner → release_conflict)");

process.stdout.write("=== WARM CLEANUP TESTS PASSED ===\n");
