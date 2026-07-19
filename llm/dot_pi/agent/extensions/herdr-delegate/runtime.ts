import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

export function resolveWorkspaceId(paramWs?: string): string {
  if (paramWs && paramWs.trim().length > 0) {
    return paramWs.trim();
  }
  if (process.env.HERDR_WORKSPACE_ID) {
    return process.env.HERDR_WORKSPACE_ID;
  }
  // Fallback: extract workspace prefix from HERDR_TAB_ID or HERDR_PANE_ID
  const tabId = process.env.HERDR_TAB_ID;
  if (tabId && tabId.includes(":")) {
    return tabId.split(":")[0];
  }
  const paneId = process.env.HERDR_PANE_ID;
  if (paneId && paneId.includes(":")) {
    return paneId.split(":")[0];
  }
  throw new Error(
    "Cannot resolve Herdr workspace id: no HERDR_WORKSPACE_ID, HERDR_TAB_ID, or HERDR_PANE_ID set",
  );
}

export function readRolePrompt(role: string): { content: string; path: string } {
  const base = process.env.PI_CODING_AGENT_DIR || resolve(homedir(), ".pi", "agent");
  const rolePath = resolve(base, "agents", `${role}.md`);
  if (!existsSync(rolePath)) {
    throw new Error(`Role prompt not found: ${rolePath}`);
  }
  const content = readFileSync(rolePath, "utf-8");
  return { content, path: rolePath };
}

export function ensureDirForFile(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function parseEnvInt(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) return defaultVal;
  return n;
}

export const READINESS_DETECTION_TIMEOUT_MS = 30_000;
export const READY_DELAY_MS = parseEnvInt("HERDR_DELEGATE_READY_DELAY_MS", 5000);
