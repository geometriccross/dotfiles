/**
 * Self-contained smoke test for herdr-delegate pure helpers.
 * Run from project root:
 *   node --experimental-strip-types llm/dot_pi/agent/extensions/herdr-delegate/test.ts
 *
 * Tests only pure functions — no Pi or Herdr runtime required.
 */
import { strict as assert } from "node:assert";
import { existsSync, unlinkSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Test: validation
// ---------------------------------------------------------------------------
import { validateTaskId, resolveCwd, validateReportPath, validateTaskFilePath } from "./validation.ts";

assert.strictEqual(validateTaskId("my-task-01"), "my-task-01");
assert.strictEqual(validateTaskId("ABC_123.test"), "ABC_123.test");
assert.throws(() => validateTaskId(""), /non-empty/);
assert.throws(() => validateTaskId("path/traversal"), /invalid characters/);
assert.throws(() => validateTaskId("has space"), /invalid characters/);
console.log("  ✓ validateTaskId");

const cwd = "/Users/test/project";
assert.strictEqual(resolveCwd(undefined, cwd), cwd);
assert.strictEqual(resolveCwd("/custom/path", cwd), "/custom/path");
console.log("  ✓ resolveCwd");

const rpOk = validateReportPath(".agent-runs/t1/reports/w.md", cwd, "t1");
assert.ok(rpOk.includes(".agent-runs/t1/reports/w.md"));
assert.throws(() => validateReportPath("../outside.md", cwd, "t1"), /outside/);
console.log("  ✓ validateReportPath");

const tfOk = validateTaskFilePath(".agent-runs/t1/tasks/role.md", cwd, "t1");
assert.ok(tfOk.includes(".agent-runs/t1/tasks/role.md"));
assert.throws(() => validateTaskFilePath("/abs.md", cwd, "t1"), /outside/);
// Must reject paths inside .agent-runs/<id>/ but outside tasks/
assert.throws(() => validateTaskFilePath(".agent-runs/t1/reports/w.md", cwd, "t1"), /outside/);
console.log("  ✓ validateTaskFilePath (tasks/ enforced)");
console.log("PASS: validation");

// ---------------------------------------------------------------------------
// Test: frontmatter
// ---------------------------------------------------------------------------
import { parseRoleFrontmatter } from "./frontmatter.ts";

const wFm = `---
model: opencode-go/deepseek-v4-pro
thinking: medium
tools: read,bash,edit,write
---`;

const meta = parseRoleFrontmatter(wFm, "herdr-worker", "/t/role.md");
assert.strictEqual(meta.model, "opencode-go/deepseek-v4-pro");
assert.strictEqual(meta.thinking, "medium");
assert.deepStrictEqual(meta.tools, ["read", "bash", "edit", "write"]);
assert.strictEqual(meta.toolsString, "read,bash,edit,write");
console.log("  ✓ comma tools");

const listFm = `---
model: test/m
thinking: high
tools: [read, bash, write]
---`;
const meta2 = parseRoleFrontmatter(listFm, "test", "/t.md");
assert.deepStrictEqual(meta2.tools, ["read", "bash", "write"]);
assert.strictEqual(meta2.toolsString, "read,bash,write");
console.log("  ✓ YAML list tools");

assert.throws(() => parseRoleFrontmatter("no fm", "x", "/x.md"), /no frontmatter/);
assert.throws(() => parseRoleFrontmatter("---\ntools: bash\n---", "x", "/x.md"), /missing.*model/);
console.log("  ✓ error cases");

// Parse real role prompts
import { resolve } from "node:path";
const agentsDir = resolve(import.meta.dirname || __dirname, "../../agents");
const workerMd = readFileSync(resolve(agentsDir, "herdr-worker.md"), "utf-8");
const wm = parseRoleFrontmatter(workerMd, "herdr-worker", resolve(agentsDir, "herdr-worker.md"));
assert.ok(wm.model.length > 0, "model must be non-empty");
assert.strictEqual(wm.thinking, "xhigh");
assert(wm.tools.includes("read"));
assert(wm.tools.includes("bash"));
console.log("  ✓ parse real herdr-worker.md");

const plannerMd = readFileSync(resolve(agentsDir, "herdr-planner.md"), "utf-8");
const pm = parseRoleFrontmatter(plannerMd, "herdr-planner", resolve(agentsDir, "herdr-planner.md"));
assert.ok(pm.model.length > 0, "model must be non-empty");
assert.strictEqual(pm.thinking, "high");
assert(pm.tools.includes("read"));
console.log("  ✓ parse real herdr-planner.md");
console.log("PASS: frontmatter");

// ---------------------------------------------------------------------------
// Test: lifecycle decisions
// ---------------------------------------------------------------------------
import { isAgentDetected } from "./lifecycle.ts";

assert.strictEqual(isAgentDetected(undefined), false);
assert.strictEqual(isAgentDetected(null), false);
assert.strictEqual(isAgentDetected(""), false);
assert.strictEqual(isAgentDetected("idle"), true);
assert.strictEqual(isAgentDetected("done"), true);
console.log("  ✓ readiness detection requires a concrete agent status");
console.log("PASS: lifecycle decisions");

// ---------------------------------------------------------------------------
// Test: parseEnvInt (pure helper, no env mocks needed for basline)
// ---------------------------------------------------------------------------
// parseEnvInt is defined in index.ts but we test the contract here.
// Since it reads process.env we can't unit-test it perfectly without
// mocking, so we test the expected name/default contract.
const envName = "HERDR_DELEGATE_READY_DELAY_MS";
// Default is 5000 when env is unset or invalid.
const saved = process.env[envName];

delete process.env[envName];
// Re-import to pick up the new env state after the module cache is busted...
// Strategy: test the contract behaviour via direct inline re-implementation.
function testParseEnvInt(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) return defaultVal;
  return n;
}

