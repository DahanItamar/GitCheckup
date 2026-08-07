import { GitCheckupError } from "@/lib/errors";
import type { RepoSlug } from "@/lib/repo-slug";

import { getOrComputeScore, type ScoredRepo } from "./score-repo";

/**
 * Two scores for one page (SPEC §7 Flow E).
 *
 * Adds no new fetching or caching of its own — it is `getOrComputeScore`
 * twice. Every rule that governs one score governs both: the cache, the
 * freshness ladder, the per-IP cold budget, and demo mode.
 *
 * The two run concurrently. Sequentially, a page comparing two uncached repos
 * would pay two full six-call fan-outs end to end, and the fan-outs do not
 * contend for anything — GitHub's budget is counted in requests, not in
 * parallelism.
 */

export interface Comparison {
  a: ScoredRepo;
  b: ScoredRepo;
}

export async function compareRepos(
  a: RepoSlug,
  b: RepoSlug,
  options: { clientIp?: string } = {},
): Promise<Comparison> {
  if (sameRepo(a, b)) {
    throw new GitCheckupError("INVALID_SLUG", {
      cause: new Error("a repository cannot be compared with itself"),
    });
  }

  const [left, right] = await Promise.all([
    getOrComputeScore(a, options),
    getOrComputeScore(b, options),
  ]);

  return { a: left, b: right };
}

/** GitHub slugs are case-insensitive, so `Facebook/React` is the same repo. */
function sameRepo(a: RepoSlug, b: RepoSlug): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.name.toLowerCase() === b.name.toLowerCase()
  );
}
