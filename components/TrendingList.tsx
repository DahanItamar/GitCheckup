import Link from "next/link";

import type { Grade } from "@/lib/score/types";

import { gradeChip, gradeColor } from "./grade-color";
import { ArrowRightIcon, StarIcon } from "./icons";
import { ScoreTrendLine } from "./ScoreSparkline";

/**
 * Declared here rather than imported from lib/db: components take props, and
 * a presentational list should not know the shape of a query result. The
 * service layer is what maps one to the other.
 */
export interface TrendingItem {
  owner: string;
  name: string;
  stars: number;
  total: number;
  grade: Grade;
  /** Score sequence, oldest first. Empty means no line is drawn. */
  trend?: number[];
}

/**
 * Renders only `owner/name` and a number. Repo descriptions are
 * attacker-controlled by anyone who can create a repository, and this is a
 * public surface someone could try to push content onto (SPEC §9).
 */
export function TrendingList({ repos }: { repos: TrendingItem[] }) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {repos.map((repo, index) => (
        <li key={`${repo.owner}/${repo.name}`}>
          <Link
            href={`/r/${repo.owner}/${repo.name}`}
            className="group flex items-center gap-4 px-2 py-3 transition-colors duration-150 hover:bg-surface"
          >
            <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-faint">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              <span className="text-muted">{repo.owner}/</span>
              {repo.name}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-faint">
              <StarIcon className="size-3" />
              {formatStars(repo.stars)}
            </span>
            {/* Shape only. The score column beside it carries the number, so
                the line answers "climbing or sliding?" and nothing else. */}
            <span className="hidden shrink-0 sm:block">
              <ScoreTrendLine totals={repo.trend ?? []} grade={repo.grade} />
            </span>
            {/* The score is the row's verdict, so it gets the only fill in it. */}
            <span
              className="w-11 shrink-0 rounded-md py-1 text-center text-sm font-semibold tabular-nums"
              style={{
                color: gradeColor(repo.grade),
                backgroundColor: gradeChip(repo.grade),
              }}
            >
              {repo.total}
            </span>
            <ArrowRightIcon className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Seed suggestions, shown when the leaderboard cannot fill itself. */
export function SuggestionChips({
  repos,
}: {
  repos: ReadonlyArray<{ owner: string; name: string }>;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {repos.map((repo) => (
        <li key={`${repo.owner}/${repo.name}`}>
          <Link
            href={`/r/${repo.owner}/${repo.name}`}
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 font-mono text-xs text-muted shadow-rest transition-[color,border-color,box-shadow] duration-150 hover:border-border-strong hover:text-ink hover:shadow-lift"
          >
            {repo.owner}/{repo.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The star glyph moved into `StarIcon`, so this returns the count alone. */
function formatStars(stars: number): string {
  if (stars >= 1000) return `${Math.round(stars / 100) / 10}k`;
  return `${stars}`;
}
