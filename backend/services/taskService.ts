import { prisma } from "../db/client";
import type { StructuredPlan } from "../ai/schema";
import type { Task, TaskDetail, TaskStatus, TaskStep, TaskStepStatus } from "../../shared/types/models";
import { toApprovalRequestDto } from "./approvalService";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  instruction: string | null;
  objective: string | null;
  risks: unknown;
  requiredResources: unknown;
  completionCriteria: string | null;
  sensitive: boolean;
  status: string;
  conversationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { steps: number; approvalRequests: number };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function toTaskDto(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instruction: row.instruction,
    objective: row.objective,
    risks: toStringArray(row.risks),
    requiredResources: toStringArray(row.requiredResources),
    completionCriteria: row.completionCriteria,
    sensitive: row.sensitive,
    status: row.status as TaskStatus,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stepCount: row._count.steps,
    pendingApprovalCount: row._count.approvalRequests,
  };
}

function toTaskStepDto(row: {
  id: string;
  taskId: string;
  order: number;
  description: string;
  requiresApproval: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): TaskStep {
  return {
    id: row.id,
    taskId: row.taskId,
    order: row.order,
    description: row.description,
    requiresApproval: row.requiresApproval,
    status: row.status as TaskStepStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const TASK_COUNT_INCLUDE = {
  _count: {
    select: {
      steps: true,
      approvalRequests: { where: { status: "PENDING" } },
    },
  },
} as const;

/**
 * Lists tasks, most recent first.
 *
 * Returns whatever is actually in the local database — there is no task
 * execution engine yet in this foundation, so a fresh install correctly
 * returns an empty list rather than placeholder data.
 */
export async function listTasks(): Promise<Task[]> {
  const rows = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: TASK_COUNT_INCLUDE,
  });
  return rows.map(toTaskDto);
}

/** Loads one task with its ordered steps and approval requests, or null if it doesn't exist. */
export async function getTask(taskId: string): Promise<TaskDetail | null> {
  const row = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      ...TASK_COUNT_INCLUDE,
      steps: { orderBy: { order: "asc" } },
      approvalRequests: { orderBy: { requestedAt: "asc" } },
    },
  });
  if (!row) return null;

  return {
    ...toTaskDto(row),
    steps: row.steps.map(toTaskStepDto),
    approvalRequests: row.approvalRequests.map(toApprovalRequestDto),
  };
}

/**
 * Persists an AI-generated plan as a Task with ordered TaskSteps.
 *
 * Nothing here executes anything — this only ever creates PENDING
 * (planned, not started) rows. Any step the AI flagged as needing
 * approval — or every step, unconditionally, when the plan was
 * classified SENSITIVE — gets a matching PENDING ApprovalRequest, so the
 * existing approvals system has real data to show instead of needing a
 * separate "requires approval" concept bolted on later.
 */
export async function createTaskFromPlan(params: {
  conversationId: string;
  instruction: string;
  sensitive: boolean;
  plan: StructuredPlan;
}): Promise<Task> {
  const { conversationId, instruction, sensitive, plan } = params;

  const createdTaskId = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: plan.title,
        description: plan.objective,
        instruction,
        objective: plan.objective,
        risks: plan.risks,
        requiredResources: plan.requiredResources,
        completionCriteria: plan.completionCriteria,
        sensitive,
        status: "PENDING",
        conversationId,
      },
    });

    await tx.taskStep.createMany({
      data: plan.steps.map((step, index) => ({
        taskId: task.id,
        order: index + 1,
        description: step.description,
        // A sensitive task requires approval on every step regardless of
        // what the model proposed — the server, not the model, is the
        // trust boundary for this safety gate.
        requiresApproval: sensitive ? true : step.requiresApproval,
        status: "PENDING",
      })),
    });

    const stepsNeedingApproval = plan.steps.filter((step) => sensitive || step.requiresApproval);
    if (stepsNeedingApproval.length > 0) {
      const createdSteps = await tx.taskStep.findMany({
        where: { taskId: task.id },
        orderBy: { order: "asc" },
      });
      await tx.approvalRequest.createMany({
        data: plan.steps
          .map((step, index) => ({ step, stepRow: createdSteps[index] }))
          .filter(({ step }) => sensitive || step.requiresApproval)
          .map(({ step, stepRow }) => ({
            taskId: task.id,
            taskStepId: stepRow.id,
            title: `Approve: ${step.description}`,
            description: `NEXUS will not proceed with this step as part of "${plan.title}" until it is approved.`,
            status: "PENDING",
          })),
      });
    }

    return task.id;
  });

  const detail = await getTask(createdTaskId);
  if (!detail) {
    throw new Error("Task was created but could not be reloaded.");
  }
  return detail;
}
