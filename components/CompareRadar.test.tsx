import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CategoryScore } from "@/lib/score/types";

import { CompareRadar } from "./CompareRadar";

/**
 * The radar's one load-bearing claim: every axis is a percentage of its own
 * category, not a share of the total. The categories are worth 25/20/20/15/20,
 * so a chart that plotted raw points would describe the rubric's weighting
 * rather than the two repositories on it.
 */

const CENTER = 130;
const RADIUS = 82;

function cats(
  spec: [key: CategoryScore["key"], earned: number, available: number][],
): CategoryScore[] {
  return spec.map(([key, earned, available]) => ({
    key,
    label: key,
    earned,
    available,
    checks: [],
  }));
}

/** The five real category weights. */
const WEIGHTS: [CategoryScore["key"], number][] = [
  ["docs", 25],
  ["community", 20],
  ["activity", 20],
  ["popularity", 15],
  ["hygiene", 20],
];

function full(fraction: number): CategoryScore[] {
  return cats(WEIGHTS.map(([key, max]) => [key, max * fraction, max]));
}

function render(a: CategoryScore[], b: CategoryScore[]): string {
  return renderToStaticMarkup(
    <CompareRadar
      a={{ label: "acme/one", categories: a }}
      b={{ label: "acme/two", categories: b }}
    />,
  );
}

/**
 * The two filled polygons, keyed by series rather than by position — `b` is
 * drawn first so `a` paints on top, and a test that assumed render order would
 * silently read the wrong shape.
 */
function shapes(markup: string): { a: string; b: string; count: number } {
  const found = [
    ...markup.matchAll(
      /<polygon points="([^"]+)" fill="var\(--series-(a|b)\)"/g,
    ),
  ];

  return {
    a: found.find((m) => m[2] === "a")![1]!,
    b: found.find((m) => m[2] === "b")![1]!,
    count: found.length,
  };
}

function distanceFromCenter(vertex: string): number {
  const [x, y] = vertex.split(",").map(Number);
  return Math.hypot(x! - CENTER, y! - CENTER);
}

describe("normalisation", () => {
  it("puts every category at the same radius when all are equally full", () => {
    // The check that catches raw plotting: at 80% of each category the shape
    // must be a regular pentagon, even though the maxima differ 25 vs 15.
    const radii = shapes(render(full(0.8), full(0.2)))
      .a.split(" ")
      .map(distanceFromCenter);

    for (const r of radii) {
      expect(r).toBeCloseTo(RADIUS * 0.8, 0);
    }
  });

  it("does not let the widest category dominate the shape", () => {
    // Docs (25) at half, Popularity (15) at half. Raw points would be 12.5 vs
    // 7.5 and draw a lopsided shape; normalised they are the same distance.
    const radii = shapes(render(full(0.5), full(0.5)))
      .a.split(" ")
      .map(distanceFromCenter);

    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1);
  });

  it("collapses a category that earned nothing to the centre", () => {
    const none = cats([
      ["docs", 0, 25],
      ["community", 20, 20],
      ["activity", 20, 20],
      ["popularity", 15, 15],
      ["hygiene", 20, 20],
    ]);
    const { a } = shapes(render(none, full(1)));

    expect(distanceFromCenter(a.split(" ")[0]!)).toBeCloseTo(0, 0);
  });

  it("survives a category with no points available", () => {
    const odd = cats([
      ["docs", 0, 0],
      ["community", 10, 20],
      ["activity", 10, 20],
      ["popularity", 5, 15],
      ["hygiene", 10, 20],
    ]);

    for (const vertex of shapes(render(odd, full(0.5))).a.split(" ")) {
      expect(Number.isFinite(distanceFromCenter(vertex))).toBe(true);
    }
  });
});

describe("what it must always carry", () => {
  const markup = render(full(0.9), full(0.4));

  it("draws both repositories", () => {
    expect(shapes(markup).count).toBe(2);
  });

  it("has a legend, because two series never rely on colour alone", () => {
    expect(markup).toContain("acme/one");
    expect(markup).toContain("acme/two");
  });

  it("says the axes are percentages, since the maxima differ", () => {
    expect(markup).toContain("each axis is % of that category");
  });

  it("keeps identity out of the grade ramp", () => {
    // Green already means "scored well" elsewhere in the app; reusing it for
    // "repo A" would put two meanings in one ink.
    expect(markup).toContain("--series-a");
    expect(markup).toContain("--series-b");
    expect(markup).not.toContain("--grade-");
  });

  it("labels every axis", () => {
    for (const [key] of WEIGHTS) {
      expect(markup).toContain(`>${key}<`);
    }
  });
});
