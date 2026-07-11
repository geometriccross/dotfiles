/**
 * Warm-pool registry for herdr-delegate.
 *
 * Pool path: `<cwd>/.agent-runs/.warm-pool/<workspace_id>.json`
 * Schema version: 2
 *
 * Pure module — no side effects, no live Herdr calls.
 * File I/O helpers only; all state transitions are synchronous pure functions.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve as pathResolve, relative } from "node:path";
import type { WarmWorkerState } from "./settle.ts";
import { assertWarmTransition } from "./settle.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WarmWorkerEntry {
  name: string;
  role: string;
  workspace_id: string;
  tab_id: string;
  pane_id: string;
  agent_session?: string; // session path for --resume / --session
  state: WarmWorkerState;
  leased_to_task?: string;
  lease_count: number;
  born_at: string; // ISO-8601
  last_lease_at?: string; // ISO-8601
  version: number;
}

export interface WarmPool {
  schema_version: 2;
  workspace_id: string;
  workers: WarmWorkerEntry[];
}

// ---------------------------------------------------------------------------
// Pool path helpers
// ---------------------------------------------------------------------------

export function poolDir(cwd: string): string {
  return pathResolve(cwd, ".agent-runs", ".warm-pool");
}

export function poolPath(cwd: string, workspaceId: string): string {
  return pathResolve(poolDir(cwd), `${workspaceId}.json`);
}

/**
 * Validate that a pool path is safe — no traversal escape, workspace-scoped.
 */
