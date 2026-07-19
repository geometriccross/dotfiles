import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

import { isHerdrRuntime } from "./availability.ts";
import { createHerdrCli } from "./cli.ts";
import { executeDelegation } from "./delegation.ts";

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  if (!isHerdrRuntime(process.env)) return;

  pi.registerTool({
    name: "herdr_delegate",
    label: "Herdr Delegate",
    description:
      "Delegate a task to a Herdr-managed child Pi agent after the root AGENTS.md routing policy selects orchestration. " +
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
      "Use herdr_delegate only when the root AGENTS.md routing policy selects orchestration; ordinary work stays in direct execution mode.",
      "After orchestration is selected, use herdr_delegate with action='start' to launch a child Pi agent (cold mode). " +
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
            "Role name matching a prompt in $PI_CODING_AGENT_DIR/agents/<role>.md (default: herdr-worker)",
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
      const result = await executeDelegation(
        params,
        { cli: createHerdrCli(pi, signal) },
        ctx,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}
