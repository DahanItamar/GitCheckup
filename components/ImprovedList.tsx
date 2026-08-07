import Link from "next/link";

import type { Grade } from "@/lib/score/types";

import { gradeChip, gradeColor } from "./grade-color";
import { ArrowRightIcon, StarIcon } from "./icons";

/**
 * The "most improved" board.
 *
 * Declared here rather than imported from lib/db for the same reason as
 * `TrendingList`: a presentational list should not know the shape of a query
 * result.
 */
export interface ImprovedItem {
  owner: string;
  name: string;
  stars: number;
  total: number;
  grade: Grade;
  from: number;
  delta: number;
}

/**
 * The gain is the subject, so it gets the emphasis the score gets on the
 * leaderboard: it is the leftmost number, in the accent, and the only one with
 * a sign. `54 → 71` sits beside it in muted text, because a reader who cares
 * about the jump immediately wants to know where it landed.
 *
 * Renders only `owner/name` and numbers. Repo descriptions are attacker-
 * controlled by anyone who can create a repository, and this is a public
 * surface someone could try to push content onto (SPEC §9).
 */
export function ImprovedList({ repos }: { repos: ImprovedItem[] }) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {repos.map((repo) => (
        <li key={`${repo.owner}/${repo.name}`}>
          <Link
            href={`/r/${repo.owner}/${repo.name}`}
            className="group flex items-center gap-4 px-2 py-3.5 transition-colors duration-150 hover:bg-surface"
          >
            <span
              className="w-12 shrink-0 rounded-md py-1 text-center text-sm font-semibold tabular-nums"
              style={{
                color: "var(--accent)",
                backgroundColor:
                  "color-mix(in oklab, var(--accent) 6%, var(--canvas))",
              }}
            >
              +{repo.delta}
            </span>

            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              <span className="text-muted">{repo.owner}/</span>
              {repo.name}
            </span>

            <span className="hidden shrink-0 text-xs tabular-nums text-faint sm:block">
              {repo.from} → {repo.total}
            </span>

            <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-faint">
              <StarIcon className="size-3" />
              {formatStars(repo.stars)}
            </span>

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

function formatStars(stars: number): string {
  if (stars >= 1000) return `${Math.round(stars / 100) / 10}k`;
  return `${stars}`;
}
