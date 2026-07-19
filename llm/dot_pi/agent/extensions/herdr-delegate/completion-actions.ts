import { resolveCwd, validateTaskId } from "./validation.ts";
import { type AgentGetResult, type HerdrCli } from "./cli.ts";
import { decideSettled } from "./settle.ts";
import {
  readLedger, writeLedger, updateLedgerStatus,
} from "./ledger.ts";
import type { TaskStatus } from "./state.ts";
import {
  readPool, writePool, findWorker, releaseWorker, markWorkerDead,
} from "./warm.ts";
import { buildResult } from "./result.ts";

export async function actionMarkIntegrated(
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

export async function actionCleanup(
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
