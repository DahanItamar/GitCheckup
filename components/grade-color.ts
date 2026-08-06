import type { Grade } from "@/lib/score/types";

/**
 * Grade → CSS custom property. Returning a `var()` rather than a literal is
 * what lets a single component render correctly in both colour schemes
 * without a `dark:` variant on every element.
 */
const GRADE_VARIABLE: Record<Grade, string> = {
  "A+": "--grade-a",
  A: "--grade-a",
  B: "--grade-b",
  C: "--grade-c",
  D: "--grade-d",
  F: "--grade-f",
};

export function gradeColor(grade: Grade): string {
  return `var(${GRADE_VARIABLE[grade]})`;
}
