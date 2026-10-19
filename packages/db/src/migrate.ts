import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Apply the SQL migrations in `migrationsFolder` (drizzle-kit's `out`, i.e.
 * packages/db/drizzle with meta/_journal.json) without drizzle-kit.
 *
 * Mirrors `drizzle-kit migrate` with drizzle.config.ts: the same non-pooling
 * URL rewrite (:6543 → :5432) and drizzle-kit's default bookkeeping table
 * (`drizzle.__drizzle_migrations`), so already-applied migrations are skipped.
 */
export const runMigrations = async (
  connectionString: string,
  migrationsFolder: string,
): Promise<void> => {
  const client = postgres(connectionString.replace(":6543", ":5432"), {
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder,
      migrationsTable: "__drizzle_migrations",
      migrationsSchema: "drizzle",
    });
  } finally {
    await client.end();
  }
};
