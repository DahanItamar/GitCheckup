/**
 * Typed failures from the GitHub layer. `lib/services/` is what translates
 * these into the `GitCheckupError` codes that routes and pages understand —
 * nothing above this layer sees an HTTP status or a GitHub response body.
 */

export type GitHubErrorCode =
  /** The repo does not exist, or is private, or the resource is absent. */
  | "NOT_FOUND"
  /** Our 5000/hr budget is spent. Distinct from NOT_FOUND: retry later works. */
  | "RATE_LIMITED"
  /**
   * GitHub rejected our credential — expired, revoked, or mistyped.
   *
   * Separate from UNAVAILABLE because it is the one failure here that is not
   * GitHub's: nothing is down, waiting does not help, and only the operator
   * can fix it. Folding it into UNAVAILABLE produced a site-wide "GitHub isn't
   * answering, this usually clears within an hour" that was wrong on both
   * counts and never cleared.
   */
  | "UNAUTHORIZED"
  /** Timed out, network failure, 5xx, or a body we could not parse. */
  | "UNAVAILABLE";

export interface GitHubErrorOptions {
  status?: number;
  /** Unix seconds at which the GitHub budget resets, when it told us. */
  rateLimitResetAt?: number;
  cause?: unknown;
}

export class GitHubError extends Error {
  readonly code: GitHubErrorCode;
  readonly status: number | undefined;
  readonly rateLimitResetAt: number | undefined;

  constructor(
    code: GitHubErrorCode,
    message: string,
    options: GitHubErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GitHubError";
    this.code = code;
    this.status = options.status;
    this.rateLimitResetAt = options.rateLimitResetAt;
  }
}

export function isGitHubError(value: unknown): value is GitHubError {
  return value instanceof GitHubError;
}
