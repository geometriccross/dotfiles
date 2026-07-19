import { strict as assert } from "node:assert";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInitialLedger, ledgerPath, readLedger, writeLedger, type Ledger } from "../ledger.ts";

// ---------------------------------------------------------------------------
// Test: warm.ts — warm-pool registry, lease/release, reconcile, selection
// ---------------------------------------------------------------------------
import {
  poolDir,
  poolPath,
  validatePoolPath,
  readPool,
  writePool,
  createPool,
  findWorker,
  sanitizeRole,
  generateWarmWorkerName,
  selectCandidate,
  leaseWorker,
  releaseWorker,
  markWorkerDead,
  reconcileWorker,
  type WarmPool,
  type WarmWorkerEntry,
  type LeaseCandidate,
  type LeaseResult,
  type ReleaseResult,
  type MarkDeadResult,
  type ReconcileResult,
} from "../warm.ts";

const WARM_TMP = resolve(
  import.meta.dirname || __dirname,
  "../../../../../../.agent-runs/herdr-delegate-warm-vs02-pool-registry/tmp-warm",
);
mkdirSync(WARM_TMP, { recursive: true });

// --- Pool path rejects unsafe/foreign workspace use ---
const WARM_WS = "workspace-1";
const WARM_WS2 = "workspace-2";

try {
  validatePoolPath("../../etc/passwd", WARM_TMP, WARM_WS);
  assert.fail("should throw on traversal");
} catch (e: any) {
  assert.ok(e.message.includes("escapes"));
}
console.log("  ✓ validatePoolPath rejects traversal");

try {
  validatePoolPath(".agent-runs/.warm-pool/workspace-2.json", WARM_TMP, WARM_WS);
  assert.fail("should throw on wrong workspace");
} catch (e: any) {
  assert.ok(e.message.includes("does not match workspace id"));
}
console.log("  ✓ validatePoolPath rejects wrong workspace");

// Valid path passes
const poolP = poolPath(WARM_TMP, WARM_WS);
const validatedPath = validatePoolPath(
  `.agent-runs/.warm-pool/${WARM_WS}.json`,
  WARM_TMP,
  WARM_WS,
);
assert.strictEqual(validatedPath, poolP);
console.log("  ✓ validatePoolPath accepts correct workspace");

// Pool path is scoped by workspace id
const p1 = poolPath(WARM_TMP, WARM_WS);
const p2 = poolPath(WARM_TMP, WARM_WS2);
assert.notStrictEqual(p1, p2, "different workspace → different pool file");
assert.ok(p1.endsWith("workspace-1.json"));
assert.ok(p2.endsWith("workspace-2.json"));
console.log("  ✓ poolPath scoped by workspace id");

// --- Name generation and validation ---
import { validateTaskId, validateWarmWorkerName } from "../validation.ts";

assert.strictEqual(sanitizeRole("herdr-worker"), "herdr-worker");
assert.strictEqual(sanitizeRole("Herdr Worker!"), "herdr-worker");
assert.strictEqual(sanitizeRole("  herdr--planner  "), "herdr-planner");
assert.strictEqual(sanitizeRole("herdr.cracker"), "herdr-cracker");
console.log("  ✓ sanitizeRole");

const gen1 = generateWarmWorkerName("herdr-worker", new Set());
assert.strictEqual(gen1, "warm-herdr-worker-01");
const gen2 = generateWarmWorkerName("herdr-worker", new Set(["warm-herdr-worker-01"]));
assert.strictEqual(gen2, "warm-herdr-worker-02");
const gen3 = generateWarmWorkerName("herdr-worker", new Set(["warm-herdr-worker-01", "warm-herdr-worker-02"]));
assert.strictEqual(gen3, "warm-herdr-worker-03");
// Complex role
const gen4 = generateWarmWorkerName("herdr-cracker", new Set());
assert.strictEqual(gen4, "warm-herdr-cracker-01");
console.log("  ✓ generateWarmWorkerName deterministic, skips existing");

// validateWarmWorkerName
assert.strictEqual(validateWarmWorkerName("warm-herdr-worker-01"), "warm-herdr-worker-01");
assert.strictEqual(validateWarmWorkerName("warm-herdr-planner-99"), "warm-herdr-planner-99");
assert.strictEqual(validateWarmWorkerName("warm-herdr-cracker-01"), "warm-herdr-cracker-01");
console.log("  ✓ validateWarmWorkerName accepts valid names");

