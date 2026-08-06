"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { parseRepoSlug, slugPath } from "@/lib/repo-slug";

/**
 * The only client component with state (SPEC §4).
 *
 * Client-side parsing here is UX — it gives an answer without a round trip.
 * It is never a control: the result page re-parses and re-validates whatever
 * lands in its URL (SPEC §7 Flow A step 4).
 */
export function RepoInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const slug = parseRepoSlug(value);
    if (slug === null) {
      setError("Enter a GitHub repo — owner/repo, or a github.com URL.");
      return;
    }

    setError(null);
    startNavigation(() => {
      router.push(slugPath(slug));
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="repo" className="sr-only">
            GitHub repository
          </label>
          <input
            id="repo"
            name="repo"
            type="text"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error !== null) setError(null);
            }}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="facebook/react"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : "repo-error"}
            className="w-full rounded-lg border border-border-strong bg-surface px-4 py-3 font-mono text-sm text-ink outline-none transition-colors duration-150 placeholder:text-faint focus-visible:border-accent"
          />
        </div>

        <button
          type="submit"
          disabled={isNavigating}
          className="shrink-0 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-canvas transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {isNavigating ? "Scoring…" : "Score it"}
        </button>
      </div>

      <p
        id="repo-error"
        role="alert"
        className="mt-2 min-h-5 text-sm"
        style={{ color: "var(--grade-f)" }}
      >
        {error}
      </p>
    </form>
  );
}
