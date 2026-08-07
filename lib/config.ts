import { z } from "zod";

/**
 * Environment, parsed once at import time (SPEC §6).
 *
 * This throws rather than warning on purpose: a missing GITHUB_TOKEN silently
 * drops GitHub to 60 requests/hour, and the app then dies mysteriously under
 * any load (SPEC §8). Failing at boot turns a confusing production incident
 * into an obvious startup error.
 */

/**
 * Demo mode: score bundled fixtures instead of reaching GitHub or Postgres, so
 * the interface can be run with no credentials at all (SPEC §11.12).
 *
 * This is not the "unauthenticated fallback" §8 forbids. That would be the app
 * quietly degrading to anonymous GitHub calls under a real workload. This makes
 * no outbound call whatsoever, must be asked for by name, and says so on every
 * page — nobody can arrive in it by accident or mistake its output for real.
 */
export const DEMO_MODE = process.env.DEMO_MODE === "1";

/**
 * In demo mode a credential is never used, so it is never demanded.
 *
 * `blankIsAbsent` matters more here than it looks. `.env.example` ships every
 * credential with an empty value, and demo mode is reached by setting
 * `DEMO_MODE=1` in that same file — so the common case is a blank
 * `DATABASE_URL`, which is a string and therefore beats the placeholder
 * default. `neon("")` then throws at import and the app dies on a route it
 * never intended to reach the database from.
 */
const credential = (real: z.ZodType<string>, placeholder: string) =>
  DEMO_MODE ? blankIsAbsent(z.string().default(placeholder)) : real;

/**
 * Treats `FOO=` in a `.env` as "not set", which is what anyone writing it
 * means.
 *
 * A key present with an empty value is a string, not `undefined`, so `.default()`
 * never fires and `.optional()` rejects it. `.env.example` ships every optional
 * key with an empty value — so `cp .env.example .env`, the setup step the
 * README, CONTRIBUTING and the handoff all give, produced an app that refused
 * to boot complaining about two variables the instructions never mentioned.
 *
 * Only for optional and defaulted values. The three credentials must still
 * fail loudly when blank; that refusal is the point of this file.
 */
function blankIsAbsent<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const envSchema = z.object({
  /** Fine-grained PAT: public repository read only, zero write scopes. */
  GITHUB_TOKEN: credential(
    z.string().min(1, "GITHUB_TOKEN is required"),
    "demo-mode-no-token",
  ),

  /**
   * HMAC key for hashing caller IPs before storage. Required from M4: a
   * predictable key would make the stored hashes reversible by anyone who
   * can guess an IP, which is the whole point of hashing them.
   */
  RATE_LIMIT_SECRET: credential(
    z.string().min(16, "RATE_LIMIT_SECRET must be at least 16 characters"),
    "demo-mode-no-secret-needed",
  ),

  /**
   * Neon connection string. Required from M2 for the same reason as the
   * token: a cache that silently isn't caching is exactly the "dies
   * mysteriously under load" failure this app refuses to boot into.
   */
  // The placeholder is well-formed on purpose: `neon()` validates the string's
  // shape when lib/db/client.ts is imported, which happens even in demo mode
  // because the import graph is static. It is never connected to.
  DATABASE_URL: credential(
    z.string().min(1, "DATABASE_URL is required"),
    "postgresql://demo:demo@demo.invalid/demo",
  ),

  /** v1 accepts exactly one provider. The seam exists; the choice does not. */
  TIPS_PROVIDER: blankIsAbsent(z.literal("rules").default("rules")),

  NEXT_PUBLIC_SITE_URL: blankIsAbsent(z.url().optional()),
  VERCEL_PROJECT_PRODUCTION_URL: blankIsAbsent(z.string().min(1).optional()),
});

/**
 * Zod names the variable but cannot say where to get one. Since this error is
 * the first thing a new contributor sees, it carries the fix with it.
 */
