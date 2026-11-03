import { randomUUID } from "node:crypto";
import * as activityService from "../services/activityService";
import * as agentActionService from "../services/agentActionService";
import * as approvalService from "../services/approvalService";
import {
  AGENT_ACTION_CATALOG,
  requiresApprovalForInvocation,
  type AgentActionType,
} from "../../shared/types/agentActions";
import type { AgentActionResult, AgentRuntimeStatus } from "../../shared/types/agentProtocol";
import type {
  AgentAction,
  AgentConnectionState,
  AgentSessionStatus,
  AgentStatusSnapshot,
  ApprovalRequest,
} from "../../shared/types/models";
import { AgentClient, type AgentClientEvents } from "./agentClient";

/**
 * The single owner of the Windows Agent's lifecycle: spawning/connecting
 * the process (via AgentClient), gating every submitted action through
 * the approval system, and keeping the database in sync with what
 * actually happened. electron/ipc/handlers.ts is the only caller — the
 * renderer never talks to the agent directly.
 *
 * Module-level state is intentional: there is exactly one Windows Agent
 * per running NEXUS instance, the same way there is exactly one Prisma
 * client (backend/db/client.ts).
 */

let client: AgentClient | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

let currentSessionId: string | null = null;
let currentSessionStatus: AgentSessionStatus | null = null;
let currentSessionStartedAt: string | null = null;
let lastHeartbeatAt: string | null = null;
let lastRuntimeStatus: AgentRuntimeStatus | null = null;
let runtimeHalted = false;
/** True once stop/emergencyStop has been requested — distinguishes an
 * expected disconnect (don't try to reconnect) from a real failure. */
let stopRequested = false;
/** The most recently observed active-window title, used only to decide
 * whether a new typeText/sendShortcut submission needs approval. */
let lastKnownActiveWindowTitle: string | null = null;

const activeActionIds = new Set<string>();
const pendingApprovalActions = new Map<
  string,
  { actionType: AgentActionType; parameters: Record<string, unknown> }
>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearHeartbeatTimer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function describeApprovalRequest(actionType: AgentActionType, parameters: Record<string, unknown>): string {
  switch (actionType) {
    case "input.typeText": {
      const text = typeof parameters.text === "string" ? parameters.text : "";
      const target = lastKnownActiveWindowTitle ? ` into "${lastKnownActiveWindowTitle}"` : "";
      return `Type ${text.length} character(s)${target}. The active window looks like a communication app, so this needs your approval.`;
    }
    case "input.sendShortcut": {
      const target = lastKnownActiveWindowTitle ? ` in "${lastKnownActiveWindowTitle}"` : "";
      return `Send the "${String(parameters.shortcut)}" shortcut${target}. The active window looks like a communication app, so this needs your approval.`;
    }
    case "fs.createFile":
      return `Overwrite the existing file at "${String(parameters.path)}". This replaces its contents and cannot be undone automatically.`;
    default:
      return `Run "${AGENT_ACTION_CATALOG[actionType].label}" with the submitted parameters.`;
  }
}

async function handleActionResult(actionId: string, result: AgentActionResult): Promise<void> {
  activeActionIds.delete(actionId);
  const action = await agentActionService.getAgentAction(actionId);
  if (!action) return;

  if (result.ok) {
    const data = result.data as Record<string, unknown> | null;
    const screenshotPath =
      action.type === "screen.captureScreenshot" && data && typeof data.path === "string" ? data.path : null;
    await agentActionService.completeAgentAction(actionId, { ok: true, result: result.data, screenshotPath });

    if (action.type === "app.getActiveWindow" && data && typeof data.title === "string") {
      lastKnownActiveWindowTitle = data.title;
    }
    await activityService.recordSystemEvent({
      type: "INFO",
      source: "AGENT",
      message: `Action "${action.type}" completed successfully.`,
    });
  } else {
    await agentActionService.completeAgentAction(actionId, {
      ok: false,
      errorCode: result.errorCode,
      errorMessage: result.message,
    });
    await activityService.recordSystemEvent({
      type: result.errorCode === "CANCELLED" ? "WARNING" : "ERROR",
      source: "AGENT",
      message: `Action "${action.type}" failed: ${result.message}`,
    });
  }
}