assert.throws(() => validateWarmWorkerName(""), /non-empty/);
assert.throws(() => validateWarmWorkerName("herdr-worker"), /Invalid warm worker name/);
assert.throws(() => validateWarmWorkerName("warm-herdr-worker"), /Invalid warm worker name/);
assert.throws(() => validateWarmWorkerName("warm-herdr-worker-0"), /Invalid warm worker name/);
assert.throws(() => validateWarmWorkerName("warm-herdr_worker-01"), /Invalid warm worker name/);
assert.throws(() => validateWarmWorkerName("warm-herdr worker-01"), /Invalid warm worker name/);
console.log("  ✓ validateWarmWorkerName rejects invalid names");

// validateWarmWorkerName is independent of validateTaskId (separate gates)
// Warm names are a stricter subset; task ids admit patterns warm names reject.
assert.throws(() => validateWarmWorkerName("my-task"), /Invalid warm worker name/);
assert.doesNotThrow(() => validateTaskId("my-task"), "task-id validator unchanged");
// warm names pass task-id validator (subset), but task-id validator is NOT relaxed.
assert.doesNotThrow(() => validateTaskId("warm-herdr-worker-01"));
console.log("  ✓ validateWarmWorkerName is independent of validateTaskId");

// --- createPool and basic I/O ---
const pool = createPool(WARM_WS);
assert.strictEqual(pool.schema_version, 2);
assert.strictEqual(pool.workspace_id, WARM_WS);
assert.deepStrictEqual(pool.workers, []);
console.log("  ✓ createPool produces empty v2 pool");

// Clean up any leftover pool file
{
  const pp = poolPath(WARM_TMP, WARM_WS);
  if (existsSync(pp)) unlinkSync(pp);
}

writePool(WARM_TMP, WARM_WS, pool);
const readBack = readPool(WARM_TMP, WARM_WS);
assert.ok(readBack);
assert.strictEqual(readBack!.schema_version, 2);
assert.strictEqual(readBack!.workspace_id, WARM_WS);
assert.strictEqual(readBack!.workers.length, 0);
console.log("  ✓ writePool / readPool round-trip");

// Read non-existent pool returns null
const noPool = readPool(WARM_TMP, WARM_WS2);
assert.strictEqual(noPool, null);
console.log("  ✓ readPool returns null for missing pool");

// --- Worker entries for selection tests ---
function makeWorker(
  name: string,
  overrides: Partial<WarmWorkerEntry> = {},
): WarmWorkerEntry {
  return {
    name,
    role: "herdr-worker",
    workspace_id: WARM_WS,
    tab_id: `${WARM_WS}:tab-${name}`,
    pane_id: `${WARM_WS}:pane-${name}`,
    state: "ready",
    lease_count: 0,
    born_at: new Date().toISOString(),
    version: 0,
    ...overrides,
  };
}

// --- Deterministic candidate selection ---
const selectPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-herdr-worker-01", { state: "ready", lease_count: 5 }),
    makeWorker("warm-herdr-worker-02", { state: "ready", lease_count: 2 }),
    makeWorker("warm-herdr-worker-03", { state: "ready", lease_count: 2, last_lease_at: "2026-01-01T00:00:00.000Z" }),
    makeWorker("warm-herdr-worker-04", { state: "leased", lease_count: 1 }),
    makeWorker("warm-herdr-worker-05", { state: "reusable", lease_count: 7 }),
    makeWorker("warm-herdr-worker-06", { state: "dead", lease_count: 0 }),
  ],
};

// Best: worker-02 (smallest lease_count among ready) vs worker-03 (tied on lease_count but older last_lease_at)
const best = selectCandidate(selectPool, WARM_WS);
assert.ok(best, "should find a candidate");
assert.strictEqual(best!.entry.name, "warm-herdr-worker-02",
  "smallest lease_count (2) with null last_lease_at wins");
console.log("  ✓ selectCandidate: smallest lease_count wins");

// Tie-break: same lease_count, different last_lease_at
const tiePool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-worker-b", { state: "ready", lease_count: 1, last_lease_at: "2026-03-01T00:00:00.000Z" }),
    makeWorker("warm-worker-a", { state: "ready", lease_count: 1, last_lease_at: "2026-01-01T00:00:00.000Z" }),
  ],
};
const tieBest = selectCandidate(tiePool, WARM_WS);
assert.ok(tieBest);
assert.strictEqual(tieBest!.entry.name, "warm-worker-a", "oldest last_lease_at wins");
console.log("  ✓ selectCandidate: oldest last_lease_at tie-break");

