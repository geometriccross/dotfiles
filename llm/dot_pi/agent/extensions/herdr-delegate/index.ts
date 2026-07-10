/**
 * herdr-delegate: Pi extension that gives a parent orchestrator a typed
 * `herdr_delegate` tool for Herdr delegation.
 *
 * V1 scope: `start` and `wait` actions only.
 * - `start`: validate, write task + ledger, create a tab and agent through the
 *   Herdr CLI, close the root pane, then atomically deliver the instruction.
 * - `wait`: poll until a non-empty report file appears or the deadline expires,
 *   then update reported/blocked.
 *
 * No continuation, cancellation, integration marking, or cleanup in this slice.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  statSync,
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

import { buildInstruction } from "./instruction.ts";
import {
  createHerdrCli,
  type HerdrCli,
} from "./cli.ts";
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

/** Read a non-empty regular file, or return null while it is unavailable. */
function readNonEmptyFile(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size === 0) return null;
    const content = readFileSync(path, "utf-8");
    return content.length > 0 ? content : null;
  } catch {
    return null;
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

  // Create initial ledger
  const initialRetry = 0;
  const initialAttempt = 1;
  const ledger: Ledger = createInitialLedger(
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

  // 7. If wait=true, run the wait loop
  if (shouldWait) {
    return actionWait(
      { task_id: taskId, cwd, timeout_ms: _timeoutMs },
      ctx,
      cli,
    );
  }

  return buildResult(startedLedger);
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
  cli: HerdrCli,
): Promise<Record<string, unknown>> {
  const taskId = validateTaskId(params.task_id);
  const cwd = resolveCwd(params.cwd, ctx.cwd);
  const timeoutMs = params.timeout_ms || 900000; // 15 min default

  const currentLedger = readLedger(cwd, taskId);
  if (!currentLedger) {
    throw new Error(`No ledger found for task "${taskId}" at ${cwd}`);
  }

  const childPaneId = currentLedger.pane_id;
  if (!childPaneId) {
    throw new Error(`Ledger for "${taskId}" has no pane_id; was start completed?`);
  }

  const reportPath = resolve(cwd, currentLedger.report_file_path);

  // Primary wait: skill-aligned done-driven completion.
  // The herdr skill canonical completion primitive is
  //   herdr wait agent-status <pane> --status done --timeout <ms>
  let agentDone = false;
  try {
    await cli.waitAgentStatus(childPaneId, timeoutMs, "done");
    agentDone = true;
  } catch {
    // waitAgentStatus threw → timeout or error (agent did not reach done)
  }

  if (!agentDone) {
    const timeoutLedger = updateLedgerStatus(
      currentLedger,
      "blocked",
      `agent did not reach done within ${timeoutMs}ms`,
      { failure_reason: `timeout after ${timeoutMs}ms: agent did not reach done` },
    );
    writeLedger(cwd, taskId, timeoutLedger);
    return buildResult(timeoutLedger);
  }

  // Agent reached done — gate on report file
  const reportContent = readNonEmptyFile(reportPath);

  if (reportContent !== null) {
    const reportedLedger = updateLedgerStatus(
      currentLedger,
      "reported",
      "agent reached done, report file present and non-empty",
    );
    writeLedger(cwd, taskId, reportedLedger);

    const result = buildResult(reportedLedger);
    result.report_content = reportContent;
    return result;
  }

  // done reached but report missing/empty → fail-fast blocked
  const blockedLedger = updateLedgerStatus(
    currentLedger,
    "blocked",
    "agent reached done without a report",
    { failure_reason: "agent reached done without a report" },
  );
  writeLedger(cwd, taskId, blockedLedger);
  return buildResult(blockedLedger);
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
      "Use 'start' to launch a new child task, 'wait' to wait for completion. " +
      "V1 supports start and wait actions only.",
    promptSnippet:
      "Delegate a task to a Herdr-managed child agent (start or wait)",
    promptGuidelines: [
      "Use herdr_delegate with action='start' to launch a child Pi agent for implementation work. " +
        "Provide task_id, cwd, role, task_content, and report_file_path.",
      "Use herdr_delegate with action='wait' to wait for a previously started child to complete and gate on its report.",
      "Always check the returned status field: 'reported' means the child wrote a non-empty report; " +
        "'blocked' means the child is stuck; 'failed' means an unrecoverable error occurred.",
    ],
    parameters: Type.Object({
      action: StringEnum(["start", "wait"] as const, {
        description: "Action to perform: start a new child task, or wait for a running one",
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

      throw new Error(`Unknown action: ${action}`);
    },
  });
}
