import type { Metadata } from "next";

import { RepoInput } from "@/components/RepoInput";
import { SuggestionChips, TrendingList } from "@/components/TrendingList";
import { DEMO_MODE } from "@/lib/config";
import { SEED_REPOS, getTrending } from "@/lib/services/trending";

/**
 * Without this the page is prerendered once at build time and the leaderboard
 * is frozen at whatever the database held during the build. Five minutes is
 * short enough that a newly scored repo shows up quickly, and long enough that
 * the CDN absorbs the traffic instead of Neon.
 */
export const revalidate = 300;

/** Flow D (SPEC §7): top 20 by score in the last 7 days. */
export const metadata: Metadata = {
  title: "Trending",
  description:
    "Recently scored public repositories on RepoGauge, ranked by score.",
};

export default async function TrendingPage() {
  const { repos, seeded } = await getTrending(20);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Trending</h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
        {/* In demo mode there is no lookup history to rank — the board is the
            bundled fixture set. The banner says the scores are canned; saying
            "anyone has looked up" here would still be a plain untruth. */}
        {DEMO_MODE
          ? "The bundled demo repositories with at least 50 stars, ranked by score."
          : "The best-scoring repositories anyone has looked up in the last seven days, with at least 50 stars."}
      </p>

      <div className="mt-10">
        {repos.length > 0 ? (
          <TrendingList repos={repos} />
        ) : (
          <p className="text-sm text-muted">
            Nothing has been scored yet. Start with one of these.
          </p>
        )}
      </div>

      {seeded && (
        <div className="mt-10">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
            Try one
          </h2>
          <div className="mt-3">
            <SuggestionChips repos={SEED_REPOS} />
          </div>
        </div>
      )}

      <div className="mt-14 max-w-xl border-t border-border pt-10">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
          Score a repo
        </h2>
        <div className="mt-4">
          <RepoInput />
        </div>
      </div>
    </div>
  );
}