// Tie-break: same lease_count, same last_lease_at → name
const nameTiePool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-worker-z", { state: "ready", lease_count: 0, last_lease_at: "2026-01-01T00:00:00.000Z" }),
    makeWorker("warm-worker-a", { state: "ready", lease_count: 0, last_lease_at: "2026-01-01T00:00:00.000Z" }),
  ],
};
const nameBest = selectCandidate(nameTiePool, WARM_WS);
assert.ok(nameBest);
assert.strictEqual(nameBest!.entry.name, "warm-worker-a", "lexicographic name tie-break");
console.log("  ✓ selectCandidate: deterministic name tie-break");

// No eligible candidates (all leased or dead)
const noEligiblePool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("w-1", { state: "leased", lease_count: 0 }),
    makeWorker("w-2", { state: "dead", lease_count: 0 }),
    makeWorker("w-3", { state: "settling", lease_count: 0 }),
  ],
};
assert.strictEqual(selectCandidate(noEligiblePool, WARM_WS), null);
console.log("  ✓ selectCandidate: null when no eligible (ready/reusable) workers");

// Wrong workspace → null
const wrongWsPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS2,
  workers: [makeWorker("w-1", { state: "ready", lease_count: 0, workspace_id: WARM_WS2 })],
};
assert.strictEqual(selectCandidate(wrongWsPool, WARM_WS), null);
console.log("  ✓ selectCandidate: null on workspace mismatch");

// --- Successful CAS lease ---
const leasePool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-w-01", { state: "ready", lease_count: 0, version: 0 }),
    makeWorker("warm-w-02", { state: "reusable", lease_count: 3, last_lease_at: "2026-06-01T00:00:00.000Z", version: 5 }),
  ],
};

// Lease from ready
const lr1 = leaseWorker(leasePool, WARM_WS, "warm-w-01", 0, "task-01");
assert.strictEqual(lr1.ok, true);
if (lr1.ok) {
  assert.strictEqual(lr1.entry.state, "leased");
  assert.strictEqual(lr1.entry.leased_to_task, "task-01");
  assert.strictEqual(lr1.entry.lease_count, 1);
  assert.strictEqual(lr1.entry.version, 1);
  assert.ok(lr1.entry.last_lease_at, "last_lease_at must be set on lease");
}
console.log("  ✓ leaseWorker: successful CAS from ready");

// Lease from reusable
const lr2 = leaseWorker(leasePool, WARM_WS, "warm-w-02", 5, "task-02");
assert.strictEqual(lr2.ok, true);
if (lr2.ok) {
  assert.strictEqual(lr2.entry.state, "leased");
  assert.strictEqual(lr2.entry.lease_count, 4, "should increment from 3 → 4");
  assert.strictEqual(lr2.entry.version, 6);
}
console.log("  ✓ leaseWorker: successful CAS from reusable");

// --- Stale version lease → conflict ---
const staleLr = leaseWorker(leasePool, WARM_WS, "warm-w-01", 99, "task-99");
assert.strictEqual(staleLr.ok, false);
if (!staleLr.ok) {
  assert.strictEqual(staleLr.conflict, "stale_version");
}
console.log("  ✓ leaseWorker: stale version → conflict");

// --- Double lease (not eligible state) → conflict ---
const doubleLeasePool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-w-03", { state: "leased", lease_count: 1, version: 3, leased_to_task: "task-03" }),
  ],
};
const dlr = leaseWorker(doubleLeasePool, WARM_WS, "warm-w-03", 3, "task-04");
assert.strictEqual(dlr.ok, false);
if (!dlr.ok) {
  assert.strictEqual(dlr.conflict, "not_eligible");
}
console.log("  ✓ leaseWorker: double lease / not-eligible → conflict");

// --- Not found → conflict ---
const nfLr = leaseWorker(leasePool, WARM_WS, "warm-nonexistent", 0, "task-x");
assert.strictEqual(nfLr.ok, false);
if (!nfLr.ok) {
  assert.strictEqual(nfLr.conflict, "not_found");
}
console.log("  ✓ leaseWorker: not_found → conflict");

