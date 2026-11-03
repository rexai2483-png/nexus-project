import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Narrow shape of the `@libsql/client` client this module actually uses. */
interface MigrationSqlClient {
  execute(
    query: string | { sql: string; args: unknown[] },
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  executeMultiple(sql: string): Promise<void>;
  close(): void;
}

/**
 * Applies any pending Prisma migrations to the given SQLite database.
 *
 * During development, `npm run prisma:migrate` (the Prisma CLI) owns
 * this job and this function is a no-op in practice because every
 * migration is already recorded. It exists for the case the CLI
 * doesn't cover: a freshly packaged build pointed at a brand-new
 * per-user database file has no CLI available to run `migrate deploy`
 * against it. This is a minimal, explicit stand-in for that command —
 * it tracks applied migrations in the same `_prisma_migrations` table
 * Prisma itself uses, so it stays interoperable with the real CLI.
 */
export async function applyPendingMigrations(
  databaseUrl: string,
  migrationsDir: string,
): Promise<{ applied: string[] }> {
  if (!fs.existsSync(migrationsDir)) {
    return { applied: [] };
  }

  // @libsql/client ships as an ESM package; this file compiles to
  // CommonJS, so it must reach it through a dynamic import rather than a
  // static `require`.
  const libsql: { createClient: (opts: { url: string }) => MigrationSqlClient } =
    await import("@libsql/client");
  const client = libsql.createClient({ url: databaseUrl });
  const applied: string[] = [];

  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);

    const appliedRows = await client.execute(
      `SELECT "migration_name" FROM "_prisma_migrations"`,
    );
    const alreadyApplied = new Set(
      appliedRows.rows.map((row) => String(row.migration_name)),
    );

    const migrationNames = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of migrationNames) {
      if (alreadyApplied.has(name)) continue;

      const sqlPath = path.join(migrationsDir, name, "migration.sql");
      if (!fs.existsSync(sqlPath)) continue;

      const sql = fs.readFileSync(sqlPath, "utf8");
      await client.executeMultiple(sql);
      await client.execute({
        sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)`,
        args: [randomUUID(), "applied-by-nexus-runtime", name],
      });
      applied.push(name);
    }
  } finally {
    client.close();
  }

  return { applied };
}