async function handleAgentStopped(
  completedActionIds: string[],
  interruptedActionIds: string[],
  stoppedAt: string,
): Promise<void> {
  runtimeHalted = true;
  currentSessionStatus = "HALTED";

  for (const id of interruptedActionIds) {
    await agentActionService.markActionCancelled(id).catch(() => undefined);
  }
  if (currentSessionId) {
    await agentActionService.markSessionHalted(currentSessionId).catch(() => undefined);
  }

  await activityService.recordSystemEvent({
    type: "SECURITY",
    source: "AGENT",
    message: `Windows Agent stopped at ${stoppedAt}. ${completedActionIds.length} action(s) completed, ${interruptedActionIds.length} interrupted.`,
  });
  clearHeartbeatTimer();
}

async function handleUnexpectedDisconnect(): Promise<void> {
  await activityService.recordSystemEvent({
    type: "WARNING",
    source: "AGENT",
    message: "Windows Agent connection dropped unexpectedly. Attempting to reconnect…",
  });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await sleep(1000 * attempt);
    // Re-check after the sleep: onProcessExit (a concurrent event) may
    // have already nulled out `client` while we were waiting.
    if (!client || !client.processAlive) break;
    try {
      await client.reconnect();
      await activityService.recordSystemEvent({
        type: "INFO",
        source: "AGENT",
        message: "Windows Agent reconnected successfully.",
      });
      return;
    } catch {
      // try again
    }
  }

  await activityService.recordSystemEvent({
    type: "ERROR",
    source: "AGENT",
    message: "Windows Agent could not be reconnected. Start a new session to continue.",
  });
  clearHeartbeatTimer();
  client = null;
  if (currentSessionId) {
    currentSessionStatus = "ENDED";
    await agentActionService.markSessionEnded(currentSessionId).catch(() => undefined);
  }
}

function buildClientEvents(): AgentClientEvents {
  return {
    onAuthenticated: () => {
      void activityService.recordSystemEvent({
        type: "INFO",
        source: "AGENT",
        message: "Windows Agent authenticated the local IPC connection.",
      });
    },
    onHeartbeat: (status) => {
      lastRuntimeStatus = status;
      lastHeartbeatAt = new Date().toISOString();
      runtimeHalted = status.haltedUntilRestart;
      if (currentSessionId) {
        void agentActionService.markSessionHeartbeat(currentSessionId);
      }
    },
    onActionStarted: (actionId) => {
      activeActionIds.add(actionId);
      void agentActionService.markActionRunning(actionId);
    },
    onActionResult: (actionId, result) => {
      void handleActionResult(actionId, result);
    },
    onStopped: (completedActionIds, interruptedActionIds, stoppedAt) => {
      void handleAgentStopped(completedActionIds, interruptedActionIds, stoppedAt);
    },
    onFatal: (message) => {
      void activityService.recordSystemEvent({
        type: "ERROR",
        source: "AGENT",
        message: `Windows Agent reported a fatal error: ${message}`,
      });
    },
    onSocketDisconnected: () => {
      if (stopRequested || runtimeHalted) return;
      void handleUnexpectedDisconnect();
    },
    onProcessExit: (code) => {
      clearHeartbeatTimer();
      const wasStoppedCleanly = runtimeHalted;
      client = null;
      void activityService.recordSystemEvent({
        type: wasStoppedCleanly ? "INFO" : "WARNING",
        source: "AGENT",
        message: wasStoppedCleanly
          ? `Windows Agent process exited after stopping (code ${code ?? "unknown"}).`
          : `Windows Agent process exited unexpectedly (code ${code ?? "unknown"}).`,
      });
      if (!wasStoppedCleanly && currentSessionId) {
        currentSessionStatus = "ENDED";
        void agentActionService.markSessionEnded(currentSessionId);
      }
    },
  };
}

