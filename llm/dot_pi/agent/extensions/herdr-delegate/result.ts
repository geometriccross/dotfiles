import { ledgerPath, type Ledger } from "./ledger.ts";

export function buildResult(
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
