import { strict as assert } from "node:assert";
import { executeDelegation } from "../delegation.ts";
import type { HerdrCli } from "../cli.ts";

const cli = {
  async agentGet() {
    return null;
  },
} as unknown as HerdrCli;

const result = await executeDelegation(
  { action: "settle", task_id: "missing-task", timeout_ms: 10 },
  { cli },
  { cwd: "/tmp" },
);

assert.deepStrictEqual(result, {
  status: "not_found",
  task_id: "missing-task",
  agent_name: "missing-task",
  cwd: "/tmp",
});

await assert.rejects(
  executeDelegation(
    { action: "invalid", task_id: "bad-action" },
    { cli },
    { cwd: "/tmp" },
  ),
  /Unknown action/,
);

console.log("PASS: delegation interface dispatches by observable result");
