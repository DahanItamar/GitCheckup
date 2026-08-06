import type { Grade } from "@/lib/score/types";

import { gradeColor } from "./grade-color";

const SIZE = 200;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ScoreDialProps {
  total: number;
  grade: Grade;
}

export function ScoreDial({ total, grade }: ScoreDialProps) {
  const clamped = Math.max(0, Math.min(100, total));
  const color = gradeColor(grade);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Score ${clamped} out of 100, grade ${grade}`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--track)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>

      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-6xl font-semibold tabular-nums tracking-tight">
          {clamped}
        </span>
        <span
          className="mt-1 text-sm font-medium tracking-[0.18em] uppercase"
          style={{ color }}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}
