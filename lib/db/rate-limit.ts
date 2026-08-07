import { lt, sql } from "drizzle-orm";

import { db } from "./client";
import { rateLimitHits } from "./schema";

/**
 * The rate-limit counter (SPEC §8). One upsert per cold score.
 *
 * Only an HMAC of the caller's IP is ever written; the raw address never
 * reaches Postgres.
 */

/** Expired buckets are swept on roughly this share of writes — no cron. */
const SWEEP_PROBABILITY = 0.01;

/**
 * Increments the bucket and returns its new count.
 *
 * Counting first and judging second means a rejected attempt still costs the
 * caller a hit, so hammering the endpoint cannot reset anything.
 */
export async function recordHit(
  bucketKey: string,
  expiresAt: Date,
): Promise<number> {
  const rows = await db
    .insert(rateLimitHits)
    .values({ bucketKey, hits: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitHits.bucketKey,
      set: { hits: sql`${rateLimitHits.hits} + 1` },
    })
    .returning({ hits: rateLimitHits.hits });

  await maybeSweep();

  // A missing row would mean the upsert silently did nothing. Treating that
  // as "one hit" fails open, which is the right side to fail on for a counter
  // that protects a budget rather than a secret.
  return rows[0]?.hits ?? 1;
}

/**
 * Deletes expired buckets on a small fraction of writes. A table this small
 * does not justify a scheduled job, and SPEC §3 says not to add one without a
 * measured problem.
 */
async function maybeSweep(): Promise<void> {
  if (Math.random() >= SWEEP_PROBABILITY) return;

  try {
    await db
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.expiresAt, new Date()));
  } catch (cause) {
    // Housekeeping must never fail a user's request.
    console.error("[rate-limit] sweep failed", cause);
  }
}
