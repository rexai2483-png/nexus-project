import { prisma, disconnectDatabase, databaseUrl, migrationsDir } from "./db/client";
import { applyPendingMigrations } from "./db/migrate";
import { recordSystemEvent } from "./services/activityService";

export * as settingsService from "./services/settingsService";
export * as taskService from "./services/taskService";
export * as activityService from "./services/activityService";
export * as approvalService from "./services/approvalService";
export * as systemService from "./services/systemService";
export { prisma, disconnectDatabase };

/**
 * Backend bootstrap. Called once from the Electron main process after
 * `app.whenReady()`, before the renderer is loaded. Makes sure the local
 * database schema is up to date (covers a brand-new per-user database
 * that the Prisma CLI never touched), then verifies the connection and
 * records a real startup event — nothing here is simulated.
 */
export async function initBackend(): Promise<void> {
  await applyPendingMigrations(databaseUrl, migrationsDir);
  await prisma.$connect();
  await recordSystemEvent({
    type: "INFO",
    source: "APP",
    message: "NEXUS backend started.",
  });
}

export async function shutdownBackend(): Promise<void> {
  try {
    await recordSystemEvent({
      type: "INFO",
      source: "APP",
      message: "NEXUS backend shutting down.",
    });
  } finally {
    await disconnectDatabase();
  }
}
