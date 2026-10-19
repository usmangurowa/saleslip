/**
 * Boot-time migration entry for the Docker image (bundled to dist/migrate.mjs).
 *
 * Replaces `node packages/db/scripts/drizzle.mjs migrate` (drizzle-kit) in the
 * container so neither pnpm nor drizzle-kit ship at runtime. Local dev keeps
 * using `pnpm db:migrate`.
 *
 * MIGRATIONS_FOLDER defaults to ../drizzle relative to dist/ (/app/drizzle in
 * the image, a copy of packages/db/drizzle).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMigrations } from "@turbo/db/migrate";

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("migrate: Missing POSTGRES_URL");
  process.exit(1);
}

const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

try {
  await runMigrations(connectionString, migrationsFolder);
  console.log(`migrate: migrations applied (${migrationsFolder})`);
} catch (error) {
  console.error("migrate: failed", error);
  process.exit(1);
}
