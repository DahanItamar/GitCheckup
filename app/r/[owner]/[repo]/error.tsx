"use client";

import { RepoError } from "@/components/RepoError";

/**
 * The boundary for the unexpected only. Every failure the product anticipates
 * is caught in `page.tsx` and rendered with its own copy — Next replaces a
 * server error's message with a generic string in production, so this
 * component cannot rely on `error.message` to say anything useful.
 */
export default function ResultError({ reset }: { reset: () => void }) {
  return (
    <RepoError
      code="UPSTREAM_UNAVAILABLE"
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity duration-150 hover:opacity-90"
        >
          Try again
        </button>
      }
    />
  );
}
