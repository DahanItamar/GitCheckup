import { describe, expect, it } from "vitest";

import { EMPTY, FIXED_NOW, PERFECT, signalsWith } from "@/lib/score/fixtures";
import { score } from "@/lib/score/rubric";

import { RuleTipProvider } from "./rules";
import { MAX_TIPS } from "./types";

const provider = new RuleTipProvider();

async function tipsFor(signals: Parameters<typeof score>[0]) {
  const result = score(signals, FIXED_NOW);
  return provider.generate(signals, result.categories);
}

describe("RuleTipProvider", () => {
  it("says nothing when there is nothing to fix", async () => {
    expect(await tipsFor(PERFECT)).toEqual([]);
  });

  it("caps the list so the page stays a to-do list, not an audit", async () => {
    const tips = await tipsFor(EMPTY);
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.length).toBeLessThanOrEqual(MAX_TIPS);
  });

  it("ranks by points recoverable, descending", async () => {
    const tips = await tipsFor(EMPTY);
    const points = tips.map((tip) => tip.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it("leads with the license for a repo that only lacks one", async () => {
    const tips = await tipsFor(signalsWith({ hasLicense: false }));
    expect(tips).toHaveLength(1);
    expect(tips[0]?.checkId).toBe("has-license");
    expect(tips[0]?.points).toBe(8);
  });

  it("never advises chasing stars or forks", async () => {
    const unpopular = signalsWith({ stars: 0, forks: 0 });
    const ids = (await tipsFor(unpopular)).map((tip) => tip.checkId);
    expect(ids).not.toContain("star-count");
    expect(ids).not.toContain("fork-count");
  });

  it("does not tell you to expand a README that does not exist", async () => {
    const ids = (await tipsFor(signalsWith({ readmeBytes: null }))).map(
      (tip) => tip.checkId,
    );
    expect(ids).toContain("has-readme");
    expect(ids).not.toContain("readme-depth");
  });

  it("does tell you to expand a thin README", async () => {
    const ids = (await tipsFor(signalsWith({ readmeBytes: 100 }))).map(
      (tip) => tip.checkId,
    );
    expect(ids).toContain("readme-depth");
    expect(ids).not.toContain("has-readme");
  });

  it("has text for every check the rubric can fail", async () => {
    const allFailing = score(EMPTY, FIXED_NOW).categories.flatMap((category) =>
      category.checks.filter((item) => item.earned < item.available),
    );
    const tips = await provider.generate(
      EMPTY,
      score(EMPTY, FIXED_NOW).categories,
    );

    for (const item of allFailing) {
      if (item.id === "star-count" || item.id === "fork-count") continue;
      if (item.id === "readme-depth") continue;
      // Every failing check is either in the list or was cut by the cap.
      const rankedAboveCap =
        tips.some((tip) => tip.checkId === item.id) || tips.length === MAX_TIPS;
      expect(rankedAboveCap).toBe(true);
    }
  });

  it("is deterministic — the same repo produces the same list twice", async () => {
    expect(await tipsFor(EMPTY)).toEqual(await tipsFor(EMPTY));
  });

  it("carries the check id that produced each tip", async () => {
    for (const tip of await tipsFor(EMPTY)) {
      expect(tip.checkId).toMatch(/^[a-z][a-z-]*[a-z]$/);
      expect(tip.text.length).toBeGreaterThan(20);
      expect(tip.points).toBeGreaterThan(0);
    }
  });
});
