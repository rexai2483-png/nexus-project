import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where the agent is allowed to write data. All three directories are
 * resolved from environment variables the backend sets when it spawns
 * this process (see backend/agent/agentClient.ts); sensible fallbacks
 * let the agent also run standalone for local testing.
 */
export const DATA_DIR = path.resolve(
  process.env.NEXUS_AGENT_DATA_DIR || path.join(os.tmpdir(), "nexus-agent-data"),
);
export const WORKSPACE_ROOT = path.resolve(
  process.env.NEXUS_AGENT_WORKSPACE_ROOT || path.join(os.homedir(), "NexusWorkspace"),
);
export const SCREENSHOT_DIR = path.join(DATA_DIR, "screenshots");

export function ensureAgentDirectories(): void {
  for (const dir of [DATA_DIR, WORKSPACE_ROOT, SCREENSHOT_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export class WorkspacePathError extends Error {}

/**
 * Resolves a caller-supplied relative path against the approved
 * workspace root and rejects anything that would escape it — the only
 * function file actions may use to turn a parameter into a real path.
 * This is the concrete implementation of "restrict filesystem access to
 * approved operations."
 */
export function resolveWorkspacePath(relativePath: string | undefined | null): string {
  const requested = (relativePath ?? ".").trim();
  if (requested.length === 0) {
    return WORKSPACE_ROOT;
  }
  if (path.isAbsolute(requested) || /^[a-zA-Z]:/.test(requested)) {
    throw new WorkspacePathError(
      "Absolute paths are not allowed — paths must be relative to the approved NEXUS workspace.",
    );
  }

  const resolved = path.resolve(WORKSPACE_ROOT, requested);
  const rootWithSep = WORKSPACE_ROOT.endsWith(path.sep) ? WORKSPACE_ROOT : WORKSPACE_ROOT + path.sep;
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new WorkspacePathError(
      `"${relativePath}" resolves outside the approved NEXUS workspace and was rejected.`,
    );
  }
  return resolved;
}
