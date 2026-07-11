/**
 * herdr-delegate: Pi extension that gives a parent orchestrator a typed
 * `herdr_delegate` tool for Herdr delegation.
 *
 * Actions: `start`, `wait`, `continue`, `settle`.
 * - `start`: validate, write task + ledger, create a tab and agent through the
 *   Herdr CLI, then atomically deliver the instruction.
 *   Optionally settle after report (wait:true + settle:true).
 * - `wait`: poll until a non-empty report file appears or the deadline expires,
 *   then update reported/blocked.
 * - `continue`: resolve an existing agent by name and deliver a follow-up
 *   instruction via pane.run (no new tab created). Optionally settle after
 *   report (wait:true + settle:true).
 * - `settle`: observe an agent via agentGet polling until it becomes reusable
 *   (idle/done) or the deadline expires. Never sends pane input.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

import {
  validateTaskId,
  resolveCwd,
  validateReportPath,
  validateTaskFilePath,
} from "./validation.ts";

import { resolvePiBin } from "./resolver.ts";

import {
  buildInstruction,
  buildContinuationInstruction,
  buildWarmLeaseInstruction,
} from "./instruction.ts";
import {
  createHerdrCli,
  type HerdrCli,
  HerdrCliError,
  isAgentNameTaken,
  decideContinue,
  isTabNotFoundError,
  type AgentGetResult,
} from "./cli.ts";
import {
  takeFingerprint,
  waitForFreshReport,
  waitForNonEmptyReport,
} from "./freshness.ts";
import { isAgentDetected } from "./lifecycle.ts";
import { decideSettled, decideReuse } from "./settle.ts";

import { parseRoleFrontmatter, type RoleMetadata } from "./frontmatter.ts";
import {
  readLedger,
  writeLedger,
  createInitialLedger,
  updateLedgerStatus,
  updateLedgerStarted,
  ledgerPath,
  type Ledger,
} from "./ledger.ts";

import type { TaskStatus } from "./state.ts";

import {
  poolPath,
  readPool,
  writePool,
  createPool,
  findWorker,
  generateWarmWorkerName,
  selectCandidate,
  leaseWorker,
  releaseWorker,
  markWorkerDead,
  type WarmPool,
  type WarmWorkerEntry,
} from "./warm.ts";
import { validateWarmWorkerName } from "./validation.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the Herdr workspace id deterministically without using focused state. */
function resolveWorkspaceId(paramWs?: string): string {
  if (paramWs && paramWs.trim().length > 0) {
    return paramWs.trim();
  }
  if (process.env.HERDR_WORKSPACE_ID) {
    return process.env.HERDR_WORKSPACE_ID;
  }
  // Fallback: extract workspace prefix from HERDR_TAB_ID or HERDR_PANE_ID
  const tabId = process.env.HERDR_TAB_ID;
  if (tabId && tabId.includes(":")) {
    return tabId.split(":")[0];
  }
  const paneId = process.env.HERDR_PANE_ID;
  if (paneId && paneId.includes(":")) {
    return paneId.split(":")[0];
  }
  throw new Error(
    "Cannot resolve Herdr workspace id: no HERDR_WORKSPACE_ID, HERDR_TAB_ID, or HERDR_PANE_ID set",
  );
}

/** Read a role prompt from ~/.pi/agent/agents/<role>.md */
function readRolePrompt(role: string): { content: string; path: string } {
  const rolePath = resolve(homedir(), ".pi", "agent", "agents", `${role}.md`);
  if (!existsSync(rolePath)) {
    throw new Error(`Role prompt not found: ${rolePath}`);
  }
  const content = readFileSync(rolePath, "utf-8");
  return { content, path: rolePath };
}

/** Ensure a directory exists for a file path. */
function ensureDirForFile(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/** Parse a non-negative integer from an env var; fall back to default on any failure. */
function parseEnvInt(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) return defaultVal;
  return n;
}

const READINESS_DETECTION_TIMEOUT_MS = 30_000;
/**
 * Delay after agent detection before delivering the instruction.
 * Detection confirms the TUI is up, but Pi emits no output event at
 * input-box readiness (wait-output is not viable for Pi). Empirically
 * 4-5 s is reliable; override via HERDR_DELEGATE_READY_DELAY_MS.
 */
const READY_DELAY_MS = parseEnvInt("HERDR_DELEGATE_READY_DELAY_MS", 5000);

// ---------------------------------------------------------------------------
// Shared settle helper (cold-compatible observation, no pane input)
// ---------------------------------------------------------------------------

/**
 * Observe an agent until it reaches a reusable state or the deadline expires.
 *
 * Uses `cli.agentGet` repeatedly — never sends pane input.
 * Does NOT mutate the task ledger; observation is separate from task state.
 *
 * Agent name resolution: `ledger.worker_name ?? task_id` (cold task ids only now;
 * worker_name supports future warm ledgers).
 *
 * Settle timeout precedence:
 *  1. Explicit timeout_ms parameter
 *  2. HERDR_DELEGATE_SETTLE_TIMEOUT_MS env var (default 60000)
 */
async function observeSettle(
  taskId: string,
  cwd: string,
  cli: HerdrCli,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const existingLedger = readLedger(cwd, taskId);
  const agentName = existingLedger?.worker_name ?? taskId;

  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = 2000;

  while (Date.now() < deadline) {
    const agent = await cli.agentGet(agentName);

    if (!agent) {
      return {
        status: "not_found",
        task_id: taskId,
        agent_name: agentName,
        cwd,
      };
    }

    const decision = decideSettled(agent.agent_status);

    if (decision.decision === "reusable") {
      return {
        status: "reusable",
        task_id: taskId,
        agent_name: agentName,
        agent_status: decision.agent_status,
        pane_id: agent.pane_id,
        tab_id: agent.tab_id,
        workspace_id: agent.workspace_id,
        cwd,
      };
    }

    if (decision.decision === "not_idle") {
      return {
        status: "not_idle",
        task_id: taskId,
        agent_name: agentName,
        agent_status: decision.agent_status,
        pane_id: agent.pane_id,
        tab_id: agent.tab_id,
        workspace_id: agent.workspace_id,
        cwd,
      };
    }

    // decision is "settling" (working) → keep waiting
    const remaining = Math.min(
      pollIntervalMs,
      Math.max(100, deadline - Date.now()),
    );
    await sleep(remaining);
  }

  // Deadline reached while agent was still working
  const agent = await cli.agentGet(agentName);

  const result: Record<string, unknown> = {
    status: "settling",
    deadline_reached: true,
    task_id: taskId,
    agent_name: agentName,
    cwd,
  };

  if (agent) {
    result.agent_status = agent.agent_status;
    result.pane_id = agent.pane_id;
    result.tab_id = agent.tab_id;
    result.workspace_id = agent.workspace_id;
  } else {
    result.agent_status = "not_found";
  }

  return result;
}

// ---------------------------------------------------------------------------
// Action: warm_start
// ---------------------------------------------------------------------------

