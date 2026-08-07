import { GITHUB_TOKEN, SITE_URL } from "@/lib/config";

import { GitHubError } from "./errors";

/**
 * The only code in the repository that calls api.github.com.
 *
 * The base URL is a hardcoded constant and every caller passes an already
 * validated path — that pair is what closes the SSRF shape described in
 * SPEC §9. There is no overload that takes a full URL, on purpose.
 */

const API_BASE = "https://api.github.com";

/** SPEC §8: one slow call must not consume the function's whole budget. */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * GitHub asks that clients identify themselves, and uses this to reach the
 * operator when a client misbehaves (SPEC §11.1). Requests without a
 * `User-Agent` are refused outright, so this is not decoration.
 *
 * It points at the deployed site rather than at the source repository, and
 * takes that address from `NEXT_PUBLIC_SITE_URL` — the same value the embed
 * snippets and the share card already use. A second variable holding "the site
 * URL, but for GitHub" would only ever be the first one with a typo, and the
 * previous hardcoded repository URL had already gone dead: the repository is
 * private, so the contact point GitHub was told to use returned a 404.
 *
 * Unset in development, `SITE_URL` falls back to localhost. Harmless — GitHub
 * only reads this when it wants to reach someone about production traffic.
 */
const USER_AGENT = `RepoGauge (+${SITE_URL})`;

/**
 * GETs a path under api.github.com and parses the JSON body.
 *
 * @param path Absolute API path beginning with "/". Any interpolated segment
 *   must already have been validated by `lib/repo-slug.ts`.
 * @throws {GitHubError} Always — callers never see a raw fetch rejection.
 */
export async function githubGet<T>(path: string): Promise<T> {
  const response = await requestOrThrow(path);

  if (!response.ok) {
    throw errorForResponse(response, path);
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new GitHubError(
      "UNAVAILABLE",
      `GitHub returned an unparseable body for ${path}`,
      { status: response.status, cause },
    );
  }
}

async function requestOrThrow(path: string): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // The rubric is only as good as its freshness; Next's fetch cache would
      // hide staleness from the layer whose whole job is deciding it.
      cache: "no-store",
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new GitHubError(
      "UNAVAILABLE",
      timedOut
        ? `GitHub did not respond within ${REQUEST_TIMEOUT_MS}ms for ${path}`
        : `Could not reach GitHub for ${path}`,
      { cause },
    );
  }
}

function errorForResponse(response: Response, path: string): GitHubError {
  if (response.status === 404) {
    return new GitHubError("NOT_FOUND", `GitHub has no ${path}`, {
      status: 404,
    });
  }

  if (isRateLimited(response)) {
    return new GitHubError("RATE_LIMITED", "GitHub rate limit exhausted", {
      status: response.status,
      rateLimitResetAt: numericHeader(response, "x-ratelimit-reset"),
    });
  }

  return new GitHubError(
    "UNAVAILABLE",
    `GitHub returned ${response.status} for ${path}`,
    { status: response.status },
  );
}

/**
 * A spent budget arrives as a 403 (primary limit) or 429 (secondary limit).
 * The remaining-count header is what separates it from a genuine 403.
 */
function isRateLimited(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  return numericHeader(response, "x-ratelimit-remaining") === 0;
}

function numericHeader(response: Response, name: string): number | undefined {
  const raw = response.headers.get(name);
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
