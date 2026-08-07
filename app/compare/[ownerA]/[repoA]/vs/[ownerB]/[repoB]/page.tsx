import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { CompareBars } from "@/components/CompareBars";
import { CompareRadar } from "@/components/CompareRadar";
import { gradeChip, gradeColor } from "@/components/grade-color";
import { RepoError } from "@/components/RepoError";
import { clientIpFrom } from "@/lib/client-ip";
import { SITE_URL } from "@/lib/config";
import { isRepoGaugeError } from "@/lib/errors";
import { parseRepoSlug } from "@/lib/repo-slug";
import { compareRepos, type Comparison } from "@/lib/services/compare";
import type { ScoredRepo } from "@/lib/services/score-repo";

/**
 * Flow E: two repos side by side, at a shareable URL.
 *
 * `/compare/facebook/react/vs/vercel/next.js` — an explicit five-segment route
 * rather than a catch-all, so Next guarantees the shape and the page only has
 * to validate the two slugs, not the arity.
 */

interface RouteParams {
  params: Promise<{
    ownerA: string;
    repoA: string;
    ownerB: string;
    repoB: string;
  }>;
}

function pathOf(p: {
  ownerA: string;
  repoA: string;
  ownerB: string;
  repoB: string;
}) {
  return `/compare/${p.ownerA}/${p.repoA}/vs/${p.ownerB}/${p.repoB}`;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const p = await params;
  const title = `${p.ownerA}/${p.repoA} vs ${p.ownerB}/${p.repoB}`;
  const description = `RepoGauge compares ${title} across docs, community, activity, popularity and hygiene.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} · RepoGauge`,
      description,
      url: `${SITE_URL}${pathOf(p)}`,
      type: "website",
    },
  };
}

export default async function ComparePage({ params }: RouteParams) {
  const p = await params;

  // Client-side validation is UX; this is the control, exactly as on the
  // result page (SPEC §7 Flow A step 4).
  const a = parseRepoSlug(`${p.ownerA}/${p.repoA}`);
  const b = parseRepoSlug(`${p.ownerB}/${p.repoB}`);
  if (a === null || b === null) return <RepoError code="INVALID_SLUG" />;

  let comparison: Comparison;
  try {
    comparison = await compareRepos(a, b, {
      clientIp: clientIpFrom(await headers()),
    });
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

  return <Result comparison={comparison} />;
}

function Result({ comparison }: { comparison: Comparison }) {
  const { a, b } = comparison;

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <header className="animate-rise grid gap-4 sm:grid-cols-2">
        <Side result={a} color="var(--series-a)" />
        <Side result={b} color="var(--series-b)" />
      </header>

      <div className="mt-12 flex justify-center">
        <CompareRadar
          a={{ label: label(a), categories: a.score.categories }}
          b={{ label: label(b), categories: b.score.categories }}
        />
      </div>

      <div className="mt-14">
        <CompareBars
          a={{ label: label(a), categories: a.score.categories }}
          b={{ label: label(b), categories: b.score.categories }}
        />
      </div>

      <p className="mt-10 text-sm text-muted">
        Neither number is a verdict on quality — see the score pages for{" "}
        <Link href={`/r/${label(a)}`} className="underline underline-offset-4">
          {label(a)}
        </Link>{" "}
        and{" "}
        <Link href={`/r/${label(b)}`} className="underline underline-offset-4">
          {label(b)}
        </Link>
        , where each one lists what to fix.
      </p>
    </div>
  );
}

/** One repo's headline: name, total, grade — the numbers the radar drops. */
function Side({ result, color }: { result: ScoredRepo; color: string }) {
  const { repo, score } = result;

  return (
    <div
      className="rounded-2xl border border-border p-6 shadow-rest"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <p className="truncate font-mono text-sm">
        <span className="text-muted">{repo.owner}/</span>
        {repo.name}
      </p>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {score.total}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold tracking-[0.14em] uppercase"
          style={{
            color: gradeColor(score.grade),
            backgroundColor: gradeChip(score.grade),
          }}
        >
          {score.grade}
        </span>
      </p>
    </div>
  );
}

function label(result: ScoredRepo): string {
  return `${result.repo.owner}/${result.repo.name}`;
}
