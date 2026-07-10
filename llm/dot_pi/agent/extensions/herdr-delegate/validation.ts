/**
 * Input validation helpers for herdr-delegate.
 * Pure functions — no side effects, no Pi or Herdr imports.
 */

import { resolve, isAbsolute, relative } from "node:path";

const TASK_ID_RE = /^[A-Za-z0-9._-]+$/;

/** Reject task_ids with /, .., shell metacharacters, or whitespace. */
export function validateTaskId(taskId: unknown): string {
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new Error("task_id must be a non-empty string");
  }
  if (!TASK_ID_RE.test(taskId)) {
    throw new Error(
      `task_id "${taskId}" contains invalid characters. Allowed: A-Za-z0-9._-`,
    );
  }
  return taskId;
}

/** Resolve cwd, defaulting to ctx.cwd. Must be absolute. */
export function resolveCwd(raw: string | undefined, ctxCwd: string): string {
  const cwd = raw ? resolve(raw) : resolve(ctxCwd);
  if (!isAbsolute(cwd)) {
    throw new Error(`cwd must be an absolute path, got "${cwd}"`);
  }
  return cwd;
}

/**
 * Ensure a report file path is inside `<cwd>/.agent-runs/<task_id>/`.
 * V1: only allow paths under the task-id runs directory.
 */
export function validateReportPath(
  raw: string,
  cwd: string,
  taskId: string,
): string {
  const resolved = resolve(cwd, raw);
  const allowedBase = resolve(cwd, ".agent-runs", taskId);
  const rel = relative(allowedBase, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `report_file_path "${raw}" resolves outside .agent-runs/${taskId}/`,
    );
  }
  return resolved;
}

/** Validate that a task file path stays under .agent-runs/<task_id>/tasks/. */
export function validateTaskFilePath(
  raw: string,
  cwd: string,
  taskId: string,
): string {
  const resolved = resolve(cwd, raw);
  const allowedBase = resolve(cwd, ".agent-runs", taskId, "tasks");
  const rel = relative(allowedBase, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `task_file_path "${raw}" resolves outside .agent-runs/${taskId}/tasks/`,
    );
  }
  return resolved;
}