// --- Wrong workspace → conflict ---
const wwLr = leaseWorker(leasePool, "workspace-99", "warm-w-01", 0, "task-x");
assert.strictEqual(wwLr.ok, false);
if (!wwLr.ok) {
  assert.strictEqual(wwLr.conflict, "wrong_workspace");
}
console.log("  ✓ leaseWorker: wrong_workspace → conflict");

// Lease does not mutate original pool (pure CAS)
const originalState = JSON.stringify(leasePool);
void lr1; // lease happened above, but leasePool should be unchanged
assert.strictEqual(JSON.stringify(leasePool), originalState, "leaseWorker is pure — original pool unchanged");
console.log("  ✓ leaseWorker: pool immutability (pure CAS)");

// --- Successful release ---
const releasePool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-w-01", { state: "leased", lease_count: 2, version: 4, leased_to_task: "task-01", last_lease_at: "2026-07-01T00:00:00.000Z" }),
  ],
};

const rel1 = releaseWorker(releasePool, WARM_WS, "warm-w-01", 4, "task-01");
assert.strictEqual(rel1.ok, true);
if (rel1.ok) {
  assert.strictEqual(rel1.entry.state, "reusable");
  assert.strictEqual(rel1.entry.leased_to_task, undefined);
  assert.strictEqual(rel1.entry.version, 5);
  assert.strictEqual(rel1.entry.last_lease_at, "2026-07-01T00:00:00.000Z", "last_lease_at preserved");
}
console.log("  ✓ releaseWorker: successful leased→reusable");

// --- Stale version release → conflict ---
const staleRel = releaseWorker(releasePool, WARM_WS, "warm-w-01", 99, "task-01");
assert.strictEqual(staleRel.ok, false);
if (!staleRel.ok) {
  assert.strictEqual(staleRel.conflict, "stale_version");
}
console.log("  ✓ releaseWorker: stale version → conflict");

// --- Not leased state → conflict ---
const notLeasedPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-w-01", { state: "ready", lease_count: 0, version: 0 }),
  ],
};
const nlRel = releaseWorker(notLeasedPool, WARM_WS, "warm-w-01", 0, "task-x");
assert.strictEqual(nlRel.ok, false);
if (!nlRel.ok) {
  assert.strictEqual(nlRel.conflict, "not_leased");
}
console.log("  ✓ releaseWorker: not_leased state → conflict");

// Release does not mutate original
const relOrig = JSON.stringify(releasePool);
void rel1;
assert.strictEqual(JSON.stringify(releasePool), relOrig, "releaseWorker is pure");
console.log("  ✓ releaseWorker: pool immutability");

// --- Settling owned worker successful release ---
const settlingPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-s-01", { state: "settling", lease_count: 3, version: 6, leased_to_task: "task-settle", last_lease_at: "2026-07-01T00:00:00.000Z" }),
  ],
};

const sRel1 = releaseWorker(settlingPool, WARM_WS, "warm-s-01", 6, "task-settle");
assert.strictEqual(sRel1.ok, true);
if (sRel1.ok) {
  assert.strictEqual(sRel1.entry.state, "reusable");
  assert.strictEqual(sRel1.entry.leased_to_task, undefined);
  assert.strictEqual(sRel1.entry.version, 7);
  assert.strictEqual(sRel1.entry.lease_count, 3, "lease_count preserved");
  assert.strictEqual(sRel1.entry.last_lease_at, "2026-07-01T00:00:00.000Z", "last_lease_at preserved");
}
console.log("  ✓ releaseWorker: settling owned worker → reusable");

// --- Settling wrong owner → conflict ---
const sRelWrongOwner = releaseWorker(settlingPool, WARM_WS, "warm-s-01", 6, "task-other");
assert.strictEqual(sRelWrongOwner.ok, false);
if (!sRelWrongOwner.ok) {
  assert.strictEqual(sRelWrongOwner.conflict, "not_owner");
}
console.log("  ✓ releaseWorker: settling wrong owner → not_owner conflict");

// --- Settling stale version → conflict ---
const sRelStaleVersion = releaseWorker(settlingPool, WARM_WS, "warm-s-01", 99, "task-settle");
assert.strictEqual(sRelStaleVersion.ok, false);
if (!sRelStaleVersion.ok) {
  assert.strictEqual(sRelStaleVersion.conflict, "stale_version");
}
console.log("  ✓ releaseWorker: settling stale version → stale_version conflict");

