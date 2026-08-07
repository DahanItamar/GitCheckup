import Link from "next/link";

import type { Grade } from "@/lib/score/types";

import { gradeColor } from "./grade-color";

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
            className="flex items-center gap-4 py-3.5 transition-colors duration-150 hover:bg-surface"
          >
            <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-faint">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              <span className="text-muted">{repo.owner}/</span>
              {repo.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-faint">
              {formatStars(repo.stars)}
            </span>
            <span
              className="w-10 shrink-0 text-right text-sm font-medium tabular-nums"
              style={{ color: gradeColor(repo.grade) }}
            >
              {repo.total}
            </span>
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
            className="inline-block rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-xs text-muted transition-colors duration-150 hover:border-border-strong hover:text-ink"
          >
            {repo.owner}/{repo.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatStars(stars: number): string {
  if (stars >= 1000) return `${Math.round(stars / 100) / 10}k★`;
  return `${stars}★`;
}
