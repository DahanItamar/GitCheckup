import type { Grade } from "./types";

/** SPEC §5: A+ ≥90 · A 80–89 · B 70–79 · C 60–69 · D 50–59 · F <50. */
const THRESHOLDS: ReadonlyArray<readonly [number, Grade]> = [
  [90, "A+"],
  [80, "A"],
  [70, "B"],
  [60, "C"],
  [50, "D"],
];

export function toGrade(total: number): Grade {
  for (const [floor, grade] of THRESHOLDS) {
    if (total >= floor) return grade;
  }
  return "F";
}
