import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { CompareInput } from "@/components/CompareInput";
import { EmbedSnippets } from "@/components/EmbedSnippets";
import { gradeTint } from "@/components/grade-color";
import { StarIcon } from "@/components/icons";
import { RepoError } from "@/components/RepoError";
import { RepoInput } from "@/components/RepoInput";
import { RetryButton } from "@/components/RetryButton";
import { ScoreDial } from "@/components/ScoreDial";
import { ScoreSparkline } from "@/components/ScoreSparkline";
import { TipList } from "@/components/TipList";
import { clientIpFrom } from "@/lib/client-ip";
import { DEMO_MODE, SITE_URL } from "@/lib/config";
import { isGitCheckupError } from "@/lib/errors";
import { parseRepoSlug } from "@/lib/repo-slug";
import {
  getScoreHistory,
  type ScoreHistoryView,
} from "@/lib/services/score-history";
import { getOrComputeScore, type ScoredRepo } from "@/lib/services/score-repo";

import { RescoreButton } from "./RescoreButton";

/**
 * The result page, and the shareable URL (SPEC §7 Flow A step 3).
 *
 * Calls `lib/services/` directly — never its own API route, which would pay a
 * network round trip and create a self-DoS path under load (SPEC §3).
 */

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { owner, repo } = await params;
  const slug = parseRepoSlug(`${owner}/${repo}`);
  const label =
    slug === null ? `${owner}/${repo}` : `${slug.owner}/${slug.name}`;

  // The card URL carries only the slug — the image route re-derives the score
  // itself rather than trusting a query parameter (SPEC §3). Scoring here as
  // well as in the page would double the GitHub fan-out for no gain.
  const image = `${SITE_URL}/api/og?repo=${encodeURIComponent(label)}`;
  const description = `GitCheckup score for ${label} — docs, community, activity, popularity and hygiene, out of 100.`;

  return {
    title: label,
    description,
    openGraph: {
      title: `${label} · GitCheckup`,
      description,
      url: `${SITE_URL}/r/${label}`,
      images: [{ url: image, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${label} · GitCheckup`,
      description,
      images: [image],
    },
  };
}

export default async function ResultPage({ params }: RouteParams) {
  const { owner, repo } = await params;

  // Client-side validation was UX. This is the control (SPEC §7 step 4).
  const slug = parseRepoSlug(`${owner}/${repo}`);
  if (slug === null) {
    return <RepoError code="INVALID_SLUG" />;
  }

  let result: ScoredRepo;
  try {
    result = await getOrComputeScore(slug, {
      clientIp: clientIpFrom(await headers()),
    });
  } catch (error) {
    if (isGitCheckupError(error)) {
      // A rate limit refills and an upstream outage ends, so both get a way to
      // try this repo again. A missing repo does not — offering a retry there
      // would invite someone to hammer a slug that will never resolve.
      const recoverable =
        error.code === "RATE_LIMITED" || error.code === "UPSTREAM_UNAVAILABLE";

      return (
        <RepoError
          code={error.code}
          retryAfterSeconds={error.retryAfterSeconds}
          action={recoverable ? <RetryButton /> : undefined}
        />
      );
    }
    throw error;
  }

  // GitHub keeps every old slug working, so `/r/facebook/react` and
  // `/r/react/react` are the same repository. Left alone that splits the
  // shareable URL (Flow A step 3) and the score history in two.
  //
  // Outside the try/catch above: `redirect()` signals by throwing, and a catch
  // that inspected it would swallow the navigation.
  //
  // This lands as a **client-side** redirect, not a 307. The canonical name is
  // only known after the score resolves, by which time the streaming response
  // has committed its status — so Next puts the instruction in the RSC payload
  // instead. Browsers follow it; `curl` sees a 200. That is acceptable because
  // it is cosmetic: `findLatestScore` resolves the old slug through
  // `repo_aliases`, so both URLs are cache hits either way, and
  // `generateMetadata` still emits a correct card for whichever was requested.
  const canonical = { owner: result.repo.owner, name: result.repo.name };
  if (canonical.owner !== slug.owner || canonical.name !== slug.name) {
    redirect(`/r/${canonical.owner}/${canonical.name}`);
  }

  // After the score, and never blocking it: the trend is decoration on a page
  // whose subject is the current number.
  const history = await getScoreHistory(slug);

  return <Result result={result} history={history} />;
}

function Result({
  result,
  history,
}: {
  result: ScoredRepo;
  history: ScoreHistoryView;
}) {
  const { repo, score } = result;
  const githubUrl = `https://github.com/${repo.owner}/${repo.name}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <header
        className="animate-rise flex flex-col gap-8 rounded-2xl border border-border p-8 shadow-rest sm:flex-row sm:items-center sm:justify-between sm:p-10"
        style={{ backgroundColor: gradeTint(score.grade, 5) }}
      >
        <div className="min-w-0">
          <a
            href={githubUrl}
            rel="noopener noreferrer nofollow"
            className="block truncate font-mono text-2xl font-medium tracking-tight underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-accent"
          >
            {repo.owner}/{repo.name}
          </a>
          <p className="mt-2 flex items-center gap-1.5 text-sm tabular-nums text-muted">
            <StarIcon className="size-3.5 text-faint" />
            {formatCount(repo.stars)} stars · scored{" "}
            <time dateTime={result.fetchedAt}>
              {formatScoredAt(result.fetchedAt)}
            </time>
          </p>

          {/* Hidden in demo mode: there is nothing to refresh from, so the
              control would report success having changed nothing. */}
          {!DEMO_MODE && <RescoreButton owner={repo.owner} name={repo.name} />}
        </div>

        <div className="shrink-0 self-center">
          <ScoreDial total={score.total} grade={score.grade} />
          <ScoreSparkline
            points={history.points}
            grade={score.grade}
            windowDays={history.windowDays}
          />
        </div>
      </header>

      <div className="mt-14 space-y-14">
        <CategoryBreakdown categories={score.categories} />
        <TipList tips={score.tips} owner={repo.owner} name={repo.name} />
        <EmbedSnippets owner={repo.owner} name={repo.name} siteUrl={SITE_URL} />

        <section className="border-t border-border pt-10">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
            Compare with
          </h2>
          <div className="mt-4 max-w-xl">
            <CompareInput owner={repo.owner} name={repo.name} />
          </div>
        </section>

        <section className="border-t border-border pt-10">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
            Score another
          </h2>
          <div className="mt-4 max-w-xl">
            <RepoInput />
          </div>
        </section>
      </div>
    </div>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * A cached score can be hours or days old, and after M2 most page views are
 * cache hits — so "just now" would be wrong far more often than right.
 */
function formatScoredAt(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);

  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
