import type { TaskStatus, TaskStepStatus } from "@shared/types/models";

/**
 * Human-facing labels for task/step status.
 *
 * NEXUS cannot execute anything yet, so in practice every task you see
 * is PENDING — but the label says "Planned — not started" rather than a
 * bare "Pending" so the UI never reads as if something ran.
 */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Planned — not started",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const TASK_STEP_STATUS_LABEL: Record<TaskStepStatus, string> = {
  PENDING: "Not started",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  SKIPPED: "Skipped",
};
