import type { RepoSignals } from "@/lib/github/types";
import type { CategoryScore, Tip } from "@/lib/score/types";

/**
 * The seam that keeps an LLM out of the render path (SPEC §3).
 *
 * v1 ships exactly one implementation, `RuleTipProvider`. The interface is
 * async so that adding a `ClaudeTipProvider` later is a new file and an env
 * value, not a change to every caller.
 */
export interface TipProvider {
  generate(signals: RepoSignals, categories: CategoryScore[]): Promise<Tip[]>;
}

/** Tips shown on the result page. */
export const MAX_TIPS = 6;

/** Tips that fit in the 1200×630 share card (SPEC §6). */
export const OG_TIP_COUNT = 3;

export type { Tip };
