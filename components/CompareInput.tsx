"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { parseRepoSlug } from "@/lib/repo-slug";

import { ArrowRightIcon, Spinner } from "./icons";

/**
 * "Compare with…" on a result page.
 *
 * Deliberately one field, not two: you are already looking at one repository,
 * so asking for both would be asking you to retype what is on screen. The
 * page you came from is the left-hand side.
 */
export function CompareInput({ owner, name }: { owner: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();

  const INVALID = "Enter a GitHub repo — owner/repo, or a github.com URL.";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const other = parseRepoSlug(value);
    if (other === null) return setError(INVALID);

    if (
      other.owner.toLowerCase() === owner.toLowerCase() &&
      other.name.toLowerCase() === name.toLowerCase()
    ) {
      // Cheaper to say so here than to navigate to a page that only exists to
      // report it.
      return setError("That is the repository you are already looking at.");
    }

    setError(null);
    startNavigation(() => {
      router.push(`/compare/${owner}/${name}/vs/${other.owner}/${other.name}`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="compare-with" className="sr-only">
            Repository to compare with
          </label>
          <input
            id="compare-with"
            name="compare-with"
            type="text"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error !== null) setError(null);
            }}
            onBlur={() => {
              if (value.trim() === "") return;
              if (parseRepoSlug(value) === null) setError(INVALID);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="owner/repo"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : "compare-error"}
            className="min-h-12 w-full rounded-xl border border-border-strong bg-surface px-4 py-3 font-mono text-sm text-ink shadow-rest transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus-visible:border-accent focus-visible:shadow-lift"
          />
        </div>

        <button
          type="submit"
          disabled={isNavigating}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-border-strong px-5 text-sm font-medium shadow-rest transition-[opacity,box-shadow] duration-150 hover:shadow-lift disabled:cursor-wait disabled:opacity-60"
        >
          {isNavigating ? (
            <>
              <Spinner />
              Comparing…
            </>
          ) : (
            <>
              Compare
              <ArrowRightIcon className="size-3.5" />
            </>
          )}
        </button>
      </div>

      <p
        id="compare-error"
        role="alert"
        className="mt-2 min-h-5 text-sm"
        style={{ color: "var(--grade-f)" }}
      >
        {error}
      </p>
    </form>
  );
}