const HINTS: Record<string, string> = {
  GITHUB_TOKEN:
    "Create a fine-grained PAT with public repository read access and zero write scopes: https://github.com/settings/personal-access-tokens",
  DATABASE_URL:
    "Create a free Postgres project at https://neon.tech, copy its connection string, then run: pnpm db:migrate",
  RATE_LIMIT_SECRET: "Any long random string. Used to HMAC caller IPs.",
};

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const name = issue.path.join(".");
        const hint = HINTS[name];
        return `  ${name}: ${issue.message}${hint ? `\n    → ${hint}` : ""}`;
      })
      .join("\n");
    throw new Error(
      `Invalid environment. Copy .env.example to .env and fill it in.\n${issues}`,
    );
  }

  return parsed.data;
}

const env = loadEnv();

export const GITHUB_TOKEN = env.GITHUB_TOKEN;
export const RATE_LIMIT_SECRET = env.RATE_LIMIT_SECRET;
export const DATABASE_URL = env.DATABASE_URL;
export const TIPS_PROVIDER = env.TIPS_PROVIDER;

/**
 * Absolute base for OG and embed URLs. Falls back to the Vercel production
 * host, then localhost — so M1 and M2 are unblocked while the production
 * domain is still an open question (SPEC §12).
 */
export const SITE_URL: string =
  env.NEXT_PUBLIC_SITE_URL ??
  (env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/** Tuning constants (SPEC §11 assumption 3). Change freely. */
export const SCORE_TTL_HOURS = 6;
export const SCORE_STALE_CEILING_DAYS = 7;
export const IMAGE_CACHE_SECONDS = 6 * 60 * 60;

/** Cold scores permitted per IP per hour (SPEC §11 assumption 4). */
export const COLD_SCORES_PER_HOUR = 30;

/** How far back `/improved` looks for a gain. */
export const IMPROVED_WINDOW_DAYS = 30;

/**
 * The star floor on `/improved`, deliberately far below `/trending`'s 50.
 *
 * That floor is not a quality bar — it is the §9 mitigation for a public
 * surface anyone can push a repository onto, and it works by making an entry
 * cost 50 real stars. A board about *movement* cannot keep it: excluding
 * everything small would rebuild the hall of giants this page exists to
 * escape, since a repo at 95 has nowhere to climb.
 *
 * 10 keeps a throwaway repository off the homepage while letting a genuinely
 * small project on. It is the first number to raise if spam ever appears, and
 * the window means anything unwanted ages off without intervention.
 */
export const IMPROVED_MIN_STARS = 10;

/**
 * How long superseded score rows are kept.
 *
 * `scores` is insert-only: every refresh writes a new row and the latest one
 * wins. Nothing read the older rows, and nothing deleted them either, so a
 * repo viewed continuously accrued four rows a day — about 3 MB a year, per
 * repo, forever.
 *
 * 180 days, because rows now accrue only when a score *changes* — an identical
 * rescan touches the existing row instead of appending. That made the window
 * cheap: measured on PGlite at ~2.2 KB per row, six months of a repo whose
 * score moves weekly is ~55 KB, and even the pathological case of a score
 * changing every 6 hours fits roughly 500 repositories in a 500 MB tier.
 *
 * Six months is also the shortest window where the sparkline says something. A
 * repo that improves once a quarter draws a flat line over 30 days.
 *
 * The newest row for a repo is never swept, whatever its age, so this bounds
 * growth without ever costing a cache hit.
 */
export const SCORE_HISTORY_DAYS = 180;

/**
 * The rubric weights this build produces. Bumped in the same commit as any
 * weight change; a cached row at an older version is a cache miss (SPEC §8).
 *
 * 2 — a repo that has never been pushed to no longer scores full marks for
 *     recency. It previously inherited its creation date, which handed every
 *     empty repo 10 free points and lifted the bottom of the scale to 24.
 */
export const RUBRIC_VERSION = 2;
