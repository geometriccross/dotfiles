/**
 * ReportFingerprint: pure, testable freshness detection for report files.
 *
 * Motivation (documented per live-Herdr evidence):
 *   A Pi pane with agent_status: "done" is still interactive and can be
 *   re-used via `herdr pane run`.  The old status therefore does NOT
 *   reliably signal that a *new* report has been written — it may have
 *   been the agent's completion state from a prior delivery.
 *
 *   Because continuation sends a *follow-up* instruction into an already-
 *   "done" (or idle) pane, the sole robust signal that the follow-up
 *   completed is a report file whose content has changed since we delivered
 *   the new instruction.
 *
 *   This module provides a fingerprint that captures existence, size, and
 *   mtime so that the continuation wait loop can gate on *fresh* output
 *   rather than on a stale agent_status.
 */

import { statSync, readFileSync } from "node:fs";

/**
 * Lightweight snapshot of a report file's observable state.
 * Pure comparison helper `isFresh` uses only these fields.
 */
export interface ReportFingerprint {
  exists: boolean;
  size: number;
  mtimeMs: number;
}

/**
 * Take a fingerprint of the file at `path`.
 * Returns exactly the observable state — no side effects beyond stat.
 */
export function takeFingerprint(path: string): ReportFingerprint {
  try {
    const st = statSync(path);
    return { exists: true, size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0 };
  }
}

/**
 * True when `after` represents a non-empty report file that differs from
 * `before` in any observable way: newly created, changed size, or changed
 * mtime (which covers same-content overwrites and truncate+rewrite).
 */
export function isFresh(
  before: ReportFingerprint,
  after: ReportFingerprint,
): boolean {
  if (!after.exists || after.size === 0) return false;
  if (!before.exists) return true;
  return before.size !== after.size || before.mtimeMs !== after.mtimeMs;
}

// ---------------------------------------------------------------------------
// Shared wait helpers (pure logic, no Herdr dependency)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read a non-empty regular file, or return null while it is unavailable. */
function readNonEmptyFile(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size === 0) return null;
    const content = readFileSync(path, "utf-8");
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/**
 * Shared fresh-report wait helper used by both start and continue.
 *
 * Polls only for a non-empty report whose fingerprint is fresh relative
 * to the pre-delivery baseline. Never inspects agent_status — freshness
 * is the sole completion signal.
 *
 * Returns full report content on success; throws on timeout.
 */
export async function waitForFreshReport(
  baseline: ReportFingerprint,
  reportPath: string,
  timeoutMs: number,
  pollIntervalMs: number = 2000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(
      Math.min(pollIntervalMs, Math.max(100, deadline - Date.now())),
    );
    const current = takeFingerprint(reportPath);
    if (isFresh(baseline, current)) {
      return readFileSync(reportPath, "utf-8");
    }
  }
  throw new Error(
    `fresh-report timeout after ${timeoutMs}ms: no fresh report detected`,
  );
}

/**
 * Standalone wait helper for action:"wait" (no pre-delivery baseline).
 *
 * Returns report content immediately if the configured report is currently
 * non-empty; otherwise polls for a non-empty report until the deadline.
 * Does NOT fabricate success — only returns when a non-empty report exists.
 */
export async function waitForNonEmptyReport(
  reportPath: string,
  timeoutMs: number,
  pollIntervalMs: number = 2000,
): Promise<string> {
  // Fast path: report already exists
  const immediate = readNonEmptyFile(reportPath);
  if (immediate !== null) return immediate;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(
      Math.min(pollIntervalMs, Math.max(100, deadline - Date.now())),
    );
    const content = readNonEmptyFile(reportPath);
    if (content !== null) return content;
  }
  throw new Error(
    `non-empty-report timeout after ${timeoutMs}ms: no report appeared`,
  );
}
