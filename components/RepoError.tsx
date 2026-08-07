import Link from "next/link";

import { userMessageFor, type GitCheckupErrorCode } from "@/lib/errors";

/**
 * Typed error → user-facing copy (SPEC §7 Flow A failure branches).
 *
 * Rendered by the page itself for expected failures rather than only by
 * `error.tsx`: Next replaces a server-thrown error's message with a generic
 * string in production, so copy that depends on the message would be lost
 * exactly where it matters. `error.tsx` remains the boundary for the
 * unexpected.
 */
interface RepoErrorProps {
  code: GitCheckupErrorCode;
  retryAfterSeconds?: number | undefined;
  action?: React.ReactNode;
}

const HEADING: Record<GitCheckupErrorCode, string> = {
  INVALID_SLUG: "That isn't a repo",
  REPO_NOT_FOUND: "No such repo",
  RATE_LIMITED: "Slow down a moment",
  UPSTREAM_UNAVAILABLE: "GitHub isn't answering",
};

export function RepoError({ code, retryAfterSeconds, action }: RepoErrorProps) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{HEADING[code]}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {userMessageFor(code)}
      </p>

      {retryAfterSeconds !== undefined && (
        <p className="mt-2 text-sm text-faint">
          Try again in about {Math.ceil(retryAfterSeconds / 60)} minutes.
        </p>
      )}

      <div className="mt-8 flex items-center justify-center gap-4">
        {action}
        <Link
          href="/"
          className="text-sm text-muted underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:text-ink"
        >
          Score another repo
        </Link>
      </div>
    </div>
  );
}
