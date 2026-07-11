/**
 * Input validation helpers for herdr-delegate.
 * Pure functions — no side effects, no Pi or Herdr imports.
 */

import { resolve, isAbsolute, relative, basename } from "node:path";

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

const WARM_NAME_RE = /^warm-[a-z0-9]+(?:-[a-z0-9]+)*-\d{2,}$/;

/** Validate warm worker names: `warm-<sanitized-role>-<NN>`. */
export function validateWarmWorkerName(name: unknown): string {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("warm worker name must be a non-empty string");
  }
  if (!WARM_NAME_RE.test(name)) {
    throw new Error(
      `Invalid warm worker name "${name}". Expected pattern: warm-<role>-<NN>`,
    );
  }
  return name;
}

/**
 * Validate that a report file path resolves to the canonical destination
 * `.agent-runs/<taskId>/reports/<role>.md`.
 *
 * `report_file_path` is optional for callers; when omitted the default
 * canonical path is used.  If supplied it must normalize to the canonical
 * path for the resolved role and task id — any noncanonical value fails
 * fast with a clear validation error.  The extension never silently polls
 * a path the role will not write.
 */
export function validateReportPath(
  raw: string,
  cwd: string,
  taskId: string,
  role: string,
): string {
  const resolved = resolve(cwd, raw);
  const allowedBase = resolve(cwd, ".agent-runs", taskId, "reports");
  const rel = relative(allowedBase, resolved);

  // 1. Path traversal / different task id / outside reports/
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `report_file_path "${raw}" resolves outside .agent-runs/${taskId}/reports/`,
    );
  }

  // 2. Must be directly inside reports/ — no subdirectories allowed.
  //    relative() returns just the filename when the file is directly
  //    inside allowedBase; any separator means a subdirectory.
  if (rel !== basename(rel)) {
    throw new Error(
      `report_file_path "${raw}" must be directly inside .agent-runs/${taskId}/reports/ ` +
      `(no subdirectories). Got relative path "${rel}".`,
    );
  }

  // 3. Canonical filename: must be exactly <role>.md
  const expectedFilename = `${role}.md`;
  const actualFilename = basename(resolved);
  if (actualFilename !== expectedFilename) {
    throw new Error(
      `report_file_path "${raw}" has noncanonical filename "${actualFilename}". ` +
      `Expected "${expectedFilename}" for role "${role}". ` +
      `The canonical path is .agent-runs/${taskId}/reports/${expectedFilename}. ` +
      `Omit report_file_path to use the default, or supply the exact canonical value.`,
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
