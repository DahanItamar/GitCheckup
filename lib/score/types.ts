export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

export type CategoryKey =
  "docs" | "community" | "activity" | "popularity" | "hygiene";

/**
 * One rubric line item. Drives both the breakdown UI and tip generation —
 * `id` is the join key between a lost point and the advice about it, which is
 * why it is a stable slug rather than an index or a label.
 */
export interface Check {
  id: string;
  label: string;
  earned: number;
  available: number;
}

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  /** Sum of `checks`. */
  earned: number;
  /** Fixed per category: 25 / 20 / 20 / 15 / 20. */
  available: number;
  checks: Check[];
}

export interface Tip {
  /** The `Check.id` that produced it. */
  checkId: string;
  text: string;
  /** Points recoverable. The sort key, descending. */
  points: number;
}

export interface ScoreResult {
  /** 0–100, integer. */
  total: number;
  grade: Grade;
  /** Always all five, in fixed order. */
  categories: CategoryScore[];
  /** Only checks that lost points; sorted by points descending. */
  tips: Tip[];
}

/**
 * What the rubric alone produces. Tips are advice about a score rather than
 * part of computing one, and they come from a provider that may one day be
 * async (SPEC §6) — so the pure function stops here and `lib/services/`
 * assembles the two halves into a `ScoreResult`.
 */
export type RubricResult = Omit<ScoreResult, "tips">;