export async function getAgentStatus(): Promise<AgentStatusSnapshot> {
  let connectionState: AgentConnectionState = "DISCONNECTED";
  if (client?.isConnected) connectionState = "CONNECTED";
  else if (client?.processAlive) connectionState = "CONNECTING";

  return {
    connectionState,
    sessionId: currentSessionId,
    sessionStatus: currentSessionStatus,
    startedAt: currentSessionStartedAt,
    lastHeartbeatAt,
    haltedUntilRestart: runtimeHalted,
    activeActionCount: activeActionIds.size,
    platform: lastRuntimeStatus?.platform ?? null,
  };
}

/** Starts a brand-new agent process + session. Idempotent while already connected. */
export async function startAgentSession(): Promise<AgentStatusSnapshot> {
  if (client?.isConnected && !runtimeHalted) {
    return getAgentStatus();
  }

  stopRequested = false;
  runtimeHalted = false;
  lastKnownActiveWindowTitle = null;
  lastRuntimeStatus = null;
  lastHeartbeatAt = null;
  activeActionIds.clear();
  pendingApprovalActions.clear();

  const newClient = new AgentClient(buildClientEvents());
  await newClient.start();
  client = newClient;

  const session = await agentActionService.createAgentSession(newClient.sessionId);
  currentSessionId = session.id;
  currentSessionStatus = session.status;
  currentSessionStartedAt = session.startedAt;

  heartbeatTimer = setInterval(() => {
    client?.sendHeartbeatPing();
  }, 5000);

  await activityService.recordSystemEvent({
    type: "INFO",
    source: "AGENT",
    message: "Windows Agent session started.",
  });

  return getAgentStatus();
}

/**
 * Waits for the agent OS process to actually exit (onProcessExit nulls
 * out `client`) rather than just for the in-memory `runtimeHalted` flag
 * — the socket can stay technically "connected" for a short window
 * after `agent.stopped` arrives while the process is still shutting
 * down, and a caller must not see a stale CONNECTED status in between.
 */
function waitUntilStoppedOrTimeout(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!client || Date.now() - start > timeoutMs) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

/** Routine, user-initiated stop — reachable from the Agent page's session controls. */
export async function stopAgentSession(): Promise<AgentStatusSnapshot> {
  if (!client) return getAgentStatus();
  stopRequested = true;
  client.requestStop();
  await waitUntilStoppedOrTimeout();
  client?.terminate();
  return getAgentStatus();
}

/**
 * Emergency STOP — the same safe-halt mechanism as `stopAgentSession`,
 * but reachable from both the dashboard and the floating assistant, and
 * logged as a SECURITY event regardless of whether any action was
 * actually in flight at the time.
 */
export async function emergencyStop(): Promise<AgentStatusSnapshot> {
  if (!client) {
    throw new Error("The Windows Agent is not running.");
  }
  stopRequested = true;
  client.requestStop();
  await waitUntilStoppedOrTimeout();
  client?.terminate();
  await activityService.recordSystemEvent({
    type: "SECURITY",
    source: "AGENT",
    message: "Emergency STOP activated by the user.",
  });
  return getAgentStatus();
}

function dispatchToAgent(actionId: string, actionType: AgentActionType, parameters: Record<string, unknown>): void {
  client?.submitAction(actionId, actionType, parameters);
}

/**
 * Validates, persists, and (if it doesn't require approval) immediately
 * dispatches one action. This is the single entry point the IPC layer
 * uses to submit agent work — nothing else can reach `AgentClient`.
 */
