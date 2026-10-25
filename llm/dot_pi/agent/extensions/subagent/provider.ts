/**
 * Extension paths for the nested session.
 *
 * The nested session loads only the model provider and web tools, not every
 * installed extension. This keeps startup around 10ms and avoids running the
 * wiki or a second language-server stack inside the parent process.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_PACKAGES: Record<string, string> = {
	commandcode: "pi-commandcode-provider",
	"claude-bridge": "pi-claude-bridge",
};

const WEB_PACKAGE = "pi-web-access";
const OMITTED_PACKAGES = new Set(["@zosmaai/pi-llm-wiki"]);

interface PackageEntry {
	source: string;
	autoload?: boolean;
	extensions?: string[];
}

function normalizePackages(value: unknown): PackageEntry[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry): PackageEntry[] => {
		if (typeof entry === "string") return [{ source: entry }];
		if (!entry || typeof entry !== "object") return [];
		const record = entry as { source?: unknown; autoload?: unknown; extensions?: unknown };
		if (typeof record.source !== "string") return [];
		return [
			{
				source: record.source,
				autoload: typeof record.autoload === "boolean" ? record.autoload : undefined,
				extensions: Array.isArray(record.extensions)
					? record.extensions.filter((item): item is string => typeof item === "string")
					: undefined,
			},
		];
	});
}

/** `npm:name`, `npm:@scope/name`, and a version suffix all resolve to the installed folder. */
function npmPackageName(source: string): string | undefined {
	if (!source.startsWith("npm:")) return undefined;
	const spec = source.slice("npm:".length).trim();
	if (!spec) return undefined;
	const at = spec.startsWith("@") ? spec.indexOf("@", 1) : spec.indexOf("@");
	return at === -1 ? spec : spec.slice(0, at);
}

function packageExtensionEntries(pkg: Record<string, unknown>): string[] {
	const pi = pkg.pi as { extensions?: unknown } | undefined;
	const raw = pi?.extensions;
	if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string");
	return typeof raw === "string" ? [raw] : [];
}

/** A directory is loadable when it has an index entry; a file is taken as-is. */
function isLoadableExtension(resolved: string): boolean {
	try {
		if (fs.statSync(resolved).isFile()) return true;
	} catch {
		return false;
	}
	return ["index.ts", "index.js"].some((name) => fs.existsSync(path.join(resolved, name)));
}

function readPackage(packageName: string): { dir: string; pkg: Record<string, unknown> } | undefined {
	const dir = path.join(getAgentDir(), "npm", "node_modules", packageName);
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as Record<string, unknown>;
		return { dir, pkg };
	} catch {
		return undefined;
	}
}

function installedPackagePaths(packageName: string, overrides?: string[]): string[] {
	const found = readPackage(packageName);
	if (!found) return [];
	const entries = overrides ?? packageExtensionEntries(found.pkg);
	return entries
		.map((entry) => path.resolve(found.dir, entry))
		.filter((resolved) => isLoadableExtension(resolved));
}

function allPackagePaths(pi: ExtensionAPI): string[] {
	const settings = pi.getSettings() as { packages?: unknown };
	const paths: string[] = [];
	for (const entry of normalizePackages(settings.packages)) {
		if (entry.autoload === false) continue;
		const name = npmPackageName(entry.source);
		if (!name) continue;
		const found = readPackage(name);
		if (!found) continue;
		const packageName = typeof found.pkg.name === "string" ? found.pkg.name : name;
		if (OMITTED_PACKAGES.has(packageName)) continue;
		paths.push(...installedPackagePaths(name, entry.extensions));
	}
	return paths;
}

/**
 * Provider and tool extensions for a nested session. Unknown extension-provided
 * models fall back to every installed package except the wiki.
 */
export function childExtensionPaths(
	pi: ExtensionAPI,
	provider: string | undefined,
	extensionProvider: boolean,
): string[] {
	const paths: string[] = [];
	const mapped = provider ? PROVIDER_PACKAGES[provider] : undefined;

	if (mapped) paths.push(...installedPackagePaths(mapped));
	else if (extensionProvider) paths.push(...allPackagePaths(pi));

	paths.push(...installedPackagePaths(WEB_PACKAGE));
	return [...new Set(paths)];
}