// --- Settling not_found → conflict ---
const sRelNotFound = releaseWorker(settlingPool, WARM_WS, "warm-nonexistent", 0, "task-x");
assert.strictEqual(sRelNotFound.ok, false);
if (!sRelNotFound.ok) {
  assert.strictEqual(sRelNotFound.conflict, "not_found");
}
console.log("  ✓ releaseWorker: settling not_found → not_found conflict");

// --- Settling wrong workspace → conflict ---
const sRelWrongWs = releaseWorker(settlingPool, "workspace-99", "warm-s-01", 6, "task-settle");
assert.strictEqual(sRelWrongWs.ok, false);
if (!sRelWrongWs.ok) {
  assert.strictEqual(sRelWrongWs.conflict, "wrong_workspace");
}
console.log("  ✓ releaseWorker: settling wrong workspace → wrong_workspace conflict");

// --- Settling immutability ---
const sOrig = JSON.stringify(settlingPool);
void sRel1; void sRelWrongOwner; void sRelStaleVersion;
assert.strictEqual(JSON.stringify(settlingPool), sOrig, "releaseWorker is pure for settling");
console.log("  ✓ releaseWorker: settling pool immutability");

// --- Regression: lease → settle → release full sequence ---
// Simulates production: ready → lease → reconciler marks settling → release → reusable
const regressionPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-regr-01", { state: "ready", lease_count: 0, version: 0 }),
  ],
};

// Step 1: lease
const regrLease = leaseWorker(regressionPool, WARM_WS, "warm-regr-01", 0, "task-regr");
assert.strictEqual(regrLease.ok, true);
if (regrLease.ok) {
  assert.strictEqual(regrLease.entry.state, "leased");
  assert.strictEqual(regrLease.entry.leased_to_task, "task-regr");
  assert.strictEqual(regrLease.entry.version, 1);
}

// Step 2: reconciler observes agent working → marks settling (simulates post-report)
const regrAfterLease = regrLease.ok ? regrLease.pool : regressionPool;
const regrSettle = reconcileWorker(regrAfterLease, WARM_WS, "warm-regr-01", "working");
assert.strictEqual(regrSettle.ok, true);
if (regrSettle.ok) {
  assert.strictEqual(regrSettle.newState, "settling");
  assert.strictEqual(regrSettle.entry.leased_to_task, "task-regr", "lease owner preserved through settling");
}

// Step 3: release from settling back to reusable (the fixed path)
const regrAfterSettle = regrSettle.ok ? regrSettle.pool : regrAfterLease;
const regrRelease = releaseWorker(regrAfterSettle, WARM_WS, "warm-regr-01", 2, "task-regr");
assert.strictEqual(regrRelease.ok, true);
if (regrRelease.ok) {
  assert.strictEqual(regrRelease.entry.state, "reusable");
  assert.strictEqual(regrRelease.entry.leased_to_task, undefined);
  assert.strictEqual(regrRelease.entry.version, 3);
  assert.strictEqual(regrRelease.entry.lease_count, 1, "lease_count intact through full sequence");
}
console.log("  ✓ releaseWorker: regression lease→settle→release full sequence");

// --- Mark dead from various states ---
const deadPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-d-ready", { state: "ready", version: 0 }),
    makeWorker("warm-d-leased", { state: "leased", version: 2, leased_to_task: "task-01", lease_count: 1 }),
    makeWorker("warm-d-settling", { state: "settling", version: 0 }),
    makeWorker("warm-d-reusable", { state: "reusable", version: 3, lease_count: 5 }),
  ],
};

// ready → dead
const mdReady = markWorkerDead(deadPool, WARM_WS, "warm-d-ready");
assert.strictEqual(mdReady.ok, true);
if (mdReady.ok) {
  assert.strictEqual(mdReady.entry.state, "dead");
  assert.strictEqual(mdReady.entry.leased_to_task, undefined);
  assert.strictEqual(mdReady.entry.version, 1);
  assert.strictEqual(mdReady.oldState, "ready");
}
console.log("  ✓ markWorkerDead: ready → dead");

// leased → dead (clears lease owner)
const mdLeased = markWorkerDead(deadPool, WARM_WS, "warm-d-leased");
assert.strictEqual(mdLeased.ok, true);
if (mdLeased.ok) {
  assert.strictEqual(mdLeased.entry.state, "dead");
  assert.strictEqual(mdLeased.entry.leased_to_task, undefined, "lease owner cleared");
  assert.strictEqual(mdLeased.entry.version, 3);
  assert.strictEqual(mdLeased.oldState, "leased");
}
console.log("  ✓ markWorkerDead: leased → dead clears lease owner");