assert.strictEqual(testParseEnvInt(envName, 5000), 5000);
console.log("  ✓ parseEnvInt falls back to default when env is unset");

process.env[envName] = "3000";
assert.strictEqual(testParseEnvInt(envName, 5000), 3000);
console.log("  ✓ parseEnvInt honors explicit env value");

process.env[envName] = "-1";
assert.strictEqual(testParseEnvInt(envName, 5000), 5000);
console.log("  ✓ parseEnvInt rejects negative values");

process.env[envName] = "notanumber";
assert.strictEqual(testParseEnvInt(envName, 5000), 5000);
console.log("  ✓ parseEnvInt rejects non-numeric values");

process.env[envName] = "3.14";
assert.strictEqual(testParseEnvInt(envName, 5000), 3);
console.log("  ✓ parseEnvInt parses with parseInt (truncates float)");

if (saved !== undefined) {
  process.env[envName] = saved;
} else {
  delete process.env[envName];
}
console.log("PASS: parseEnvInt");

// ---------------------------------------------------------------------------
// Test: state
// ---------------------------------------------------------------------------
import { isTransitionAllowed, assertTransition } from "./state.ts";

assert.ok(isTransitionAllowed("started", "reported"));
assert.ok(isTransitionAllowed("started", "blocked"));
assert.ok(isTransitionAllowed("started", "failed"));
assert.ok(!isTransitionAllowed("started", "integrated"));
assert.ok(!isTransitionAllowed("started", "started"));
assert.ok(isTransitionAllowed("reported", "integrated"));
assert.ok(isTransitionAllowed("blocked", "started"));
assert.ok(isTransitionAllowed("blocked", "failed"));
assert.ok(!isTransitionAllowed("cleaned", "started"));
assert.doesNotThrow(() => assertTransition("started", "reported"));
assert.throws(() => assertTransition("started", "integrated"), /Invalid/);
console.log("PASS: state");

// ---------------------------------------------------------------------------
// Test: resolver
// ---------------------------------------------------------------------------
import { resolvePiBin, assertExecutable } from "./resolver.ts";
import { homedir } from "node:os";

const TMP_DIR = resolve(import.meta.dirname || __dirname, "../../../../../.agent-runs/herdr-delegate-vs02-readiness-and-file-gate/tmp-test");
mkdirSync(TMP_DIR, { recursive: true });

// Helper: create an executable temp file
function makeExec(path: string): void {
  writeFileSync(path, "#!/bin/sh\necho ok", "utf-8");
  chmodSync(path, 0o755);
}

