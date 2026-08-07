"use client";

import { useActionState } from "react";

import { Spinner } from "@/components/icons";

import { rescore, type RescoreState } from "./actions";

/**
 * Sits beside "scored N hours ago", because that line is the claim this
 * control exists to change.
 *
 * The failure message renders inline rather than replacing the page: a
 * rescore that hits the rate limit has not invalidated the score already on
 * screen, and throwing away a perfectly good result to report that the
 * refresh failed would be a worse answer than the one being refreshed.
 */

const INITIAL: RescoreState = { error: null };

export function RescoreButton({
  owner,
  name,
}: {
  owner: string;
  name: string;
}) {
  const [state, action, isPending] = useActionState(rescore, INITIAL);

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="repo" value={`${owner}/${name}`} />

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 py-1 text-xs text-muted transition-colors duration-150 hover:text-ink disabled:cursor-wait disabled:opacity-60"
      >
        {isPending && <Spinner className="size-3" />}
        <span className="underline decoration-border-strong underline-offset-4">
          {isPending ? "Rescoring…" : "Rescore now"}
        </span>
      </button>

      {state.error !== null && (
        <p
          role="alert"
          className="mt-1.5 text-xs"
          style={{ color: "var(--grade-d)" }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
