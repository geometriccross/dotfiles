/** Claude-style transcript rendering for the subagent row. */

import {
	getMarkdownTheme,
	keyHint,
	type AgentToolResult,
	type Theme,
	type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import { blockText, clip, formatCost, formatDuration, formatTokens, toolUsesLabel } from "./format.ts";
import type { SubagentDetails, ToolActivity } from "./session.ts";

const MAX_TASK_CHARS = 2_000;
const CONNECTOR = "  ⎿  ";
const INDENT = "     ";

export interface RenderState {
	startedAt?: number;
	interval?: ReturnType<typeof setInterval>;
}

/** The parameter fields the header needs. */
export interface RenderArgs {
	task: string;
	description?: string;
}

/** The subset of ToolRenderContext this file reads, stated explicitly because it is not exported publicly. */
export interface RenderContext {
	state: RenderState;
	args: RenderArgs;
	outputPad: number;
	executionStarted: boolean;
	invalidate: () => void;
	durationMs: number | undefined;
	isError: boolean;
}

export function renderCall(args: RenderArgs, theme: Theme, context: RenderContext): Text {
	const state = context.state;
	if (context.executionStarted && state.startedAt === undefined) state.startedAt = Date.now();
	const label = args.description?.trim() || clip(args.task ?? "", 60);
	const line =
		`${theme.fg("accent", "⏺")} ${theme.fg("toolTitle", theme.bold("subagent"))}` +
		theme.fg("muted", `(${label})`);
	return new Text(line, context.outputPad, 0);
}

export function renderResult(
	result: AgentToolResult<SubagentDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: RenderContext,
): Component {
	const elapsedMs = trackElapsed(context, options.isPartial);
	const details = result.details;

	if (!details) {
		return new Text(`${CONNECTOR}${clip(blockText(result.content, "\n").trim(), 120)}`, context.outputPad, 0);
	}

	if (options.expanded) {
		return expandedView({
			details,
			result,
			isPartial: options.isPartial,
			isError: context.isError,
			theme,
			task: context.args.task ?? "",
			pad: context.outputPad,
			elapsedMs,
		});
	}

	return new Text(summaryLine(details, options.isPartial, context.isError, theme, elapsedMs), context.outputPad, 0);
}

/** Redraw the elapsed time once a second while the child runs, then stop. */
function trackElapsed(context: RenderContext, isPartial: boolean): number | undefined {
	const state = context.state;
	if (isPartial) {
		if (state.startedAt !== undefined && state.interval === undefined) {
			state.interval = setInterval(() => context.invalidate(), 1_000);
		}
	} else if (state.interval !== undefined) {
		clearInterval(state.interval);
		state.interval = undefined;
	}

	if (!isPartial && context.durationMs !== undefined) return context.durationMs;
	return state.startedAt === undefined ? undefined : Date.now() - state.startedAt;
}

function summaryLine(
	details: SubagentDetails,
	isPartial: boolean,
	isError: boolean,
	theme: Theme,
	elapsedMs: number | undefined,
): string {
	return isPartial
		? runningLine(details, theme, elapsedMs)
		: finishedLine(details, isError, theme, elapsedMs);
}

function runningLine(details: SubagentDetails, theme: Theme, elapsedMs: number | undefined): string {
	const tools = toolActivities(details.activity);
	const current = [...tools].reverse().find((entry) => entry.status === "running") ?? tools[tools.length - 1];
	const parts = ["Running…"];
	if (details.toolUses > 0) parts.push(toolUsesLabel(details.toolUses));
	if (current) parts.push(toolLabel(current));
	if (elapsedMs !== undefined) parts.push(formatDuration(elapsedMs));
	return CONNECTOR + theme.fg("muted", parts.join(" · "));
}

function finishedLine(
	details: SubagentDetails,
	isError: boolean,
	theme: Theme,
	elapsedMs: number | undefined,
): string {
	const parts = [toolUsesLabel(details.toolUses)];
	const tokens = details.usage.input + details.usage.output;
	if (tokens > 0) parts.push(`${formatTokens(tokens)} tokens`);
	if (elapsedMs !== undefined) parts.push(formatDuration(elapsedMs));

	let line =
		CONNECTOR +
		theme.fg(isError ? "error" : "success", isError ? "Failed" : "Done") +
		" " +
		theme.fg("muted", `(${parts.join(" · ")})`);

	if (isError) {
		const reason = clip(details.errorMessage ?? details.stopReason ?? "subagent failed", 100);
		line += `: ${theme.fg("error", reason)}`;
	} else {
		line += ` ${theme.fg("dim", "·")} ${keyHint("app.tools.expand", "to expand")}`;
	}

	return line;
}

function toolActivities(activity: SubagentDetails["activity"]): ToolActivity[] {
	return activity.filter((entry): entry is ToolActivity => entry.kind === "tool");
}

function toolLabel(entry: ToolActivity): string {
	return entry.args ? `${entry.name}(${entry.args})` : entry.name;
}

function usageLine(details: SubagentDetails, elapsedMs: number | undefined): string {
	const usage = details.usage;
	const parts = [`in ${formatTokens(usage.input)}`];
	if (usage.cacheRead > 0) parts.push(`cache ${formatTokens(usage.cacheRead)}`);
	parts.push(`out ${formatTokens(usage.output)}`);
	if (usage.cost.total > 0) parts.push(formatCost(usage.cost.total));
	if (elapsedMs !== undefined) parts.push(formatDuration(elapsedMs));
	return parts.join(" · ");
}

function expandedView(options: {
	details: SubagentDetails;
	result: { content: unknown };
	isPartial: boolean;
	isError: boolean;
	theme: Theme;
	task: string;
	pad: number;
	elapsedMs: number | undefined;
}): Container {
	const { details, result, isPartial, isError, theme, task, pad, elapsedMs } = options;
	const container = new Container();
	const taskText = task.length > MAX_TASK_CHARS ? `${task.slice(0, MAX_TASK_CHARS)}…` : task;

	container.addChild(new Text(`${CONNECTOR}${theme.fg("muted", "Task:")} ${taskText}`, pad, 0));

	if (details.dropped > 0) {
		container.addChild(new Text(`${INDENT}${theme.fg("muted", `... ${details.dropped} earlier entries`)}`, pad, 0));
	}

	for (const entry of details.activity) {
		if (entry.kind === "text") {
			container.addChild(new Text(`${INDENT}${theme.fg("toolOutput", entry.text)}`, pad, 0));
			continue;
		}
		const color = entry.status === "error" ? "error" : entry.status === "running" ? "warning" : "success";
		let line = `${INDENT}${theme.fg(color, "⏺")} ${theme.fg("toolTitle", entry.name)}`;
		if (entry.args) line += theme.fg("muted", `(${entry.args})`);
		container.addChild(new Text(line, pad, 0));
		if (entry.preview) {
			const previewColor = entry.status === "error" ? "error" : "toolOutput";
			container.addChild(
				new Text(`${INDENT}  ${theme.fg("dim", "⎿")}  ${theme.fg(previewColor, entry.preview)}`, pad, 0),
			);
		}
	}

	if (!isPartial) {
		const finalText = blockText(result.content, "\n").trim();
		if (finalText) {
			container.addChild(new Spacer(1));
			container.addChild(new Markdown(finalText, pad + INDENT.length, 0, getMarkdownTheme()));
		}
		if (isError) {
			const reason = details.errorMessage ?? details.stopReason ?? "subagent failed";
			container.addChild(new Spacer(1));
			container.addChild(new Text(`${INDENT}${theme.fg("error", reason)}`, pad, 0));
		}
	}

	container.addChild(new Spacer(1));
	container.addChild(new Text(`${INDENT}${theme.fg("dim", usageLine(details, elapsedMs))}`, pad, 0));
	if (details.model) container.addChild(new Text(`${INDENT}${theme.fg("dim", details.model)}`, pad, 0));
	return container;
}
