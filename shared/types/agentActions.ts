/**
 * The Windows Agent's action registry — metadata only.
 *
 * This catalog is the single source of truth for "what the agent is
 * allowed to do" and is imported by both sides of the system:
 *  - backend/agent/agentManager.ts validates a submitted action against
 *    it BEFORE ever forwarding anything to the agent process.
 *  - agent/actions/registry.ts validates again, independently, right
 *    before executing a handler.
 * The actual handlers (what each action DOES) live only in
 * agent/actions/*.ts — this file never imports anything Windows/OS
 * specific, so it's safe for the renderer to read too (e.g. to render a
 * permission badge) without pulling in automation code.
 */

export type AgentActionType =
  | "app.launch"
  | "app.isRunning"
  | "app.getActiveWindow"
  | "screen.captureScreenshot"
  | "input.moveMouse"
  | "input.click"
  | "input.typeText"
  | "input.sendShortcut"
  | "fs.listDirectory"
  | "fs.readFileMetadata"
  | "fs.createFolder"
  | "fs.createFile";

/** LOW: safe, reversible. ELEVATED: changes device state. SENSITIVE: hard/impossible to undo, or touches other people/data. */
export type AgentPermissionLevel = "LOW" | "ELEVATED" | "SENSITIVE";

export type AgentParamFieldType = "string" | "number" | "boolean";

export interface AgentParamField {
  name: string;
  type: AgentParamFieldType;
  required: boolean;
  description: string;
}

export interface AgentActionDefinitionMeta {
  type: AgentActionType;
  label: string;
  description: string;
  permissionLevel: AgentPermissionLevel;
  /** Static default. The actual decision also depends on the submitted
   *  parameters — see `requiresApprovalForInvocation` below. */
  requiresApprovalByDefault: boolean;
  cancellable: boolean;
  timeoutMs: number;
  params: AgentParamField[];
}

export const AGENT_ACTION_CATALOG: Record<AgentActionType, AgentActionDefinitionMeta> = {
  "app.launch": {
    type: "app.launch",
    label: "Launch application",
    description: "Launches an application from the approved applications catalog.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 10_000,
    params: [{ name: "appId", type: "string", required: true, description: 'Approved application id, e.g. "notepad".' }],
  },
  "app.isRunning": {
    type: "app.isRunning",
    label: "Check if application is running",
    description: "Reports whether an approved application currently has a running process.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [{ name: "appId", type: "string", required: true, description: "Approved application id." }],
  },
  "app.getActiveWindow": {
    type: "app.getActiveWindow",
    label: "Get active window",
    description: "Returns the title and screen region of the currently focused window.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [],
  },
  "screen.captureScreenshot": {
    type: "screen.captureScreenshot",
    label: "Capture screenshot",
    description:
      "Captures the current desktop and stores it for review. Every capture is recorded — never taken silently.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 10_000,
    params: [],
  },
  "input.moveMouse": {
    type: "input.moveMouse",
    label: "Move mouse",
    description: "Moves the mouse pointer to a specific screen coordinate.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: true,
    timeoutMs: 5_000,
    params: [
      { name: "x", type: "number", required: true, description: "Target X coordinate." },
      { name: "y", type: "number", required: true, description: "Target Y coordinate." },
    ],
  },
  "input.click": {
    type: "input.click",
    label: "Click",
    description: "Clicks the mouse at a specific screen coordinate.",
    permissionLevel: "ELEVATED",
    requiresApprovalByDefault: false,
    cancellable: true,
    timeoutMs: 5_000,
    params: [
      { name: "x", type: "number", required: true, description: "Target X coordinate." },
      { name: "y", type: "number", required: true, description: "Target Y coordinate." },
      { name: "button", type: "string", required: false, description: '"left" or "right" (default "left").' },
    ],
  },
  "input.typeText": {
    type: "input.typeText",
    label: "Type text",
    description: "Types text at the current input focus. Requires approval when the focused window looks like a communication app.",
    permissionLevel: "ELEVATED",
    requiresApprovalByDefault: false,
    cancellable: true,
    timeoutMs: 15_000,
    params: [{ name: "text", type: "string", required: true, description: "Text to type." }],
  },
  "input.sendShortcut": {
    type: "input.sendShortcut",
    label: "Send keyboard shortcut",
    description: "Sends an approved keyboard shortcut (key combination) from a fixed catalog.",
    permissionLevel: "ELEVATED",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [{ name: "shortcut", type: "string", required: true, description: 'Approved shortcut id, e.g. "save", "copy".' }],
  },
  "fs.listDirectory": {
    type: "fs.listDirectory",
    label: "List directory",
    description: "Lists the contents of a directory inside the approved workspace.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [{ name: "path", type: "string", required: false, description: "Path relative to the approved workspace root (default: root)." }],
  },
  "fs.readFileMetadata": {
    type: "fs.readFileMetadata",
    label: "Read file metadata",
    description: "Reads size/timestamps for a file inside the approved workspace.",
    permissionLevel: "LOW",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [{ name: "path", type: "string", required: true, description: "Path relative to the approved workspace root." }],
  },
  "fs.createFolder": {
    type: "fs.createFolder",
    label: "Create folder",
    description: "Creates a new folder inside the approved workspace.",
    permissionLevel: "ELEVATED",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [{ name: "path", type: "string", required: true, description: "Path relative to the approved workspace root." }],
  },
  "fs.createFile": {
    type: "fs.createFile",
    label: "Create file",
    description: "Creates a file inside the approved workspace. Overwriting an existing file always requires approval.",
    permissionLevel: "ELEVATED",
    requiresApprovalByDefault: false,
    cancellable: false,
    timeoutMs: 5_000,
    params: [
      { name: "path", type: "string", required: true, description: "Path relative to the approved workspace root." },
      { name: "content", type: "string", required: false, description: "Initial file content (default empty)." },
      { name: "overwrite", type: "boolean", required: false, description: "Must be true to replace an existing file (default false)." },
    ],
  },
};

/** Window titles that look like a communication app — typing into one always requires approval. */
export const COMMUNICATION_APP_TITLE_PATTERN =
  /outlook|gmail|mail\s|slack|teams|discord|whatsapp|telegram|messenger|skype|zoom|signal/i;

export interface ApprovalDecisionContext {
  /** Title of the window that was focused immediately before this action would run, if known. */
  activeWindowTitle?: string | null;
}

/**
 * Whether a specific, fully-parameterized action invocation requires
 * human approval before it may execute. Deliberately a function of both
 * the action type AND its actual parameters/context — approval applies
 * to the exact action being requested, never blanket-authorizing every
 * invocation of a type for the rest of a session.
 */
export function requiresApprovalForInvocation(
  type: AgentActionType,
  parameters: Record<string, unknown>,
  context: ApprovalDecisionContext = {},
): boolean {
  const definition = AGENT_ACTION_CATALOG[type];
  if (definition.requiresApprovalByDefault) return true;

  if (type === "fs.createFile" && parameters.overwrite === true) {
    return true;
  }

  if (
    (type === "input.typeText" || type === "input.sendShortcut") &&
    typeof context.activeWindowTitle === "string" &&
    COMMUNICATION_APP_TITLE_PATTERN.test(context.activeWindowTitle)
  ) {
    return true;
  }

  return false;
}
