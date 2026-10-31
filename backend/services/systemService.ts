import os from "node:os";
import { app } from "electron";
import { prisma } from "../db/client";
import type { SystemStatus } from "../../shared/types/models";

/**
 * Reports real, observable facts about the running app and its local
 * database connection. No simulated metrics, no placeholder activity —
 * if a value can't be determined truthfully, it is omitted rather than
 * faked.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  let dbConnected = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  return {
    platform: os.platform(),
    arch: os.arch(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? "unknown",
    nodeVersion: process.versions.node ?? "unknown",
    chromeVersion: process.versions.chrome ?? "unknown",
    uptimeSeconds: Math.round(process.uptime()),
    dbConnected,
  };
}
