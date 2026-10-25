/** Pure text helpers shared by the child runner and the transcript renderer. */

const READ_LIKE_TOOLS = new Set(["read", "grep", "find", "ls"]);
const ARG_KEYS = ["command", "path", "pattern", "query", "url", "task", "prompt", "description", "file_path"] as const;

export function clip(text: string, max: number): string {
	const singleLine = text.replace(/\s+/g, " ").trim();
	return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

/** Text blocks of a message or tool result. `content` may be a string or block array. */
export function blockText(content: unknown, separator = ""): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			if (!block || typeof block !== "object") return "";
			const typed = block as { type?: string; text?: string };
			return typed.type === "text" ? typed.text ?? "" : "";
		})
		.join(separator);
}

export function hasImage(content: unknown): boolean {
	return (
		Array.isArray(content) &&
		content.some((block) => block && typeof block === "object" && (block as { type?: string }).type === "image")
	);
}

/** A compact one-line argument summary for the transcript. */
export function summarizeArgs(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const record = args as Record<string, unknown>;
	for (const key of ARG_KEYS) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return clip(value, 80);
	}
	return "";
}

/** A one-line preview of a completed tool call. */
export function previewResult(name: string, result: unknown): string {
	const content = (result as { content?: unknown } | undefined)?.content;
	const text = blockText(content, "\n").trim();
	if (!text) return hasImage(content) ? "[image]" : "";
	const lines = text.split("\n").filter((line) => line.trim());
	if (READ_LIKE_TOOLS.has(name)) return `${lines.length} line${lines.length === 1 ? "" : "s"}`;
	return clip(lines[0] ?? "", 100);
}

export function formatTokens(count: number): string {
	if (count < 1_000) return String(count);
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	return `${Math.round(count / 1_000)}k`;
}

export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1_000));
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatCost(cost: number): string {
	return `$${cost >= 0.01 ? cost.toFixed(2) : cost.toPrecision(2)}`;
}

export function toolUsesLabel(count: number): string {
	return `${count} tool use${count === 1 ? "" : "s"}`;
}
