"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { parseRepoSlug, slugPath } from "@/lib/repo-slug";

import { ArrowRightIcon, Spinner } from "./icons";

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

  const INVALID = "Enter a GitHub repo — owner/repo, or a github.com URL.";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const slug = parseRepoSlug(value);
    if (slug === null) {
      setError(INVALID);
      return;
    }

    setError(null);
    startNavigation(() => {
      router.push(slugPath(slug));
    });
  }

  /**
   * Answer while the field still has the user's attention, rather than making
   * them press the button to find out. An empty field is not a complaint —
   * leaving a box you never filled in is not an error, and saying so would
   * scold anyone who clicks past the input on their way to the page.
   */
  function onBlur() {
    if (value.trim() === "") return;
    if (parseRepoSlug(value) === null) setError(INVALID);
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
              // Clear on the first keystroke: the complaint is about what was
              // there, and leaving it up while they fix it reads as nagging.
              if (error !== null) setError(null);
            }}
            onBlur={onBlur}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="owner/repo"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : "repo-error"}
            className="min-h-12 w-full rounded-xl border border-border-strong bg-surface px-4 py-3 font-mono text-sm text-ink shadow-rest transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus-visible:border-accent focus-visible:shadow-lift"
          />
        </div>

        <button
          type="submit"
          disabled={isNavigating}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-canvas shadow-rest transition-[opacity,box-shadow] duration-150 hover:opacity-90 hover:shadow-lift disabled:cursor-wait disabled:opacity-60"
        >
          {isNavigating ? (
            <>
              <Spinner />
              Scoring…
            </>
          ) : (
            <>
              Score it
              <ArrowRightIcon className="size-3.5" />
            </>
          )}
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
