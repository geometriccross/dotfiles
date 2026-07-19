import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface AgentSession {
  source: string;
  agent: string;
  kind: "id" | "path";
  value: string;
}

export interface TabCreateResult {
  tabId: string;
  rootPaneId: string;
}

export interface AgentStartResult {
  paneId: string;
  agentSession?: AgentSession;
}

export interface AgentGetResult {
  name: string;
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  agent_status: string;
  agent_session?: string;
}

/** Pure decision types and function for the continue action. */
export type ContinueDecision =
  | { decision: "not_found"; task_id: string }
  | {
      decision: "not_idle";
      task_id: string;
      agent_status: string;
      pane_id: string;
      tab_id: string;
      workspace_id: string;
    }
  | { decision: "busy"; agent: AgentGetResult }
  | { decision: "deliver"; agent: AgentGetResult };

/**
 * Pure decision function for the continue action.
 * Separated so the branching logic is testable without a live Herdr CLI.
 *
 * Live-Herdr evidence: a Pi pane with agent_status "done" is still
 * interactive and can process follow-up instructions via pane.run.
 * Therefore "done" is continuation-eligible (returns deliver).
 *
 * "working" returns busy — do NOT send a new instruction into an
 * agent that is actively processing a prior task.
 */
export function decideContinue(
  agent: AgentGetResult | null,
  taskId: string,
): ContinueDecision {
  if (!agent) {
    return { decision: "not_found", task_id: taskId };
  }
  if (agent.agent_status === "idle" || agent.agent_status === "done") {
    return { decision: "deliver", agent };
  }
  if (agent.agent_status === "working") {
    return { decision: "busy", agent };
  }
  return {
    decision: "not_idle",
    task_id: taskId,
    agent_status: agent.agent_status,
    pane_id: agent.pane_id,
    tab_id: agent.tab_id,
    workspace_id: agent.workspace_id,
  };
}

export interface AgentStatusEvent {
  event: "pane.agent_status_changed";
  data: {
    pane_id: string;
    agent_status: string;
  };
}

export class HerdrCliError extends Error {
  readonly commandArgs: string[];
  readonly exitCode?: number;

  constructor(message: string, commandArgs: string[], exitCode?: number) {
    super(message);
    this.name = "HerdrCliError";
    this.commandArgs = commandArgs;
    this.exitCode = exitCode;
  }
}

/**
 * Extract a JSON error code from a HerdrCliError's message.
 * Returns the error code string, or null if not found / not parseable.
 */
function extractErrorCode(msg: string): string | null {
  const firstBrace = msg.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = firstBrace; i < msg.length; i++) {
    if (msg[i] === '{') depth++;
    else if (msg[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(msg.slice(firstBrace, end + 1));
    const err =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>).error
        : undefined;
    if (
      err !== undefined &&
      typeof err === "object" &&
      typeof (err as Record<string, unknown>).code === "string"
    ) {
      return (err as Record<string, unknown>).code as string;
    }
    return null;
  } catch {
    return null;
  }
}

/** Pure helper: detect agent_name_taken from a HerdrCliError's JSON error body. */
export function isAgentNameTaken(error: HerdrCliError): boolean {
  return extractErrorCode(error.message) === "agent_name_taken";
}

/** Pure helper: detect tab_not_found from a HerdrCliError's JSON error body. */
export function isTabNotFoundError(error: HerdrCliError): boolean {
  return extractErrorCode(error.message) === "tab_not_found";
}

