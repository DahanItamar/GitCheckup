"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { clientIpFrom } from "@/lib/client-ip";
import { isRepoGaugeError, userMessageFor } from "@/lib/errors";
import { parseRepoSlug, slugPath } from "@/lib/repo-slug";
import { getOrComputeScore } from "@/lib/services/score-repo";

/**
 * "Rescore now" — the one way past the 6-hour TTL (SPEC §7 Flow A step 5).
 *
 * Without it, pushing a LICENSE and wanting to see the number move meant
 * waiting out the TTL with no way to ask. `forceRefresh` had been implemented
 * in the service since M2 and reachable from nothing.
 *
 * A POST, not a link. The result URL is the shareable artifact (Flow A step
 * 3), and a `?refresh=1` that anyone could paste into a chat would turn every
 * visit into a fresh six-call fan-out against a budget the visitor is not
 * paying for.
 *
 * It re-parses the slug rather than trusting the form field, for the same
 * reason `page.tsx` re-parses the route: client-side validation is UX, never a
 * control. And because it takes the cold path, `getOrComputeScore` charges it
 * against the caller's per-IP budget exactly like a first-time score — a
 * refresh button that skipped the rate limiter would be a free way to drain
 * the token quota.
 */

export interface RescoreState {
  /** User-facing copy, or null when the refresh succeeded. */
  error: string | null;
}

export async function rescore(
  _previous: RescoreState,
  formData: FormData,
): Promise<RescoreState> {
  const slug = parseRepoSlug(String(formData.get("repo") ?? ""));
  if (slug === null) return { error: userMessageFor("INVALID_SLUG") };

  try {
    await getOrComputeScore(slug, {
      forceRefresh: true,
      clientIp: clientIpFrom(await headers()),
    });
  } catch (error) {
    if (isRepoGaugeError(error)) return { error: userMessageFor(error.code) };

    // Same rule as the routes: the detail goes to the logs, never the screen.
    console.error("[rescore] unhandled failure", error);
    return { error: userMessageFor("UPSTREAM_UNAVAILABLE") };
  }

  revalidatePath(slugPath(slug));
  return { error: null };
}
