import type { Grade } from "@/lib/score/types";

import { gradeChip, gradeColor, gradeTint } from "./grade-color";

const SIZE = 208;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The scale starts at 14, not 0 (SPEC §8) — a repo that merely exists collects
 * points for not being archived and having issues enabled. A dial drawn from 0
 * would show every repository as further along than it is, so the arc is drawn
 * over the range the score can actually occupy.
 */
const FLOOR = 14;

interface ScoreDialProps {
  total: number;
  grade: Grade;
}

export function ScoreDial({ total, grade }: ScoreDialProps) {
  const clamped = Math.max(0, Math.min(100, total));
  const swept = Math.max(0, (clamped - FLOOR) / (100 - FLOOR));
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
          fill={gradeTint(grade, 7)}
          stroke="var(--track)"
          strokeWidth={STROKE}
        />
        <circle
          className="animate-dial-draw"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={
            {
              "--dial-circumference": `${CIRCUMFERENCE}`,
              "--dial-offset": `${CIRCUMFERENCE * (1 - swept)}`,
              strokeDashoffset: CIRCUMFERENCE * (1 - swept),
            } as React.CSSProperties
          }
        />
      </svg>

      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-[3.75rem] leading-none font-semibold tracking-tight tabular-nums">
          {clamped}
        </span>
        <span
          className="mt-2 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-[0.18em] uppercase"
          style={{ color, backgroundColor: gradeChip(grade) }}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}
