import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import type { HerdrCli } from "../cli.ts";
import {
  createInitialLedger,
  readLedger,
  writeLedger,
  type Ledger,
} from "../ledger.ts";
import { readPool } from "../warm.ts";

process.env.HERDR_DELEGATE_READY_DELAY_MS = "0";
process.env.HERDR_WORKSPACE_ID = "test-workspace";
process.env.PI_CODING_AGENT_DIR = resolve(import.meta.dirname, "../../../");

const { executeDelegation: dispatchDelegation } = await import("../delegation.ts");

function executeDelegation(
  params: Record<string, unknown>,
  context: { cwd: string },
  cli: HerdrCli,
) {
  return dispatchDelegation(params, { cli }, context);
}

function fakeCli(overrides: Partial<HerdrCli> = {}): HerdrCli {
  return {
    async tabCreate() {
      return { tabId: "test-workspace:tab", rootPaneId: "test-workspace:root" };
    },
    async agentStart() {
      return { paneId: "test-workspace:child" };
    },
    async paneClose() {},
    async paneRun() {},
    async waitAgentStatus() {
      return {
        event: "pane.agent_status_changed",
        data: { pane_id: "test-workspace:child", agent_status: "idle" },
      };
    },
    async agentGet() {
      return null;
    },
    async paneRead() {
      return "";
    },
    async tabClose() {},
    ...overrides,
  };
}

function initialLedger(cwd: string, taskId: string): Ledger {
  return createInitialLedger(
    taskId,
    cwd,
    "test-workspace",
    "herdr-worker",
    "/role.md",
    "test/model",
    "medium",
    ["read"],
    `.agent-runs/${taskId}/tasks/herdr-worker.md`,
    `.agent-runs/${taskId}/reports/herdr-worker.md`,
    0,
    1,
  );
}

