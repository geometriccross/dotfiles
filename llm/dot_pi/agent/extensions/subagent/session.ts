/**
 * Nested in-process agent session for the subagent tool.
 *
 * The session has its own message history, compaction, retries, and tool set, so
 * the parent conversation stays isolated. Only the final report leaves this module.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	createCodemodeExtension,
	createMcpExtension,
	createToolSearchExtension,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { blockText, clip, previewResult, summarizeArgs, toolUsesLabel } from "./format.ts";

const MAX_ACTIVITY = 40;

const DEFAULT_SYSTEM = `You are a subagent. Another agent delegated one task to you; that task is the user message.

Work autonomously with the tools you have. Do not ask questions or wait for approval; state assumptions and proceed.
Some instructions from the parent's context may mention tools this child does not have (for example wiki tools); ignore those and use the tools you have.
Your context is separate from the caller's, so explore and read as much as the task needs.
If the findings are long, write them to a temporary file (for example under /tmp) and return the path with a short digest.
Pass a timeout to bash for commands that may run long; do not leave a command running without one.
Final reply: a compact report the caller can act on. Include exact file paths, line numbers, commands, error messages, and the conclusion. Do not narrate your process or repeat raw output.`;

export interface ToolActivity {
	kind: "tool";
	id?: string;
	name: string;
	args?: string;
	status: "running" | "ok" | "error";
	preview?: string;
}

export interface TextActivity {
	kind: "text";
	text: string;
}

export type Activity = ToolActivity | TextActivity;

export interface SubagentDetails {
	description?: string;
	model?: string;
	turns: number;
	toolUses: number;
	activity: Activity[];
	dropped: number;
	usage: Usage;
	stopReason?: string;
	errorMessage?: string;
}

export interface RunOptions {
	task: string;
	description?: string;
	systemPrompt: string;
	model: Model<Api> | undefined;
	thinkingLevel: ThinkingLevel | undefined;
	tools: string[];
	cwd: string;
	timeoutMs: number;
	extensionPaths: string[];
	signal?: AbortSignal;
	onUpdate?: (details: SubagentDetails) => void;
}

export interface RunResult {
	details: SubagentDetails;
	finalText: string;
	aborted: boolean;
	timedOut: boolean;
	timeoutMs: number;
	promptError?: string;
}

export function buildSystemPrompt(extra: string | undefined): string {
	const trimmed = extra?.trim();
	return trimmed ? `${DEFAULT_SYSTEM}\n\nAdditional instructions from the caller:\n${trimmed}` : DEFAULT_SYSTEM;
}

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function addUsage(total: Usage, usage: Usage | undefined): void {
	if (!usage) return;
	total.input += usage.input || 0;
	total.output += usage.output || 0;
	total.cacheRead += usage.cacheRead || 0;
	total.cacheWrite += usage.cacheWrite || 0;
	total.totalTokens += usage.totalTokens || 0;
	total.cost.input += usage.cost?.input || 0;
	total.cost.output += usage.cost?.output || 0;
	total.cost.cacheRead += usage.cost?.cacheRead || 0;
	total.cost.cacheWrite += usage.cost?.cacheWrite || 0;
	total.cost.total += usage.cost?.total || 0;
}

function createDetails(description: string | undefined): SubagentDetails {
	return {
		description,
		turns: 0,
		toolUses: 0,
		activity: [],
		dropped: 0,
		usage: emptyUsage(),
	};
}

function pushActivity(details: SubagentDetails, entry: Activity): void {
	details.activity.push(entry);
	if (details.activity.length > MAX_ACTIVITY) {
		details.activity.shift();
		details.dropped++;
	}
}

function dropFinalTextEntry(details: SubagentDetails, entry: TextActivity | undefined): void {
	if (!entry) return;
	const index = details.activity.indexOf(entry);
	if (index >= 0) details.activity.splice(index, 1);
}

function applyEvent(
	details: SubagentDetails,
	event: AgentSessionEvent,
	state: { finalText: string; lastTextEntry?: TextActivity },
): boolean {
	if (event.type === "message_end") {
		const message = event.message;
		if (message.role !== "assistant") return false;
		details.turns++;
		addUsage(details.usage, message.usage);
		if (!details.model && typeof message.model === "string") details.model = message.model;
		if (typeof message.stopReason === "string") details.stopReason = message.stopReason;
		if (typeof message.errorMessage === "string") details.errorMessage = clip(message.errorMessage, 300);
		const text = blockText(message.content).trim();
		if (text) {
			state.finalText = text;
			state.lastTextEntry = { kind: "text", text: clip(text, 240) };
			pushActivity(details, state.lastTextEntry);
		}
		return true;
	}

	if (event.type !== "tool_execution_start" && event.type !== "tool_execution_end") return false;

	// Nested calls (for example inside codemode) are already summarized by their parent tool.
	if ("parentToolCallId" in event && event.parentToolCallId) return false;

	if (event.type === "tool_execution_start") {
		details.toolUses++;
		pushActivity(details, {
			kind: "tool",
			id: event.toolCallId,
			name: event.toolName,
			args: summarizeArgs(event.args),
			status: "running",
		});
		return true;
	}

	const entry = details.activity.find(
		(item): item is ToolActivity => item.kind === "tool" && item.id === event.toolCallId,
	);
	if (!entry) return false;
	entry.status = event.isError ? "error" : "ok";
	entry.preview = previewResult(event.toolName, event.result);
	entry.id = undefined;
	return true;
}

export function progressText(details: SubagentDetails): string {
	const tools = details.activity.filter((entry): entry is ToolActivity => entry.kind === "tool");
	const current = [...tools].reverse().find((entry) => entry.status === "running") ?? tools[tools.length - 1];
	const label = current ? `${current.name}${current.args ? `(${current.args})` : ""}` : "starting";
	return `subagent: ${toolUsesLabel(details.toolUses)} · ${label}`;
}

export async function runSubagent(options: RunOptions): Promise<RunResult> {
	const details = createDetails(options.description);
	const state: { finalText: string; lastTextEntry?: TextActivity } = { finalText: "" };
	let aborted = false;
	let timedOut = false;
	let promptError: string | undefined;

	const notify = () => options.onUpdate?.(details);
	notify();

	const agentDir = getAgentDir();
	const loader = new DefaultResourceLoader({
		cwd: options.cwd,
		agentDir,
		noExtensions: true,
		additionalExtensionPaths: options.extensionPaths,
		extensionFactories: [createCodemodeExtension({ mode: "on" }), createToolSearchExtension(), createMcpExtension()],
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		systemPrompt: options.systemPrompt,
	});
	await loader.reload();

	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(options.cwd),
		tools: options.tools,
	});

	try {
		await session.bindExtensions({});
	} catch (error) {
		session.dispose();
		throw error;
	}

	const abortSession = () => {
		void session.abort().catch(() => {});
	};
	const onAbort = () => {
		if (aborted) return;
		aborted = true;
		abortSession();
	};
	const timeoutTimer =
		options.timeoutMs > 0
			? setTimeout(() => {
					if (timedOut) return;
					timedOut = true;
					abortSession();
				}, options.timeoutMs)
			: undefined;

	session.subscribe((event) => {
		if (applyEvent(details, event, state)) notify();
	});

	if (options.signal) {
		if (options.signal.aborted) onAbort();
		else options.signal.addEventListener("abort", onAbort, { once: true });
	}

	try {
		if (!aborted) {
			try {
				await session.prompt(options.task);
			} catch (error) {
				promptError = error instanceof Error ? error.message : String(error);
				details.errorMessage = clip(promptError, 300);
			}
		}
	} finally {
		if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
		if (options.signal) options.signal.removeEventListener("abort", onAbort);
		dropFinalTextEntry(details, state.lastTextEntry);
		details.model ??= options.model ? `${options.model.provider}/${options.model.id}` : undefined;
		if (timedOut) details.errorMessage = "Timed out";
		session.dispose();
	}

	return {
		details,
		finalText: state.finalText,
		aborted,
		timedOut,
		timeoutMs: options.timeoutMs,
		promptError,
	};
}
