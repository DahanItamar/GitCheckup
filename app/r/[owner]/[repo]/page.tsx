import type { Metadata } from "next";

import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { RepoError } from "@/components/RepoError";
import { RepoInput } from "@/components/RepoInput";
import { ScoreDial } from "@/components/ScoreDial";
import { TipList } from "@/components/TipList";
import { isRepoGaugeError } from "@/lib/errors";
import { parseRepoSlug } from "@/lib/repo-slug";
import { getOrComputeScore, type ScoredRepo } from "@/lib/services/score-repo";

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
  // Scoring here as well as in the page would double the GitHub fan-out. The
  // score-aware title and og:image land in M3, behind the database cache.
  return {
    title: `${owner}/${repo}`,
    description: `RepoGauge score for ${owner}/${repo} — docs, community, activity, popularity and hygiene, out of 100.`,
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
    result = await getOrComputeScore(slug);
  } catch (error) {
    if (isRepoGaugeError(error)) {
      return (
        <RepoError
          code={error.code}
          retryAfterSeconds={error.retryAfterSeconds}
        />
      );
    }
    throw error;
  }

  return <Result result={result} />;
}

function Result({ result }: { result: ScoredRepo }) {
  const { repo, score } = result;
  const githubUrl = `https://github.com/${repo.owner}/${repo.name}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <header className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <a
            href={githubUrl}
            rel="noopener noreferrer nofollow"
            className="block truncate font-mono text-2xl font-medium tracking-tight underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-accent"
          >
            {repo.owner}/{repo.name}
          </a>
          <p className="mt-2 text-sm text-muted tabular-nums">
            {formatCount(repo.stars)} stars · scored{" "}
            <time dateTime={result.fetchedAt}>
              {formatScoredAt(result.fetchedAt)}
            </time>
          </p>
        </div>

        <div className="shrink-0 self-center">
          <ScoreDial total={score.total} grade={score.grade} />
        </div>
      </header>

      <div className="mt-14 space-y-14">
        <CategoryBreakdown categories={score.categories} />
        <TipList tips={score.tips} />

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
