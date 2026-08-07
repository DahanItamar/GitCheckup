import { DEMO_MODE, RUBRIC_VERSION, SCORE_HISTORY_DAYS } from "@/lib/config";
import { findScoreHistory } from "@/lib/db/scores";
import type { RepoSlug } from "@/lib/repo-slug";

/**
 * The sparkline's data, as a service call (SPEC §3) — `components/` never
 * fetch, and `app/` never emits SQL.
 *
 * Never throws. The trend is decoration on a page whose subject is the current
 * score: a database hiccup should cost the sparkline, not the result. Same
 * reasoning as `getTrending`, and the same shape of guard.
 */

export interface ScoreHistoryPoint {
  total: number;
  at: Date;
}

export interface ScoreHistoryView {
  points: ScoreHistoryPoint[];
  windowDays: number;
}

export async function getScoreHistory(
  slug: RepoSlug,
): Promise<ScoreHistoryView> {
  // Demo mode holds one canned score per repo and no history at all. Drawing a
  // line through a single fixture point would invent a trend the demo cannot
  // have, which is the one thing demo mode may never do (SPEC §11.12).
  if (DEMO_MODE) return { points: [], windowDays: SCORE_HISTORY_DAYS };

  try {
    const rows = await findScoreHistory(slug, {
      rubricVersion: RUBRIC_VERSION,
    });

    return {
      // `firstSeenAt`, not `fetchedAt`: the chart plots when a score was
      // reached, not when it was last confirmed. See `findScoreHistory`.
      points: rows.map((row) => ({ total: row.total, at: row.firstSeenAt })),
      windowDays: SCORE_HISTORY_DAYS,
    };
  } catch (cause) {
    console.error("[score-history] query failed; hiding the sparkline", cause);
    return { points: [], windowDays: SCORE_HISTORY_DAYS };
  }
}