const cwd = mkdtempSync(resolve(tmpdir(), "herdr-delegate-actions-"));
try {
  // Cold start retains its root pane and delivers exactly one instruction.
  const paneCloseCalls: string[] = [];
  const paneRunCalls: string[] = [];
  const coldStart = await executeDelegation(
    {
      action: "start",
      task_id: "cold-lifecycle",
      cwd,
      workspace_id: "test-workspace",
      role: "herdr-worker",
      task_content: "# cold task",
      wait: false,
    },
    { cwd },
    fakeCli({
      async paneClose(paneId) {
        paneCloseCalls.push(paneId);
      },
      async paneRun(paneId) {
        paneRunCalls.push(paneId);
      },
    }),
  );
  assert.strictEqual(coldStart.status, "started");
  assert.strictEqual(coldStart.root_pane_id, "test-workspace:root");
  assert.deepStrictEqual(paneCloseCalls, [], "cold start must retain the root pane");
  assert.deepStrictEqual(paneRunCalls, ["test-workspace:child"]);
  assert.match(
    readFileSync(resolve(cwd, ".agent-runs/cold-lifecycle/tasks/herdr-worker.md"), "utf8"),
    /cold task/,
  );

  // Continue dispatches only to an idle agent and preserves the ledger.
  const continueRuns: string[] = [];
  const continued = await executeDelegation(
    {
      action: "continue",
      task_id: "cold-lifecycle",
      cwd,
      task_content: "# follow-up",
      wait: false,
    },
    { cwd },
    fakeCli({
      async agentGet() {
        return {
          name: "cold-lifecycle",
          pane_id: "test-workspace:child",
          tab_id: "test-workspace:tab",
          workspace_id: "test-workspace",
          agent_status: "idle",
        };
      },
      async paneRun(paneId) {
        continueRuns.push(paneId);
      },
    }),
  );
  assert.strictEqual(continued.status, "started");
  assert.deepStrictEqual(continueRuns, ["test-workspace:child"]);
  assert.match(
    readFileSync(resolve(cwd, ".agent-runs/cold-lifecycle/tasks/herdr-worker.md"), "utf8"),
    /follow-up/,
  );

  // Wait, integrate, and clean up through the public delegation interface.
  writeFileSync(
    resolve(cwd, ".agent-runs/cold-lifecycle/reports/herdr-worker.md"),
    "completed report\n",
  );
  const waited = await executeDelegation(
    { action: "wait", task_id: "cold-lifecycle", cwd, timeout_ms: 20 },
    { cwd },
    fakeCli(),
  );
  assert.strictEqual(waited.status, "reported");
  assert.strictEqual(waited.report_content, "completed report\n");

  const integrated = await executeDelegation(
    {
      action: "mark_integrated",
      task_id: "cold-lifecycle",
      cwd,
      integration_summary: "verified",
    },
    { cwd },
    fakeCli(),
  );
  assert.strictEqual(integrated.status, "integrated");

  const closedTabs: string[] = [];
  const coldCleanup = await executeDelegation(
    { action: "cleanup", task_id: "cold-lifecycle", cwd, keep_worker: false },
    { cwd },
    fakeCli({
      async tabClose(tabId) {
        closedTabs.push(tabId);
      },
    }),
  );
  assert.strictEqual(coldCleanup.status, "cleaned");
  assert.deepStrictEqual(closedTabs, ["test-workspace:tab"]);
  assert.strictEqual(readLedger(cwd, "cold-lifecycle")?.status, "cleaned");

  // Cancel closes a cold task tab and records the terminal state.
  const cancelLedger = {
    ...initialLedger(cwd, "cold-cancel"),
    tab_id: "test-workspace:cancel-tab",
    pane_id: "test-workspace:cancel-pane",
  };
  writeLedger(cwd, "cold-cancel", cancelLedger);
  const cancelClosedTabs: string[] = [];
  const cancelled = await executeDelegation(
    { action: "cancel", task_id: "cold-cancel", cwd, reason: "test" },
    { cwd },
    fakeCli({
      async agentGet() {
        return {
          name: "cold-cancel",
          pane_id: "test-workspace:cancel-pane",
          tab_id: "test-workspace:cancel-tab",
          workspace_id: "test-workspace",
          agent_status: "working",
        };
      },
      async tabClose(tabId) {
        cancelClosedTabs.push(tabId);
      },
    }),
  );
  assert.strictEqual(cancelled.status, "cancelled");
  assert.deepStrictEqual(cancelClosedTabs, ["test-workspace:cancel-tab"]);
  assert.strictEqual(readLedger(cwd, "cold-cancel")?.status, "cancelled");

  // Warm mode reports no candidate before a pool exists.
  const noWarmWorker = await executeDelegation(
    {
      action: "start",
      task_id: "warm-no-worker",
      cwd,
      workspace_id: "test-workspace",
      role: "herdr-worker",
      task_content: "# warm task",
      wait: false,
      mode: "warm",
    },
    { cwd },
    fakeCli({
      async waitAgentStatus() {
        throw new Error("warm lease path must not perform a cold readiness wait");
      },
    }),
  );
  assert.strictEqual(noWarmWorker.status, "no_warm_worker");

  // Warm a worker, lease it without a cold delay, then release it on cleanup.
  const warmed = await executeDelegation(
    {
      action: "warm_start",
      cwd,
      workspace_id: "test-workspace",
      role: "herdr-worker",
      worker_name: "warm-herdr-worker-01",
    },
    { cwd },
    fakeCli(),
  );
  assert.strictEqual(warmed.status, "ready");
  assert.strictEqual(readPool(cwd, "test-workspace")?.workers[0].state, "ready");

  const warmPaneRuns: string[] = [];
  const warmLease = await executeDelegation(
    {
      action: "start",
      task_id: "warm-lifecycle",
      cwd,
      workspace_id: "test-workspace",
      role: "herdr-worker",
      task_content: "# leased warm task",
      wait: false,
      mode: "warm",
    },
    { cwd },
    fakeCli({
      async waitAgentStatus() {
        throw new Error("warm lease path must not perform a cold readiness wait");
      },
      async paneRun(paneId) {
        warmPaneRuns.push(paneId);
      },
    }),
  );
  assert.strictEqual(warmLease.status, "started");
  assert.deepStrictEqual(warmPaneRuns, ["test-workspace:child"]);
  assert.strictEqual(readPool(cwd, "test-workspace")?.workers[0].state, "leased");

  const warmLedger = readLedger(cwd, "warm-lifecycle")!;
  writeLedger(cwd, "warm-lifecycle", {
    ...warmLedger,
    status: "integrated",
    integration_summary: "verified",
  });
  const warmClosedTabs: string[] = [];
  const warmCleanup = await executeDelegation(
    { action: "cleanup", task_id: "warm-lifecycle", cwd },
    { cwd },
    fakeCli({
      async agentGet() {
        return {
          name: "warm-herdr-worker-01",
          pane_id: "test-workspace:child",
          tab_id: "test-workspace:tab",
          workspace_id: "test-workspace",
          agent_status: "done",
        };
      },
      async tabClose(tabId) {
        warmClosedTabs.push(tabId);
      },
    }),
  );
  assert.strictEqual(warmCleanup.status, "cleaned");
  assert.strictEqual(warmCleanup.worker_state, "reusable");
  assert.deepStrictEqual(warmClosedTabs, [], "reusable worker keeps its tab");
  assert.strictEqual(readPool(cwd, "test-workspace")?.workers[0].state, "reusable");
  assert.strictEqual(readLedger(cwd, "warm-lifecycle")?.status, "cleaned");

  // Settle observes agent state without mutating the task ledger.
  const settled = await executeDelegation(
    { action: "settle", task_id: "warm-lifecycle", cwd },
    { cwd },
    fakeCli({
      async agentGet() {
        return {
          name: "warm-herdr-worker-01",
          pane_id: "test-workspace:child",
          tab_id: "test-workspace:tab",
          workspace_id: "test-workspace",
          agent_status: "idle",
        };
      },
      async paneRun() {
        throw new Error("settle must be observation-only");
      },
    }),
  );
  assert.strictEqual(settled.status, "reusable");
  assert.strictEqual(readLedger(cwd, "warm-lifecycle")?.status, "cleaned");

  console.log("PASS: delegation action lifecycles through observable behavior");
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
