import type { HerdrCli } from "./cli.ts";
import { readLedger } from "./ledger.ts";
import { resolveCwd, validateTaskId } from "./validation.ts";
import { decideSettled } from "./settle.ts";
import { parseEnvInt, sleep } from "./runtime.ts";

export async function observeSettle(
  taskId: string,
  cwd: string,
  cli: HerdrCli,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const existingLedger = readLedger(cwd, taskId);
  const agentName = existingLedger?.worker_name ?? taskId;

  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = 2000;

  while (Date.now() < deadline) {
    const agent = await cli.agentGet(agentName);

    if (!agent) {
      return {
        status: "not_found",
        task_id: taskId,
        agent_name: agentName,
        cwd,
      };
    }

    const decision = decideSettled(agent.agent_status);

    if (decision.decision === "reusable") {
      return {
        status: "reusable",
        task_id: taskId,
        agent_name: agentName,
        agent_status: decision.agent_status,
        pane_id: agent.pane_id,
        tab_id: agent.tab_id,
        workspace_id: agent.workspace_id,
        cwd,
      };
    }

    if (decision.decision === "not_idle") {
      return {
        status: "not_idle",
        task_id: taskId,
        agent_name: agentName,
        agent_status: decision.agent_status,
        pane_id: agent.pane_id,
        tab_id: agent.tab_id,
        workspace_id: agent.workspace_id,
        cwd,
      };
    }

    // decision is "settling" (working) → keep waiting
    const remaining = Math.min(
      pollIntervalMs,
      Math.max(100, deadline - Date.now()),
    );
    await sleep(remaining);
  }

  // Deadline reached while agent was still working
  const agent = await cli.agentGet(agentName);

  const result: Record<string, unknown> = {
    status: "settling",
    deadline_reached: true,
    task_id: taskId,
    agent_name: agentName,
    cwd,
  };

  if (agent) {
    result.agent_status = agent.agent_status;
    result.pane_id = agent.pane_id;
    result.tab_id = agent.tab_id;
    result.workspace_id = agent.workspace_id;
  } else {
    result.agent_status = "not_found";
  }

  return result;
}

export async function actionSettle(
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

  // Settle timeout precedence:
  // 1. Explicit timeout_ms parameter
  // 2. HERDR_DELEGATE_SETTLE_TIMEOUT_MS env var (default 60000)
  const settleTimeoutMs =
    params.timeout_ms ||
    parseEnvInt("HERDR_DELEGATE_SETTLE_TIMEOUT_MS", 60000);

  return observeSettle(taskId, cwd, cli, settleTimeoutMs);
}
