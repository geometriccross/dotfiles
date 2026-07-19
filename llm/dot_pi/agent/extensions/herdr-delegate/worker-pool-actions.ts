import { resolve } from "node:path";

import { resolveCwd, validateWarmWorkerName } from "./validation.ts";
import { resolvePiBin } from "./resolver.ts";
import { buildWarmLeaseInstruction } from "./instruction.ts";
import type { HerdrCli } from "./cli.ts";
import { takeFingerprint, waitForFreshReport } from "./freshness.ts";
import { isAgentDetected } from "./lifecycle.ts";
import { parseRoleFrontmatter, type RoleMetadata } from "./frontmatter.ts";
import {
  readLedger, writeLedger, updateLedgerStatus, type Ledger,
} from "./ledger.ts";
import {
  poolPath, readPool, writePool, createPool, generateWarmWorkerName,
  selectCandidate, leaseWorker,
  type WarmPool, type WarmWorkerEntry,
} from "./warm.ts";
import {
  READINESS_DETECTION_TIMEOUT_MS, READY_DELAY_MS,
  parseEnvInt, readRolePrompt, resolveWorkspaceId, sleep,
} from "./runtime.ts";
import { observeSettle } from "./settle-action.ts";
import { buildResult } from "./result.ts";

export async function actionWarmStart(
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

export async function actionStartWarm(
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
