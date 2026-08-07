import { RUBRIC_VERSION } from "@/lib/config";
import { findTrending, type TrendingRepo } from "@/lib/db/scores";

/**
 * Flow D (SPEC §7). The leaderboard and the landing strip run the same query
 * at different limits.
 */

const WINDOW_DAYS = 7;

/** SPEC §11 assumption 5. Lower it and the board is whatever was last pasted. */
const MIN_STARS = 50;

/** Below this, the page shows suggestions instead of a thin list (SPEC §8). */
const MIN_ROWS_BEFORE_SEEDING = 6;

/**
 * The seed set, shown when the query cannot fill the page. Without it, the
 * second impression of a brand-new deployment is an empty leaderboard.
 */
export const SEED_REPOS = [
  { owner: "facebook", name: "react" },
  { owner: "vercel", name: "next.js" },
  { owner: "rust-lang", name: "rust" },
  { owner: "sveltejs", name: "svelte" },
] as const;

export interface TrendingView {
  repos: TrendingRepo[];
  /** True when the caller should render the seed suggestions instead. */
  seeded: boolean;
}

/**
 * Never throws. Trending is a secondary surface — a database hiccup should
 * degrade it to the suggestion list, not take down the landing page.
 */
export async function getTrending(limit: number): Promise<TrendingView> {
  try {
    const repos = await findTrending({
      limit,
      windowDays: WINDOW_DAYS,
      minStars: MIN_STARS,
      rubricVersion: RUBRIC_VERSION,
    });

    return { repos, seeded: repos.length < MIN_ROWS_BEFORE_SEEDING };
  } catch (cause) {
    console.error("[trending] query failed; falling back to seeds", cause);
    return { repos: [], seeded: true };
  }
}
