import { after } from "next/server";

import { DEMO_MODE, RUBRIC_VERSION } from "@/lib/config";
import { findDemoSignals } from "@/lib/demo/repos";
import { findLatestScore, saveScore, type CachedScore } from "@/lib/db/scores";
import { GitCheckupError } from "@/lib/errors";
import { GitHubError } from "@/lib/github/errors";
import { fetchRepoSignals } from "@/lib/github/signals";
import type { RepoSignals } from "@/lib/github/types";
import type { RepoSlug } from "@/lib/repo-slug";
import { score } from "@/lib/score/rubric";
import type { ScoreResult } from "@/lib/score/types";
import { getTipProvider } from "@/lib/tips";

import { decideCacheAction } from "./freshness";
import { chargeColdScore } from "./rate-limit";

/**
 * The one orchestration seam (SPEC §6): cache lookup → freshness → fetch →
 * score → persist. This is the only place lib/db and lib/github meet.
 */

export interface ScoreRepoOptions {
  /** Skip the freshness check and force a GitHub fetch. Rate-limited callers only. */
  forceRefresh?: boolean;

  /**
   * Serve whatever is cached, at any age, and never touch GitHub — not even
   * behind the response (SPEC §7 Flow B step 3).
   *
   * The image routes set this. They are called by GitHub's Camo proxy on
   * every README view of every repo that embeds a card, so if they could
   * trigger fetches, long-tail embed traffic would drain the 5000/hr budget
   * with no user waiting on the result. Only a completely unknown repo costs
   * a fetch. Freshness is a UI concern; the card trades it for a hard ceiling
   * on outbound calls.
   */
  neverRefresh?: boolean;

  /**
   * The caller's address, for the per-IP cold-score limit (SPEC §8). Routes
   * read it from the request; nothing below this layer touches headers.
   * Undefined means unknown, which is allowed through — see `chargeColdScore`.
   */
  clientIp?: string;
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

  // Demo mode short-circuits before any IO: no GitHub, no Postgres, no rate
  // limiter. Everything downstream — rubric, tips, card, badge — is the real
  // implementation running on canned input.
  if (DEMO_MODE) return demoScore(slug, now);

  const cached = await readCache(slug);

  const action = options?.forceRefresh
    ? "cold"
    : decideCacheAction(cached, RUBRIC_VERSION, now);

  // Flow B: an image route takes what we have and asks GitHub for nothing.
  // The rubric version is still honoured — a card contradicting the page it
  // links to would be worse than a slow card.
  if (
    cached !== null &&
    options?.neverRefresh === true &&
    cached.rubricVersion === RUBRIC_VERSION
  ) {
    return serve(cached, { stale: action !== "fresh" });
  }

  if (cached !== null && action === "fresh") {
    return serve(cached, { stale: false });
  }

  if (cached !== null && action === "stale") {
    // The user waits on nothing; the refresh runs after the response.
    scheduleRefresh(slug);
    return serve(cached, { stale: true });
  }

  // Only a cold score costs GitHub budget, so only a cold score is charged.
  // This sits before the fetch and after every cache branch above it.
  await chargeColdScore(options?.clientIp, now);

  return computeAndPersist(slug, now, cached);
}

/**
 * A fixture scored by the real rubric. An unknown slug is a genuine
 * REPO_NOT_FOUND — the demo has a fixed set of repos and says so rather than
 * inventing a score for whatever was typed.
 */
async function demoScore(slug: RepoSlug, now: Date): Promise<ScoredRepo> {
  const signals = findDemoSignals(slug, now);
  if (signals === null) throw new GitCheckupError("REPO_NOT_FOUND");

  return {
    repo: { owner: signals.owner, name: signals.name, stars: signals.stars },
    score: await scoreSignals(signals, now),
    fetchedAt: now.toISOString(),
    cached: false,
    stale: false,
  };
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
      // What was asked for, which is not always what GitHub returned: a
      // renamed or transferred repo answers under its canonical slug. Passing
      // it lets the next lookup by the old name hit the cache.
      requestedSlug: { owner: slug.owner, name: slug.name },
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
    // Name the credential explicitly. "GitHub failed" is true of an outage,
    // which ends on its own; a rejected token does not, and this branch is
    // exactly where that difference hides — the site keeps answering from
    // cache and looks healthy.
    console.error(
      cause instanceof GitHubError && cause.code === "UNAUTHORIZED"
        ? "[score-repo] serving a stale score; GITHUB_TOKEN was rejected"
        : "[score-repo] serving a stale score; GitHub failed",
      cause,
    );
    return serve(fallback, { stale: true });
  }
  throw toGitCheckupError(cause);
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

function toGitCheckupError(cause: unknown): GitCheckupError {
  if (!(cause instanceof GitHubError)) {
    return new GitCheckupError("UPSTREAM_UNAVAILABLE", { cause });
  }

  if (cause.code === "NOT_FOUND") {
    return new GitCheckupError("REPO_NOT_FOUND", { cause });
  }

  // A spent GitHub budget is our problem, not the caller's: RATE_LIMITED is
  // reserved for a caller who exceeded *our* per-IP limit (SPEC §8).
  //
  // UNAUTHORIZED lands here too, and deliberately keeps the same copy. The
  // visitor cannot act on our expired token, and telling them the operator
  // misconfigured the site would be honest but useless. The distinction is
  // preserved in `cause` and shouted in the log, where it can be acted on.
  return new GitCheckupError("UPSTREAM_UNAVAILABLE", { cause });
}
