import { GitCheckupError } from "@/lib/errors";

/**
 * Parses and validates `owner/repo` out of every input form the product
 * accepts (SPEC §7 Flow A step 2). Pure — no network, no environment.
 *
 * The character rules are GitHub's own (SPEC §8): anything that cannot name a
 * real repository is rejected here, before a query or a fetch runs. That makes
 * this the outer edge of the SSRF boundary described in §9 — the only
 * user-controlled input that ever reaches api.github.com is a pair of strings
 * that matched these expressions.
 */

export interface RepoSlug {
  owner: string;
  name: string;
}

/** Owner: ≤39 chars, alphanumeric, single internal hyphens only. */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Repo: ≤100 chars of alphanumerics, dot, underscore, hyphen. */
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

const SSH_FORM = /^git@github\.com:(?<owner>[^/]+)\/(?<name>.+)$/;

/** `.` and `..` match REPO_PATTERN but are path traversal, not repo names. */
const RESERVED_NAMES = new Set([".", ".."]);

/**
 * Returns the slug, or null if the input is not a GitHub repo reference.
 * Never throws — callers that want an error use {@link assertRepoSlug}.
 */
export function parseRepoSlug(input: string): RepoSlug | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const pair = extractPair(trimmed);
  if (pair === null) return null;

  const owner = pair.owner;
  const name = stripGitSuffix(pair.name);

  if (!OWNER_PATTERN.test(owner)) return null;
  if (!REPO_PATTERN.test(name)) return null;
  if (RESERVED_NAMES.has(name)) return null;

  return { owner, name };
}

/** Throws `GitCheckupError('INVALID_SLUG')` rather than returning null. */
export function assertRepoSlug(input: string): RepoSlug {
  const slug = parseRepoSlug(input);
  if (slug === null) throw new GitCheckupError("INVALID_SLUG");
  return slug;
}

/** The canonical cache key. GitHub slugs are case-insensitive (SPEC §8). */
export function slugKey(slug: RepoSlug): string {
  return `${slug.owner.toLowerCase()}/${slug.name.toLowerCase()}`;
}

export function slugPath(slug: RepoSlug): string {
  return `/r/${slug.owner}/${slug.name}`;
}

/**
 * Pulls the two path segments out of any accepted form, without validating
 * their contents. Validation is the caller's next step.
 */
function extractPair(input: string): { owner: string; name: string } | null {
  const ssh = SSH_FORM.exec(input);
  if (ssh?.groups) {
    return { owner: ssh.groups.owner ?? "", name: ssh.groups.name ?? "" };
  }

  if (looksLikeUrl(input)) {
    return fromUrl(input);
  }

  const segments = input.split("/");
  if (segments.length !== 2) return null;
  return { owner: segments[0] ?? "", name: segments[1] ?? "" };
}

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input) || /^(www\.)?github\.com\//i.test(input);
}

function fromUrl(input: string): { owner: string; name: string } | null {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

  // `/owner/repo`, `/owner/repo/`, `/owner/repo/tree/main/src` all resolve to
  // the same repo — take the first two segments and ignore the rest.
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length < 2) return null;

  return { owner: segments[0] ?? "", name: segments[1] ?? "" };
}

function stripGitSuffix(name: string): string {
  return name.endsWith(".git") ? name.slice(0, -".git".length) : name;
}
