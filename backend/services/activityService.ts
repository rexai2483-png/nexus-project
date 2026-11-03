import { prisma } from "../db/client";
import type { ActivityListInput } from "../../shared/types/ipc";
import type { SystemEvent, SystemEventSource, SystemEventType } from "../../shared/types/models";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toDto(row: {
  id: string;
  type: string;
  source: string;
  message: string;
  createdAt: Date;
}): SystemEvent {
  return {
    id: row.id,
    type: row.type as SystemEventType,
    source: row.source as SystemEventSource,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lists recent system events for the Activity view, newest first. */
export async function listActivity(
  input?: ActivityListInput,
): Promise<SystemEvent[]> {
  const limit = Math.min(input?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await prisma.systemEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toDto);
}

/** Records a real system event. Never used to fabricate activity. */
export async function recordSystemEvent(params: {
  type: SystemEventType;
  source: SystemEventSource;
  message: string;
}): Promise<void> {
  await prisma.systemEvent.create({ data: params });
}