export function validatePoolPath(
  raw: string,
  cwd: string,
  workspaceId: string,
): string {
  const resolved = pathResolve(cwd, raw);
  const dir = poolDir(cwd);
  const rel = relative(dir, resolved);
  if (rel.startsWith("..") || rel === "" || resolved === dir) {
    throw new Error(
      `Pool path "${raw}" escapes .agent-runs/.warm-pool/`,
    );
  }
  const expected = poolPath(cwd, workspaceId);
  if (resolved !== expected) {
    throw new Error(
      `Pool path "${raw}" does not match workspace id "${workspaceId}"`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Pool I/O
// ---------------------------------------------------------------------------

export function readPool(cwd: string, workspaceId: string): WarmPool | null {
  const p = poolPath(cwd, workspaceId);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Tolerate schema_version missing (old pools) but ensure v2 when present
  if (parsed.schema_version !== undefined && parsed.schema_version !== 2) {
    throw new Error(
      `Unsupported pool schema_version: ${parsed.schema_version}`,
    );
  }
  // Normalize to v2 shape
  return {
    schema_version: 2,
    workspace_id: (parsed.workspace_id as string) || workspaceId,
    workers: (parsed.workers as WarmWorkerEntry[]) || [],
  };
}

export function writePool(
  cwd: string,
  workspaceId: string,
  pool: WarmPool,
): void {
  const p = poolPath(cwd, workspaceId);
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(p, JSON.stringify(pool, null, 2) + "\n", "utf-8");
}

export function createPool(workspaceId: string): WarmPool {
  return {
    schema_version: 2,
    workspace_id: workspaceId,
    workers: [],
  };
}

export function findWorker(
  pool: WarmPool,
  name: string,
): WarmWorkerEntry | undefined {
  return pool.workers.find((w) => w.name === name);
}

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------

/**
 * Sanitize a role string for use in a warm worker name.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims.
 */
export function sanitizeRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Generate a deterministic warm worker name.
 * Pattern: `warm-<sanitized-role>-<NN>` where NN is zero-padded positive integer.
 */
export function generateWarmWorkerName(
  role: string,
  existingNames: Set<string>,
): string {
  const sanitized = sanitizeRole(role);
  let n = 1;
  while (true) {
    const candidate = `warm-${sanitized}-${String(n).padStart(2, "0")}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
    n++;
  }
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

export interface LeaseCandidate {
  entry: WarmWorkerEntry;
  index: number;
}

/**
 * Select the best candidate for leasing from the pool.
 *
 * Criteria (priority order):
 *   1. workspace matches
 *   2. state is "ready" or "reusable"
 *   3. smallest lease_count
 *   4. oldest (or missing) last_lease_at
 *   5. deterministic name tie-break (lexicographic)
 */
export function selectCandidate(
  pool: WarmPool,
  workspaceId: string,
): LeaseCandidate | null {
  if (pool.workspace_id !== workspaceId) {
    return null;
  }

  const eligible: LeaseCandidate[] = [];
  for (let i = 0; i < pool.workers.length; i++) {
    const w = pool.workers[i];
    if (w.state === "ready" || w.state === "reusable") {
      eligible.push({ entry: w, index: i });
    }
  }

  if (eligible.length === 0) return null;

  // Sort ascending: smallest lease_count, then oldest last_lease_at, then name
  eligible.sort((a, b) => {
    const lc = a.entry.lease_count - b.entry.lease_count;
    if (lc !== 0) return lc;
    // null/missing last_lease_at sorts first (oldest — never leased)
    const aTs = a.entry.last_lease_at ?? "";
    const bTs = b.entry.last_lease_at ?? "";
    if (aTs !== bTs) {
      if (aTs === "") return -1;
      if (bTs === "") return 1;
      return aTs.localeCompare(bTs);
    }
    // Deterministic name tie-break
    return a.entry.name.localeCompare(b.entry.name);
  });

  return eligible[0];
}

// ---------------------------------------------------------------------------
// Lease (optimistic CAS)
// ---------------------------------------------------------------------------

export type LeaseResult =
  | { ok: true; pool: WarmPool; entry: WarmWorkerEntry }
  | {
      ok: false;
      conflict: "stale_version" | "not_eligible" | "not_found" | "wrong_workspace";
    };

/**
 * Attempt to lease a worker using optimistic CAS.
 *
 * @param pool            Current pool state (owned by caller)
 * @param workspaceId     Expected workspace id
 * @param name            Worker name
 * @param expectedVersion Expected version of the worker entry
 * @param taskId          Task id to lease the worker to
 * @returns               Updated pool on success, or conflict details
 */
export function leaseWorker(
  pool: WarmPool,
  workspaceId: string,
  name: string,
  expectedVersion: number,
  taskId: string,
): LeaseResult {
  if (pool.workspace_id !== workspaceId) {
    return { ok: false, conflict: "wrong_workspace" };
  }

  const idx = pool.workers.findIndex((w) => w.name === name);
  if (idx === -1) {
    return { ok: false, conflict: "not_found" };
  }

  const worker = pool.workers[idx];

  // Version must match
  if (worker.version !== expectedVersion) {
    return { ok: false, conflict: "stale_version" };
  }

  // Must be in ready or reusable state
  if (worker.state !== "ready" && worker.state !== "reusable") {
    return { ok: false, conflict: "not_eligible" };
  }

  // Transition
  assertWarmTransition(worker.state, "leased");

  const now = new Date().toISOString();
  const leased: WarmWorkerEntry = {
    ...worker,
    state: "leased",
    leased_to_task: taskId,
    lease_count: worker.lease_count + 1,
    last_lease_at: now,
    version: worker.version + 1,
  };

  const updatedPool: WarmPool = {
    ...pool,
    workers: [
      ...pool.workers.slice(0, idx),
      leased,
      ...pool.workers.slice(idx + 1),
    ],
  };

  return { ok: true, pool: updatedPool, entry: leased };
}

// ---------------------------------------------------------------------------
// Release (after settled successful task)
// ---------------------------------------------------------------------------

export type ReleaseResult =
  | { ok: true; pool: WarmPool; entry: WarmWorkerEntry }
  | {
      ok: false;
      conflict:
        | "stale_version"
        | "not_leased"
        | "not_owner"
        | "not_found"
        | "wrong_workspace";
    };

/**
 * Release a leased or settling worker back to reusable after a settled
 * successful task.
 *
 * Accepts workers in `leased` or `settling` state, provided the caller
 * owns the lease (`leased_to_task` matches `taskId`) and the expected
 * version matches (optimistic CAS).
 *
 * @param pool            Current pool state
 * @param workspaceId     Expected workspace id
 * @param name            Worker name
 * @param expectedVersion Expected version of the worker entry
 * @param taskId          Task id that owns the lease
 * @returns               Updated pool on success, or conflict details
 */
export function releaseWorker(
  pool: WarmPool,
  workspaceId: string,
  name: string,
  expectedVersion: number,
  taskId: string,
): ReleaseResult {
  if (pool.workspace_id !== workspaceId) {
    return { ok: false, conflict: "wrong_workspace" };
  }

  const idx = pool.workers.findIndex((w) => w.name === name);
  if (idx === -1) {
    return { ok: false, conflict: "not_found" };
  }

  const worker = pool.workers[idx];

  // Version must match
  if (worker.version !== expectedVersion) {
    return { ok: false, conflict: "stale_version" };
  }

  // Must be in leased or settling state
  if (worker.state !== "leased" && worker.state !== "settling") {
    return { ok: false, conflict: "not_leased" };
  }

  // Must own the lease
  if (worker.leased_to_task !== taskId) {
    return { ok: false, conflict: "not_owner" };
  }

  assertWarmTransition(worker.state, "reusable");

  const released: WarmWorkerEntry = {
    ...worker,
    state: "reusable",
    leased_to_task: undefined,
    version: worker.version + 1,
  };

  const updatedPool: WarmPool = {
    ...pool,
    workers: [
      ...pool.workers.slice(0, idx),
      released,
      ...pool.workers.slice(idx + 1),
    ],
  };

  return { ok: true, pool: updatedPool, entry: released };
}

// ---------------------------------------------------------------------------
// Mark dead
// ---------------------------------------------------------------------------

export type MarkDeadResult =
  | { ok: true; pool: WarmPool; entry: WarmWorkerEntry; oldState: WarmWorkerState }
  | { ok: false; conflict: "already_dead" | "not_found" | "wrong_workspace" };

/**
 * Explicitly mark a worker as dead from any state.
 * Clears lease owner and increments version.
 */
export function markWorkerDead(
  pool: WarmPool,
  workspaceId: string,
  name: string,
): MarkDeadResult {
  if (pool.workspace_id !== workspaceId) {
    return { ok: false, conflict: "wrong_workspace" };
  }

  const idx = pool.workers.findIndex((w) => w.name === name);
  if (idx === -1) {
    return { ok: false, conflict: "not_found" };
  }

  const worker = pool.workers[idx];

  if (worker.state === "dead") {
    return { ok: false, conflict: "already_dead" };
  }

  const oldState = worker.state;
  assertWarmTransition(worker.state, "dead");

  const dead: WarmWorkerEntry = {
    ...worker,
    state: "dead",
    leased_to_task: undefined,
    version: worker.version + 1,
  };

  const updatedPool: WarmPool = {
    ...pool,
    workers: [
      ...pool.workers.slice(0, idx),
      dead,
      ...pool.workers.slice(idx + 1),
    ],
  };

  return { ok: true, pool: updatedPool, entry: dead, oldState };
}

// ---------------------------------------------------------------------------
// Reconcile (pure, no CLI calls)
// ---------------------------------------------------------------------------

export type ReconcileResult =
  | { ok: true; pool: WarmPool; entry: WarmWorkerEntry; newState: WarmWorkerState }
  | { ok: false; conflict: "not_found" | "wrong_workspace" | "already_dead" };

/**
 * Pure reconcile: supplied probe result updates the pool entry state.
 *
 * - "idle" or "done": leased/settling → reusable (settled successfully)
 * - "working": leased/settling → settling (still processing)
 * - null: entry → dead (gone / not detectable)
 *
 * No CLI calls — the caller supplies the probe result.
 */
export function reconcileWorker(
  pool: WarmPool,
  workspaceId: string,
  name: string,
  probe: "idle" | "done" | "working" | null,
): ReconcileResult {
  if (pool.workspace_id !== workspaceId) {
    return { ok: false, conflict: "wrong_workspace" };
  }

  const idx = pool.workers.findIndex((w) => w.name === name);
  if (idx === -1) {
    return { ok: false, conflict: "not_found" };
  }

  const worker = pool.workers[idx];

  if (worker.state === "dead") {
    return { ok: false, conflict: "already_dead" };
  }

  let newState: WarmWorkerState;

  if (probe === "idle" || probe === "done") {
    // idle/done → reusable (from leased or settling only)
    if (worker.state === "leased" || worker.state === "settling") {
      newState = "reusable";
    } else {
      // ready or reusable already settled — no-op
      return { ok: true, pool, entry: worker, newState: worker.state };
    }
  } else if (probe === "working") {
    // working → settling (from leased only; settling/reusable/ready → no-op)
    if (worker.state === "leased") {
      newState = "settling";
    } else if (worker.state === "settling") {
      // Already settling — no-op
      return { ok: true, pool, entry: worker, newState: worker.state };
    } else {
      // ready or reusable — staying in current state (stale/out-of-sync)
      return { ok: true, pool, entry: worker, newState: worker.state };
    }
  } else {
    // null → dead
    newState = "dead";
  }

  assertWarmTransition(worker.state, newState);

  const updated: WarmWorkerEntry = {
    ...worker,
    state: newState,
    leased_to_task: newState === "dead" ? undefined : worker.leased_to_task,
    version: worker.version + 1,
  };

  const updatedPool: WarmPool = {
    ...pool,
    workers: [
      ...pool.workers.slice(0, idx),
      updated,
      ...pool.workers.slice(idx + 1),
    ],
  };

  return { ok: true, pool: updatedPool, entry: updated, newState };
}
