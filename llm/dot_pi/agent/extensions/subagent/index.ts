/**
 * Subagent - delegate a task to an isolated in-process agent session.
 *
 * The child session has its own context window, compaction, retries, and tool set,
 * so large investigations, log reading, and computer-use debugging stay out of the
 * parent's context. Only the child's final report is returned.
 */

import * as path from "node:path";
import { StringEnum, Type, type Api, type Model } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import { formatDuration } from "./format.ts";
import { childExtensionPaths } from "./provider.ts";
import {
	buildSystemPrompt,
	progressText,
	runSubagent,
	type RunResult,
	type SubagentDetails,
} from "./session.ts";
import { renderCall, renderResult, type RenderState } from "./view.ts";

const MAX_FINAL_CHARS = 24_000;
const DEFAULT_TIMEOUT_SECONDS = 1_800;
const DEFAULT_TOOLS = [
	"read",
	"bash",
	"grep",
	"find",
	"ls",
	"edit",
	"write",
	"web_search",
	"fetch_content",
	"codemode",
	"tool_search",
	"mcp__*",
];

const subagentParams = Type.Object({
	task: Type.String({
		description:
			"Self-contained task for the subagent. It does not see this conversation, so include paths, symptoms, commands, and what to report back.",
	}),
	description: Type.Optional(
		Type.String({ description: 'Short label shown next to the tool call, e.g. "auth flow survey".' }),
	),
	system: Type.Optional(
		Type.String({ description: "Extra system instructions for the child, appended to the built-in subagent prompt." }),
	),
	model: Type.Optional(
		Type.String({ description: "Model for the child as provider/id. Defaults to the current session model." }),
	),
	thinking: Type.Optional(
		StringEnum(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const, {
			description: "Thinking level for the child. Defaults to the current session level.",
		}),
	),
	tools: Type.Optional(
		Type.String({
			description: `Comma-separated tool allowlist. Default: ${DEFAULT_TOOLS.join(",")}.`,
		}),
	),
	cwd: Type.Optional(
		Type.String({ description: "Working directory for the child. Defaults to the current working directory." }),
	),
	timeout: Type.Optional(
		Type.Number({
			description: `Wall-clock limit in seconds. Default ${DEFAULT_TIMEOUT_SECONDS}; 0 disables it.`,
			minimum: 0,
			default: DEFAULT_TIMEOUT_SECONDS,
		}),
	),
});

function resolveModel(
	registry: ModelRegistry,
	spec: string | undefined,
	fallback: Model<Api> | undefined,
): Model<Api> | undefined {
	if (!spec) return fallback;
	const models = registry.getAll();
	const exact = models.filter((model) => model.id === spec);
	if (exact.length > 0) {
		return exact.find((model) => model.provider === fallback?.provider) ?? exact[0];
	}
	const slash = spec.indexOf("/");
	if (slash > 0) {
		const found = registry.find(spec.slice(0, slash), spec.slice(slash + 1));
		if (found) return found;
	}
	throw new Error(`Model "${spec}" not found`);
}

function capFinalText(text: string): string {
	if (text.length <= MAX_FINAL_CHARS) return text;
	return `${text.slice(0, MAX_FINAL_CHARS)}\n\n[truncated ${text.length - MAX_FINAL_CHARS} characters]`;
}

function failureText(run: RunResult): string {
	const reason = run.promptError ?? run.details.errorMessage ?? run.details.stopReason ?? "subagent failed";
	const partial = run.finalText ? `\n\nLast output:\n${run.finalText}` : "";
	return `Subagent failed: ${reason}${partial}`;
}

function toToolResult(run: RunResult, parentAborted: boolean) {
	if (run.aborted || parentAborted) throw new Error("Subagent aborted");

	if (run.timedOut) {
		const note = `Subagent timed out after ${formatDuration(run.timeoutMs)}.`;
		const partial = run.finalText ? `\n\nLast output before the timeout:\n${run.finalText}` : "";
		const hint = "\n\nRetry with a narrower task, or pass timeout: 0 to disable the limit.";
		return {
			content: [{ type: "text" as const, text: capFinalText(`${note}${partial}${hint}`) }],
			details: run.details,
			usage: run.details.usage,
			isError: true,
		};
	}

	const failed =
		run.details.stopReason === "error" ||
		run.details.stopReason === "aborted" ||
		run.promptError !== undefined;

	const text = capFinalText(failed ? failureText(run) : run.finalText || "(subagent produced no output)");

	return {
		content: [{ type: "text" as const, text }],
		details: run.details,
		usage: run.details.usage,
		...(failed ? { isError: true } : {}),
	};
}

export default function (pi: ExtensionAPI) {
	const subagentTool = defineTool<typeof subagentParams, SubagentDetails, RenderState>({
		name: "subagent",
		label: "Subagent",
		description:
			"Run a task in an isolated in-process agent session with its own context window, compaction, and retries. Use it for large investigations, log reading, or computer-use debugging where intermediate output would flood your context. Only the child's final report returns. The child gets core file/shell tools, web search, codemode, and MCP tools.",
		promptSnippet: "Delegate a self-contained task to an isolated agent session",
		promptGuidelines: [
			"Use subagent for work that would flood this context: large codebase surveys, long log analysis, or browser/computer-use debugging. Give it a self-contained task and ask for a concise report with paths and line numbers.",
		],
		parameters: subagentParams,
		renderShell: "self",
		renderCall,
		renderResult,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (!params.task?.trim()) throw new Error("task is required");

			const model = resolveModel(ctx.modelRegistry, params.model, ctx.model);
			if (!model) throw new Error("No model is selected");

			const extensionProvider = ctx.modelRegistry.getRegisteredProviderIds().includes(model.provider);
			let extensionPaths: string[] = [];
			try {
				extensionPaths = childExtensionPaths(pi, model.provider, extensionProvider);
			} catch {
				// Extension discovery is an optimization for the child; core tools still work.
			}

			const requestedTools = params.tools
				? params.tools
						.split(",")
						.map((name) => name.trim())
						.filter(Boolean)
				: [];
			const tools = requestedTools.length > 0 ? requestedTools : DEFAULT_TOOLS;

			const run = await runSubagent({
				task: params.task,
				description: params.description,
				systemPrompt: buildSystemPrompt(params.system),
				model,
				thinkingLevel: params.thinking ?? ctx.thinkingLevel,
				tools,
				cwd: params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd,
				timeoutMs: (params.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1_000,
				extensionPaths,
				signal,
				onUpdate: onUpdate
					? (details) =>
							onUpdate({
								content: [{ type: "text", text: progressText(details) }],
								details,
							})
					: undefined,
			});

			return toToolResult(run, Boolean(signal?.aborted));
		},
	});

	pi.registerTool(subagentTool);
}
