import { prisma } from "../db/client";
import type { AgentActionType, AgentPermissionLevel } from "../../shared/types/agentActions";
import type {
  AgentAction,
  AgentActionStatus,
  AgentSession,
  AgentSessionStatus,
} from "../../shared/types/models";

/**
 * Prisma persistence + DTO conversion for the Windows Agent's sessions
 * and actions. The real execution/approval orchestration lives in
 * backend/agent/agentManager.ts — this module only reads and writes
 * rows, mirroring the existing services/taskService.ts split.
 */

function toAgentSessionDto(row: {
  id: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  haltedAt: Date | null;
  lastHeartbeatAt: Date | null;
}): AgentSession {
  return {
    id: row.id,
    status: row.status as AgentSessionStatus,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    haltedAt: row.haltedAt ? row.haltedAt.toISOString() : null,
    lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.toISOString() : null,
  };
}

interface AgentActionRow {
  id: string;
  sessionId: string;
  type: string;
  parameters: unknown;
  permissionLevel: string;
  requiresApproval: boolean;
  status: string;
  result: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotPath: string | null;
  submittedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  approvalRequests?: { id: string }[];
}

function toAgentActionDto(row: AgentActionRow): AgentAction {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    parameters: (row.parameters ?? {}) as Record<string, unknown>,
    permissionLevel: row.permissionLevel as AgentPermissionLevel,
    requiresApproval: row.requiresApproval,
    status: row.status as AgentActionStatus,
    // The schema models the relation from the ApprovalRequest side
    // (an action may accumulate more than one request over retries);
    // the DTO exposes only the most recent one, which is always the
    // single PENDING request at any given time in this sprint's flow.
    approvalRequestId: row.approvalRequests?.[0]?.id ?? null,
    result: row.result ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    screenshotPath: row.screenshotPath,
    submittedAt: row.submittedAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

const ACTION_INCLUDE = {
  approvalRequests: { orderBy: { requestedAt: "desc" as const }, take: 1 },
} as const;

export async function createAgentSession(sessionId: string): Promise<AgentSession> {
  const row = await prisma.agentSession.create({
    data: { id: sessionId, status: "ACTIVE" },
  });
  return toAgentSessionDto(row);
}

export async function getAgentSession(sessionId: string): Promise<AgentSession | null> {
  const row = await prisma.agentSession.findUnique({ where: { id: sessionId } });
  return row ? toAgentSessionDto(row) : null;
}

export async function markSessionHeartbeat(sessionId: string): Promise<void> {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { lastHeartbeatAt: new Date() },
  });
}

export async function markSessionEnded(sessionId: string): Promise<void> {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { status: "ENDED", endedAt: new Date() },
  });
}

export async function markSessionHalted(sessionId: string): Promise<void> {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { status: "HALTED", haltedAt: new Date() },
  });
}

export async function createAgentAction(params: {
  id: string;
  sessionId: string;
  type: AgentActionType;
  parameters: Record<string, unknown>;
  permissionLevel: AgentPermissionLevel;
  requiresApproval: boolean;
  status: AgentActionStatus;
}): Promise<AgentAction> {
  const row = await prisma.agentAction.create({
    data: {
      id: params.id,
      sessionId: params.sessionId,
      type: params.type,
      parameters: params.parameters as object,
      permissionLevel: params.permissionLevel,
      requiresApproval: params.requiresApproval,
      status: params.status,
    },
    include: ACTION_INCLUDE,
  });
  return toAgentActionDto(row);
}

export async function markActionRunning(actionId: string): Promise<void> {
  await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

export async function markActionAwaitingApproval(actionId: string): Promise<void> {
  await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: "AWAITING_APPROVAL" },
  });
}

export async function markActionRejected(actionId: string, reason: string): Promise<void> {
  await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: "REJECTED", errorMessage: reason, completedAt: new Date() },
  });
}

export async function markActionCancelled(actionId: string): Promise<void> {
  await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: "CANCELLED", errorCode: "CANCELLED", completedAt: new Date() },
  });
}

export async function completeAgentAction(
  actionId: string,
  outcome:
    | { ok: true; result: unknown; screenshotPath?: string | null }
    | { ok: false; errorCode: string; errorMessage: string },
): Promise<void> {
  if (outcome.ok) {
    await prisma.agentAction.update({
      where: { id: actionId },
      data: {
        status: "SUCCEEDED",
        result: outcome.result as object,
        screenshotPath: outcome.screenshotPath ?? null,
        completedAt: new Date(),
      },
    });
  } else {
    await prisma.agentAction.update({
      where: { id: actionId },
      data: {
        status: outcome.errorCode === "CANCELLED" ? "CANCELLED" : "FAILED",
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        completedAt: new Date(),
      },
    });
  }
}

export async function listRecentAgentActions(sessionId?: string, limit = 50): Promise<AgentAction[]> {
  const rows = await prisma.agentAction.findMany({
    where: sessionId ? { sessionId } : undefined,
    orderBy: { submittedAt: "desc" },
    take: Math.min(limit, 200),
    include: ACTION_INCLUDE,
  });
  return rows.map(toAgentActionDto);
}

export async function getAgentAction(actionId: string): Promise<AgentAction | null> {
  const row = await prisma.agentAction.findUnique({
    where: { id: actionId },
    include: ACTION_INCLUDE,
  });
  return row ? toAgentActionDto(row) : null;
}

export async function linkApprovalRequest(actionId: string, approvalRequestId: string): Promise<void> {
  await prisma.approvalRequest.update({
    where: { id: approvalRequestId },
    data: { agentActionId: actionId },
  });
}
