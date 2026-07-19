import type { HerdrCli } from "./cli.ts";
import { actionStart } from "./start-action.ts";
import { actionContinue, actionWait } from "./continuation-actions.ts";
import { actionWarmStart } from "./worker-pool-actions.ts";
import { actionSettle } from "./settle-action.ts";
import { actionCancel } from "./cancel-action.ts";
import { actionMarkIntegrated, actionCleanup } from "./completion-actions.ts";

export interface DelegationDependencies {
  cli: HerdrCli;
}

export interface DelegationContext {
  cwd: string;
}

export async function executeDelegation(
  params: Record<string, unknown>,
  dependencies: DelegationDependencies,
  context: DelegationContext,
): Promise<Record<string, unknown>> {
  const { cli } = dependencies;
  const action = params.action as string;

  if (action === "start") {
    return actionStart(params as Parameters<typeof actionStart>[0], context, cli);
  }
  if (action === "wait") {
    return actionWait(params as Parameters<typeof actionWait>[0], context, cli);
  }
  if (action === "continue") {
    return actionContinue(
      params as Parameters<typeof actionContinue>[0],
      context,
      cli,
    );
  }
  if (action === "cancel") {
    return actionCancel(params as Parameters<typeof actionCancel>[0], context, cli);
  }
  if (action === "mark_integrated") {
    return actionMarkIntegrated(
      params as Parameters<typeof actionMarkIntegrated>[0],
      context,
      cli,
    );
  }
  if (action === "settle") {
    return actionSettle(params as Parameters<typeof actionSettle>[0], context, cli);
  }
  if (action === "cleanup") {
    return actionCleanup(
      params as Parameters<typeof actionCleanup>[0],
      context,
      cli,
    );
  }
  if (action === "warm_start") {
    return actionWarmStart(
      params as Parameters<typeof actionWarmStart>[0],
      context,
      cli,
    );
  }

  throw new Error(`Unknown action: ${action}`);
}
