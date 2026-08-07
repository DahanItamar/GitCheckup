import { DEMO_MODE, RUBRIC_VERSION } from "@/lib/config";
import { findTrending, type TrendingRepo } from "@/lib/db/scores";
import { allDemoSignals, demoSlugsBelow } from "@/lib/demo/repos";
import { score } from "@/lib/score/rubric";

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
const LIVE_SEED_REPOS = [
  { owner: "facebook", name: "react" },
  { owner: "vercel", name: "next.js" },
  { owner: "rust-lang", name: "rust" },
  { owner: "sveltejs", name: "svelte" },
] as const;

/**
 * In demo mode the suggestions must be slugs the fixtures actually contain, or
 * every "try one" link lands on a not-found page. They are deliberately the
 * fixtures the star floor keeps off the board — see `demoSlugsBelow`.
 */
export const SEED_REPOS: ReadonlyArray<{ owner: string; name: string }> =
  DEMO_MODE ? demoSlugsBelow(MIN_STARS) : LIVE_SEED_REPOS;

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
  if (DEMO_MODE) return demoTrending(limit);

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

/**
 * The same star floor and ranking as the real query, applied to fixtures — so
 * the demo leaderboard demonstrates the actual rule rather than just listing
 * everything bundled.
 */
function demoTrending(limit: number): TrendingView {
  const now = new Date();

  const repos: TrendingRepo[] = allDemoSignals(now)
    .filter((signals) => signals.stars >= MIN_STARS)
    .map((signals) => {
      const result = score(signals, now);
      return {
        owner: signals.owner,
        name: signals.name,
        stars: signals.stars,
        total: result.total,
        grade: result.grade,
      };
    })
    .sort((a, b) => b.total - a.total || b.stars - a.stars)
    .slice(0, limit);

  // Always seeded, unlike the live rule. The board is full — six fixtures clear
  // the floor — so the row count would never trigger the suggestions, and the
  // two repositories worth demonstrating are exactly the ones it excludes.
  return { repos, seeded: true };
}
