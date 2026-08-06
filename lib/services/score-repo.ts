import { RepoGaugeError } from "@/lib/errors";
import { GitHubError } from "@/lib/github/errors";
import { fetchRepoSignals } from "@/lib/github/signals";
import type { RepoSlug } from "@/lib/repo-slug";
import { score } from "@/lib/score/rubric";
import type { ScoreResult } from "@/lib/score/types";
import { getTipProvider } from "@/lib/tips";

/**
 * The one orchestration seam (SPEC §6): fetch → score → tips.
 *
 * M1 has no database, so every call is a cold path and `cached` is always
 * false. M2 inserts the fresh / stale / cold branches of Flow A ahead of the
 * fetch; the signature and the returned shape are already what those branches
 * will produce, so no caller changes when persistence lands.
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
  /** True when served past TTL with a background refresh queued. */
  stale: boolean;
}

export async function getOrComputeScore(
  slug: RepoSlug,
  _options?: ScoreRepoOptions,
): Promise<ScoredRepo> {
  const now = new Date();
  const signals = await fetchSignalsOrTranslate(slug);

  const rubric = score(signals, now);
  const tips = await getTipProvider().generate(signals, rubric.categories);

  return {
    repo: {
      // Canonical casing from the API, not whatever the visitor typed.
      owner: signals.owner,
      name: signals.name,
      stars: signals.stars,
    },
    score: { ...rubric, tips },
    fetchedAt: now.toISOString(),
    cached: false,
    stale: false,
  };
}

/**
 * The single place a GitHub failure becomes a product error. Above this line
 * nothing knows about HTTP statuses; below it, nothing knows about the UI.
 */
async function fetchSignalsOrTranslate(slug: RepoSlug) {
  try {
    return await fetchRepoSignals(slug);
  } catch (cause) {
    throw toRepoGaugeError(cause);
  }
}

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
