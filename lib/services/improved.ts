import {
  DEMO_MODE,
  IMPROVED_MIN_STARS,
  IMPROVED_WINDOW_DAYS,
  RUBRIC_VERSION,
} from "@/lib/config";
import { findMostImproved, type ImprovedRepo } from "@/lib/db/scores";

/**
 * Flow D′ (SPEC §7): the repos that gained the most points recently.
 *
 * Replaces ranking by absolute score, which could only ever list the same
 * enormous repositories — nothing about a 95 changes. This asks who did the
 * work, which is the question RepoGauge is uniquely able to answer.
 */

export interface ImprovedView {
  repos: ImprovedRepo[];
  windowDays: number;
  minStars: number;
  /**
   * True when the board is empty because nothing has *moved* yet, rather than
   * because the query failed. The page says different things about each: one
   * is a young deployment working correctly, the other is a fault.
   */
  quiet: boolean;
}

export async function getMostImproved(limit: number): Promise<ImprovedView> {
  const empty = {
    repos: [],
    windowDays: IMPROVED_WINDOW_DAYS,
    minStars: IMPROVED_MIN_STARS,
  };

  // Demo fixtures hold one canned score each and no history, so no repo has a
  // "from" to have improved on. An invented gain would be the demo fabricating
  // the very thing this page exists to report (SPEC §11.12).
  if (DEMO_MODE) return { ...empty, quiet: true };

  try {
    const repos = await findMostImproved({
      limit,
      windowDays: IMPROVED_WINDOW_DAYS,
      minStars: IMPROVED_MIN_STARS,
      rubricVersion: RUBRIC_VERSION,
    });

    return { ...empty, repos, quiet: repos.length === 0 };
  } catch (cause) {
    console.error("[improved] query failed", cause);
    return { ...empty, quiet: false };
  }
}
