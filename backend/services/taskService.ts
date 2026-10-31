import { prisma } from "../db/client";
import type { Task, TaskStatus } from "../../shared/types/models";

function toDto(row: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
  });
  return rows.map(toDto);
}
