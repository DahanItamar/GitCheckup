import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScoreSparkline, type SparkPoint } from "./ScoreSparkline";

/**
 * The sparkline's judgement calls, rendered to static markup.
 *
 * Two of them decide whether the chart tells the truth: it refuses to draw a
 * trend from one observation, and it never lets a small change fill the plot.
 * The rest of the component is geometry.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-08-07T00:00:00Z").getTime();

function series(...totals: number[]): SparkPoint[] {
  return totals.map((total, i) => ({ total, at: new Date(T0 + i * DAY) }));
}

function render(points: SparkPoint[]): string {
  return renderToStaticMarkup(
    <ScoreSparkline points={points} grade="B" windowDays={180} />,
  );
}

/** The y of every vertex on the line, top-down in SVG coordinates. */
function lineYs(markup: string): number[] {
  const points = /<polyline points="([^"]+)"/.exec(markup)?.[1] ?? "";
  return points
    .split(" ")
    .filter(Boolean)
    .map((pair) => Number(pair.split(",")[1]));
}

describe("when it declines to draw", () => {
  it("renders nothing for a repo scored once", () => {
    // A single observation is a dot. Drawing a flat line through it would
    // imply the score had been measured all along.
    expect(render(series(70))).toBe("");
  });

  it("renders nothing with no history at all", () => {
    expect(render([])).toBe("");
  });

  it("draws as soon as there are two points", () => {
    expect(render(series(70, 75))).toContain("<polyline");
  });
});

describe("scaling", () => {
  it("does not let a small change fill the plot", () => {
    // 70 → 71 auto-scaled to the data would span the full height and read as
    // a collapse. The floor keeps a one-point move looking like one point.
    const [top, bottom] = lineYs(render(series(70, 71)));
    const height = Math.abs(top! - bottom!);

    expect(height).toBeLessThan(6);
  });

  it("still shows a large change as large", () => {
    const [top, bottom] = lineYs(render(series(30, 90)));

    expect(Math.abs(top! - bottom!)).toBeGreaterThan(25);
  });

  it("puts a higher score higher on the page", () => {
    const ys = lineYs(render(series(40, 80)));

    // SVG y grows downward, so the better score must have the smaller y.
    expect(ys[1]!).toBeLessThan(ys[0]!);
  });

  it("keeps every point inside the box", () => {
    for (const y of lineYs(render(series(0, 100, 50, 14)))) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(40);
    }
  });

  it("survives a flat series without dividing by zero", () => {
    const ys = lineYs(render(series(70, 70, 70)));

    expect(ys.every(Number.isFinite)).toBe(true);
    expect(new Set(ys).size).toBe(1);
  });
});

describe("what it says in words", () => {
  it("labels both endpoints visibly, and nothing in between", () => {
    const markup = render(series(61, 68, 74));
    const caption = /<figcaption[^>]*>(.*?)<\/figcaption>/s.exec(markup)?.[1];

    expect(caption).toContain(">61<");
    expect(caption).toContain(">74<");
    // A number on every point is chaos and goes unread. 68 is still reachable
    // — the hover title and the sr-only table both carry it — but it is not
    // printed on the chart, which is why this looks at the caption alone.
    expect(caption).not.toContain(">68<");
  });

  it("counts changes rather than observations", () => {
    expect(render(series(61, 68, 74))).toContain("2 changes");
    expect(render(series(61, 68))).toContain("1 change");
  });

  it("carries the series as a table for screen readers", () => {
    const markup = render(series(61, 74));

    expect(markup).toContain("sr-only");
    expect(markup).toContain("Score history");
  });

  it("describes itself for assistive tech", () => {
    expect(render(series(61, 74))).toContain('aria-label="Score over the last');
  });
});
