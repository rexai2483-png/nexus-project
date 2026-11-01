import { prisma } from "../db/client";
import type { ApprovalRequest, ApprovalStatus } from "../../shared/types/models";

export function toApprovalRequestDto(row: {
  id: string;
  taskId: string | null;
  taskStepId: string | null;
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
    title: row.title,
    description: row.description,
    status: row.status as ApprovalStatus,
    requestedAt: row.requestedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/**
 * Lists approval requests awaiting a decision. Nothing in this
 * foundation creates approval requests yet — automation that needs
 * human sign-off is a later phase — so this legitimately returns an
 * empty array today.
 */
export async function listPendingApprovals(): Promise<ApprovalRequest[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });
  return rows.map(toApprovalRequestDto);
}
