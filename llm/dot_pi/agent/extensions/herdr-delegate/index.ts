/**
 * herdr-delegate: Pi extension that gives a parent orchestrator a typed
 * `herdr_delegate` tool for Herdr delegation.
 *
 * Actions: `start`, `wait`, `continue`.
 * - `start`: validate, write task + ledger, create a tab and agent through the
 *   Herdr CLI, close the root pane, then atomically deliver the instruction.
 * - `wait`: poll until a non-empty report file appears or the deadline expires,
 *   then update reported/blocked.
 * - `continue`: resolve an existing agent by name and deliver a follow-up
 *   instruction via pane.run (no new tab created).
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
    label?: string;
    pi_path?: string;
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const role = params.role || "herdr-worker";
  const taskContent = params.task_content;
  const _timeoutMs = params.timeout_ms || 900000;
  const shouldWait = params.wait !== false; // default true
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

  // 3. pane.close root pane so child owns the dedicated tab
  try {
    await cli.paneClose(rootPaneId);
  } catch {
    // Non-fatal; tab still usable even if root is open
  }

  // 4. Wait until Herdr has detected the child, then allow Pi's input box to
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

  // 5. Snapshot report fingerprint BEFORE delivery (freshness baseline)
  const reportAbsPath = resolve(cwd, reportFilePath);
  const preFingerprint = takeFingerprint(reportAbsPath);

  // 6. Atomically deliver text + Enter with herdr pane run.
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

  // 7. Write started ledger (only after instruction delivery succeeds)
  const startedLedger = updateLedgerStarted(
    withTab,
    tabId,
    rootPaneId,
    childPaneId,
    agentSession,
  );
  writeLedger(cwd, taskId, startedLedger);

  // 8. If wait=true, poll for fresh report (NOT done-driven wait)
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
  },
  ctx: { cwd: string },
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const taskContent = params.task_content;
  const shouldWait = params.wait !== false;
  const _timeoutMs = params.timeout_ms || 900000;

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
  validateReportPath(reportFilePath, cwd, taskId);

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
  const existingLedger = readLedger(cwd, taskId);
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
      "'cancel' to terminate a running task, " +
      "'mark_integrated' to advance a reported task to integrated, " +
      "'cleanup' to close the task tab and mark as cleaned.",
    promptSnippet:
      "Delegate a task to a Herdr-managed child agent (start or wait)",
    promptGuidelines: [
      "Use herdr_delegate with action='start' to launch a child Pi agent for implementation work. " +
        "Provide task_id, cwd, role, task_content, and report_file_path.",
      "Use herdr_delegate with action='wait' to wait for a previously started child to complete and gate on its report.",
      "Use herdr_delegate with action='continue' to send a follow-up instruction to an existing idle/working child agent.",
      "Use herdr_delegate with action='cancel' to terminate a running child task (closes tab, marks ledger cancelled).",
      "Use herdr_delegate with action='mark_integrated' to advance a reported task to the integrated state.",
      "Use herdr_delegate with action='cleanup' to close the task's tab/pane and mark the ledger as cleaned.",
      "Always check the returned status field: 'reported' means the child wrote a non-empty report; " +
        "'blocked' means the child is stuck; 'failed' means an unrecoverable error occurred; " +
        "'already_running' means the agent exists from a prior start; 'not_found' means no agent with that name exists; " +
        "'busy' means the agent is actively working and cannot accept a continue right now; " +
        "'not_idle' means the agent is blocked/unknown and cannot accept a continue; " +
        "'cancelled' means the task was successfully cancelled and its tab closed; " +
        "'cleaned' means the task's tab/pane has been closed and the task is cleaned; " +
        "'not_reported' means the task is not in reported state and cannot be integrated; " +
        "'not_ready_for_cleanup' means the task is still started/reported and cannot be cleaned yet.",
    ],
    parameters: Type.Object({
      action: StringEnum(["start", "wait", "continue", "cancel", "mark_integrated", "cleanup"] as const, {
        description: "Action to perform: start, wait, continue, cancel, mark_integrated, or cleanup",
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
            "Relative path where the child must write its report (default: .agent-runs/<task_id>/reports/<role>.md). Must stay under .agent-runs/<task_id>/",
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

      if (action === "cleanup") {
        const result = await actionCleanup(params as Parameters<typeof actionCleanup>[0], ctx, cli);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      throw new Error(`Unknown action: ${action}`);
    },
  });
}
