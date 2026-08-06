import type { RepoSignals } from "@/lib/github/types";

import { toGrade } from "./grade";
import type { Check, CategoryScore, RubricResult } from "./types";

/**
 * The rubric (SPEC §5). Fixed weights, 100 points total.
 *
 * Pure by construction: no clock, no network, no database. `now` is a
 * parameter rather than a `new Date()` call inside, because "days since the
 * last push" is otherwise untestable and a score would silently differ between
 * the API response and the share card rendered a second later.
 */

const CATEGORY_TOTALS = {
  docs: 25,
  community: 20,
  activity: 20,
  popularity: 15,
  hygiene: 20,
} as const;

export function score(
  signals: RepoSignals,
  now: Date = new Date(),
): RubricResult {
  const categories: CategoryScore[] = [
    scoreDocs(signals),
    scoreCommunity(signals),
    scoreActivity(signals, now),
    scorePopularity(signals),
    scoreHygiene(signals),
  ];

  const total = categories.reduce((sum, category) => sum + category.earned, 0);

  return { total, grade: toGrade(total), categories };
}

/* -------------------------------------------------------------------------
 * Docs — 25 pts
 * ---------------------------------------------------------------------- */

function scoreDocs(signals: RepoSignals): CategoryScore {
  const bytes = signals.readmeBytes ?? 0;

  return category("docs", "Docs", [
    check(
      "has-readme",
      "README present",
      signals.readmeBytes !== null ? 6 : 0,
      6,
    ),
    check(
      "readme-depth",
      "README has real depth",
      atLeast(bytes, [
        [4000, 8],
        [1500, 6],
        [300, 3],
      ]),
      8,
    ),
    check(
      "has-description",
      "Repository description set",
      signals.description !== null ? 5 : 0,
      5,
    ),
    check(
      "has-topics",
      "Topics tagged",
      atLeast(signals.topics.length, [
        [3, 4],
        [1, 2],
      ]),
      4,
    ),
    check(
      "has-homepage",
      "Homepage or docs link",
      signals.homepage !== null ? 2 : 0,
      2,
    ),
  ]);
}

/* -------------------------------------------------------------------------
 * Community — 20 pts
 * ---------------------------------------------------------------------- */

function scoreCommunity(signals: RepoSignals): CategoryScore {
  return category("community", "Community", [
    check("has-license", "LICENSE file present", signals.hasLicense ? 8 : 0, 8),
    check(
      "has-contributing",
      "Contributing guide",
      signals.hasContributing ? 4 : 0,
      4,
    ),
    check(
      "has-code-of-conduct",
      "Code of conduct",
      signals.hasCodeOfConduct ? 3 : 0,
      3,
    ),
    check(
      "has-security-policy",
      "Security policy",
      signals.hasSecurityPolicy ? 3 : 0,
      3,
    ),
    check(
      "has-templates",
      "Issue or PR templates",
      signals.hasIssueOrPrTemplate ? 2 : 0,
      2,
    ),
  ]);
}

/* -------------------------------------------------------------------------
 * Activity — 20 pts
 * ---------------------------------------------------------------------- */

function scoreActivity(signals: RepoSignals, now: Date): CategoryScore {
  return category("activity", "Activity", [
    check(
      "recent-push",
      "Pushed recently",
      atMost(daysSince(signals.pushedAt, now), [
        [30, 10],
        [90, 7],
        [180, 4],
        [365, 2],
      ]),
      10,
    ),
    check(
      "commit-cadence",
      "Commit cadence over 90 days",
      atLeast(signals.commitsLast90Days, [
        [20, 6],
        [5, 4],
        [1, 2],
      ]),
      6,
    ),
    check(
      "issue-backlog",
      "Issue backlog in proportion",
      scoreIssueBacklog(signals),
      4,
    ),
  ]);
}

/**
 * Below 50 stars the open-issues-to-stars ratio is noise — one filed issue on
 * a 3-star repo would read as a crisis — so it scores full marks instead.
 */
function scoreIssueBacklog(signals: RepoSignals): number {
  if (signals.stars < 50) return 4;

  const ratio = signals.openIssues / signals.stars;
  if (ratio <= 0.05) return 4;
  if (ratio <= 0.15) return 3;
  if (ratio <= 0.3) return 2;
  return 1;
}

/* -------------------------------------------------------------------------
 * Popularity — 15 pts, log-scaled so a 40-star repo isn't crushed
 * ---------------------------------------------------------------------- */

function scorePopularity(signals: RepoSignals): CategoryScore {
  return category("popularity", "Popularity", [
    check("star-count", "Stars", logPoints(signals.stars, 2.2, 11), 11),
    check("fork-count", "Forks", logPoints(signals.forks, 1.6, 4), 4),
  ]);
}

/** 10★ → 2 · 100★ → 4 · 1k★ → 7 · 10k★ → 9 · 100k★ → 11. */
function logPoints(count: number, factor: number, cap: number): number {
  const safe = Math.max(0, count);
  return Math.min(cap, Math.round(Math.log10(safe + 1) * factor));
}

/* -------------------------------------------------------------------------
 * Hygiene — 20 pts
 * ---------------------------------------------------------------------- */

function scoreHygiene(signals: RepoSignals): CategoryScore {
  return category("hygiene", "Hygiene", [
    check(
      "has-ci",
      "CI workflows configured",
      signals.hasCiWorkflows ? 8 : 0,
      8,
    ),
    check("not-archived", "Not archived", signals.isArchived ? 0 : 4, 4),
    check("is-original", "Original, not a fork", signals.isFork ? 0 : 3, 3),
    check(
      "issues-enabled",
      "Issues enabled",
      signals.hasIssuesEnabled ? 3 : 0,
      3,
    ),
    check(
      "language-detected",
      "Language detected",
      signals.primaryLanguage !== null ? 2 : 0,
      2,
    ),
  ]);
}

/* -------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------- */

function category(
  key: CategoryScore["key"],
  label: string,
  checks: Check[],
): CategoryScore {
  const earned = checks.reduce((sum, item) => sum + item.earned, 0);
  const available = CATEGORY_TOTALS[key];

  return { key, label, earned, available, checks };
}

function check(
  id: string,
  label: string,
  earned: number,
  available: number,
): Check {
  return { id, label, earned, available };
}

/** Descending tiers: the first threshold the value reaches wins. */
function atLeast(
  value: number,
  tiers: ReadonlyArray<readonly [number, number]>,
): number {
  for (const [threshold, points] of tiers) {
    if (value >= threshold) return points;
  }
  return 0;
}

/** Ascending tiers: the first ceiling the value fits under wins. */
function atMost(
  value: number,
  tiers: ReadonlyArray<readonly [number, number]>,
): number {
  for (const [ceiling, points] of tiers) {
    if (value <= ceiling) return points;
  }
  return 0;
}

/**
 * An unparseable timestamp scores as ancient rather than throwing — a bad date
 * from upstream should cost points, not take down the page.
 */
function daysSince(isoTimestamp: string, now: Date): number {
  const then = Date.parse(isoTimestamp);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;

  return (now.getTime() - then) / (24 * 60 * 60 * 1000);
}