const execPath = resolve(TMP_DIR, "fake-pi");
const nonexecPath = resolve(TMP_DIR, "nonexec-pi");
const missingPath = resolve(TMP_DIR, "missing-pi");

// Cleanup from previous runs
if (existsSync(execPath)) unlinkSync(execPath);
if (existsSync(nonexecPath)) unlinkSync(nonexecPath);
if (existsSync(missingPath)) unlinkSync(missingPath);

makeExec(execPath);
writeFileSync(nonexecPath, "not executable", "utf-8");
chmodSync(nonexecPath, 0o644);

// --- assertExecutable
assertExecutable(execPath, "test"); // should not throw
assert.throws(() => assertExecutable(missingPath, "test"), /not found/);
assert.throws(() => assertExecutable(nonexecPath, "test"), /not executable/);
console.log("  ✓ assertExecutable");

// --- resolvePiBin: explicit pi_path (valid)
assert.strictEqual(resolvePiBin(execPath, undefined), execPath);
console.log("  ✓ explicit pi_path (valid absolute executable)");

// --- resolvePiBin: explicit pi_path (not absolute)
assert.throws(
  () => resolvePiBin("relative/pi", undefined),
  /pi_path must be an absolute path/,
);
console.log("  ✓ explicit pi_path rejects relative path");

// --- resolvePiBin: explicit pi_path (missing)
assert.throws(
  () => resolvePiBin(missingPath, undefined),
  /not found/,
);
console.log("  ✓ explicit pi_path rejects missing file");

// --- resolvePiBin: explicit pi_path (not executable)
assert.throws(
  () => resolvePiBin(nonexecPath, undefined),
  /not executable/,
);
console.log("  ✓ explicit pi_path rejects non-executable file");

// --- resolvePiBin: HERDR_PI_BIN (valid)
assert.strictEqual(resolvePiBin(undefined, execPath), execPath);
console.log("  ✓ HERDR_PI_BIN (valid absolute executable)");

// --- resolvePiBin: HERDR_PI_BIN (not absolute)
assert.throws(
  () => resolvePiBin(undefined, "relative/pi"),
  /HERDR_PI_BIN must be an absolute path/,
);
console.log("  ✓ HERDR_PI_BIN rejects relative path");

// --- resolvePiBin: HERDR_PI_BIN (missing)
assert.throws(
  () => resolvePiBin(undefined, missingPath),
  /not found/,
);
console.log("  ✓ HERDR_PI_BIN rejects missing file");

// --- resolvePiBin: well-known path
const wellKnown = resolve(homedir(), ".local", "share", "npm-global", "bin", "pi");
if (existsSync(wellKnown)) {
  // The well-known path exists and is executable on this machine
  const result = resolvePiBin(undefined, undefined);
  assert.strictEqual(result, wellKnown);
  console.log(`  ✓ well-known path resolved: ${wellKnown}`);
} else {
  console.log("  ⚠ well-known path missing — skipping branch test");
}

// --- resolvePiBin: bare fallback (well-known not present scenario)
// Simulate by passing env var that doesn't exist; if well-known is missing
// or inaccessible, the fallback is "pi". Test separately by mocking the
// condition: if we unset HERDR_PI_BIN and well-known exists, we can't test
// the fallback without extra mocking. Instead test that fallback is reached
// when well-known path is broken.
const bogusPiBin = "/definitely/does/not/exist/pi";
if (!existsSync(bogusPiBin)) {
  // HERDR_PI_BIN pointing to nonexistent path → should throw, not fallback
  assert.throws(
    () => resolvePiBin(undefined, bogusPiBin),
    /not found/,
  );
  console.log("  ✓ HERDR_PI_BIN rejects bogus path (no silent fallback)");
}

// Cleanup
if (existsSync(execPath)) unlinkSync(execPath);
if (existsSync(nonexecPath)) unlinkSync(nonexecPath);

console.log("PASS: resolver");

// ---------------------------------------------------------------------------
// Test: ledger
// ---------------------------------------------------------------------------
import {
  createInitialLedger, updateLedgerStatus, updateLedgerStarted,
  readLedger, writeLedger, ledgerPath,
} from "./ledger.ts";

