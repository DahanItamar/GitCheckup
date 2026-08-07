import type { Metadata } from "next";

import { ImprovedList } from "@/components/ImprovedList";
import { RepoInput } from "@/components/RepoInput";
import { SuggestionChips } from "@/components/TrendingList";
import { getMostImproved } from "@/lib/services/improved";
import { SEED_REPOS } from "@/lib/services/trending";

/**
 * Same reason as the landing page: without this the board is prerendered once
 * at build time and freezes at whatever the database held then.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Most improved",
  description:
    "Public repositories that gained the most RepoGauge points recently.",
};

export default async function ImprovedPage() {
  const { repos, windowDays, minStars, quiet } = await getMostImproved(20);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Most improved</h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
        Repositories that gained the most points in the last {windowDays} days,
        ranked by how far they climbed rather than how high they sit. A project
        going from 54 to 71 did more work than one parked at 95.
      </p>

      <div className="mt-10">
        {repos.length > 0 ? (
          <ImprovedList repos={repos} />
        ) : (
          <EmptyBoard
            quiet={quiet}
            minStars={minStars}
            windowDays={windowDays}
          />
        )}
      </div>

      <div className="mt-14 max-w-xl border-t border-border pt-10">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
          Score a repo
        </h2>
        <div className="mt-4">
          <RepoInput />
        </div>
        <div className="mt-6">
          <SuggestionChips repos={SEED_REPOS} />
        </div>
      </div>
    </div>
  );
}

/**
 * An empty board here is the normal state of a young deployment, not a fault:
 * a gain needs two scores of the same repo, so nothing can appear until
 * someone scores a repo, changes it, and scores it again. Saying only "nothing
 * yet" would read as broken, so this says what has to happen and gives the
 * control that starts it.
 */
function EmptyBoard({
  quiet,
  minStars,
  windowDays,
}: {
  quiet: boolean;
  minStars: number;
  windowDays: number;
}) {
  if (!quiet) {
    return (
      <p role="status" className="text-sm text-muted">
        The board could not be loaded. It should be back shortly — the score
        pages are unaffected.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-5 shadow-rest">
      <h2 className="text-sm font-medium">Nothing has moved yet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        A repository appears here once RepoGauge has seen it twice and the
        second score is higher. Score one below, add a LICENSE or a CI workflow,
        then score it again — the gain shows up here for {windowDays} days.
      </p>
      <p className="mt-2 text-xs text-faint">
        Repositories need at least {minStars} stars to be listed.
      </p>
    </div>
  );
}
