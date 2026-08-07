import type { CategoryScore } from "@/lib/score/types";

/**
 * Two repositories' category profiles, overlaid.
 *
 * Radar is the wrong form for one repository — five bars against a shared
 * baseline beat five radial axes every time, which is why the result page uses
 * bars. It earns its place *here*, where the job changes from magnitude to
 * profile: two repos can both score 71 for completely different reasons, and
 * the shape difference is exactly that fact. The paired bars underneath still
 * carry the magnitudes.
 *
 * **Every axis is normalised to its own maximum, and the chart says so.** The
 * categories are worth 25/20/20/15/20, so plotting raw points would silently
 * make Docs the widest axis on every chart ever drawn — a shape that describes
 * the rubric's weighting rather than the repositories.
 *
 * Colour is categorical and never the grade ramp: on a page about two repos,
 * green already means "scored well", and reusing it for identity would put two
 * meanings in one ink.
 */

export interface RadarSeries {
  label: string;
  categories: CategoryScore[];
}

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 82;
const RINGS = [0.25, 0.5, 0.75, 1];

export function CompareRadar({ a, b }: { a: RadarSeries; b: RadarSeries }) {
  // Both sides come from the same rubric, so the axes are the same five in the
  // same order. Reading them off `a` keeps the labels and the geometry from
  // ever disagreeing.
  const axes = a.categories.map((category) => category.label);

  return (
    <figure className="flex flex-col items-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Category profile of ${a.label} against ${b.label}, each axis as a percentage of the points available in that category.`}
        className="overflow-visible"
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={ringPoints(axes.length, ring)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {axes.map((label, i) => {
          const [x, y] = pointAt(i, axes.length, 1);
          return (
            <line
              key={label}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}

        <Shape series={b} color="var(--series-b)" />
        <Shape series={a} color="var(--series-a)" />

        {axes.map((label, i) => (
          <AxisLabel key={label} label={label} index={i} count={axes.length} />
        ))}
      </svg>

      {/* Two series, so a legend is not optional. */}
      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs">
        <Key color="var(--series-a)" label={a.label} />
        <Key color="var(--series-b)" label={b.label} />
        <span className="text-faint">each axis is % of that category</span>
      </figcaption>
    </figure>
  );
}

function Shape({ series, color }: { series: RadarSeries; color: string }) {
  const points = series.categories
    .map((category, i) => {
      const ratio =
        category.available === 0 ? 0 : category.earned / category.available;
      return pointAt(i, series.categories.length, ratio).join(",");
    })
    .join(" ");

  return (
    <g>
      <polygon points={points} fill={color} opacity={0.12} />
      <polygon
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {/* The swatch carries identity; the text stays in ink, never the series
          colour — a coloured label is a contrast problem and a legend at once. */}
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-muted">{label}</span>
    </span>
  );
}

/**
 * Axis labels sit outside the outer ring, anchored by which side they fall on
 * so a long word grows away from the chart instead of over it.
 */
function AxisLabel({
  label,
  index,
  count,
}: {
  label: string;
  index: number;
  count: number;
}) {
  const [x, y] = pointAt(index, count, 1.24);
  const dx = x - CENTER;

  return (
    <text
      x={x}
      y={y}
      textAnchor={Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end"}
      dominantBaseline="middle"
      fontSize={11}
      fill="var(--muted)"
    >
      {label}
    </text>
  );
}

/** Vertex `index` of `count`, at `ratio` of the radius. Starts at the top. */
function pointAt(
  index: number,
  count: number,
  ratio: number,
): [number, number] {
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  return [
    round(CENTER + Math.cos(angle) * RADIUS * ratio),
    round(CENTER + Math.sin(angle) * RADIUS * ratio),
  ];
}

function ringPoints(count: number, ratio: number): string {
  return Array.from({ length: count }, (_, i) =>
    pointAt(i, count, ratio).join(","),
  ).join(" ");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
