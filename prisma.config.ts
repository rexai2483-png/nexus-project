import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 CLI configuration (`prisma migrate`, `prisma studio`, etc.).
 *
 * The running Electron app does NOT read this file — it builds its own
 * driver adapter at runtime (see backend/db/client.ts) so it can fall
 * back to a per-user data directory in packaged builds. This file only
 * controls the CLI tooling used during development.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
