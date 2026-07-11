/**
 * Warm-worker state machine and pure decision helpers for
 * herdr-delegate warm-worker lifecycle.
 *
 * Pure module — no side effects, no live Herdr calls, no async.
 * Only imports the AgentGetResult type from cli.ts.
 */
import type { AgentGetResult } from "./cli.ts";

// ---------------------------------------------------------------------------
// WarmWorkerState
// ---------------------------------------------------------------------------

export type WarmWorkerState =
  | "ready"
  | "leased"
  | "settling"
  | "reusable"
  | "dead";

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

/**
 * Allowed warm-worker transitions.
 * ready → leased, dead
 * leased → settling, reusable, dead
 * settling → reusable, dead
 * reusable → leased, dead
 * dead → (terminal, no outgoing transitions)
 */
export const WARM_TRANSITIONS: Record<WarmWorkerState, WarmWorkerState[]> = {
  ready: ["leased", "dead"],
  leased: ["settling", "reusable", "dead"],
  settling: ["reusable", "dead"],
  reusable: ["leased", "dead"],
  dead: [],
};

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

export function isWarmTransitionAllowed(
  from: WarmWorkerState,
  to: WarmWorkerState,
): boolean {
  const allowed = WARM_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertWarmTransition(
  from: WarmWorkerState,
  to: WarmWorkerState,
): void {
  if (!isWarmTransitionAllowed(from, to)) {
    throw new Error(
      `Invalid warm-worker state transition: ${from} -> ${to}`,
    );
  }
}

// ---------------------------------------------------------------------------
// SettleDecision — pure settlement observation
// ---------------------------------------------------------------------------

export type SettleDecision =
  | { decision: "reusable"; agent_status: string }
  | { decision: "settling"; agent_status: string }
  | { decision: "not_idle"; agent_status: string }
  | { decision: "not_found" };

/**
 * Pure settlement decision helper.
 *
 * Takes an optional observed agent_status string and returns a typed decision:
 *  - reusable: agent_status is "idle" or "done"
 *  - settling: agent_status is "working"
 *  - not_idle: agent_status is "blocked", "unknown", or any other recognised
 *    non-empty string
 *  - not_found: agent_status is null, undefined, or empty
 *
 * This mirrors the freshness module's status-independence lesson:
 * idle and done are both settlement-eligible; we do not gate exclusively on
 * "done" because an idle pane is equally ready for the next delivery.
 */
export function decideSettled(
  agentStatus: string | null | undefined,
): SettleDecision {
  if (agentStatus == null || agentStatus === "") {
    return { decision: "not_found" };
  }
  if (agentStatus === "idle" || agentStatus === "done") {
    return { decision: "reusable", agent_status: agentStatus };
  }
  if (agentStatus === "working") {
    return { decision: "settling", agent_status: agentStatus };
  }
  return { decision: "not_idle", agent_status: agentStatus };
}

// ---------------------------------------------------------------------------
// ReuseDecision — combined worker-state + agent-status decision
// ---------------------------------------------------------------------------

export type ReuseDecision =
  | { decision: "not_found"; task_id: string }
  | {
      decision: "deliver";
      agent: AgentGetResult;
      worker_state: WarmWorkerState;
    }
  | {
      decision: "settling";
      agent: AgentGetResult;
      worker_state: WarmWorkerState;
    }
  | {
      decision: "busy";
      agent: AgentGetResult;
      worker_state: WarmWorkerState;
    }
  | {
      decision: "not_idle";
      agent: AgentGetResult;
      worker_state: WarmWorkerState;
    };

/**
 * Pure reuse-decision helper that combines worker state + observed agent
 * status to decide whether a warm worker can accept a delivery.
 *
 * Decision matrix (priority order):
 *  1. Agent null → not_found
 *  2. agent_status ∈ {idle, done} AND workerState ∈ {ready, reusable}
 *     → deliver
 *  3. agent_status === "working" AND workerState === "leased" AND
 *     leased to a *different* task → busy
 *  4. agent_status === "working" AND workerState !== "reusable"
 *     → settling (truthful: still processing; do not inject)
 *  5. all other combinations → not_idle
 *
 * This is the warm-mode counterpart to decideContinue in cli.ts.
 * Unlike decideContinue (which treats working → busy), this function
 * distinguishes "settling" (same-task worker still processing) from
 * "busy" (worker leased to another task).
 */
export function decideReuse(
  agent: AgentGetResult | null,
  workerState: WarmWorkerState,
  leasedToTaskId: string | undefined,
  currentTaskId: string,
): ReuseDecision {
  if (!agent) {
    return { decision: "not_found", task_id: currentTaskId };
  }

  const idleOrDone =
    agent.agent_status === "idle" || agent.agent_status === "done";
  const isWorking = agent.agent_status === "working";
  const isReusable = workerState === "reusable";

  // Rule 2: dead worker → not_idle regardless of agent_status
  if (workerState === "dead") {
    return { decision: "not_idle", agent, worker_state: workerState };
  }

  // Rule 3: ready/reusable + idle/done → deliver
  if (
    idleOrDone &&
    (workerState === "ready" || isReusable)
  ) {
    return { decision: "deliver", agent, worker_state: workerState };
  }

  // Rule 4: working + leased to different task → busy
  if (
    isWorking &&
    workerState === "leased" &&
    leasedToTaskId !== undefined &&
    leasedToTaskId !== currentTaskId
  ) {
    return { decision: "busy", agent, worker_state: workerState };
  }

  // Rule 5: working + not reusable → settling
  if (isWorking && !isReusable) {
    return { decision: "settling", agent, worker_state: workerState };
  }

  // Rule 6: everything else → not_idle
  return { decision: "not_idle", agent, worker_state: workerState };
}
