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

/**
 * The same colour mixed toward the canvas — a wash for a panel or a shape,
 * never a ground for text in the same grade colour. Use `gradeChip` for that.
 *
 * Mixed toward the canvas rather than toward transparency so it stays opaque
 * over whatever it lands on, and so one call works in both schemes.
 */
export function gradeTint(grade: Grade, percent: number): string {
  return `color-mix(in oklab, var(${GRADE_VARIABLE[grade]}) ${percent}%, var(--canvas))`;
}

/**
 * The strongest tint that still clears WCAG AA (4.5:1) for grade-coloured text
 * sitting on it, in **both** colour schemes.
 *
 * Measured, not guessed. Two cases bind it from opposite directions: in light
 * mode amber (`--grade-c`, the lowest-contrast grade on a pale ground) drops
 * below 4.5 past 8%, and in dark mode red (`--grade-f`) drops below it past
 * 6% — mixing a bright colour into a near-black canvas lifts the background
 * fast. 6% clears both at 4.59 and 4.57. Raising it silently fails one scheme
 * or the other, which is why the number is not a parameter.
 */
export function gradeChip(grade: Grade): string {
  return gradeTint(grade, 6);
}

/**
 * A ratio, 0–1, on the same five-colour scale the grades use.
 *
 * The category bars used a single accent colour, so a category that earned
 * nothing rendered the same green as one that earned everything — colour was
 * decoration on the densest part of the page. The thresholds match the grade
 * bands in `lib/score/types.ts` so a category reading "amber" means the same
 * thing as a repo grading C.
 */
export function ratioColor(ratio: number): string {
  if (ratio >= 0.9) return "var(--grade-a)";
  if (ratio >= 0.7) return "var(--grade-b)";
  if (ratio >= 0.5) return "var(--grade-c)";
  if (ratio >= 0.3) return "var(--grade-d)";
  return "var(--grade-f)";
}
