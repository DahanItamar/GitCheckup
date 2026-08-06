/**
 * The one error type that crosses the service seam (SPEC §6).
 *
 * Route handlers map `code` to an HTTP status in exactly one place; `error.tsx`
 * maps it to user-facing copy. Nothing else catches. This module deliberately
 * imports nothing, so a client component can read the codes without dragging
 * the database client into the browser bundle.
 */

export type RepoGaugeErrorCode =
  "INVALID_SLUG" | "REPO_NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE";

/** Copy shown to the user. Carries no upstream detail and no stack. */
const USER_MESSAGE: Record<RepoGaugeErrorCode, string> = {
  INVALID_SLUG: "That doesn't look like a GitHub repository. Try owner/repo.",
  REPO_NOT_FOUND:
    "We couldn't find that repo. RepoGauge only reads public repositories.",
  RATE_LIMITED:
    "Too many new repos scored from your network. Try again in a few minutes.",
  UPSTREAM_UNAVAILABLE:
    "GitHub isn't answering right now. This usually clears within an hour.",
};

export interface RepoGaugeErrorOptions {
  /** Seconds until the caller may retry. Only meaningful for RATE_LIMITED. */
  retryAfterSeconds?: number;
  /** Kept for logs only — never serialized into a response. */
  cause?: unknown;
}

export class RepoGaugeError extends Error {
  readonly code: RepoGaugeErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: RepoGaugeErrorCode, options: RepoGaugeErrorOptions = {}) {
    super(USER_MESSAGE[code], { cause: options.cause });
    this.name = "RepoGaugeError";
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isRepoGaugeError(value: unknown): value is RepoGaugeError {
  return value instanceof Error && value.name === "RepoGaugeError";
}

/**
 * `error.tsx` receives a digest-stripped Error in production, so it cannot rely
 * on `instanceof`. Next preserves `message`, which is why the user-facing string
 * is the message rather than a separate field.
 */
export function userMessageFor(code: RepoGaugeErrorCode): string {
  return USER_MESSAGE[code];
}

export const HTTP_STATUS: Record<RepoGaugeErrorCode, number> = {
  INVALID_SLUG: 400,
  REPO_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
};
