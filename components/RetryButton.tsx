"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Spinner } from "./icons";

/**
 * Re-runs the server render of the current route.
 *
 * `RATE_LIMITED` and `UPSTREAM_UNAVAILABLE` both describe a condition that
 * clears on its own — a budget that refills, a GitHub outage that ends. Until
 * now the only control on those screens was "Score another repo", which is not
 * what someone waiting on *this* repo wants. `error.tsx` has had a reset button
 * since M1; this is the same affordance for the failures `page.tsx` renders
 * itself (SPEC §7).
 *
 * `router.refresh()` rather than `location.reload()`: it re-runs the Server
 * Component and swaps the result in, so a retry that fails again does not cost
 * a full document load, and one that succeeds does not flash a white page.
 */
export function RetryButton() {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startRetry(() => router.refresh())}
      disabled={isRetrying}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-canvas shadow-rest transition-[opacity,box-shadow] duration-150 hover:opacity-90 hover:shadow-lift disabled:cursor-wait disabled:opacity-60"
    >
      {isRetrying && <Spinner />}
      {isRetrying ? "Trying…" : "Try again"}
    </button>
  );
}
