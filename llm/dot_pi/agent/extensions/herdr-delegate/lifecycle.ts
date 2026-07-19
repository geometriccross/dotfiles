/** Pure lifecycle decisions shared by start/wait orchestration and tests. */

/** A concrete status means Herdr has detected and registered the child agent. */
export function isAgentDetected(agentStatus: unknown): boolean {
  return typeof agentStatus === "string" && agentStatus.trim().length > 0;
}
