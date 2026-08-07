import { SCORE_STALE_CEILING_DAYS, SCORE_TTL_HOURS } from "@/lib/config";

/**
 * Flow A step 5 (SPEC §7), as a pure function.
 *
 * Extracted from the orchestration so the branch that decides whether a user
 * waits on GitHub can be tested exhaustively without a database, a network,
 * or a clock. Everything it needs is an argument.
 */

export type CacheAction =
  /** Within TTL and current rubric — serve it, touch nothing. */
  | "fresh"
  /** Past TTL but inside the ceiling — serve it now, refresh behind the response. */
  | "stale"
  /** Missing, too old, or scored by an older rubric — fetch synchronously. */
  | "cold";

export interface CacheCandidate {
  fetchedAt: Date;
  rubricVersion: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function decideCacheAction(
  candidate: CacheCandidate | null,
  currentRubricVersion: number,
  now: Date,
): CacheAction {
  if (candidate === null) return "cold";

  // A row written by different weights is not a stale answer, it is a
  // different question. No backfill, no migration — just a miss (SPEC §8).
  if (candidate.rubricVersion !== currentRubricVersion) return "cold";

  const ageMs = now.getTime() - candidate.fetchedAt.getTime();

  // A clock skew that puts the row in the future shouldn't read as expired.
  if (ageMs <= SCORE_TTL_HOURS * HOUR_MS) return "fresh";
  if (ageMs <= SCORE_STALE_CEILING_DAYS * DAY_MS) return "stale";

  return "cold";
}

/** Whole days since a score was taken, for the "scored N days ago" notice. */
export function daysSince(fetchedAt: Date, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - fetchedAt.getTime()) / DAY_MS),
  );
}
