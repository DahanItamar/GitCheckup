import type { RepoSlug } from "@/lib/repo-slug";

import { githubGet } from "./client";
import { GitHubError } from "./errors";
import type {
  GitHubCommitsResponse,
  GitHubCommunityProfileResponse,
  GitHubContentEntry,
  GitHubReadmeResponse,
  GitHubRepoResponse,
  RepoSignals,
} from "./types";

/**
 * The six-call fan-out (SPEC §6).
 *
 * Only call #1 is fatal. Every other rejection degrades that signal to its
 * "absent" value and the score still returns — a partial score beats an error
 * page, and an empty repository legitimately 404s on four of these six.
 */

/** Asserted in a test so the budget cannot silently grow. */
export const GITHUB_CALL_BUDGET = 6;

const COMMIT_WINDOW_DAYS = 90;
const COMMIT_PAGE_SIZE = 100;

export async function fetchRepoSignals(
  slug: RepoSlug,
  now: Date = new Date(),
): Promise<RepoSignals> {
  const paths = buildSignalPaths(slug, now);

  const [repo, community, readme, root, dotGithub, commits] =
    await Promise.allSettled([
      githubGet<GitHubRepoResponse>(paths.repo),
      githubGet<GitHubCommunityProfileResponse>(paths.community),
      githubGet<GitHubReadmeResponse>(paths.readme),
      githubGet<GitHubContentEntry[]>(paths.rootContents),
      githubGet<GitHubContentEntry[]>(paths.dotGithubContents),
      githubGet<GitHubCommitsResponse>(paths.commits),
    ]);

  if (repo.status === "rejected") {
    throw asGitHubError(repo.reason, paths.repo);
  }

  const files = valueOf(community)?.files ?? null;
  const rootEntries = entriesOf(root);
  const dotGithubEntries = entriesOf(dotGithub);

  return {
    ...identity(repo.value),
    readmeBytes: valueOf(readme)?.size ?? null,
    hasLicense: files?.license != null,
    hasContributing: files?.contributing != null,
    hasCodeOfConduct: files?.code_of_conduct != null,
    hasSecurityPolicy:
      hasSecurityFile(rootEntries) || hasSecurityFile(dotGithubEntries),
    hasIssueOrPrTemplate:
      files?.issue_template != null ||
      files?.pull_request_template != null ||
      hasTemplateEntry(dotGithubEntries),
    hasCiWorkflows: hasWorkflowsDirectory(dotGithubEntries),
    commitsLast90Days: Math.min(
      valueOf(commits)?.length ?? 0,
      COMMIT_PAGE_SIZE,
    ),
  };
}

/**
 * Exported so a test can assert the call budget without a network. Segments
 * are already constrained to `[A-Za-z0-9._-]` by `lib/repo-slug.ts`; encoding
 * them again costs nothing and removes the need to trust that at a distance.
 */
export function buildSignalPaths(slug: RepoSlug, now: Date) {
  const base = `/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.name)}`;
  const since = new Date(
    now.getTime() - COMMIT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    repo: base,
    community: `${base}/community/profile`,
    readme: `${base}/readme`,
    rootContents: `${base}/contents/`,
    dotGithubContents: `${base}/contents/.github`,
    commits: `${base}/commits?per_page=${COMMIT_PAGE_SIZE}&since=${encodeURIComponent(since)}`,
  } as const;
}

/** The fields that come from call #1, normalized. */
function identity(repo: GitHubRepoResponse) {
  return {
    owner: repo.owner.login,
    name: repo.name,
    githubId: repo.id,
    description: emptyToNull(repo.description),
    homepage: emptyToNull(repo.homepage),
    topics: repo.topics ?? [],
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    // An empty repo has never been pushed to; its creation date is the honest
    // answer and keeps the recency check from dividing by nothing.
    pushedAt: repo.pushed_at ?? repo.created_at,
    isArchived: repo.archived,
    isFork: repo.fork,
    hasIssuesEnabled: repo.has_issues,
    primaryLanguage: emptyToNull(repo.language),
    defaultBranch: repo.default_branch,
  };
}

/**
 * GitHub serves SECURITY.md from the repository root or from `.github/`, and
 * accepts several extensions. `/community/profile` does not report it at all,
 * which is why two of the six calls are content listings.
 */
function hasSecurityFile(entries: GitHubContentEntry[]): boolean {
  return entries.some(
    (entry) =>
      entry.type === "file" && /^security(\.[a-z]+)?$/i.test(entry.name),
  );
}

/**
 * `/community/profile` reports `issue_template: null` when a repo uses the
 * directory form (`.github/ISSUE_TEMPLATE/`) rather than a single file —
 * vercel/next.js is one such repo. The `.github` listing is already in hand,
 * so covering that case costs no extra call.
 */
function hasTemplateEntry(entries: GitHubContentEntry[]): boolean {
  return entries.some((entry) =>
    /^(issue_template|pull_request_template)(\.[a-z]+)?$/i.test(entry.name),
  );
}

/**
 * Git cannot store an empty directory, so a `workflows` entry in the listing
 * implies at least one file inside it — no seventh call needed.
 */
function hasWorkflowsDirectory(entries: GitHubContentEntry[]): boolean {
  return entries.some(
    (entry) => entry.type === "dir" && entry.name === "workflows",
  );
}

function valueOf<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

/** A content path can also return a single object; only listings interest us. */
function entriesOf(
  result: PromiseSettledResult<GitHubContentEntry[]>,
): GitHubContentEntry[] {
  const value = valueOf(result);
  return Array.isArray(value) ? value : [];
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function asGitHubError(reason: unknown, path: string): GitHubError {
  if (reason instanceof GitHubError) return reason;
  return new GitHubError("UNAVAILABLE", `GitHub request failed for ${path}`, {
    cause: reason,
  });
}
