import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "./schema";

/**
 * A real Postgres for tests, in-process.
 *
 * PGlite is Postgres compiled to WebAssembly — not a mock and not SQLite, so
 * `DISTINCT ON`, `jsonb`, partial indexes on `lower()`, `ON CONFLICT` and the
 * CHECK constraints all behave exactly as they will on Neon. It exists here
 * because the alternative was shipping the entire persistence layer unverified
 * until someone supplied a connection string.
 *
 * The committed migrations under `drizzle/` are applied verbatim, so this also
 * proves the generated SQL is valid Postgres rather than only that the schema
 * file typechecks.
 */

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestPostgres {
  db: TestDb;
  close: () => Promise<void>;
}

export async function createTestPostgres(): Promise<TestPostgres> {
  const client = new PGlite();
  await applyMigrations(client);

  return {
    db: drizzle(client, { schema }),
    close: () => client.close(),
  };
}

/**
 * Runs every committed migration in filename order. `drizzle-kit` separates
 * statements with a breakpoint marker rather than a bare semicolon, because a
 * semicolon can legally appear inside a function body.
 */
async function applyMigrations(client: PGlite): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed !== "") await client.exec(trimmed);
    }
  }
}
