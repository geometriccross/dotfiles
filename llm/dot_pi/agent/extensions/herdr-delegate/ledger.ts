/**
 * JSON ledger read/write at .agent-runs/<task_id>/index.json.
 * Pure helpers — no Herdr or Pi imports.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TaskStatus } from "./state.ts";
import { assertTransition } from "./state.ts";

export interface LedgerEvent {
  at: string; // ISO-8601
  status: TaskStatus | "starting" | "continuing";
  message: string;
}

export interface Ledger {
  task_id: string;
  cwd: string;
  workspace_id: string;
  tab_id?: string;
  root_pane_id?: string;
  pane_id?: string;
  role: string;
  role_path: string;
  model: string;
  thinking: string;
  tools: string[];
  task_file_path: string;
  report_file_path: string;
  agent_session?: {
    source: string;
    agent: string;
    kind: "id" | "path";
    value: string;
  };
  status: TaskStatus;
  retry_count: number;
  attempt: number;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  failure_reason: string | null;
  integration_summary: string | null;
  verification_summary: string | null;
  events: LedgerEvent[];
  /** Warm-pool v2 extensions — all optional, tolerant of old ledgers. */
  schema_version?: number;
  worker_name?: string;
  lease_id?: string;
  task_file_revisions?: string[];
  baseline_fingerprint?: { size: number; mtimeMs: number; exists: boolean };
}

export function ledgerPath(cwd: string, taskId: string): string {
  return `${cwd}/.agent-runs/${taskId}/index.json`;
}

export function readLedger(cwd: string, taskId: string): Ledger | null {
  const p = ledgerPath(cwd, taskId);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");
  return JSON.parse(raw) as Ledger;
}

export function writeLedger(cwd: string, taskId: string, ledger: Ledger): void {
  const p = ledgerPath(cwd, taskId);
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(p, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
}

export function createInitialLedger(
  taskId: string,
  cwd: string,
  workspaceId: string,
  role: string,
  rolePath: string,
  model: string,
  thinking: string,
  tools: string[],
  taskFilePath: string,
  reportFilePath: string,
  retryCount: number,
  attempt: number,
): Ledger {
  const now = new Date().toISOString();
  return {
    task_id: taskId,
    cwd,
    workspace_id: workspaceId,
    tab_id: undefined,
    root_pane_id: undefined,
    pane_id: undefined,
    role,
    role_path: rolePath,
    model,
    thinking,
    tools,
    task_file_path: taskFilePath,
    report_file_path: reportFilePath,
    agent_session: undefined,
    status: "started" as TaskStatus,
    retry_count: retryCount,
    attempt,
    started_at: now,
    updated_at: now,
    finished_at: null,
    failure_reason: null,
    integration_summary: null,
    verification_summary: null,
    events: [
      {
        at: now,
        status: "starting",
        message: "ledger created",
      },
    ],
  };
}

export function updateLedgerStatus(
  ledger: Ledger,
  newStatus: TaskStatus,
  message: string,
  extras?: Partial<Pick<Ledger, "tab_id" | "root_pane_id" | "pane_id" | "agent_session" | "failure_reason">>,
): Ledger {
  assertTransition(ledger.status, newStatus);

  const now = new Date().toISOString();
  const updated: Ledger = {
    ...ledger,
    ...extras,
    status: newStatus,
    updated_at: now,
    events: [
      ...ledger.events,
      { at: now, status: newStatus, message },
    ],
  };

  if (newStatus === "reported" || newStatus === "failed" || newStatus === "cancelled" || newStatus === "cleaned") {
    updated.finished_at = now;
  }

  if (newStatus === "blocked" && extras?.failure_reason) {
    updated.failure_reason = extras.failure_reason;
  }
  if (newStatus === "failed" && extras?.failure_reason) {
    updated.failure_reason = extras.failure_reason;
  }

  return updated;
}

/**
 * Update ledger fields after agent start + instruction delivery.
 * This is NOT a state transition — status stays "started" but we record
 * the tab/pane/session info and add a "started" event.
 */
export function updateLedgerStarted(
  ledger: Ledger,
  tabId: string,
  rootPaneId: string,
  paneId: string,
  agentSession?: Ledger["agent_session"],
): Ledger {
  if (ledger.status !== "started") {
    throw new Error(
      `Cannot record agent start: ledger status is "${ledger.status}", expected "started"`,
    );
  }
  const now = new Date().toISOString();
  return {
    ...ledger,
    tab_id: tabId,
    root_pane_id: rootPaneId,
    pane_id: paneId,
    agent_session: agentSession,
    updated_at: now,
    events: [
      ...ledger.events,
      { at: now, status: "started", message: "agent started, instruction delivered" },
    ],
  };
}
