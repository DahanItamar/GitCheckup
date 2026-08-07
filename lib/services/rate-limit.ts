import { createHmac } from "node:crypto";

import { COLD_SCORES_PER_HOUR, RATE_LIMIT_SECRET } from "@/lib/config";
import { recordHit } from "@/lib/db/rate-limit";
import { GitCheckupError } from "@/lib/errors";

/**
 * Per-IP throttling of cold scores (SPEC §8).
 *
 * The resource being protected is the GitHub token budget, not our own
 * bandwidth — so cached reads are unlimited and only a fetch counts.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Buckets outlive their hour so a sweep is never racing an active window. */
const BUCKET_LIFETIME_MS = 2 * HOUR_MS;

/**
 * `<hmac(ip)>:<epoch_hour>`. Pure, so the keying scheme can be tested without
 * a database — including the property that matters most, that the raw IP is
 * not recoverable from the key.
 */
export function bucketKeyFor(ip: string, now: Date, secret: string): string {
  const epochHour = Math.floor(now.getTime() / HOUR_MS);
  const hashed = createHmac("sha256", secret).update(ip).digest("hex");

  return `${hashed}:${epochHour}`;
}

/** Seconds until the current hour rolls over and the caller's budget resets. */
export function secondsUntilReset(now: Date): number {
  const elapsed = now.getTime() % HOUR_MS;
  return Math.max(1, Math.ceil((HOUR_MS - elapsed) / 1000));
}

/**
 * Charges one cold score to the caller, throwing once they exceed the hourly
 * allowance.
 *
 * An unknown IP is allowed through. Local development and server-side calls
 * have no forwarded address, and refusing to score anything without one would
 * break the app in exactly the environments where no budget is at risk.
 */
export async function chargeColdScore(
  clientIp: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (clientIp === undefined || clientIp === "") return;

  const key = bucketKeyFor(clientIp, now, RATE_LIMIT_SECRET);

  let hits: number;
  try {
    hits = await recordHit(key, new Date(now.getTime() + BUCKET_LIFETIME_MS));
  } catch (cause) {
    // A limiter that cannot reach its store must not take the product down.
    console.error("[rate-limit] counter unavailable; allowing", cause);
    return;
  }

  if (hits > COLD_SCORES_PER_HOUR) {
    throw new GitCheckupError("RATE_LIMITED", {
      retryAfterSeconds: secondsUntilReset(now),
    });
  }
}
