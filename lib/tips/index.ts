import { TIPS_PROVIDER } from "@/lib/config";

import { RuleTipProvider } from "./rules";
import type { TipProvider } from "./types";

/**
 * Provider selection (SPEC §6). `TIPS_PROVIDER` validates to the literal
 * "rules" in v1, so this switch has one arm — it exists so that adding a
 * second one is a two-line change rather than a refactor.
 */

const PROVIDERS: Record<typeof TIPS_PROVIDER, () => TipProvider> = {
  rules: () => new RuleTipProvider(),
};

let cached: TipProvider | null = null;

export function getTipProvider(): TipProvider {
  cached ??= PROVIDERS[TIPS_PROVIDER]();
  return cached;
}

export { NOT_ACTIONABLE } from "./rules";
export { MAX_TIPS } from "./types";
export type { TipProvider } from "./types";
