import { prisma } from "../db/client";
import type { MemoryRecord, MemoryRecordType } from "../../shared/types/models";

function toDto(row: {
  id: string;
  type: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}): MemoryRecord {
  return {
    id: row.id,
    type: row.type as MemoryRecordType,
    key: row.key,
    value: row.value,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lists durable memory records, newest-updated first.
 *
 * The `MemoryRecord` table has existed since the initial migration but
 * nothing writes to it yet — see prisma/schema.prisma's note on the
 * model. This returns a real (today, empty) read from that table rather
 * than a hardcoded placeholder, so the Memory Centre is wired to the
 * real backend and will reflect records the moment something starts
 * writing them.
 */
export async function listMemoryRecords(): Promise<MemoryRecord[]> {
  const rows = await prisma.memoryRecord.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toDto);
}