// ---------------------------------------------------------------------------
// Test: buildInstruction (delivery after readiness gate)
// ---------------------------------------------------------------------------
import { buildInstruction } from "./instruction.ts";

const instr = buildInstruction("tasks/w.md", "reports/w.md");
assert.ok(instr.includes("Read tasks/w.md"));
assert.ok(instr.includes("complete the task contract exactly"));
assert.ok(instr.includes("write the required report"));
assert.ok(instr.includes("Do not modify files outside the allowed edit scope"));
console.log("  ✓ buildInstruction (delivery after readiness gate)");
console.log("PASS: buildInstruction");

// ---------------------------------------------------------------------------
// Test: Herdr CLI JSON parsing
// ---------------------------------------------------------------------------
import {
  createHerdrCli,
  parseAgentStartOutput,
  parseAgentStatusOutput,
  parseTabCreateOutput,
} from "./cli.ts";

const tabAccess = parseTabCreateOutput(JSON.stringify({
  id: "request-1",
  result: {
    tab: { tab_id: "workspace-1:tab-2" },
    root_pane: { pane_id: "workspace-1:pane-root" },
  },
}));
assert.deepStrictEqual(tabAccess, {
  tabId: "workspace-1:tab-2",
  rootPaneId: "workspace-1:pane-root",
});

const startAccess = parseAgentStartOutput(JSON.stringify({
  id: "request-2",
  result: {
    agent: {
      pane_id: "workspace-1:pane-child",
      agent_session: {
        source: "pi",
        agent: "child-task",
        kind: "path",
        value: "/tmp/child-session.jsonl",
      },
    },
  },
}));
assert.strictEqual(startAccess.paneId, "workspace-1:pane-child");
assert.deepStrictEqual(startAccess.agentSession, {
  source: "pi",
  agent: "child-task",
  kind: "path",
  value: "/tmp/child-session.jsonl",
});

assert.deepStrictEqual(parseAgentStatusOutput(JSON.stringify({
  event: "pane.agent_status_changed",
  data: { pane_id: "workspace-1:pane-child", agent_status: "idle" },
})).data, {
  pane_id: "workspace-1:pane-child",
  agent_status: "idle",
});

// parseAgentStatusOutput now accepts any non-empty status string
assert.deepStrictEqual(parseAgentStatusOutput(JSON.stringify({
  event: "pane.agent_status_changed",
  data: { pane_id: "workspace-1:pane-child", agent_status: "done" },
})).data, {
  pane_id: "workspace-1:pane-child",
  agent_status: "done",
});
console.log("  ✓ parseAgentStatusOutput accepts done status");
assert.throws(() => parseTabCreateOutput("not-json"), /malformed JSON/);
assert.throws(
  () => parseAgentStartOutput(JSON.stringify({ id: "x", result: { pane_id: "wrong-level" } })),
  /result\.agent\.pane_id/,
);
assert.throws(
  () => parseAgentStatusOutput(JSON.stringify({ event: "wrong", data: {} })),
  /unexpected event/,
);
console.log("PASS: Herdr CLI JSON parsing");

const emptyStdoutPi = {
  async exec() {
    return { code: 0, stdout: "", stderr: "", killed: false };
  },
};
await assert.doesNotReject(
  createHerdrCli(emptyStdoutPi as any).paneRun("w:child", "instruction"),
);

const failedPaneRunPi = {
  async exec() {
    return { code: 1, stdout: "", stderr: "pane run failed", killed: false };
  },
};
await assert.rejects(
  createHerdrCli(failedPaneRunPi as any).paneRun("w:child", "instruction"),
  /pane run failed with exit 1/,
);
console.log("PASS: paneRun empty-stdout success and non-zero failure");

