/**
 * Pi executable resolver for herdr-delegate.
 *
 * Resolution order:
 *   1. Explicit `pi_path` start parameter (must be absolute + executable)
 *   2. `HERDR_PI_BIN` environment variable (must be absolute + executable)
 *   3. `~/.local/share/npm-global/bin/pi` if it exists and is executable
 *   4. `"pi"` bare-name fallback
 *
 * Pure helpers — no Herdr or Pi imports. Filesystem checks are explicit
 * side-effectful calls made only by the active resolver; the inner resolution
 * logic is testable separately.
 */

import { existsSync } from "node:fs";
import { accessSync, constants } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

/** Known well-known Pi install path under npm-global. */
const WELL_KNOWN_PI = resolve(
  homedir(),
  ".local",
  "share",
  "npm-global",
  "bin",
  "pi",
);

/**
 * Check that a path exists and is executable.
 * Throws a descriptive error when validation fails.
 */
export function assertExecutable(filePath: string, source: string): void {
  if (!existsSync(filePath)) {
    throw new Error(
      `Pi executable from ${source} not found: ${filePath}`,
    );
  }
  try {
    accessSync(filePath, constants.X_OK);
  } catch {
    throw new Error(
      `Pi executable from ${source} is not executable: ${filePath}`,
    );
  }
}

/**
 * Resolve the Pi executable path to use for agent.start argv[0].
 *
 * @param piPath - Explicit path from the `pi_path` start parameter.
 * @returns The resolved executable string (either an absolute path or "pi").
 */
export function resolvePiBin(piPath?: string, envPiBin?: string): string {
  // 1. Explicit pi_path parameter
  if (piPath !== undefined && piPath.trim().length > 0) {
    const trimmed = piPath.trim();
    if (!isAbsolute(trimmed)) {
      throw new Error(
        `pi_path must be an absolute path, got "${trimmed}"`,
      );
    }
    assertExecutable(trimmed, "pi_path parameter");
    return trimmed;
  }

  // 2. HERDR_PI_BIN environment variable
  if (envPiBin !== undefined && envPiBin.trim().length > 0) {
    const trimmed = envPiBin.trim();
    if (!isAbsolute(trimmed)) {
      throw new Error(
        `HERDR_PI_BIN must be an absolute path, got "${trimmed}"`,
      );
    }
    assertExecutable(trimmed, "HERDR_PI_BIN");
    return trimmed;
  }

  // 3. Well-known path
  if (existsSync(WELL_KNOWN_PI)) {
    try {
      accessSync(WELL_KNOWN_PI, constants.X_OK);
      return WELL_KNOWN_PI;
    } catch {
      // fall through to bare fallback
    }
  }

  // 4. Bare fallback
  return "pi";
}
