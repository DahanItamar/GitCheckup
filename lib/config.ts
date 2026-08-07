import { z } from "zod";

/**
 * Environment, parsed once at import time (SPEC §6).
 *
 * This throws rather than warning on purpose: a missing GITHUB_TOKEN silently
 * drops GitHub to 60 requests/hour, and the app then dies mysteriously under
 * any load (SPEC §8). Failing at boot turns a confusing production incident
 * into an obvious startup error.
 */

const envSchema = z.object({
  /** Fine-grained PAT: public repository read only, zero write scopes. */
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),

  /**
   * HMAC key for hashing caller IPs before storage. Required from M4: a
   * predictable key would make the stored hashes reversible by anyone who
   * can guess an IP, which is the whole point of hashing them.
   */
  RATE_LIMIT_SECRET: z
    .string()
    .min(16, "RATE_LIMIT_SECRET must be at least 16 characters"),

  /**
   * Neon connection string. Required from M2 for the same reason as the
   * token: a cache that silently isn't caching is exactly the "dies
   * mysteriously under load" failure this app refuses to boot into.
   */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /** v1 accepts exactly one provider. The seam exists; the choice does not. */
  TIPS_PROVIDER: z.literal("rules").default("rules"),

  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
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

/**
 * The rubric weights this build produces. Bumped in the same commit as any
 * weight change; a cached row at an older version is a cache miss (SPEC §8).
 *
 * 2 — a repo that has never been pushed to no longer scores full marks for
 *     recency. It previously inherited its creation date, which handed every
 *     empty repo 10 free points and lifted the bottom of the scale to 24.
 */
export const RUBRIC_VERSION = 2;
