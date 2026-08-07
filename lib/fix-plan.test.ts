import { describe, expect, it } from "vitest";

import { fixPlanFilename, renderFixPlan, type FixPlanInput } from "./fix-plan";
import type { CategoryScore, ScoreResult } from "./score/types";

/**
 * The Markdown fix plan. It is written to disk and pasted into an agent's
 * context, so two properties matter more than layout: it must list everything
 * that lost points rather than the page's top six, and it must not carry any
 * repository-controlled text.
 */

function category(
  key: CategoryScore["key"],
  label: string,
  checks: CategoryScore["checks"],
): CategoryScore {
  return {
    key,
    label,
    earned: checks.reduce((sum, check) => sum + check.earned, 0),
    available: checks.reduce((sum, check) => sum + check.available, 0),
    checks,
  };
}

const CATEGORIES: CategoryScore[] = [
  category("docs", "Docs", [
    { id: "has-readme", label: "README present", earned: 6, available: 6 },
    { id: "has-topics", label: "Topics tagged", earned: 0, available: 4 },
  ]),
  category("popularity", "Popularity", [
    { id: "star-count", label: "Stars", earned: 0, available: 11 },
    { id: "fork-count", label: "Forks", earned: 0, available: 4 },
  ]),
];

const SCORE: ScoreResult = {
  total: 6,
  grade: "F",
  categories: CATEGORIES,
  tips: [
    {
      checkId: "has-topics",
      text: "Add at least three topics.",
      points: 4,
    },
  ],
};

const INPUT: FixPlanInput = {
  owner: "acme",
  name: "starter-kit",
  score: SCORE,
  fetchedAt: "2026-08-07T12:00:00.000Z",
  rubricVersion: 2,
  resultUrl: "https://gitcheckup.app/r/acme/starter-kit",
};

describe("renderFixPlan", () => {
  const plan = renderFixPlan(INPUT);

  it("leads with the repo, the score and where it came from", () => {
    expect(plan).toContain("# GitCheckup fix plan — acme/starter-kit");
    expect(plan).toContain("**6/100 · grade F**");
    expect(plan).toContain("rubric v2");
    expect(plan).toContain("https://gitcheckup.app/r/acme/starter-kit");
  });

  it("counts only the reachable points toward the target", () => {
    // 4 actionable, 15 locked behind stars and forks. A plan that promised
    // 25/100 would be sending an agent after points it cannot earn.
    expect(plan).toContain("+4 points");
    expect(plan).toContain("**10/100 (F)**");
  });

  it("gives each fix a checkbox, its points and its advice", () => {
    expect(plan).toContain("**Topics tagged**");
    expect(plan).toContain("· +4 (currently 0/4)");
    expect(plan).toContain("Add at least three topics.");
  });

  it("marks the items GitHub's UI owns rather than a file", () => {
    // The briefing promises these are marked. An agent sent looking for a
    // file to create for "Topics tagged" finds nothing and either invents one
    // or gives up.
    expect(plan).toContain(
      "**Topics tagged** _(repository setting, not a file)_",
    );
  });

  it("names what cannot be worked on, so the arithmetic adds up", () => {
    expect(plan).toContain("## Not actionable — 15 points");
    expect(plan).toContain("**Stars** — 0/11");
    expect(plan).toContain("**Forks** — 0/4");
  });

  it("keeps stars and forks out of the fix list", () => {
    const fixes = plan.slice(
      plan.indexOf("## What to fix"),
      plan.indexOf("## Not actionable"),
    );

    expect(fixes).not.toContain("Stars");
    expect(fixes).not.toContain("Forks");
  });

  it("lists what already passes, so an agent knows what not to break", () => {
    expect(plan).toContain("## Already passing");
    expect(plan).toContain("README present — 6/6");
  });

  it("ends with exactly one newline", () => {
    expect(plan.endsWith("\n")).toBe(true);
    expect(plan.endsWith("\n\n")).toBe(false);
  });
});

describe("what the plan refuses to carry", () => {
  it("has no room for a repository description", () => {
    // Descriptions are attacker-controlled by anyone who can create a repo
    // (SPEC §9). `ScoreResult` does not carry one, and the renderer takes
    // nothing else from the repository — this pins that shape.
    const keys = Object.keys(INPUT).sort();

    expect(keys).toEqual([
      "fetchedAt",
      "name",
      "owner",
      "resultUrl",
      "rubricVersion",
      "score",
    ]);
  });
});

describe("uncapped, unlike the page", () => {
  it("lists every lost check even when the provider ran out of advice", () => {
    // The page caps tips at MAX_TIPS. A check past that cap arrives with no
    // prose, and must still appear — silently dropping it would define
    // "everything to fix" as "the first six things".
    const many = category(
      "community",
      "Community",
      Array.from({ length: 9 }, (_, index) => ({
        id: `check-${index}`,
        label: `Check ${index}`,
        earned: 0,
        available: 2,
      })),
    );

    const plan = renderFixPlan({
      ...INPUT,
      score: { ...SCORE, categories: [many], tips: [] },
    });

    for (let index = 0; index < 9; index++) {
      expect(plan).toContain(`- [ ] **Check ${index}** · +2 (currently 0/2)`);
    }
  });

  it("says so plainly when there is nothing left to do", () => {
    const perfect = category("docs", "Docs", [
      { id: "has-readme", label: "README present", earned: 6, available: 6 },
    ]);

    const plan = renderFixPlan({
      ...INPUT,
      score: { total: 100, grade: "A+", categories: [perfect], tips: [] },
    });

    expect(plan).toContain("nothing in this file to do");
    expect(plan).not.toContain("## What to fix");
  });
});

describe("fixPlanFilename", () => {
  it("names the repo it describes", () => {
    expect(fixPlanFilename("acme", "starter-kit")).toBe(
      "gitcheckup-acme-starter-kit.md",
    );
  });
});
