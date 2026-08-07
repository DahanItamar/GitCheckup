import type { RepoSignals } from "@/lib/github/types";

/**
 * Signal fixtures shared by the rubric tests.
 *
 * `PERFECT` is the only literal; every other fixture is an override of it, so
 * adding a field to `RepoSignals` breaks in exactly one place.
 */

export const FIXED_NOW = new Date("2026-08-07T00:00:00.000Z");

/** Every check at full marks. Scores 100.  */
export const PERFECT: RepoSignals = {
  owner: "acme",
  name: "widget",
  githubId: 1,
  description: "A widget.",
  homepage: "https://widget.example",
  topics: ["widgets", "tools", "cli"],
  stars: 100_000,
  forks: 20_000,
  openIssues: 1_000,
  pushedAt: "2026-08-06T00:00:00.000Z",
  isArchived: false,
  isFork: false,
  hasIssuesEnabled: true,
  primaryLanguage: "TypeScript",
  defaultBranch: "main",
  readmeBytes: 12_000,
  hasLicense: true,
  hasContributing: true,
  hasCodeOfConduct: true,
  hasSecurityPolicy: true,
  hasIssueOrPrTemplate: true,
  hasCiWorkflows: true,
  commitsLast90Days: 100,
};

/**
 * A repository with no commits at all. `pushedAt` is null — there is no push
 * to judge, so recency scores zero rather than crediting the creation date.
 */
export const EMPTY: RepoSignals = {
  ...PERFECT,
  description: null,
  homepage: null,
  topics: [],
  stars: 0,
  forks: 0,
  openIssues: 0,
  pushedAt: null,
  primaryLanguage: null,
  readmeBytes: null,
  hasLicense: false,
  hasContributing: false,
  hasCodeOfConduct: false,
  hasSecurityPolicy: false,
  hasIssueOrPrTemplate: false,
  hasCiWorkflows: false,
  commitsLast90Days: 0,
};

/** Well-documented, well-loved, and finished with. */
export const ARCHIVED: RepoSignals = {
  ...PERFECT,
  stars: 8_000,
  forks: 900,
  openIssues: 400,
  pushedAt: "2023-01-01T00:00:00.000Z",
  isArchived: true,
  commitsLast90Days: 0,
};

export function signalsWith(overrides: Partial<RepoSignals>): RepoSignals {
  return { ...PERFECT, ...overrides };
}

/** Days before FIXED_NOW, as the ISO timestamp GitHub would have returned. */
export function daysAgo(days: number): string {
  return new Date(
    FIXED_NOW.getTime() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
}
