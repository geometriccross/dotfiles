/**
 * State machine for Herdr task lifecycle.
 * Enforces valid transitions only.
 * Pure — no side effects.
 */

export type TaskStatus =
  | "started"
  | "reported"
  | "integrated"
  | "cleaned"
  | "blocked"
  | "failed";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  started: ["reported", "blocked", "failed"],
  reported: ["integrated", "failed"],
  integrated: ["cleaned"],
  cleaned: [],
  blocked: ["started", "failed"],
  failed: ["started"],
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
