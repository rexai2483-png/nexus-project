import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

/**
 * Resolves the SQLite connection string used by Prisma.
 *
 * - In development, `DATABASE_URL` comes from the project's `.env`
 *   (loaded via dotenv in electron/main.ts) and points at
 *   prisma/dev.db, the same database `prisma migrate dev` writes to.
 * - In a packaged build there is no `.env` shipped with the app, so we
 *   fall back to a database file inside Electron's per-user app data
 *   directory — the correct place for a desktop app to keep local state
 *   on Windows, macOS, and Linux.
 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const userDataDir = app.getPath("userData");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const dbPath = path.join(userDataDir, "nexus.db");
  return `file:${dbPath}`;
}

export const databaseUrl = resolveDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

/** Where Prisma migration folders live when running from the source tree. */
export const migrationsDir = path.join(app.getAppPath(), "prisma", "migrations");

// Prisma 7 requires an explicit driver adapter at runtime (the schema no
// longer carries a connection `url`). libSQL's Node client ships prebuilt
// N-API binaries (via the `libsql` package), which are ABI-stable across
// both Node.js and Electron — no native rebuild step required.
const adapter = new PrismaLibSql({ url: databaseUrl });

export const prisma = new PrismaClient({ adapter });

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
