import type { AgentActionType } from "./agentActions";

/**
 * Wire protocol for the local socket/pipe between the Electron backend
 * (client) and the standalone Windows Agent process (server) — see
 * agent/ipc/server.ts and backend/agent/agentClient.ts. This is a
 * different, separate channel from shared/types/ipc.ts, which is the
 * Electron contextBridge contract between the renderer and main process.
 *
 * Messages are newline-delimited JSON. The connection is useless until
 * the backend sends a valid `auth` message with the per-launch token the
 * backend itself generated and passed to the agent via environment
 * variable at spawn time (see backend/agent/agentManager.ts) — nothing
 * else can complete the handshake.
 */

export type AgentActionErrorCode =
  | "VALIDATION_ERROR"
  | "UNKNOWN_ACTION"
  | "UNSUPPORTED_PLATFORM"
  | "EXECUTION_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "HALTED";

export interface AgentActionResultSuccess {
  ok: true;
  data: unknown;
}

export interface AgentActionResultFailure {
  ok: false;
  errorCode: AgentActionErrorCode;
  message: string;
}

export type AgentActionResult = AgentActionResultSuccess | AgentActionResultFailure;

export interface AgentRuntimeStatus {
  platform: string;
  haltedUntilRestart: boolean;
  activeActionCount: number;
  uptimeSeconds: number;
}

/** Sent from the backend to the agent process. */
export type AgentInboundMessage =
  | { type: "auth"; token: string }
  | { type: "heartbeat.ping" }
  | {
      type: "action.submit";
      actionId: string;
      actionType: AgentActionType;
      parameters: Record<string, unknown>;
    }
  | { type: "action.cancel"; actionId: string }
  | { type: "agent.stop" };

/** Sent from the agent process to the backend. */
export type AgentOutboundMessage =
  | { type: "auth.ok" }
  | { type: "auth.failed"; reason: string }
  | { type: "heartbeat.pong"; status: AgentRuntimeStatus }
  | { type: "action.started"; actionId: string; startedAt: string }
  | {
      type: "action.result";
      actionId: string;
      result: AgentActionResult;
      startedAt: string;
      completedAt: string;
    }
  | { type: "action.cancelled"; actionId: string; completedAt: string }
  | {
      type: "agent.stopped";
      completedActionIds: string[];
      interruptedActionIds: string[];
      stoppedAt: string;
    }
  | { type: "fatal"; message: string };
