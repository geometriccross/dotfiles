import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  validateTaskId, resolveCwd, validateReportPath, validateTaskFilePath,
} from "./validation.ts";
import { resolvePiBin } from "./resolver.ts";
import { buildInstruction } from "./instruction.ts";
import { type HerdrCli, HerdrCliError, isAgentNameTaken } from "./cli.ts";
import { takeFingerprint, waitForFreshReport } from "./freshness.ts";
import { isAgentDetected } from "./lifecycle.ts";
import { parseRoleFrontmatter, type RoleMetadata } from "./frontmatter.ts";
import {
  readLedger, writeLedger, createInitialLedger, updateLedgerStatus,
  updateLedgerStarted, type Ledger,
} from "./ledger.ts";
import {
  READINESS_DETECTION_TIMEOUT_MS, READY_DELAY_MS, ensureDirForFile,
  parseEnvInt, readRolePrompt, resolveWorkspaceId, sleep,
} from "./runtime.ts";
import { observeSettle } from "./settle-action.ts";
import { buildResult } from "./result.ts";
import { actionStartWarm } from "./worker-pool-actions.ts";

export async function actionStart(
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
