/**
 * Everything the rubric is allowed to see (SPEC §5).
 *
 * Produced only by `lib/github/signals.ts`. No GitHub API shape leaks past this
 * file: every field below is already normalized, so the rubric never has to
 * know that GitHub returns `""` for an unset homepage or that an absent README
 * is a 404 rather than a null field.
 */
export interface RepoSignals {
  /** Canonical casing from the GitHub API, not from user input. */
  owner: string;
  name: string;
  githubId: number;

  /** null = no description set. A scored condition, not missing data. */
  description: string | null;
  /** null = unset. GitHub also returns "", which we normalize to null. */
  homepage: string | null;
  topics: string[];
  stars: number;
  forks: number;
  /** Includes open PRs — GitHub's own quirk, accepted (SPEC §8). */
  openIssues: number;
  /**
   * ISO 8601 UTC, or null when the repository has never been pushed to —
   * an empty repo with no commits. Distinct from "pushed a long time ago":
   * there is no push to judge, so the recency check scores it zero rather
   * than crediting the creation date.
   */
  pushedAt: string | null;
  isArchived: boolean;
  isFork: boolean;
  hasIssuesEnabled: boolean;
  /** null = GitHub detected no language (docs-only repos). */
  primaryLanguage: string | null;
  defaultBranch: string;

  /** null = no README found anywhere GitHub looks. */
  readmeBytes: number | null;
  hasLicense: boolean;
  hasContributing: boolean;
  hasCodeOfConduct: boolean;
  hasSecurityPolicy: boolean;
  hasIssueOrPrTemplate: boolean;
  /** `.github/workflows` exists. Git cannot store an empty directory, so its
   *  presence in a listing implies at least one file inside it. */
  hasCiWorkflows: boolean;

  /** Capped at 100 — we request a single page (SPEC §8). */
  commitsLast90Days: number;
}

/* -------------------------------------------------------------------------
 * Raw upstream shapes. Only the fields we read are declared; GitHub sends far
 * more and we deliberately ignore it.
 * ---------------------------------------------------------------------- */

export interface GitHubRepoResponse {
  id: number;
  name: string;
  owner: { login: string };
  description: string | null;
  homepage: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
  created_at: string;
  archived: boolean;
  fork: boolean;
  has_issues: boolean;
  language: string | null;
  default_branch: string;
}

/**
 * `/community/profile`. Each entry is an object when the file exists and null
 * when it does not. Note the endpoint reports no security policy — that is why
 * SPEC §6 spends two of the six calls on content listings.
 */
export interface GitHubCommunityProfileResponse {
  files: {
    code_of_conduct: unknown | null;
    contributing: unknown | null;
    issue_template: unknown | null;
    pull_request_template: unknown | null;
    license: unknown | null;
    readme: unknown | null;
  } | null;
}

export interface GitHubReadmeResponse {
  /** Bytes. The content itself is never fetched or decoded (SPEC §11.11). */
  size: number;
}

export interface GitHubContentEntry {
  name: string;
  type: "file" | "dir" | "symlink" | "submodule";
}

export type GitHubCommitsResponse = unknown[];