// settling → dead
const mdSettling = markWorkerDead(deadPool, WARM_WS, "warm-d-settling");
assert.strictEqual(mdSettling.ok, true);
if (mdSettling.ok) {
  assert.strictEqual(mdSettling.entry.state, "dead");
  assert.strictEqual(mdSettling.oldState, "settling");
}
console.log("  ✓ markWorkerDead: settling → dead");

// reusable → dead
const mdReusable = markWorkerDead(deadPool, WARM_WS, "warm-d-reusable");
assert.strictEqual(mdReusable.ok, true);
if (mdReusable.ok) {
  assert.strictEqual(mdReusable.entry.state, "dead");
  assert.strictEqual(mdReusable.oldState, "reusable");
}
console.log("  ✓ markWorkerDead: reusable → dead");

// Already dead → conflict
const alreadyDeadPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [makeWorker("warm-d-dead", { state: "dead", version: 5 })],
};
const mdDead = markWorkerDead(alreadyDeadPool, WARM_WS, "warm-d-dead");
assert.strictEqual(mdDead.ok, false);
if (!mdDead.ok) {
  assert.strictEqual(mdDead.conflict, "already_dead");
}
console.log("  ✓ markWorkerDead: already_dead → conflict");

// Mark dead preserves immutability
const deadOrig = JSON.stringify(deadPool);
void mdReady; void mdLeased; void mdSettling; void mdReusable;
assert.strictEqual(JSON.stringify(deadPool), deadOrig, "markWorkerDead is pure");
console.log("  ✓ markWorkerDead: pool immutability");

// --- Reconcile matrix ---
const reconPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [
    makeWorker("warm-r-ready", { state: "ready", version: 0 }),
    makeWorker("warm-r-leased", { state: "leased", version: 1, leased_to_task: "task-01" }),
    makeWorker("warm-r-settling", { state: "settling", version: 0 }),
    makeWorker("warm-r-reusable", { state: "reusable", version: 2 }),
  ],
};

// idle → reusable (from leased)
const recIdleLeased = reconcileWorker(reconPool, WARM_WS, "warm-r-leased", "idle");
assert.strictEqual(recIdleLeased.ok, true);
if (recIdleLeased.ok) {
  assert.strictEqual(recIdleLeased.newState, "reusable");
  assert.strictEqual(recIdleLeased.entry.version, 2);
}
console.log("  ✓ reconcile: idle → leased becomes reusable");

// done → reusable (from settling)
const recDoneSettling = reconcileWorker(reconPool, WARM_WS, "warm-r-settling", "done");
assert.strictEqual(recDoneSettling.ok, true);
if (recDoneSettling.ok) {
  assert.strictEqual(recDoneSettling.newState, "reusable");
}
console.log("  ✓ reconcile: done → settling becomes reusable");

// working → settling (from leased)
const recWorkingLeased = reconcileWorker(reconPool, WARM_WS, "warm-r-leased", "working");
assert.strictEqual(recWorkingLeased.ok, true);
if (recWorkingLeased.ok) {
  assert.strictEqual(recWorkingLeased.newState, "settling");
}
console.log("  ✓ reconcile: working → leased becomes settling");

// working → ready (from ready — no-op, stale pool entry, can't transition to settling)
const recWorkingReady = reconcileWorker(reconPool, WARM_WS, "warm-r-ready", "working");
assert.strictEqual(recWorkingReady.ok, true);
if (recWorkingReady.ok) {
  assert.strictEqual(recWorkingReady.newState, "ready", "ready+working → no-op, stays ready");
  assert.strictEqual(recWorkingReady.entry.version, 0, "version unchanged for no-op");
}
console.log("  ✓ reconcile: working → ready is no-op (invalid transition)");

// null → dead (from any state)
const recNullReady = reconcileWorker(reconPool, WARM_WS, "warm-r-ready", null);
assert.strictEqual(recNullReady.ok, true);
if (recNullReady.ok) {
  assert.strictEqual(recNullReady.newState, "dead");
  assert.strictEqual(recNullReady.entry.leased_to_task, undefined);
}
console.log("  ✓ reconcile: null → ready becomes dead, clears lease owner");

