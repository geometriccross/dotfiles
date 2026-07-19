/**
 * YAML frontmatter parser for Herdr role prompts.
 * Extracts model, thinking, and tools from `---`-delimited frontmatter.
 * Pure function — no side effects.
 */

export interface RoleMetadata {
  role: string;
  rolePath: string;
  model: string;
  thinking: string;
  tools: string[];
  toolsString: string; // comma-separated for --tools
}

/**
 * Parse frontmatter from a role prompt markdown string.
 * Expects YAML-ish keys: model:, thinking:, tools: (comma-separated or YAML list).
 */
export function parseRoleFrontmatter(
  content: string,
  role: string,
  rolePath: string,
): RoleMetadata {
  if (!content.startsWith("---")) {
    throw new Error(`Role prompt "${rolePath}" has no frontmatter (missing ---)`);
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) {
    throw new Error(
      `Role prompt "${rolePath}" has unclosed frontmatter (missing closing ---)`,
    );
  }

  const fm = content.slice(3, endIdx);
  const model = extractKey(fm, "model");
  const thinking = extractKey(fm, "thinking") || "off";
  const toolsRaw = extractKey(fm, "tools");

  if (!model) {
    throw new Error(
      `Role prompt "${rolePath}" is missing required frontmatter key: model`,
    );
  }
  if (!toolsRaw) {
    throw new Error(
      `Role prompt "${rolePath}" is missing required frontmatter key: tools`,
    );
  }

  // Tools can be a comma-separated string or a YAML list: [a, b, c]
  let tools: string[];
  if (toolsRaw.startsWith("[") && toolsRaw.endsWith("]")) {
    tools = toolsRaw
      .slice(1, -1)
      .split(",")
      .map((t) => t.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  } else {
    tools = toolsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  if (tools.length === 0) {
    throw new Error(
      `Role prompt "${rolePath}" has empty tools list`,
    );
  }

  return {
    role,
    rolePath,
    model,
    thinking,
    tools,
    toolsString: tools.join(","),
  };
}

function extractKey(fm: string, key: string): string | undefined {
  // Match key: value where value runs to end of line or next key
  const re = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`, "m");
  const m = fm.match(re);
  if (!m) return undefined;
  return m[1].trim();
}