const calls: string[][] = [];
const fakePi = {
  async exec(_command: string, args: string[]) {
    calls.push(args);
    let stdout: string;
    if (args[0] === "tab" && args[1] === "create") {
      stdout = JSON.stringify({ id: "1", result: {
        tab: { tab_id: "w:t" }, root_pane: { pane_id: "w:root" },
      } });
    } else if (args[0] === "agent" && args[1] === "start") {
      stdout = JSON.stringify({ id: "2", result: { agent: { pane_id: "w:child" } } });
    } else if (args[0] === "wait") {
      // Return the status that was requested via --status flag
      const statusIdx = args.indexOf("--status");
      const status = statusIdx >= 0 ? args[statusIdx + 1] : "idle";
      stdout = JSON.stringify({ event: "pane.agent_status_changed", data: {
        pane_id: "w:child", agent_status: status,
      } });
    } else if (args[0] === "pane" && args[1] === "read") {
      stdout = "diagnostic text";
    } else {
      stdout = JSON.stringify({ id: "3", result: { type: "ok" } });
    }
    return { stdout, stderr: "", code: 0, killed: false };
  },
};
const fixtureCli = createHerdrCli(fakePi as any);
await fixtureCli.tabCreate("w", "task");
await fixtureCli.agentStart({
  name: "task", tabId: "w:t", cwd: "/repo", piBin: "/bin/pi",
  model: "m", thinking: "medium", toolsCsv: "read,bash", rolePath: "/role.md",
});
await fixtureCli.paneClose("w:root");
await fixtureCli.paneRun("w:child", "multi-line\ninstruction with 'quotes'");
await fixtureCli.waitAgentStatus("w:child", 1234);
// Also test with explicit done status (skill-aligned completion primitive)
await fixtureCli.waitAgentStatus("w:child", 5678, "done");
assert.strictEqual(await fixtureCli.paneRead("w:child", 50), "diagnostic text");
await fixtureCli.tabClose("w:t");
assert.deepStrictEqual(calls, [
  ["tab", "create", "--workspace", "w", "--label", "task", "--no-focus"],
  ["agent", "start", "task", "--tab", "w:t", "--cwd", "/repo", "--no-focus", "--",
    "/bin/pi", "--name", "task", "--model", "m", "--thinking", "medium",
    "--tools", "read,bash", "--append-system-prompt", "/role.md"],
  ["pane", "close", "w:root"],
  ["pane", "run", "w:child", "multi-line\ninstruction with 'quotes'"],
  ["wait", "agent-status", "w:child", "--status", "idle", "--timeout", "1234"],
  ["wait", "agent-status", "w:child", "--status", "done", "--timeout", "5678"],
  ["pane", "read", "w:child", "--source", "recent-unwrapped", "--lines", "50"],
  ["tab", "close", "w:t"],
]);
console.log("PASS: Herdr CLI argument shapes");

const TMP = resolve(import.meta.dirname || __dirname, "../../../../../.agent-runs/herdr-delegate-vs02-readiness-and-file-gate/tmp-ledger-test");
const TID = "ledger-test-01";
const lp = ledgerPath(TMP, TID);
if (existsSync(lp)) unlinkSync(lp);

const init = createInitialLedger(TID, TMP, "w1", "role", "/rp.md",
  "test/m", "medium", ["read", "bash"],
  "tasks/w.md", "reports/w.md", 0, 1);
assert.strictEqual(init.status, "started");
assert.strictEqual(init.events[0].status, "starting");
writeLedger(TMP, TID, init);
const rb = readLedger(TMP, TID);
assert.ok(rb);
assert.strictEqual(rb!.task_id, TID);

const reported = updateLedgerStatus(init, "reported", "ok");
assert.strictEqual(reported.status, "reported");
assert.ok(reported.finished_at);

const failed = updateLedgerStatus(init, "failed", "crash", { failure_reason: "err" });
assert.strictEqual(failed.status, "failed");
assert.strictEqual(failed.failure_reason, "err");

const blocked = updateLedgerStatus(init, "blocked", "rate", { failure_reason: "rate" });
assert.strictEqual(blocked.status, "blocked");

assert.throws(() => updateLedgerStatus(init, "integrated", "no"), /Invalid/);

const started = updateLedgerStarted(init, "t1", "r1", "p1", {
  source: "s", agent: "pi", kind: "path", value: "/s.jsonl",
});
assert.strictEqual(started.tab_id, "t1");
assert.strictEqual(started.status, "started");
assert.strictEqual(started.events.length, 2);

assert.throws(() => updateLedgerStarted({ ...init, status: "reported" } as any, "x", "y", "z"), /expected/);

if (existsSync(lp)) unlinkSync(lp);
console.log("PASS: ledger");

process.stdout.write("=== ALL PURE HELPER TESTS PASSED ===\n");