const recNullReusable = reconcileWorker(reconPool, WARM_WS, "warm-r-reusable", null);
assert.strictEqual(recNullReusable.ok, true);
if (recNullReusable.ok) {
  assert.strictEqual(recNullReusable.newState, "dead");
}
console.log("  ✓ reconcile: null → reusable becomes dead");

// idle → ready (already settled — no-op, no version bump)
const recIdleReady = reconcileWorker(reconPool, WARM_WS, "warm-r-ready", "idle");
assert.strictEqual(recIdleReady.ok, true);
if (recIdleReady.ok) {
  assert.strictEqual(recIdleReady.newState, "ready", "ready with idle probe stays ready (no-op)");
  assert.strictEqual(recIdleReady.entry.version, 0, "version unchanged for no-op");
}
console.log("  ✓ reconcile: idle → ready is no-op (version unchanged)");

// idle → reusable already is no-op
const recIdleReusable = reconcileWorker(reconPool, WARM_WS, "warm-r-reusable", "idle");
assert.strictEqual(recIdleReusable.ok, true);
if (recIdleReusable.ok) {
  assert.strictEqual(recIdleReusable.newState, "reusable", "reusable with idle probe stays reusable");
  assert.strictEqual(recIdleReusable.entry.version, 2, "version unchanged");
}
console.log("  ✓ reconcile: idle → reusable is no-op");

// Reconcile dead → already_dead
const deadReconPool: WarmPool = {
  schema_version: 2,
  workspace_id: WARM_WS,
  workers: [makeWorker("warm-r-dead", { state: "dead", version: 5 })],
};
const recDead = reconcileWorker(deadReconPool, WARM_WS, "warm-r-dead", "idle");
assert.strictEqual(recDead.ok, false);
if (!recDead.ok) {
  assert.strictEqual(recDead.conflict, "already_dead");
}
console.log("  ✓ reconcile: dead worker → already_dead conflict");

// Reconcile does not mutate original
const reconOrig = JSON.stringify(reconPool);
void recIdleLeased; void recDoneSettling;
assert.strictEqual(JSON.stringify(reconPool), reconOrig, "reconcileWorker is pure");
console.log("  ✓ reconcileWorker: pool immutability");

// --- Full reconcile matrix ---
interface ReconCase {
  from: "ready" | "leased" | "settling" | "reusable";
  probe: "idle" | "done" | "working" | null;
  expected: "ready" | "leased" | "settling" | "reusable" | "dead";
}

const reconMatrix: ReconCase[] = [
  // ready worker
  { from: "ready", probe: "idle", expected: "ready" },
  { from: "ready", probe: "done", expected: "ready" },
  { from: "ready", probe: "working", expected: "ready" },
  { from: "ready", probe: null, expected: "dead" },
  // leased worker
  { from: "leased", probe: "idle", expected: "reusable" },
  { from: "leased", probe: "done", expected: "reusable" },
  { from: "leased", probe: "working", expected: "settling" },
  { from: "leased", probe: null, expected: "dead" },
  // settling worker
  { from: "settling", probe: "idle", expected: "reusable" },
  { from: "settling", probe: "done", expected: "reusable" },
  { from: "settling", probe: "working", expected: "settling" },
  { from: "settling", probe: null, expected: "dead" },
  // reusable worker
  { from: "reusable", probe: "idle", expected: "reusable" },
  { from: "reusable", probe: "done", expected: "reusable" },
  { from: "reusable", probe: "working", expected: "reusable" },
  { from: "reusable", probe: null, expected: "dead" },
];

let reconPass = 0;
for (const c of reconMatrix) {
  const rp: WarmPool = {
    schema_version: 2,
    workspace_id: WARM_WS,
    workers: [
      makeWorker(`warm-${c.from}`, { state: c.from, version: 0, leased_to_task: c.from === "leased" ? "task-01" : undefined }),
    ],
  };
  const result = reconcileWorker(rp, WARM_WS, `warm-${c.from}`, c.probe);
  assert.strictEqual(result.ok, true, `from=${c.from} probe=${c.probe}`);
  if (result.ok) {
    assert.strictEqual(
      result.newState,
      c.expected,
      `from=${c.from} probe=${c.probe}: expected ${c.expected}, got ${result.newState}`,
    );
  }
  reconPass++;
}
console.log(`  ✓ reconcile matrix: ${reconPass}/${reconMatrix.length} cases passed`);

// --- Ledger compatibility: old (no schema_version) parses ---
// (createInitialLedger, writeLedger, readLedger, ledgerPath already imported above)

