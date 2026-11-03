import { prisma } from "../db/client";
import type { ApprovalRequest, ApprovalStatus } from "../../shared/types/models";

export function toApprovalRequestDto(row: {
  id: string;
  taskId: string | null;
  taskStepId: string | null;
  agentActionId?: string | null;
  title: string;
  description: string;
  status: string;
  requestedAt: Date;
  resolvedAt: Date | null;
}): ApprovalRequest {
  return {
    id: row.id,
    taskId: row.taskId,
    taskStepId: row.taskStepId,
    agentActionId: row.agentActionId ?? null,
    title: row.title,
    description: row.description,
    status: row.status as ApprovalStatus,
    requestedAt: row.requestedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/**
 * Lists approval requests awaiting a decision — both task-step
 * approvals (still unused pending a later execution phase) and
 * agent-action approvals created by backend/agent/agentManager.ts
 * whenever a submitted action requires explicit sign-off.
 */
export async function listPendingApprovals(): Promise<ApprovalRequest[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });
  return rows.map(toApprovalRequestDto);
}

export async function getApprovalRequest(approvalRequestId: string): Promise<ApprovalRequest | null> {
  const row = await prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  return row ? toApprovalRequestDto(row) : null;
}

export async function createAgentActionApproval(params: {
  agentActionId: string;
  title: string;
  description: string;
}): Promise<ApprovalRequest> {
  const row = await prisma.approvalRequest.create({
    data: {
      agentActionId: params.agentActionId,
      title: params.title,
      description: params.description,
      status: "PENDING",
    },
  });
  return toApprovalRequestDto(row);
}

/**
 * Resolves one approval request — approve or deny — never a whole task
 * or session. The approval always targets the exact row it was created
 * for; nothing here can be reinterpreted as a broader authorization.
 */
export async function decideApproval(
  approvalRequestId: string,
  decision: "APPROVED" | "DENIED",
): Promise<ApprovalRequest> {
  const existing = await prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  if (!existing) {
    throw new Error(`Approval request "${approvalRequestId}" was not found.`);
  }
  if (existing.status !== "PENDING") {
    throw new Error(`Approval request "${approvalRequestId}" was already ${existing.status.toLowerCase()}.`);
  }

  const row = await prisma.approvalRequest.update({
    where: { id: approvalRequestId },
    data: { status: decision, resolvedAt: new Date() },
  });
  return toApprovalRequestDto(row);
}
