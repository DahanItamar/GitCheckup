import { after } from "next/server";

import { RUBRIC_VERSION } from "@/lib/config";
import { findLatestScore, saveScore, type CachedScore } from "@/lib/db/scores";
import { RepoGaugeError } from "@/lib/errors";
import { GitHubError } from "@/lib/github/errors";
import { fetchRepoSignals } from "@/lib/github/signals";
import type { RepoSignals } from "@/lib/github/types";
import type { RepoSlug } from "@/lib/repo-slug";
import { score } from "@/lib/score/rubric";
import type { ScoreResult } from "@/lib/score/types";
import { getTipProvider } from "@/lib/tips";

import { decideCacheAction } from "./freshness";

/**
 * The one orchestration seam (SPEC §6): cache lookup → freshness → fetch →
 * score → persist. This is the only place lib/db and lib/github meet.
 */

export interface ScoreRepoOptions {
  /** Skip the freshness check and force a GitHub fetch. Rate-limited callers only. */
  forceRefresh?: boolean;
}

export interface ScoredRepo {
  repo: { owner: string; name: string; stars: number };
  score: ScoreResult;
  /** ISO 8601 UTC. */
  fetchedAt: string;
  /** True when served without touching GitHub. */
  cached: boolean;
  /** True when served past TTL — either with a refresh queued, or degraded. */
  stale: boolean;
}

export async function getOrComputeScore(
  slug: RepoSlug,
  options?: ScoreRepoOptions,
): Promise<ScoredRepo> {
  const now = new Date();
  const cached = await readCache(slug);

  const action = options?.forceRefresh
    ? "cold"
    : decideCacheAction(cached, RUBRIC_VERSION, now);

  if (cached !== null && action === "fresh") {
    return serve(cached, { stale: false });
  }

  if (cached !== null && action === "stale") {
    // The user waits on nothing; the refresh runs after the response.
    scheduleRefresh(slug);
    return serve(cached, { stale: true });
  }

  return computeAndPersist(slug, now, cached);
}

/* -------------------------------------------------------------------------
 * Cold path
 * ---------------------------------------------------------------------- */

async function computeAndPersist(
  slug: RepoSlug,
  now: Date,
  fallback: CachedScore | null,
): Promise<ScoredRepo> {
  let signals: RepoSignals;
  try {
    signals = await fetchRepoSignals(slug);
  } catch (cause) {
    return degradeOrThrow(cause, fallback);
  }

  const result = await scoreSignals(signals, now);

  // A cache write that fails must not cost the user the score they waited
  // for — the next request simply misses again.
  try {
    await saveScore({
      githubId: signals.githubId,
      owner: signals.owner,
      name: signals.name,
      stars: signals.stars,
      isArchived: signals.isArchived,
      score: result,
      rubricVersion: RUBRIC_VERSION,
    });
  } catch (cause) {
    console.error("[score-repo] failed to persist score", cause);
  }

  return {
    repo: { owner: signals.owner, name: signals.name, stars: signals.stars },
    score: result,
    fetchedAt: now.toISOString(),
    cached: false,
    stale: false,
  };
}

async function scoreSignals(
  signals: RepoSignals,
  now: Date,
): Promise<ScoreResult> {
  const rubric = score(signals, now);
  const tips = await getTipProvider().generate(signals, rubric.categories);
  return { ...rubric, tips };
}

/**
 * SPEC §8: when GitHub is unreachable, any score we hold beats an error page,
 * however old it is. The page marks it stale and says when it was taken.
 */
function degradeOrThrow(
  cause: unknown,
  fallback: CachedScore | null,
): ScoredRepo {
  if (fallback !== null) {
    console.error("[score-repo] serving a stale score; GitHub failed", cause);
    return serve(fallback, { stale: true });
  }
  throw toRepoGaugeError(cause);
}

/* -------------------------------------------------------------------------
 * Cache
 * ---------------------------------------------------------------------- */

/**
 * A cache that is down is a cache miss, not an outage. Degrading to the M1
 * behaviour — fetch every time — keeps the product working while Neon is
 * asleep or unreachable.
 */
async function readCache(slug: RepoSlug): Promise<CachedScore | null> {
  try {
    return await findLatestScore(slug);
  } catch (cause) {
    console.error("[score-repo] cache read failed; treating as a miss", cause);
    return null;
  }
}

function serve(cached: CachedScore, flags: { stale: boolean }): ScoredRepo {
  return {
    repo: cached.repo,
    score: cached.score,
    fetchedAt: cached.fetchedAt.toISOString(),
    cached: true,
    stale: flags.stale,
  };
}

/**
 * `after()` throws outside a request scope — a script or a test. Serving the
 * stale score without a refresh is still the correct answer there, so the
 * failure to schedule is swallowed rather than propagated.
 */
function scheduleRefresh(slug: RepoSlug): void {
  try {
    after(async () => {
      try {
        await computeAndPersist(slug, new Date(), null);
      } catch (cause) {
        console.error("[score-repo] background refresh failed", cause);
      }
    });
  } catch {
    // No request scope. Nothing to schedule against.
  }
}

/* -------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------- */

function toRepoGaugeError(cause: unknown): RepoGaugeError {
  if (!(cause instanceof GitHubError)) {
    return new RepoGaugeError("UPSTREAM_UNAVAILABLE", { cause });
  }

  if (cause.code === "NOT_FOUND") {
    return new RepoGaugeError("REPO_NOT_FOUND", { cause });
  }

  // A spent GitHub budget is our problem, not the caller's: RATE_LIMITED is
  // reserved for a caller who exceeded *our* per-IP limit (SPEC §8).
  return new RepoGaugeError("UPSTREAM_UNAVAILABLE", { cause });
}