const LEDGER_WARM_TMP = resolve(
  import.meta.dirname || __dirname,
  "../../../../../../.agent-runs/herdr-delegate-warm-vs02-pool-registry/tmp-ledger-warm",
);
mkdirSync(LEDGER_WARM_TMP, { recursive: true });

// Write an old-style ledger (no warm fields)
const oldLedger = createInitialLedger(
  "warm-compat-01",
  LEDGER_WARM_TMP,
  "ws1",
  "herdr-worker",
  "/rp.md",
  "test/m",
  "medium",
  ["read", "bash"],
  "tasks/w.md",
  "reports/w.md",
  0,
  1,
);
// Explicitly remove warm fields before writing to simulate old ledger
const oldLedgerClean: Record<string, unknown> = { ...oldLedger };
delete oldLedgerClean.schema_version;
delete oldLedgerClean.worker_name;
delete oldLedgerClean.lease_id;
delete oldLedgerClean.task_file_revisions;
delete oldLedgerClean.baseline_fingerprint;
const oldLp = ledgerPath(LEDGER_WARM_TMP, "warm-compat-01");
mkdirSync(dirname(oldLp), { recursive: true });
writeFileSync(oldLp, JSON.stringify(oldLedgerClean, null, 2) + "\n", "utf-8");

// Read it back — must parse without error (optional warm fields)
const oldRead = readLedger(LEDGER_WARM_TMP, "warm-compat-01");
assert.ok(oldRead, "old ledger without warm fields must parse");
assert.strictEqual(oldRead!.task_id, "warm-compat-01");
assert.strictEqual(oldRead!.schema_version, undefined, "schema_version absent in old ledger");
assert.strictEqual(oldRead!.worker_name, undefined);
assert.strictEqual(oldRead!.events.length, 1);
assert.strictEqual(oldRead!.events[0].status, "starting");
console.log("  ✓ cold/schema-less ledger parsing is tolerant");

// Write a ledger with warm fields populated
const warmLedger: Ledger = {
  ...oldRead!,
  schema_version: 2,
  worker_name: "warm-herdr-worker-01",
  lease_id: "lease-abc-123",
  task_file_revisions: ["abc123", "def456"],
  baseline_fingerprint: { size: 150, mtimeMs: 1234567890, exists: true },
};
writeLedger(LEDGER_WARM_TMP, "warm-compat-01", warmLedger);

const warmRead = readLedger(LEDGER_WARM_TMP, "warm-compat-01");
assert.ok(warmRead);
assert.strictEqual(warmRead!.schema_version, 2);
assert.strictEqual(warmRead!.worker_name, "warm-herdr-worker-01");
assert.strictEqual(warmRead!.lease_id, "lease-abc-123");
assert.deepStrictEqual(warmRead!.task_file_revisions, ["abc123", "def456"]);
assert.deepStrictEqual(warmRead!.baseline_fingerprint, { size: 150, mtimeMs: 1234567890, exists: true });
// Existing fields preserved
assert.strictEqual(warmRead!.task_id, "warm-compat-01");
assert.strictEqual(warmRead!.status, "started");
assert.strictEqual(warmRead!.events.length, 1);
assert.strictEqual(warmRead!.events[0].status, "starting");
console.log("  ✓ warm fields round-trip without clobbering existing ledger fields/events");

// Write ledger with warm fields then update status — events preserved
const reportedWarm = {
  ...warmRead!,
  status: "reported" as const,
  updated_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  events: [
    ...warmRead!.events,
    { at: new Date().toISOString(), status: "reported" as const, message: "done" },
  ],
};
writeLedger(LEDGER_WARM_TMP, "warm-compat-01", reportedWarm as Ledger);
const reportedWarmRead = readLedger(LEDGER_WARM_TMP, "warm-compat-01");
assert.ok(reportedWarmRead);
assert.strictEqual(reportedWarmRead!.events.length, 2, "two events — starting + reported");
assert.strictEqual(reportedWarmRead!.schema_version, 2, "warm fields survive status update");
assert.strictEqual(reportedWarmRead!.worker_name, "warm-herdr-worker-01");
console.log("  ✓ warm fields survive ledger status update without clobbering events");

// Cleanup test tmp files
if (existsSync(oldLp)) unlinkSync(oldLp);

console.log("PASS: warm-pool registry + ledger warm-field compatibility");