async function actionWarmStart(
  params: {
    cwd?: string;
    workspace_id?: string;
    role?: string;
    worker_name?: string;
    timeout_ms?: number;
    pi_path?: string;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const role = params.role || "herdr-worker";
  const piBin = resolvePiBin(params.pi_path, process.env.HERDR_PI_BIN);
  const workspaceId = resolveWorkspaceId(params.workspace_id);

  // Read and parse role prompt
  const { content: rpContent, path: rpPath } = readRolePrompt(role);
  const meta: RoleMetadata = parseRoleFrontmatter(rpContent, role, rpPath);

  // Resolve or validate worker name
  const pool = readPool(cwd, workspaceId) || createPool(workspaceId);
  const existingPoolNames = new Set(pool.workers.map((w) => w.name));

  let workerName: string;
  if (params.worker_name) {
    workerName = validateWarmWorkerName(params.worker_name);
    // Collision: must not already be in pool
    if (existingPoolNames.has(workerName)) {
      throw new Error(
        `Warm worker name "${workerName}" is already in pool for workspace "${workspaceId}"`,
      );
    }
    // Collision: must not be a live agent
    try {
      const existing = await cli.agentGet(workerName);
      if (existing) {
        throw new Error(
          `Warm worker name "${workerName}" collides with a live agent`,
        );
      }
    } catch {
      // agentGet failure is acceptable — agent likely doesn't exist
    }
  } else {
    // Generate next unused name from pool, then check live collision
    workerName = generateWarmWorkerName(role, existingPoolNames);
    try {
      const existing = await cli.agentGet(workerName);
      if (existing) {
        // Name collides with live agent — add to skip set and regenerate
        const allSkip = new Set(existingPoolNames);
        allSkip.add(workerName);
        workerName = generateWarmWorkerName(role, allSkip);
        const check2 = await cli.agentGet(workerName);
        if (check2) {
          throw new Error(
            `Cannot find unused warm worker name for role "${role}" ` +
            `in workspace "${workspaceId}" — pool may be saturated`,
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Cannot find")) throw e;
      // agentGet failure is acceptable
    }
  }

  // Create tab (no root-pane close — root pane retention is mandatory)
  let tabId: string;
  let rootPaneId: string;
  try {
    const tabRes = await cli.tabCreate(workspaceId, `warm-${workerName}`);
    tabId = tabRes.tabId;
    rootPaneId = tabRes.rootPaneId;
  } catch (e) {
    throw new Error(`warm_start tab.create failed: ${e}`);
  }

  // Agent start — interactive Pi with role model/thinking/tools
  let childPaneId: string;
  let agentSession: { source: string; agent: string; kind: "id" | "path"; value: string } | undefined;
  try {
    const agentRes = await cli.agentStart({
      name: workerName,
      tabId,
      cwd,
      piBin,
      model: meta.model,
      thinking: meta.thinking,
      toolsCsv: meta.toolsString,
      rolePath: rpPath,
    });
    childPaneId = agentRes.paneId;
    agentSession = agentRes.agentSession;
  } catch (e) {
    try { await cli.tabClose(tabId); } catch { /* ignore */ }
    throw new Error(`warm_start agent.start failed: ${e}`);
  }

  // Wait readiness — detect agent, then allow input box to mount
  try {
    const readiness = await cli.waitAgentStatus(
      childPaneId,
      READINESS_DETECTION_TIMEOUT_MS,
    );
    if (!isAgentDetected(readiness.data.agent_status)) {
      throw new Error(
        "warm worker agent was not detected before pool registration",
      );
    }
    await sleep(READY_DELAY_MS);
  } catch (e) {
    try { await cli.tabClose(tabId); } catch { /* ignore */ }
    throw new Error(`warm_start readiness wait failed: ${e}`);
  }

  // Register pool entry as "ready" — no task text sent
  const now = new Date().toISOString();
  const entry: WarmWorkerEntry = {
    name: workerName,
    role,
    workspace_id: workspaceId,
    tab_id: tabId,
    pane_id: childPaneId,
    agent_session: agentSession?.value,
    state: "ready",
    lease_count: 0,
    born_at: now,
    version: 0,
  };

  const updatedPool: WarmPool = {
    ...pool,
    workers: [...pool.workers, entry],
  };
  writePool(cwd, workspaceId, updatedPool);

  return {
    status: "ready",
    worker_name: workerName,
    worker_state: "ready",
    tab_id: tabId,
    root_pane_id: rootPaneId,
    pane_id: childPaneId,
    workspace_id: workspaceId,
    pool_path: poolPath(cwd, workspaceId),
  };
}

// ---------------------------------------------------------------------------
// Internal: execute a single warm start and return the worker name
// ---------------------------------------------------------------------------

async function autoWarmOne(
  cwd: string,
  workspaceId: string,
  role: string,
  cli: HerdrCli,
): Promise<string> {
  const result = await actionWarmStart(
    { cwd, workspace_id: workspaceId, role },
    { cwd },
    cli,
  );
  return result.worker_name as string;
}

// ---------------------------------------------------------------------------
// Warm start delivery: lease a pool worker and deliver the task
// ---------------------------------------------------------------------------

async function actionStartWarm(
  taskId: string,
  cwd: string,
  workspaceId: string,
  role: string,
  rpPath: string,
  meta: RoleMetadata,
  taskContent: string | undefined,
  taskFilePath: string,
  reportFilePath: string,
  ledger: Ledger,
  shouldWait: boolean,
  shouldSettle: boolean,
  timeoutMs: number,
  autoWarm: boolean,
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  // Require task_content
  if (!taskContent) {
    throw new Error("task_content is required for start action (warm mode)");
  }

  // Read pool
  let pool = readPool(cwd, workspaceId);
  if (!pool) {
    // No pool and no auto_warm → no_warm_worker
    if (!autoWarm) {
      return {
        status: "no_warm_worker",
        task_id: taskId,
        cwd,
        workspace_id: workspaceId,
      };
    }
    // Auto-warm: create a pool implicitly
    pool = createPool(workspaceId);
  }

  // Select eligible pool candidate (ready/reusable, matching role and workspace)
  let candidate = selectCandidate(pool, workspaceId);

  if (!candidate) {
    if (!autoWarm) {
      return {
        status: "no_warm_worker",
        task_id: taskId,
        cwd,
        workspace_id: workspaceId,
      };
    }
    // Auto-warm exactly one worker
    await autoWarmOne(cwd, workspaceId, role, cli);
    pool = readPool(cwd, workspaceId)!; // Re-read after warm
    candidate = selectCandidate(pool, workspaceId);
    if (!candidate) {
      return {
        status: "no_warm_worker",
        task_id: taskId,
        cwd,
        workspace_id: workspaceId,
      };
    }
  }

  const worker = candidate.entry;
  const workerName = worker.name;

  // CAS lease worker to task
  const leaseResult = leaseWorker(pool, workspaceId, workerName, worker.version, taskId);
  if (!leaseResult.ok) {
    return {
      status: "busy",
      task_id: taskId,
      cwd,
      workspace_id: workspaceId,
      worker_name: workerName,
      conflict: leaseResult.conflict,
      worker_state: worker.state,
    };
  }

  // Persist updated pool
  pool = leaseResult.pool;
  writePool(cwd, workspaceId, pool);

  const leasedEntry = leaseResult.entry;
  const childPaneId = leasedEntry.pane_id;
  const tabId = leasedEntry.tab_id;

  // Update ledger with warm fields and tab/pane metadata
  const now = new Date().toISOString();
  const warmLedger: Ledger = {
    ...ledger,
    schema_version: 2,
    worker_name: workerName,
    lease_id: `lease-${taskId}-${Date.now()}`,
    tab_id: tabId,
    pane_id: childPaneId,
    updated_at: now,
    events: [
      ...ledger.events,
      {
        at: now,
        status: "starting",
        message: `warm lease: worker "${workerName}" leased to task`,
      },
    ],
  };
  writeLedger(cwd, taskId, warmLedger);

  // Snapshot report fingerprint BEFORE delivery
  const reportAbsPath = resolve(cwd, reportFilePath);
  const preFingerprint = takeFingerprint(reportAbsPath);

  // Deliver warm-lease instruction (no cold readiness delay)
  const instruction = buildWarmLeaseInstruction(taskFilePath, reportFilePath);
  try {
    await cli.paneRun(childPaneId, instruction);
  } catch (e) {
    const failedLedger = updateLedgerStatus(
      warmLedger,
      "failed",
      `warm pane.run failed: ${e}`,
      { failure_reason: String(e), pane_id: childPaneId },
    );
    writeLedger(cwd, taskId, failedLedger);
    throw e;
  }

  // Write started ledger (warm: no root_pane_id — tab persists from warm_start)
  const startedNow = new Date().toISOString();
  const startedLedger: Ledger = {
    ...warmLedger,
    tab_id: tabId,
    pane_id: childPaneId,
    root_pane_id: undefined,
    updated_at: startedNow,
    events: [
      ...warmLedger.events,
      {
        at: startedNow,
        status: "started",
        message: "warm agent instruction delivered",
      },
    ],
  };
  writeLedger(cwd, taskId, startedLedger);

  // If wait=true, poll for fresh report
  if (shouldWait) {
    try {
      const reportContent = await waitForFreshReport(
        preFingerprint,
        reportAbsPath,
        timeoutMs,
      );
      const currentLedger = readLedger(cwd, taskId)!;
      const reportedLedger = updateLedgerStatus(
        currentLedger,
        "reported",
        "warm start: fresh report detected via fingerprint change",
      );
      writeLedger(cwd, taskId, reportedLedger);

      // Transition pool from "leased" to "settling" (not yet reusable)
      const poolAfterReport = readPool(cwd, workspaceId);
      if (poolAfterReport) {
        const wIdx = poolAfterReport.workers.findIndex(
          (w) => w.name === workerName,
        );
        if (wIdx !== -1 && poolAfterReport.workers[wIdx].state === "leased") {
          const settledWorker: WarmWorkerEntry = {
            ...poolAfterReport.workers[wIdx],
            state: "settling",
            version: poolAfterReport.workers[wIdx].version + 1,
          };
          const updatedPool: WarmPool = {
            ...poolAfterReport,
            workers: [
              ...poolAfterReport.workers.slice(0, wIdx),
              settledWorker,
              ...poolAfterReport.workers.slice(wIdx + 1),
            ],
          };
          writePool(cwd, workspaceId, updatedPool);
        }
      }

      const result = buildResult(reportedLedger);
      result.report_content = reportContent;
      result.warm = true;
      result.worker_name = workerName;

      // If settle=true, observe post-report settlement
      if (shouldSettle) {
        const settleResult = await observeSettle(
          taskId, cwd, cli,
          timeoutMs ||
            parseEnvInt("HERDR_DELEGATE_SETTLE_TIMEOUT_MS", 60000),
        );
        // Merge settle result; pool stays leased/settling (no release)
        return {
          ...settleResult,
          status: settleResult.status,
          report_content: reportContent,
          task_file_path: result.task_file_path,
          report_file_path: result.report_file_path,
          ledger_path: result.ledger_path,
          settled: true,
          warm: true,
          worker_name: workerName,
        };
      }

      return result;
    } catch (e) {
      const currentLedger = readLedger(cwd, taskId)!;
      const blockedLedger = updateLedgerStatus(
        currentLedger,
        "blocked",
        `warm start: no fresh report within ${timeoutMs}ms`,
        {
          failure_reason:
            `timeout after ${timeoutMs}ms: no fresh report detected (${e})`,
        },
      );
      writeLedger(cwd, taskId, blockedLedger);
      const result = buildResult(blockedLedger);
      result.warm = true;
      result.worker_name = workerName;
      return result;
    }
  }

  const result = buildResult(startedLedger);
  result.warm = true;
  result.worker_name = workerName;
  return result;
}

// ---------------------------------------------------------------------------
// Action: start
// ---------------------------------------------------------------------------

async function actionStart(
  params: {
    task_id: string;
    cwd?: string;
    workspace_id?: string;
    role?: string;
    task_content?: string;
    task_file_path?: string;
    report_file_path?: string;
    timeout_ms?: number;
    wait?: boolean;
    settle?: boolean;
    label?: string;
    pi_path?: string;
    mode?: string;
    auto_warm?: boolean;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const role = params.role || "herdr-worker";
  const taskContent = params.task_content;
  const shouldSettle = params.settle === true;
  const _timeoutMs = params.timeout_ms || 900000;
  const shouldWait = params.wait !== false; // default true
  if (shouldSettle && !shouldWait) {
    throw new Error("settle:true requires wait:true for start action; cannot settle without a confirmed report baseline");
  }
  const label = params.label || taskId;
  const piBin = resolvePiBin(params.pi_path, process.env.HERDR_PI_BIN);

  // Resolve workspace id (deterministic, no focused-state)
  const workspaceId = resolveWorkspaceId(params.workspace_id);

  // Read and parse role prompt
  const { content: rpContent, path: rpPath } = readRolePrompt(role);
  const meta: RoleMetadata = parseRoleFrontmatter(rpContent, role, rpPath);

  // Task and report file paths
  const defaultTaskPath = `.agent-runs/${taskId}/tasks/${role}.md`;
  const taskFilePath = validateTaskFilePath(
    params.task_file_path || defaultTaskPath,
    cwd,
    taskId,
  );
  const defaultReportPath = `.agent-runs/${taskId}/reports/${role}.md`;
  const reportFilePath = validateReportPath(
    params.report_file_path || defaultReportPath,
    cwd,
    taskId,
    role,
  );

  // Write task file
  if (!taskContent) {
    throw new Error("task_content is required for start action");
  }
  ensureDirForFile(resolve(cwd, taskFilePath));
  writeFileSync(resolve(cwd, taskFilePath), taskContent, "utf-8");

  // Ensure report dir exists
  ensureDirForFile(resolve(cwd, reportFilePath));

  // Create or reuse ledger (non-destructive: preserve prior events)
  const initialRetry = 0;
  const initialAttempt = 1;
  const prevLedger = readLedger(cwd, taskId);
  let ledger: Ledger;
  if (prevLedger) {
    const now = new Date().toISOString();
    ledger = {
      ...prevLedger,
      task_id: taskId,
      cwd,
      workspace_id: workspaceId,
      role,
      role_path: rpPath,
      model: meta.model,
      thinking: meta.thinking,
      tools: meta.tools,
      task_file_path: taskFilePath,
      report_file_path: reportFilePath,
      status: "started",
      retry_count: initialRetry,
      attempt: prevLedger.attempt + 1,
      started_at: now,
      updated_at: now,
      finished_at: null,
      failure_reason: null,
      integration_summary: null,
      verification_summary: null,
      tab_id: undefined,
      root_pane_id: undefined,
      pane_id: undefined,
      agent_session: undefined,
      events: [
        ...prevLedger.events,
        { at: now, status: "starting", message: `ledger reused for attempt ${prevLedger.attempt + 1}` },
      ],
    };
  } else {
    ledger = createInitialLedger(
      taskId,
      cwd,
      workspaceId,
      role,
      rpPath,
      meta.model,
      meta.thinking,
      meta.tools,
      taskFilePath,
      reportFilePath,
      initialRetry,
      initialAttempt,
    );
  }
  writeLedger(cwd, taskId, ledger);

  // =========================================================================
  // Warm mode: lease a pool worker and deliver
  // =========================================================================
  const mode = params.mode || "cold";
  const autoWarm = params.auto_warm === true;

  if (mode === "warm") {
    return actionStartWarm(
      taskId, cwd, workspaceId, role, rpPath, meta,
      taskContent, taskFilePath, reportFilePath,
      ledger, shouldWait, shouldSettle, _timeoutMs,
      autoWarm, cli,
    );
  }

  // =========================================================================
  // Cold mode (default): create a new tab + agent
  // =========================================================================

  // 1. herdr tab create --workspace <ws> --label <id> --no-focus
  let tabCreateRes;
  try {
    tabCreateRes = await cli.tabCreate(workspaceId, label);
  } catch (e) {
    // Update ledger as failed
    const failedLedger = updateLedgerStatus(
      ledger,
      "failed",
      `tab.create failed: ${e}`,
      { failure_reason: String(e) },
    );
    writeLedger(cwd, taskId, failedLedger);
    throw e;
  }

  const { tabId, rootPaneId } = tabCreateRes;

  // Update ledger with tab info before agent.start
  const withTab = { ...ledger, tab_id: tabId, root_pane_id: rootPaneId };
  writeLedger(cwd, taskId, withTab);

  // 2. agent.start — normal interactive Pi, NO argv task prompt
  // Role is passed via --append-system-prompt; frontmatter model/thinking/tools
  // are passed explicitly as flags.
  let agentRes;
  try {
    agentRes = await cli.agentStart({
      name: taskId,
      tabId,
      cwd,
      piBin,
      model: meta.model,
      thinking: meta.thinking,
      toolsCsv: meta.toolsString,
      rolePath: rpPath,
    });
  } catch (e) {
    // Check for agent_name_taken — reuse existing agent
    if (e instanceof HerdrCliError && isAgentNameTaken(e)) {
      const existing = await cli.agentGet(taskId);
      if (existing && (existing.agent_status === "idle" || existing.agent_status === "done" || existing.agent_status === "working")) {
        // Best-effort close created tab
        try { await cli.tabClose(tabId); } catch { /* ignore */ }
        return {
          status: "already_running",
          task_id: taskId,
          pane_id: existing.pane_id,
          tab_id: existing.tab_id,
          workspace_id: existing.workspace_id,
          agent_status: existing.agent_status,
          cwd,
        };
      }
    }
    // Best-effort close created tab
    try {
      await cli.tabClose(tabId);
    } catch {
      // ignore
    }
    const failedLedger = updateLedgerStatus(
      withTab,
      "failed",
      `agent.start failed: ${e}`,
      { failure_reason: String(e) },
    );
    writeLedger(cwd, taskId, failedLedger);
    throw e;
  }

  const { paneId: childPaneId, agentSession } = agentRes;

  // 3. Wait until Herdr has detected the child, then allow Pi's input box to
  // mount before delivering text + Enter. Status is a readiness signal only.
  try {
    const readiness = await cli.waitAgentStatus(
      childPaneId,
      READINESS_DETECTION_TIMEOUT_MS,
    );
    if (!isAgentDetected(readiness.data.agent_status)) {
      throw new Error("child agent was not detected before instruction delivery");
    }
    await sleep(READY_DELAY_MS);
  } catch (e) {
    const failedLedger = updateLedgerStatus(
      withTab,
      "failed",
      `agent readiness wait failed: ${e}`,
      { failure_reason: String(e), pane_id: childPaneId },
    );
    writeLedger(cwd, taskId, failedLedger);
    throw e;
  }

  // 4. Snapshot report fingerprint BEFORE delivery (freshness baseline)
  const reportAbsPath = resolve(cwd, reportFilePath);
  const preFingerprint = takeFingerprint(reportAbsPath);

  // 5. Atomically deliver text + Enter with herdr pane run.
  const instruction = buildInstruction(taskFilePath, reportFilePath);
  try {
    await cli.paneRun(childPaneId, instruction);
  } catch (e) {
    const failedLedger = updateLedgerStatus(
      withTab,
      "failed",
      `pane.run failed: ${e}`,
      { failure_reason: String(e), pane_id: childPaneId },
    );
    writeLedger(cwd, taskId, failedLedger);
    throw e;
  }

  // 6. Write started ledger (only after instruction delivery succeeds)
  const startedLedger = updateLedgerStarted(
    withTab,
    tabId,
    rootPaneId,
    childPaneId,
    agentSession,
  );
  writeLedger(cwd, taskId, startedLedger);

  // 7. If wait=true, poll for fresh report (NOT done-driven wait)
  if (shouldWait) {
    try {
      const reportContent = await waitForFreshReport(
        preFingerprint,
        reportAbsPath,
        _timeoutMs,
      );
      const currentLedger = readLedger(cwd, taskId)!;
      const reportedLedger = updateLedgerStatus(
        currentLedger,
        "reported",
        "start: fresh report detected via fingerprint change",
      );
      writeLedger(cwd, taskId, reportedLedger);
      const result = buildResult(reportedLedger);
      result.report_content = reportContent;

      // 7b. If settler=true, observe post-report settlement
      if (shouldSettle) {
        const settleResult = await observeSettle(
          taskId, cwd, cli,
          params.timeout_ms ||
            parseEnvInt("HERDR_DELEGATE_SETTLE_TIMEOUT_MS", 60000),
        );
        // Merge: settle result is primary, retain report_content + task context
        return {
          ...settleResult,
          status: settleResult.status, // "reusable" | "settling" | "not_idle" | "not_found"
          report_content: reportContent,
          task_file_path: result.task_file_path,
          report_file_path: result.report_file_path,
          ledger_path: result.ledger_path,
          settled: true,
        };
      }

      return result;
    } catch (e) {
      const currentLedger = readLedger(cwd, taskId)!;
      const blockedLedger = updateLedgerStatus(
        currentLedger,
        "blocked",
        `start: no fresh report within ${_timeoutMs}ms`,
        {
          failure_reason:
            `timeout after ${_timeoutMs}ms: no fresh report detected (${e})`,
        },
      );
      writeLedger(cwd, taskId, blockedLedger);
      return buildResult(blockedLedger);
    }
  }

  return buildResult(startedLedger);
}

// ---------------------------------------------------------------------------
// Action: continue
// ---------------------------------------------------------------------------

async function actionContinue(
  params: {
    task_id: string;
    cwd?: string;
    task_content?: string;
    report_file_path?: string;
    timeout_ms?: number;
    wait?: boolean;
    settle?: boolean;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const taskContent = params.task_content;
  const shouldSettle = params.settle === true;
  const shouldWait = params.wait !== false;
  const _timeoutMs = params.timeout_ms || 900000;
  if (shouldSettle && !shouldWait) {
    throw new Error("settle:true requires wait:true for continue action; cannot settle without a confirmed report baseline");
  }

  if (!taskContent) {
    throw new Error("task_content is required for continue action");
  }

  // 1. Resolve existing agent
  const agent = await cli.agentGet(taskId);

  if (!agent) {
    // Agent not found — include session hint from ledger if available
    const existingLedger = readLedger(cwd, taskId);
    const result: Record<string, unknown> = {
      status: "not_found",
      task_id: taskId,
      cwd,
    };
    if (existingLedger?.agent_session?.value) {
      result.agent_session = existingLedger.agent_session.value;
    }
    return result;
  }

  // 2. Decide eligibility using pure helper (live-evidence driven)
  const decision = decideContinue(agent, taskId);

  if (decision.decision === "not_found") {
    // Should not happen here since agent was resolved, but handle defensively
    return { status: "not_found", task_id: taskId, cwd };
  }

  if (decision.decision === "not_idle") {
    return {
      status: "not_idle",
      task_id: taskId,
      agent_status: decision.agent_status,
      pane_id: decision.pane_id,
      tab_id: decision.tab_id,
      workspace_id: decision.workspace_id,
      cwd,
    };
  }

  if (decision.decision === "busy") {
    return {
      status: "busy",
      task_id: taskId,
      pane_id: agent.pane_id,
      tab_id: agent.tab_id,
      workspace_id: agent.workspace_id,
      agent_status: agent.agent_status,
      cwd,
    };
  }

  // 3. Agent is eligible (deliver) — prepare continuation
  const existingLedger = readLedger(cwd, taskId);
  const role = existingLedger?.role || "herdr-worker";
  const defaultTaskPath = `.agent-runs/${taskId}/tasks/${role}.md`;
  const taskFilePath = existingLedger?.task_file_path || defaultTaskPath;
  const reportFilePath =
    params.report_file_path ||
    existingLedger?.report_file_path ||
    `.agent-runs/${taskId}/reports/${role}.md`;

  // Validate paths
  validateTaskFilePath(taskFilePath, cwd, taskId);
  const continueRole = role;
  validateReportPath(reportFilePath, cwd, taskId, continueRole);

  // Write task file with new content
  ensureDirForFile(resolve(cwd, taskFilePath));
  writeFileSync(resolve(cwd, taskFilePath), taskContent, "utf-8");

  // Ensure report dir exists
  ensureDirForFile(resolve(cwd, reportFilePath));

  // 4. Write ledger event (non-destructive append)
  const now = new Date().toISOString();
  if (existingLedger) {
    const updatedLedger: Ledger = {
      ...existingLedger,
      status: "started",
      updated_at: now,
      events: [
        ...existingLedger.events,
        { at: now, status: "continuing", message: "continue action: follow-up step delivered" },
      ],
    };
    writeLedger(cwd, taskId, updatedLedger);
  } else {
    // Create a minimal ledger when none exists
    const newLedger: Ledger = {
      task_id: taskId,
      cwd,
      workspace_id: agent.workspace_id,
      tab_id: agent.tab_id || undefined,
      root_pane_id: undefined,
      pane_id: agent.pane_id,
      role,
      role_path: "",
      model: "",
      thinking: "",
      tools: [],
      task_file_path: taskFilePath,
      report_file_path: reportFilePath,
      agent_session: agent.agent_session
        ? { source: "pi", agent: taskId, kind: "path", value: agent.agent_session }
        : undefined,
      status: "started",
      retry_count: 0,
      attempt: 1,
      started_at: now,
      updated_at: now,
      finished_at: null,
      failure_reason: null,
      integration_summary: null,
      verification_summary: null,
      events: [
        { at: now, status: "continuing", message: "continue action: follow-up step delivered (new ledger)" },
      ],
    };
    writeLedger(cwd, taskId, newLedger);
  }

  // 5. Snapshot report fingerprint BEFORE delivery (fixes order bug:
  //    was taken after paneRun, could miss a fast child write).
  const reportAbsPath = resolve(cwd, reportFilePath);
  const preFingerprint = takeFingerprint(reportAbsPath);

  // 6. Deliver continuation-specific instruction via pane run
  const attempt = existingLedger?.attempt || 1;
  const instruction = buildContinuationInstruction(
    taskFilePath,
    reportFilePath,
    attempt,
  );
  try {
    await cli.paneRun(agent.pane_id, instruction);
  } catch (e) {
    const currentLedger = readLedger(cwd, taskId)!;
    const failedLedger = updateLedgerStatus(
      currentLedger,
      "failed",
      `pane.run failed in continue: ${e}`,
      { failure_reason: String(e), pane_id: agent.pane_id },
    );
    writeLedger(cwd, taskId, failedLedger);
    throw e;
  }

  // 7. Wait if requested — use shared fresh-report polling helper.
  if (shouldWait) {
    try {
      const reportContent = await waitForFreshReport(
        preFingerprint,
        reportAbsPath,
        _timeoutMs,
      );
      const currentLedger = readLedger(cwd, taskId)!;
      const reportedLedger = updateLedgerStatus(
        currentLedger,
        "reported",
        "continue: fresh report detected via fingerprint change",
      );
      writeLedger(cwd, taskId, reportedLedger);
      const result = buildResult(reportedLedger);
      result.report_content = reportContent;

      // 7b. If settler=true, observe post-report settlement
      if (shouldSettle) {
        const settleResult = await observeSettle(
          taskId, cwd, cli,
          params.timeout_ms ||
            parseEnvInt("HERDR_DELEGATE_SETTLE_TIMEOUT_MS", 60000),
        );
        return {
          ...settleResult,
          status: settleResult.status,
          report_content: reportContent,
          task_file_path: result.task_file_path,
          report_file_path: result.report_file_path,
          ledger_path: result.ledger_path,
          settled: true,
        };
      }

      return result;
    } catch (e) {
      const currentLedger = readLedger(cwd, taskId)!;
      const blockedLedger = updateLedgerStatus(
        currentLedger,
        "blocked",
        `continue: no fresh report within ${_timeoutMs}ms`,
        {
          failure_reason:
            `timeout after ${_timeoutMs}ms: no fresh report detected (${e})`,
        },
      );
      writeLedger(cwd, taskId, blockedLedger);
      return buildResult(blockedLedger);
    }
  }

  return {
    status: "started",
    task_id: taskId,
    cwd,
    pane_id: agent.pane_id,
    tab_id: agent.tab_id || null,
    workspace_id: agent.workspace_id,
  };
}

// ---------------------------------------------------------------------------
// Action: wait
// ---------------------------------------------------------------------------

async function actionWait(
  params: {
    task_id: string;
    cwd?: string;
    timeout_ms?: number;
  },
  ctx: { cwd: string },
  _cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const timeoutMs = params.timeout_ms || 900000; // 15 min default

  const currentLedger = readLedger(cwd, taskId);
  if (!currentLedger) {
    throw new Error(`No ledger found for task "${taskId}" at ${cwd}`);
  }

  const reportPath = resolve(cwd, currentLedger.report_file_path);

  // Report-freshness-driven wait — status is diagnostic only.
  // Does NOT gate on agent_status:done or idle.  Pi can finish as
  // either "done" or "idle"; report presence is the completion truth.
  try {
    const reportContent = await waitForNonEmptyReport(
      reportPath,
      timeoutMs,
    );
    const reportedLedger = updateLedgerStatus(
      currentLedger,
      "reported",
      "wait: non-empty report detected",
    );
    writeLedger(cwd, taskId, reportedLedger);
    const result = buildResult(reportedLedger);
    result.report_content = reportContent;
    return result;
  } catch (e) {
    const blockedLedger = updateLedgerStatus(
      currentLedger,
      "blocked",
      `wait: no report within ${timeoutMs}ms`,
      {
        failure_reason:
          `timeout after ${timeoutMs}ms: no report appeared (${e})`,
      },
    );
    writeLedger(cwd, taskId, blockedLedger);
    return buildResult(blockedLedger);
  }
}

// ---------------------------------------------------------------------------
// Action: settle
// ---------------------------------------------------------------------------

async function actionSettle(
  params: {
    task_id: string;
    cwd?: string;
    timeout_ms?: number;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);

  // Settle timeout precedence:
  // 1. Explicit timeout_ms parameter
  // 2. HERDR_DELEGATE_SETTLE_TIMEOUT_MS env var (default 60000)
  const settleTimeoutMs =
    params.timeout_ms ||
    parseEnvInt("HERDR_DELEGATE_SETTLE_TIMEOUT_MS", 60000);

  return observeSettle(taskId, cwd, cli, settleTimeoutMs);
}

// ---------------------------------------------------------------------------
// Action: cancel
// ---------------------------------------------------------------------------

async function actionCancel(
  params: {
    task_id: string;
    cwd?: string;
    reason?: string;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const reason = params.reason || "cancelled by orchestrator";

  const existingLedger = readLedger(cwd, taskId);

  // =======================================================================
  // Warm cancel path: worker_name present in ledger → destructive, never
  // release back to pool.
  // =======================================================================
  if (existingLedger?.schema_version === 2 && existingLedger.worker_name) {
    const workerName = existingLedger.worker_name;
    const workspaceId = existingLedger.workspace_id;
    const pool = readPool(cwd, workspaceId);

    // Close worker tab — resolve by worker_name (not task_id)
    let closed = false;

    // Try pool entry's tab_id first
    if (existingLedger.tab_id) {
      try {
        await cli.tabClose(existingLedger.tab_id);
        closed = true;
      } catch {
        // Non-fatal
      }
    }

    if (!closed) {
      // Resolve by worker name
      try {
        const agent = await cli.agentGet(workerName);
        if (agent?.tab_id) {
          try {
            await cli.tabClose(agent.tab_id);
            closed = true;
          } catch {
            // Non-fatal
          }
        } else if (agent?.pane_id) {
          try {
            await cli.paneClose(agent.pane_id);
            closed = true;
          } catch {
            // Non-fatal
          }
        }
      } catch {
        // agentGet failed — non-fatal
      }
    }

    // Mark pool entry dead (if pool + worker exist)
    let poolMarkedDead = false;
    if (pool) {
      const mdResult = markWorkerDead(pool, workspaceId, workerName);
      if (mdResult.ok) {
        writePool(cwd, workspaceId, mdResult.pool);
        poolMarkedDead = true;
      }
    }

    // Update ledger as cancelled
    const now = new Date().toISOString();
    const cancelledLedger: Ledger = {
      ...existingLedger,
      status: "cancelled" as TaskStatus,
      updated_at: now,
      finished_at: now,
      failure_reason: reason,
      events: [
        ...existingLedger.events,
        {
          at: now,
          status: "cancelled" as TaskStatus,
          message: `warm cancel: ${reason}`,
        },
      ],
    };
    writeLedger(cwd, taskId, cancelledLedger);

    return buildResult(cancelledLedger, {
      agent_existed: true,
      was_closed: closed,
      warm: true,
      worker_name: workerName,
      pool_marked_dead: poolMarkedDead,
    });
  }

  // =======================================================================
  // Cold cancel path (no worker_name — existing behaviour, unchanged)
  // =======================================================================

  // 1. Try to resolve agent
  let agent: AgentGetResult | null = null;
  try {
    agent = await cli.agentGet(taskId);
  } catch {
    // agentGet failed — proceed without agent info
  }

  // 2. Close tab/pane if agent exists
  let closed = false;
  if (agent) {
    if (agent.tab_id) {
      try {
        await cli.tabClose(agent.tab_id);
        closed = true;
      } catch {
        // tabClose failed — try paneClose fallback
      }
    }
    if (!closed && agent.pane_id) {
      try {
        await cli.paneClose(agent.pane_id);
        closed = true;
      } catch {
        // paneClose also failed — non-fatal
      }
    }
  }

  // 3. No agent and no ledger → nothing to cancel
  if (!agent && !existingLedger) {
    return {
      status: "not_found",
      task_id: taskId,
      cwd,
    };
  }

  // 4. Update/create ledger as cancelled (terminal state)
  const now = new Date().toISOString();

  if (existingLedger) {
    let cancelledLedger: Ledger;
    try {
      cancelledLedger = updateLedgerStatus(
        existingLedger,
        "cancelled",
        reason,
        { failure_reason: reason },
      );
    } catch {
      // Force-write cancelled when state machine disallows (e.g. already integrated)
      cancelledLedger = {
        ...existingLedger,
        status: "cancelled" as TaskStatus,
        updated_at: now,
        finished_at: now,
        failure_reason: reason,
        events: [
          ...existingLedger.events,
          { at: now, status: "cancelled" as TaskStatus, message: reason },
        ],
      };
    }
    writeLedger(cwd, taskId, cancelledLedger);
    return buildResult(cancelledLedger, {
      agent_existed: true,
      was_closed: closed,
    });
  }

  // No ledger but agent existed — create minimal cancelled ledger
  const minimalLedger: Ledger = {
    task_id: taskId,
    cwd,
    workspace_id: agent?.workspace_id || "",
    tab_id: agent?.tab_id || undefined,
    pane_id: agent?.pane_id || undefined,
    role: "",
    role_path: "",
    model: "",
    thinking: "",
    tools: [],
    task_file_path: "",
    report_file_path: "",
    agent_session: undefined,
    status: "cancelled" as TaskStatus,
    retry_count: 0,
    attempt: 1,
    started_at: now,
    updated_at: now,
    finished_at: now,
    failure_reason: reason,
    integration_summary: null,
    verification_summary: null,
    events: [
      { at: now, status: "cancelled" as TaskStatus, message: reason },
    ],
  };
  writeLedger(cwd, taskId, minimalLedger);
  return buildResult(minimalLedger, {
    agent_existed: true,
    was_closed: closed,
  });
}

// ---------------------------------------------------------------------------
// Action: mark_integrated
// ---------------------------------------------------------------------------

async function actionMarkIntegrated(
  params: {
    task_id: string;
    cwd?: string;
    integration_summary?: string;
  },
  ctx: { cwd: string },
  _cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);

  const existingLedger = readLedger(cwd, taskId);
  if (!existingLedger) {
    return { status: "not_found", task_id: taskId, cwd };
  }

  if (existingLedger.status !== "reported") {
    return {
      status: "not_reported",
      task_id: taskId,
      cwd,
      current_status: existingLedger.status,
    };
  }

  const summary = params.integration_summary || null;
  const integratedLedger = updateLedgerStatus(
    existingLedger,
    "integrated",
    "marked integrated by orchestrator",
  );
  if (summary) {
    integratedLedger.integration_summary = summary;
  }
  writeLedger(cwd, taskId, integratedLedger);
  return buildResult(integratedLedger);
}

// ---------------------------------------------------------------------------
// Action: cleanup
// ---------------------------------------------------------------------------

async function actionCleanup(
  params: {
    task_id: string;
    cwd?: string;
    keep_worker?: boolean;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);

  const existingLedger = readLedger(cwd, taskId);
  if (!existingLedger) {
    return { status: "not_found", task_id: taskId, cwd };
  }

  // Lifecycle enforcement: only allow cleanup from terminal/idle states
  const allowedCleanupFrom: TaskStatus[] = [
    "integrated",
    "cancelled",
    "failed",
    "blocked",
  ];
  if (!(allowedCleanupFrom as string[]).includes(existingLedger.status)) {
    return {
      status: "not_ready_for_cleanup",
      task_id: taskId,
      cwd,
      current_status: existingLedger.status,
    };
  }

  // =======================================================================
  // Warm cleanup path: worker_name present in ledger
  // =======================================================================
  if (existingLedger.schema_version === 2 && existingLedger.worker_name) {
    const keepWorker = params.keep_worker !== false; // default true for warm
    const workerName = existingLedger.worker_name;
    const workspaceId = existingLedger.workspace_id;
    const pool = readPool(cwd, workspaceId);

    if (!pool) {
      return {
        status: "no_pool",
        task_id: taskId,
        cwd,
        worker_name: workerName,
        workspace_id: workspaceId,
      };
    }

    const worker = findWorker(pool, workerName);
    if (!worker) {
      return {
        status: "worker_not_found",
        task_id: taskId,
        cwd,
        worker_name: workerName,
        workspace_id: workspaceId,
      };
    }

    // Verify ownership: pool worker must be leased to this exact task
    if (worker.leased_to_task !== taskId) {
      return {
        status: "not_leased_to_task",
        task_id: taskId,
        cwd,
        worker_name: workerName,
        worker_leased_to: worker.leased_to_task,
        worker_state: worker.state,
      };
    }

    // --- keep_worker=true (default warm): release to reusable, no tabClose ---
    if (keepWorker) {
      // Probe worker agent status
      let agent: AgentGetResult | null = null;
      try {
        agent = await cli.agentGet(workerName);
      } catch {
        // agentGet failure — treat as missing
      }

      if (!agent) {
        // Missing agent — mark dead in pool, return non-cleaned
        const mdResult = markWorkerDead(pool, workspaceId, workerName);
        if (mdResult.ok) {
          writePool(cwd, workspaceId, mdResult.pool);
        }
        return {
          status: "agent_missing",
          task_id: taskId,
          cwd,
          worker_name: workerName,
          worker_state: worker.state,
          pool_marked_dead: mdResult.ok,
          message: "Worker agent not found — marked dead in pool.",
        };
      }

      const settlement = decideSettled(agent.agent_status);

      if (settlement.decision === "settling") {
        return {
          status: "not_ready_for_cleanup",
          task_id: taskId,
          cwd,
          worker_name: workerName,
          worker_state: worker.state,
          agent_status: agent.agent_status,
        };
      }

      if (settlement.decision === "not_idle") {
        return {
          status: "not_ready_for_cleanup",
          task_id: taskId,
          cwd,
          worker_name: workerName,
          worker_state: worker.state,
          agent_status: agent.agent_status,
        };
      }

      // settlement.decision === "reusable" — idle/done, proceed with release
      const relResult = releaseWorker(
        pool,
        workspaceId,
        workerName,
        worker.version,
        taskId,
      );
      if (!relResult.ok) {
        return {
          status: "release_conflict",
          task_id: taskId,
          cwd,
          worker_name: workerName,
          conflict: relResult.conflict,
          worker_state: worker.state,
        };
      }

      writePool(cwd, workspaceId, relResult.pool);

      const cleanedLedger = updateLedgerStatus(
        existingLedger,
        "cleaned",
        "cleanup: warm worker released to reusable, tab retained",
      );
      writeLedger(cwd, taskId, cleanedLedger);

      return {
        status: "cleaned",
        task_id: taskId,
        cwd,
        workspace_id: workspaceId,
        worker_name: workerName,
        worker_state: "reusable",
        tab_id: worker.tab_id,
        pane_id: worker.pane_id,
      };
    }

    // --- keep_worker=false: close tab, mark dead ---
    let closed = false;
    if (worker.tab_id) {
      try {
        await cli.tabClose(worker.tab_id);
        closed = true;
      } catch {
        // tab_not_found is idempotent — non-fatal
      }
    }
    if (!closed) {
      // Resolve by worker name for closing
      try {
        const wAgent = await cli.agentGet(workerName);
        if (wAgent?.tab_id) {
          try {
            await cli.tabClose(wAgent.tab_id);
            closed = true;
          } catch {
            // Non-fatal
          }
        } else if (wAgent?.pane_id) {
          try {
            await cli.paneClose(wAgent.pane_id);
            closed = true;
          } catch {
            // Non-fatal
          }
        }
      } catch {
        // agentGet failed — non-fatal
      }
    }

    // Mark worker dead in pool
    const mdResult = markWorkerDead(pool, workspaceId, workerName);
    if (mdResult.ok) {
      writePool(cwd, workspaceId, mdResult.pool);
    }

    const cleanedLedger = updateLedgerStatus(
      existingLedger,
      "cleaned",
      "cleanup: keep_worker=false — worker tab closed, pool marked dead",
    );
    writeLedger(cwd, taskId, cleanedLedger);

    return {
      status: "cleaned",
      task_id: taskId,
      cwd,
      workspace_id: workspaceId,
      worker_name: workerName,
      worker_state: "dead",
      pool_marked_dead: mdResult.ok,
      tab_closed: closed,
    };
  }

  // =======================================================================
  // Cold cleanup path (no worker_name — existing behaviour, unchanged)
  // =======================================================================

  // Close tab if present
  if (existingLedger.tab_id) {
    try {
      await cli.tabClose(existingLedger.tab_id);
    } catch {
      // tabClose failed — try paneClose fallback
      if (existingLedger.pane_id) {
        try {
          await cli.paneClose(existingLedger.pane_id);
        } catch {
          // Non-fatal
        }
      }
    }
  } else {
    // No tab_id in ledger — resolve agent for closing info
    try {
      const agent = await cli.agentGet(taskId);
      if (agent?.tab_id) {
        try {
          await cli.tabClose(agent.tab_id);
        } catch {
          // Non-fatal
        }
      } else if (agent?.pane_id) {
        try {
          await cli.paneClose(agent.pane_id);
        } catch {
          // Non-fatal
        }
      }
    } catch {
      // agentGet failed — already closed, non-fatal
    }
  }

  const cleanedLedger = updateLedgerStatus(
    existingLedger,
    "cleaned",
    "cleanup: tab/pane closed, task cleaned",
  );
  writeLedger(cwd, taskId, cleanedLedger);

  return {
    status: "cleaned",
    task_id: taskId,
    cwd,
    workspace_id: cleanedLedger.workspace_id,
  };
}

// ---------------------------------------------------------------------------
// Result builder
// ---------------------------------------------------------------------------

function buildResult(
  ledger: Ledger,
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    status: ledger.status,
    task_id: ledger.task_id,
    cwd: ledger.cwd,
    workspace_id: ledger.workspace_id,
    tab_id: ledger.tab_id ?? null,
    root_pane_id: ledger.root_pane_id ?? null,
    pane_id: ledger.pane_id ?? null,
    task_file_path: ledger.task_file_path,
    report_file_path: ledger.report_file_path,
    ledger_path: ledgerPath(ledger.cwd, ledger.task_id),
  };

  if (ledger.agent_session) {
    base.agent_session = ledger.agent_session;
  }

  if (ledger.status === "failed" || ledger.status === "blocked") {
    base.error = ledger.failure_reason;
    if (ledger.status === "failed") {
      base.error_class =
        ledger.failure_reason?.includes("timeout") ? "timeout"
        : ledger.failure_reason?.includes("report") ? "report"
        : ledger.failure_reason?.includes("Herdr") ? "herdr"
        : "tool";
    }
    if (ledger.status === "blocked") {
      base.error_class = ledger.failure_reason?.includes("timeout")
        ? "timeout"
        : "herdr";
    }
  }

  if (ledger.status === "blocked") {
    base.agent_status = "blocked";
  }

  if (overrides) {
    Object.assign(base, overrides);
  }

  return base;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "herdr_delegate",
    label: "Herdr Delegate",
    description:
      "Delegate a task to a Herdr-managed child Pi agent. " +
      "Use 'start' to launch a new child task, 'wait' to wait for completion, " +
      "'continue' to reuse an existing child agent for a follow-up step, " +
      "'settle' to observe an agent until reusable, " +
      "'cancel' to terminate a running task, " +
      "'mark_integrated' to advance a reported task to integrated, " +
      "'cleanup' to close the task tab and mark as cleaned. " +
      "A started tab retains its root pane (root_pane_id in result) plus the agent child pane; " +
      "only tabClose (via cancel/cleanup) removes both panes together.",
    promptSnippet:
      "Delegate a task to a Herdr-managed child agent (start, wait, warm_start)",
    promptGuidelines: [
      "Use herdr_delegate with action='start' to launch a child Pi agent for implementation work (cold mode). " +
        "Provide task_id, cwd, role, task_content, and report_file_path. Optionally set settle:true with wait:true to observe post-report settlement.",
      "Use herdr_delegate with action='warm_start' to pre-warm a Pi worker in the pool without a task. " +
        "Provide workspace_id, role, and optionally worker_name. The warm worker will be registered in the pool as 'ready'.",
      "Use herdr_delegate with action='start' and mode='warm' to lease a warm pool worker for a task. " +
        "Provide task_id, task_content, role, workspace_id. Optionally set auto_warm:true to warm a worker if none exists.",
      "Warm pool statuses: 'no_warm_worker' means no eligible worker; 'busy' means CAS lease conflict. " +
        "Use warm_start to pre-warm workers before leasing them.",
      "Use herdr_delegate with action='wait' to wait for a previously started child to complete and gate on its report.",
      "Use herdr_delegate with action='continue' to send a follow-up instruction to an existing idle/working child agent. Optionally set settle:true with wait:true to observe post-report settlement.",
      "Use herdr_delegate with action='settle' to observe an agent until it becomes reusable (idle/done) or the deadline expires. Never sends pane input; pure observation only.",
      "Use herdr_delegate with action='cancel' to terminate a running child task (closes tab, marks ledger cancelled). " +
        "For warm tasks, resolves by worker_name and marks the pool entry dead (never releases back to pool).",
      "Use herdr_delegate with action='mark_integrated' to advance a reported task to the integrated state.",
      "Use herdr_delegate with action='cleanup' to close the task's tab/pane and mark the ledger as cleaned. " +
        "For warm tasks, use keep_worker:true (default) to release the worker back to the pool without closing its tab; " +
        "use keep_worker:false to close the worker tab and mark it dead in the pool.",
      "Always check the returned status field: 'reported' means the child wrote a non-empty report; " +
        "'blocked' means the child is stuck; 'failed' means an unrecoverable error occurred; " +
        "'already_running' means the agent exists from a prior start; 'not_found' means no agent with that name exists; " +
        "'busy' means the agent is actively working and cannot accept a continue right now; " +
        "'not_idle' means the agent is blocked/unknown and cannot accept a continue; " +
        "'reusable' means the agent is idle/done and ready for the next delivery; " +
        "'settling' means the agent is still working (if deadline_reached:true, timeout occurred); " +
        "'cancelled' means the task was successfully cancelled and its tab closed; " +
        "'cleaned' means the task's tab/pane has been closed and the task is cleaned (warm: worker released to reusable with keep_worker:true, or tab closed with keep_worker:false); " +
        "'agent_missing' means the warm worker agent was not found (marked dead in pool, cleanup incomplete); " +
        "'release_conflict' means the warm worker could not be released due to version mismatch or other CAS conflict; " +
        "'no_pool' means no warm pool exists for the workspace; " +
        "'worker_not_found' means the worker entry was not found in the pool; " +
        "'not_leased_to_task' means the pool worker is not leased to this task; " +
        "'not_reported' means the task is not in reported state and cannot be integrated; " +
        "'not_ready_for_cleanup' means the task is still started/reported and cannot be cleaned yet.",
    ],
    parameters: Type.Object({
      action: StringEnum(["start", "wait", "continue", "settle", "cancel", "mark_integrated", "cleanup", "warm_start"] as const, {
        description: "Action to perform: start, wait, continue, settle, cancel, mark_integrated, cleanup, or warm_start",
      }),
      task_id: Type.String({
        description:
          "Unique task identifier. Allowed characters: A-Za-z0-9._-",
      }),
      cwd: Type.Optional(
        Type.String({
          description: "Working directory (defaults to current)",
        }),
      ),
      workspace_id: Type.Optional(
        Type.String({
          description:
            "Herdr workspace id (defaults to HERDR_WORKSPACE_ID or derived from tab/pane env)",
        }),
      ),
      // --- start parameters ---
      role: Type.Optional(
        Type.String({
          description:
            "Role name matching a prompt in ~/.pi/agent/agents/<role>.md (default: herdr-worker)",
        }),
      ),
      task_content: Type.Optional(
        Type.String({
          description:
            "Full markdown task contract content to write to the task file (required for start)",
        }),
      ),
      task_file_path: Type.Optional(
        Type.String({
          description:
            "Relative path for the task file (default: .agent-runs/<task_id>/tasks/<role>.md)",
        }),
      ),
      report_file_path: Type.Optional(
        Type.String({
          description:
            "Canonical report path. Omit this field — the extension resolves it to .agent-runs/<task_id>/reports/<role>.md automatically. " +
            "Only supply a value for backward-compatible callers; it must match the canonical path exactly (same filename, role, and task id). " +
            "A noncanonical value is rejected with a validation error — the extension never silently polls a path the role will not write.",
        }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({
          description:
            "Max ms to wait for child task completion after instruction delivery (default: 900000 = 15 min)",
        }),
      ),
      wait: Type.Optional(
        Type.Boolean({
          description:
            "Whether to also wait for completion after start (default: true). Set false for fire-and-forget.",
        }),
      ),
      settle: Type.Optional(
        Type.Boolean({
          description:
            "After wait completes with a fresh report, observe the agent until it becomes reusable (idle/done) or deadline expires. Requires wait:true — rejected otherwise. Settle timeout defaults via HERDR_DELEGATE_SETTLE_TIMEOUT_MS (default 60000ms), overridable with timeout_ms.",
        }),
      ),
      label: Type.Optional(
        Type.String({
          description: "Herdr tab label (default: task_id)",
        }),
      ),
      pi_path: Type.Optional(
        Type.String({
          description:
            "Absolute path to the Pi executable for agent.start. " +
            "Resolution order: explicit pi_path, HERDR_PI_BIN env, " +
            "~/.local/share/npm-global/bin/pi (if executable), then 'pi' fallback. " +
            "Must be absolute and executable when provided.",
        }),
      ),
      // --- start mode (cold / warm) ---
      mode: Type.Optional(
        StringEnum(["cold", "warm"] as const, {
          description:
            "Start mode: 'cold' (default) creates a new tab/agent; 'warm' leases a pre-warmed pool worker. " +
            "Only valid with action='start'.",
        }),
      ),
      auto_warm: Type.Optional(
        Type.Boolean({
          description:
            "When mode='warm' and no eligible pool worker exists, automatically warm one worker then lease it. " +
            "Default: false — returns no_warm_worker when no candidate exists.",
        }),
      ),
      // --- warm_start parameters ---
      worker_name: Type.Optional(
        Type.String({
          description:
            "Warm worker name pattern 'warm-<role>-<NN>'. For warm_start: optional explicit name; " +
            "otherwise auto-generated. Must pass validateWarmWorkerName.",
        }),
      ),
      // --- cancel parameters ---
      reason: Type.Optional(
        Type.String({
          description:
            "Reason for cancellation (recorded in ledger event). Default: 'cancelled by orchestrator'",
        }),
      ),
      // --- mark_integrated parameters ---
      integration_summary: Type.Optional(
        Type.String({
          description:
            "Optional summary of integration (recorded in ledger)",
        }),
      ),
      // --- cleanup parameters ---
      keep_worker: Type.Optional(
        Type.Boolean({
          description:
            "For warm-ledger cleanup only: when true (default for warm tasks), release the settled worker back to reusable without closing its tab. " +
            "When false, close the worker tab and mark the pool entry dead. Ignored for cold (non-warm) ledgers.",
        }),
      ),
      // --- wait parameters ---
      // (shared: task_id, cwd, timeout_ms already defined above)
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      signal: AbortSignal,
      _onUpdate: (update: unknown) => void,
      ctx: { cwd: string },
    ) {
      const action = params.action as string;
      const cli = createHerdrCli(pi, signal);

      if (action === "start") {
        const result = await actionStart(params as Parameters<typeof actionStart>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "wait") {
        const result = await actionWait(params as Parameters<typeof actionWait>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "continue") {
        const result = await actionContinue(params as Parameters<typeof actionContinue>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "cancel") {
        const result = await actionCancel(params as Parameters<typeof actionCancel>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "mark_integrated") {
        const result = await actionMarkIntegrated(params as Parameters<typeof actionMarkIntegrated>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "settle") {
        const result = await actionSettle(params as Parameters<typeof actionSettle>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "cleanup") {
        const result = await actionCleanup(params as Parameters<typeof actionCleanup>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      if (action === "warm_start") {
        const result = await actionWarmStart(params as Parameters<typeof actionWarmStart>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      throw new Error(`Unknown action: ${action}`);
    },
  });
}
