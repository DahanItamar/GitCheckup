import type { Grade } from "@/lib/score/types";

import { gradeColor } from "./grade-color";

/**
 * A repo's score over the retention window, under the dial.
 *
 * The dial is the hero figure and this is its trend — the stat-tile pattern,
 * not a chart in its own right. So: no axes, no gridlines, no legend (one
 * series needs none), and the only labels are the two endpoints, which are
 * what let a reader recover the real magnitude from a shape.
 *
 * Marks follow the house spec: a 2px round-capped line, an end marker at r=4
 * carrying a 2px ring in the surface colour so it stays legible where it meets
 * the line, and a 10%-opacity wash beneath rather than a saturated fill.
 *
 * It is a server component and stays one. A crosshair tooltip would mean
 * shipping JavaScript to every result page for a decoration; instead each
 * vertex carries a `<title>`, which browsers surface natively on hover, and
 * the full series is repeated as an `sr-only` table so the data is never
 * gated behind a pointer.
 */

export interface SparkPoint {
  total: number;
  at: Date;
}

interface ScoreSparklineProps {
  points: SparkPoint[];
  /** The current grade — the line takes its colour, tying it to the dial. */
  grade: Grade;
  windowDays: number;
}

const WIDTH = 208;
const HEIGHT = 40;
const PAD = 4;

/**
 * The plotted band never spans less than this many points.
 *
 * Auto-scaling to the data alone would render a one-point wobble as a cliff —
 * the honest-looking chart that misleads hardest. A floor keeps small changes
 * looking small, and the endpoint labels carry the exact numbers regardless.
 */
const MIN_SPAN = 12;

export function ScoreSparkline({
  points,
  grade,
  windowDays,
}: ScoreSparklineProps) {
  // One observation is a dot, not a trend. Saying so beats drawing a flat line
  // that implies the score has been measured all along.
  if (points.length < 2) return null;

  const color = gradeColor(grade);
  const { toX, toY } = scale(points);
  const line = points.map((p, i) => `${toX(i)},${toY(p.total)}`).join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;

  return (
    <figure className="mt-4">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Score over the last ${windowDays} days: ${first.total} to ${last.total}.`}
        className="overflow-visible"
      >
        <polygon
          points={`${toX(0)},${HEIGHT} ${line} ${toX(points.length - 1)},${HEIGHT}`}
          fill={color}
          opacity={0.1}
        />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={`${p.at.toISOString()}-${p.total}`}
            cx={toX(i)}
            cy={toY(p.total)}
            r={i === points.length - 1 ? 4 : 2.5}
            fill={i === points.length - 1 ? color : "var(--surface)"}
            stroke={i === points.length - 1 ? "var(--surface)" : color}
            strokeWidth={2}
          >
            <title>{`${p.total} on ${formatDay(p.at)}`}</title>
          </circle>
        ))}
      </svg>

      <figcaption className="mt-1.5 flex items-baseline justify-between text-xs text-faint tabular-nums">
        <span>{first.total}</span>
        <span className="text-muted">
          {points.length === 2 ? "1 change" : `${points.length - 1} changes`} in{" "}
          {windowDays} days
        </span>
        <span>{last.total}</span>
      </figcaption>

      <table className="sr-only">
        <caption>Score history</caption>
        <tbody>
          {points.map((p) => (
            <tr key={`${p.at.toISOString()}-row`}>
              <th scope="row">{formatDay(p.at)}</th>
              <td>{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * Maps index → x and score → y.
 *
 * Points are spaced evenly by index rather than by date. The series records
 * *changes*, and spacing by real time would squash a busy month into a few
 * pixels beside a quiet one — the shape a reader is looking for is the
 * sequence of moves, not their tempo. The caption states the window so the
 * axis being ordinal is never a surprise.
 */
function scale(points: SparkPoint[]) {
  const totals = points.map((p) => p.total);
  const low = Math.min(...totals);
  const high = Math.max(...totals);

  const pad = Math.max(0, (MIN_SPAN - (high - low)) / 2);
  const min = Math.max(0, low - pad);
  const max = Math.min(100, high + pad);
  const span = max - min || 1;

  const usable = HEIGHT - PAD * 2;
  const step = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;

  return {
    toX: (index: number) => round(PAD + index * step),
    toY: (total: number) =>
      round(PAD + usable - ((total - min) / span) * usable),
  };
}

/** Keeps the SVG path readable and the markup small. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