function parseJson(command: string, stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new HerdrCliError(
      `Herdr CLI ${command} returned malformed JSON: ${error}; stdout=${JSON.stringify(stdout)}`,
      command.split(" "),
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function resultRecord(command: string, stdout: string): Record<string, unknown> {
  const envelope = asRecord(parseJson(command, stdout));
  const result = asRecord(envelope?.result);
  if (!envelope || typeof envelope.id !== "string" || !result) {
    throw new HerdrCliError(
      `Herdr CLI ${command} returned an invalid id/result envelope`,
      command.split(" "),
    );
  }
  return result;
}

export function parseTabCreateOutput(stdout: string): TabCreateResult {
  const result = resultRecord("tab create", stdout);
  const tab = asRecord(result.tab);
  const rootPane = asRecord(result.root_pane);
  if (typeof tab?.tab_id !== "string" || typeof rootPane?.pane_id !== "string") {
    throw new HerdrCliError(
      "Herdr CLI tab create response missing result.tab.tab_id or result.root_pane.pane_id",
      ["tab", "create"],
    );
  }
  return { tabId: tab.tab_id, rootPaneId: rootPane.pane_id };
}

export function parseAgentStartOutput(stdout: string): AgentStartResult {
  const result = resultRecord("agent start", stdout);
  const agent = asRecord(result.agent);
  if (typeof agent?.pane_id !== "string") {
    throw new HerdrCliError(
      "Herdr CLI agent start response missing result.agent.pane_id",
      ["agent", "start"],
    );
  }

  const rawSession = asRecord(agent.agent_session);
  let agentSession: AgentSession | undefined;
  if (rawSession !== undefined) {
    if (
      typeof rawSession.source !== "string" ||
      typeof rawSession.agent !== "string" ||
      (rawSession.kind !== "id" && rawSession.kind !== "path") ||
      typeof rawSession.value !== "string"
    ) {
      throw new HerdrCliError(
        "Herdr CLI agent start response has malformed result.agent.agent_session",
        ["agent", "start"],
      );
    }
    agentSession = rawSession as unknown as AgentSession;
  }

  return { paneId: agent.pane_id, agentSession };
}

export function parseAgentStatusOutput(
  stdout: string,
  expectedStatus?: string,
): AgentStatusEvent {
  const parsed = asRecord(parseJson("wait agent-status", stdout));
  const data = asRecord(parsed?.data);
  if (
    parsed?.event !== "pane.agent_status_changed" ||
    typeof data?.pane_id !== "string" ||
    typeof data?.agent_status !== "string" ||
    data.agent_status.length === 0
  ) {
    throw new HerdrCliError(
      "Herdr CLI wait agent-status returned an unexpected event",
      ["wait", "agent-status"],
    );
  }
  if (
    expectedStatus !== undefined &&
    data.agent_status !== expectedStatus
  ) {
    throw new HerdrCliError(
      `Herdr CLI wait agent-status expected status "${expectedStatus}" but got "${data.agent_status}"`,
      ["wait", "agent-status"],
    );
  }
  return parsed as unknown as AgentStatusEvent;
}

export interface HerdrCli {
  tabCreate(workspaceId: string, label: string): Promise<TabCreateResult>;
  agentStart(options: {
    name: string;
    tabId: string;
    cwd: string;
    piBin: string;
    model: string;
    thinking: string;
    toolsCsv: string;
    rolePath: string;
  }): Promise<AgentStartResult>;
  paneClose(paneId: string): Promise<void>;
  paneRun(paneId: string, instruction: string): Promise<void>;
  waitAgentStatus(
    paneId: string,
    timeoutMs: number,
    status?: string,
  ): Promise<AgentStatusEvent>;
  agentGet(name: string): Promise<AgentGetResult | null>;
  paneRead(paneId: string, lines: number): Promise<string>;
  tabClose(tabId: string): Promise<void>;
}

export function createHerdrCli(
  pi: Pick<ExtensionAPI, "exec">,
  signal?: AbortSignal,
): HerdrCli {
  async function exec(args: string[], timeout: number = 10000): Promise<string> {
    const response = await pi.exec("herdr", args, { signal, timeout });
    if (response.code !== 0) {
      const detail = response.stderr.trim() || response.stdout.trim() || "no output";
      throw new HerdrCliError(
        `Herdr CLI ${args.slice(0, 2).join(" ")} failed with exit ${response.code}${response.killed ? " (killed)" : ""}: ${detail}`,
        args,
        response.code,
      );
    }
    return response.stdout;
  }

  async function expectOk(args: string[]): Promise<void> {
    const result = resultRecord(args.slice(0, 2).join(" "), await exec(args));
    if (result.type !== "ok") {
      throw new HerdrCliError(
        `Herdr CLI ${args.slice(0, 2).join(" ")} response missing result.type=ok`,
        args,
      );
    }
  }

  return {
    async tabCreate(workspaceId, label) {
      const args = ["tab", "create", "--workspace", workspaceId, "--label", label, "--no-focus"];
      return parseTabCreateOutput(await exec(args));
    },

    async agentStart(options) {
      const args = [
        "agent", "start", options.name,
        "--tab", options.tabId,
        "--cwd", options.cwd,
        "--no-focus", "--",
        options.piBin,
        "--name", options.name,
        "--model", options.model,
        "--thinking", options.thinking,
        "--tools", options.toolsCsv,
        "--append-system-prompt", options.rolePath,
      ];
      return parseAgentStartOutput(await exec(args));
    },

    paneClose(paneId) {
      return expectOk(["pane", "close", paneId]);
    },

    async paneRun(paneId, instruction) {
      await exec(["pane", "run", paneId, instruction]);
      // herdr pane run returns empty stdout on success; exit 0 (enforced by exec) is the success signal
    },

    async waitAgentStatus(paneId, timeoutMs, status = "idle") {
      const args = [
        "wait", "agent-status", paneId,
        "--status", status,
        "--timeout", String(timeoutMs),
      ];
      return parseAgentStatusOutput(
        await exec(args, timeoutMs + 5000),
        status,
      );
    },

    async agentGet(name: string): Promise<AgentGetResult | null> {
      const args = ["agent", "get", name];
      const response = await pi.exec("herdr", args, { signal, timeout: 10000 });
      const raw = (response.stdout || response.stderr || "").trim();

      let parsed: Record<string, unknown> | undefined;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // not JSON
      }

      if (parsed) {
        const err = asRecord(parsed.error);
        if (err?.code === "agent_not_found") return null;

        const result = asRecord(parsed.result);
        const agent = asRecord(result?.agent);
        if (agent) {
          const session = asRecord(agent.agent_session);
          return {
            name: String(agent.name || ""),
            pane_id: String(agent.pane_id || ""),
            tab_id: String(agent.tab_id || ""),
            workspace_id: String(agent.workspace_id || ""),
            agent_status: String(agent.agent_status || ""),
            agent_session: session?.value as string | undefined,
          };
        }
      }

      if (response.code !== 0) {
        throw new HerdrCliError(
          `Herdr CLI agent get failed with exit ${response.code}: ${raw}`,
          args,
          response.code,
        );
      }

      throw new HerdrCliError(
        `Herdr CLI agent get returned unexpected response: ${raw}`,
        args,
      );
    },

    paneRead(paneId, lines) {
      return exec([
        "pane", "read", paneId,
        "--source", "recent-unwrapped",
        "--lines", String(lines),
      ]);
    },

    async tabClose(tabId) {
      const args = ["tab", "close", tabId];
      try {
        await expectOk(args);
      } catch (e) {
        if (e instanceof HerdrCliError && isTabNotFoundError(e)) {
          return; // idempotent: tab already closed
        }
        throw e;
      }
    },
  };
}
