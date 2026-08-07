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
// `||`, not `??`. drizzle-kit does read `.env`, and `.env.example` ships this
// key present-and-empty — so the value here is `""` rather than undefined,
// which `??` passes straight through. The placeholder below then never
// rendered, and the failure read "Please provide required params for Postgres
// driver" instead of naming the variable to set. Same empty-is-not-absent trap
// as `lib/config.ts`.
const PLACEHOLDER =
  "postgresql://set-DATABASE_URL-in-dot-env@localhost:5432/gitcheckup";

const databaseUrl = process.env.DATABASE_URL || PLACEHOLDER;

// drizzle-kit prints neither the URL it used nor the variable it wanted, so
// `migrate` against the placeholder just stalls on localhost and dies. Saying
// it here costs one line and is the difference between "go set DATABASE_URL"
// and ten minutes of wondering which of three things is wrong.
if (databaseUrl === PLACEHOLDER) {
  console.warn(
    "\n  DATABASE_URL is not set — using a placeholder.\n" +
      "  `generate` works without one; `migrate`, `push` and `studio` will fail.\n" +
      "  Create a free Postgres project at https://neon.tech and put its\n" +
      "  connection string in .env as DATABASE_URL.\n",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
