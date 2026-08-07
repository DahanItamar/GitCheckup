import { defineConfig } from "drizzle-kit";

/**
 * Reads DATABASE_URL straight from the environment rather than from
 * lib/config.ts: drizzle-kit is a CLI that runs outside the app, and
 * importing the app's Zod-validated config would make schema generation
 * depend on GITHUB_TOKEN being present.
 */
/**
 * `drizzle-kit generate` diffs the schema file and never opens a connection,
 * so migrations can be written before a Neon project exists. Only `migrate`,
 * `push` and `studio` connect — those fail loudly against this placeholder,
 * which is the intended signal to go set the real value.
 */
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://set-DATABASE_URL-in-dot-env@localhost:5432/repogauge";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
