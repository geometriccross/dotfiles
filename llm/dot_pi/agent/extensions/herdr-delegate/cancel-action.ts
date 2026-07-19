import { resolveCwd, validateTaskId } from "./validation.ts";
import { type AgentGetResult, type HerdrCli } from "./cli.ts";
import {
  readLedger, writeLedger, updateLedgerStatus, type Ledger,
} from "./ledger.ts";
import type { TaskStatus } from "./state.ts";
import { readPool, writePool, markWorkerDead } from "./warm.ts";
import { buildResult } from "./result.ts";

export async function actionCancel(
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