export async function submitAction(
  actionType: AgentActionType,
  parameters: Record<string, unknown>,
): Promise<AgentAction> {
  if (!client?.isConnected) {
    throw new Error("The Windows Agent is not connected. Start the agent before submitting actions.");
  }
  if (runtimeHalted) {
    throw new Error("The Windows Agent is halted after an emergency stop and requires an explicit restart.");
  }
  const definition = AGENT_ACTION_CATALOG[actionType];
  if (!definition) {
    throw new Error(`"${actionType}" is not a registered action type.`);
  }
  if (!currentSessionId) {
    throw new Error("No active agent session.");
  }

  const requiresApproval = requiresApprovalForInvocation(actionType, parameters, {
    activeWindowTitle: lastKnownActiveWindowTitle,
  });

  const actionId = randomUUID();
  await agentActionService.createAgentAction({
    id: actionId,
    sessionId: currentSessionId,
    type: actionType,
    parameters,
    permissionLevel: definition.permissionLevel,
    requiresApproval,
    status: requiresApproval ? "AWAITING_APPROVAL" : "PENDING",
  });

  if (requiresApproval) {
    await approvalService.createAgentActionApproval({
      agentActionId: actionId,
      title: `Approve: ${definition.label}`,
      description: describeApprovalRequest(actionType, parameters),
    });
    pendingApprovalActions.set(actionId, { actionType, parameters });
    await activityService.recordSystemEvent({
      type: "INFO",
      source: "AGENT",
      message: `Action "${definition.label}" is awaiting approval before it will run.`,
    });
  } else {
    dispatchToAgent(actionId, actionType, parameters);
  }

  const dto = await agentActionService.getAgentAction(actionId);
  if (!dto) throw new Error("Action was created but could not be reloaded.");
  return dto;
}

/** Best-effort cleanup used when the whole NEXUS backend is shutting down — ensures no orphaned agent process survives the app closing. */
export function shutdownAgent(): void {
  clearHeartbeatTimer();
  client?.terminate();
  client = null;
}

export async function cancelAction(actionId: string): Promise<void> {
  if (pendingApprovalActions.has(actionId)) {
    pendingApprovalActions.delete(actionId);
    await agentActionService.markActionCancelled(actionId);
    return;
  }
  if (!client) {
    throw new Error("The Windows Agent is not running.");
  }
  client.cancelAction(actionId);
}

export async function listRecentActions(limit?: number): Promise<AgentAction[]> {
  return agentActionService.listRecentAgentActions(currentSessionId ?? undefined, limit);
}

/**
 * The single entry point for resolving ANY approval request. Approving
 * one tied to an agent action actually forwards it for execution;
 * denying marks that exact action REJECTED. Approvals never apply to
 * more than the one row they were created for.
 */
export async function decideApproval(
  approvalRequestId: string,
  decision: "APPROVED" | "DENIED",
): Promise<ApprovalRequest> {
  const resolved = await approvalService.decideApproval(approvalRequestId, decision);
  if (!resolved.agentActionId) {
    return resolved;
  }

  const pending = pendingApprovalActions.get(resolved.agentActionId);
  pendingApprovalActions.delete(resolved.agentActionId);

  if (decision === "APPROVED") {
    if (!client?.isConnected || runtimeHalted || !pending) {
      await agentActionService.markActionRejected(
        resolved.agentActionId,
        "Approved, but the Windows Agent is no longer connected to execute it.",
      );
    } else {
      dispatchToAgent(resolved.agentActionId, pending.actionType, pending.parameters);
    }
    await activityService.recordSystemEvent({
      type: "INFO",
      source: "AGENT",
      message: `Approval granted for action ${resolved.agentActionId}.`,
    });
  } else {
    await agentActionService.markActionRejected(resolved.agentActionId, "The user denied this action.");
    await activityService.recordSystemEvent({
      type: "WARNING",
      source: "AGENT",
      message: `Approval denied for action ${resolved.agentActionId}.`,
    });
  }

  return resolved;
}
