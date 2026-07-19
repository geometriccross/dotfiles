import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  validateTaskId, resolveCwd, validateReportPath, validateTaskFilePath,
} from "./validation.ts";
import { buildContinuationInstruction } from "./instruction.ts";
import { type HerdrCli, decideContinue } from "./cli.ts";
import { takeFingerprint, waitForFreshReport, waitForNonEmptyReport } from "./freshness.ts";
import {
  readLedger, writeLedger, updateLedgerStatus, type Ledger,
} from "./ledger.ts";
import { ensureDirForFile, parseEnvInt } from "./runtime.ts";
import { observeSettle } from "./settle-action.ts";
import { buildResult } from "./result.ts";

export async function actionContinue(
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

export async function actionWait(
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
