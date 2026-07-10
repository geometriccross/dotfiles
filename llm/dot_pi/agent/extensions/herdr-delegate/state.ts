/**
 * State machine for Herdr task lifecycle.
 * Enforces valid transitions only.
 * Pure — no side effects.
 */

export type TaskStatus =
  | "started"
  | "reported"
  | "integrated"
  | "cancelled"
  | "cleaned"
  | "blocked"
  | "failed";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  started: ["reported", "blocked", "failed", "cancelled"],
  reported: ["integrated", "failed", "cancelled"],
  integrated: ["cleaned"],
  cancelled: ["cleaned"],
  cleaned: [],
  blocked: ["started", "failed", "cancelled", "cleaned"],
  failed: ["started", "cancelled", "cleaned"],
};

export function isTransitionAllowed(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertTransition(
  from: TaskStatus,
  to: TaskStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new Error(
      `Invalid state transition: ${from} -> ${to}`,
    );
  }
}
