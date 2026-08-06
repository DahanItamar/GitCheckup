import { describe, expect, it } from "vitest";

import { toGrade } from "./grade";
import { score } from "./rubric";
import type { CategoryKey, RubricResult } from "./types";
import {
  ARCHIVED,
  EMPTY,
  FIXED_NOW,
  PERFECT,
  daysAgo,
  signalsWith,
} from "./fixtures";

/**
 * The most important test file in the repository (SPEC §4).
 *
 * Every tier boundary in §5 is pinned here, on both sides. Changing a weight
 * should turn this file red — that is the point, and it is the cue to bump
 * RUBRIC_VERSION in the same commit.
 */

const scoreAt = (signals: Parameters<typeof score>[0]): RubricResult =>
  score(signals, FIXED_NOW);

function checkPoints(result: RubricResult, id: string): number {
  for (const category of result.categories) {
    const found = category.checks.find((item) => item.id === id);
    if (found) return found.earned;
  }
  throw new Error(`No check with id "${id}"`);
}

function categoryPoints(result: RubricResult, key: CategoryKey): number {
  const found = result.categories.find((category) => category.key === key);
  if (!found) throw new Error(`No category "${key}"`);
  return found.earned;
}

describe("the scale itself", () => {
  it("is worth exactly 100 points across five categories", () => {
    const result = scoreAt(PERFECT);
    const available = result.categories.reduce(
      (sum, category) => sum + category.available,
      0,
    );

    expect(available).toBe(100);
    expect(result.categories.map((category) => category.key)).toEqual([
      "docs",
      "community",
      "activity",
      "popularity",
      "hygiene",
    ]);
  });

  it("gives each category the weight the spec assigns it", () => {
    const byKey = Object.fromEntries(
      scoreAt(PERFECT).categories.map((category) => [
        category.key,
        category.available,
      ]),
    );

    expect(byKey).toEqual({
      docs: 25,
      community: 20,
      activity: 20,
      popularity: 15,
      hygiene: 20,
    });
  });

  it("never lets a category's checks exceed its available points", () => {
    for (const category of scoreAt(PERFECT).categories) {
      const fromChecks = category.checks.reduce(
        (sum, item) => sum + item.available,
        0,
      );
      expect(fromChecks).toBe(category.available);
    }
  });

  it("totals the categories, and only the categories", () => {
    const result = scoreAt(ARCHIVED);
    const sum = result.categories.reduce(
      (total, category) => total + category.earned,
      0,
    );
    expect(result.total).toBe(sum);
  });
});

describe("docs — 25 pts", () => {
  it("awards the README presence point independently of its depth", () => {
    const thin = scoreAt(signalsWith({ readmeBytes: 10 }));
    expect(checkPoints(thin, "has-readme")).toBe(6);
    expect(checkPoints(thin, "readme-depth")).toBe(0);
  });

  it("scores a missing README at zero on both checks", () => {
    const none = scoreAt(signalsWith({ readmeBytes: null }));
    expect(checkPoints(none, "has-readme")).toBe(0);
    expect(checkPoints(none, "readme-depth")).toBe(0);
  });

  it.each([
    [4000, 8],
    [3999, 6],
    [1500, 6],
    [1499, 3],
    [300, 3],
    [299, 0],
    [0, 0],
  ])("scores a %i-byte README at %i points", (bytes, expected) => {
    expect(
      checkPoints(scoreAt(signalsWith({ readmeBytes: bytes })), "readme-depth"),
    ).toBe(expected);
  });

  it("treats an empty description as absent", () => {
    expect(
      checkPoints(
        scoreAt(signalsWith({ description: null })),
        "has-description",
      ),
    ).toBe(0);
    expect(checkPoints(scoreAt(PERFECT), "has-description")).toBe(5);
  });

  it.each([
    [0, 0],
    [1, 2],
    [2, 2],
    [3, 4],
    [9, 4],
  ])("scores %i topics at %i points", (count, expected) => {
    const topics = Array.from(
      { length: count },
      (_, index) => `topic-${index}`,
    );
    expect(checkPoints(scoreAt(signalsWith({ topics })), "has-topics")).toBe(
      expected,
    );
  });

  it("scores the homepage as present or absent, nothing between", () => {
    expect(
      checkPoints(scoreAt(signalsWith({ homepage: null })), "has-homepage"),
    ).toBe(0);
    expect(checkPoints(scoreAt(PERFECT), "has-homepage")).toBe(2);
  });
});

describe("community — 20 pts", () => {
  it.each([
    ["hasLicense", "has-license", 8],
    ["hasContributing", "has-contributing", 4],
    ["hasCodeOfConduct", "has-code-of-conduct", 3],
    ["hasSecurityPolicy", "has-security-policy", 3],
    ["hasIssueOrPrTemplate", "has-templates", 2],
  ] as const)("scores %s at %s → %i points", (signal, checkId, points) => {
    expect(checkPoints(scoreAt(signalsWith({ [signal]: true })), checkId)).toBe(
      points,
    );
    expect(
      checkPoints(scoreAt(signalsWith({ [signal]: false })), checkId),
    ).toBe(0);
  });

  it("is the category a license alone can nearly half-fill", () => {
    const licenseOnly = signalsWith({
      hasLicense: true,
      hasContributing: false,
      hasCodeOfConduct: false,
      hasSecurityPolicy: false,
      hasIssueOrPrTemplate: false,
    });
    expect(categoryPoints(scoreAt(licenseOnly), "community")).toBe(8);
  });
});

describe("activity — 20 pts", () => {
  it.each([
    [0, 10],
    [30, 10],
    [31, 7],
    [90, 7],
    [91, 4],
    [180, 4],
    [181, 2],
    [365, 2],
    [366, 0],
    [3000, 0],
  ])("scores a push %i days ago at %i points", (days, expected) => {
    expect(
      checkPoints(
        scoreAt(signalsWith({ pushedAt: daysAgo(days) })),
        "recent-push",
      ),
    ).toBe(expected);
  });

  it("scores an unparseable push date as ancient rather than throwing", () => {
    expect(
      checkPoints(
        scoreAt(signalsWith({ pushedAt: "not a date" })),
        "recent-push",
      ),
    ).toBe(0);
  });

  it.each([
    [0, 0],
    [1, 2],
    [4, 2],
    [5, 4],
    [19, 4],
    [20, 6],
    [100, 6],
  ])("scores %i commits in 90 days at %i points", (commits, expected) => {
    expect(
      checkPoints(
        scoreAt(signalsWith({ commitsLast90Days: commits })),
        "commit-cadence",
      ),
    ).toBe(expected);
  });

  it("ignores the issue ratio below 50 stars, where it is noise", () => {
    const tiny = signalsWith({ stars: 49, openIssues: 200 });
    expect(checkPoints(scoreAt(tiny), "issue-backlog")).toBe(4);
  });

  it.each([
    [5, 4],
    [15, 3],
    [30, 2],
    [31, 1],
    [500, 1],
  ])(
    "scores %i open issues against 100 stars at %i points",
    (openIssues, expected) => {
      const signals = signalsWith({ stars: 100, openIssues });
      expect(checkPoints(scoreAt(signals), "issue-backlog")).toBe(expected);
    },
  );
});

describe("popularity — 15 pts, log-scaled", () => {
  it.each([
    [0, 0],
    [10, 2],
    [100, 4],
    [1_000, 7],
    [10_000, 9],
    [100_000, 11],
    [1_000_000, 11],
  ])("scores %i stars at %i points", (stars, expected) => {
    expect(checkPoints(scoreAt(signalsWith({ stars })), "star-count")).toBe(
      expected,
    );
  });

  it.each([
    [0, 0],
    [10, 2],
    [100, 3],
    [1_000, 4],
    [100_000, 4],
  ])("scores %i forks at %i points", (forks, expected) => {
    expect(checkPoints(scoreAt(signalsWith({ forks })), "fork-count")).toBe(
      expected,
    );
  });

  it("does not crush a small but real project", () => {
    const modest = signalsWith({ stars: 40, forks: 4 });
    expect(categoryPoints(scoreAt(modest), "popularity")).toBeGreaterThan(0);
  });
});

describe("hygiene — 20 pts", () => {
  it("rewards CI more than anything else in the category", () => {
    const noCi = scoreAt(signalsWith({ hasCiWorkflows: false }));
    expect(checkPoints(scoreAt(PERFECT), "has-ci")).toBe(8);
    expect(checkPoints(noCi, "has-ci")).toBe(0);
  });

  it("penalises archived repos and forks", () => {
    expect(
      checkPoints(scoreAt(signalsWith({ isArchived: true })), "not-archived"),
    ).toBe(0);
    expect(
      checkPoints(scoreAt(signalsWith({ isFork: true })), "is-original"),
    ).toBe(0);
  });

  it("scores a docs-only repo's missing language as a loss, not an error", () => {
    expect(
      checkPoints(
        scoreAt(signalsWith({ primaryLanguage: null })),
        "language-detected",
      ),
    ).toBe(0);
  });

  it("scores disabled issues at zero", () => {
    expect(
      checkPoints(
        scoreAt(signalsWith({ hasIssuesEnabled: false })),
        "issues-enabled",
      ),
    ).toBe(0);
  });
});

describe("whole-repo fixtures", () => {
  it("scores a repo that does everything right at 100 / A+", () => {
    const result = scoreAt(PERFECT);
    expect(result.total).toBe(100);
    expect(result.grade).toBe("A+");
  });

  it("scores an empty repo low, without dividing or logging by zero", () => {
    const result = scoreAt(EMPTY);
    expect(Number.isFinite(result.total)).toBe(true);
    expect(result.total).toBeLessThan(30);
    expect(result.grade).toBe("F");
    expect(categoryPoints(result, "docs")).toBe(0);
    expect(categoryPoints(result, "popularity")).toBe(0);
  });

  it("scores a well-built but abandoned repo on its documentation, not its pulse", () => {
    const result = scoreAt(ARCHIVED);
    expect(categoryPoints(result, "docs")).toBe(25);
    expect(categoryPoints(result, "activity")).toBeLessThanOrEqual(4);
    expect(checkPoints(result, "not-archived")).toBe(0);
  });

  it("produces an integer total in range for every fixture", () => {
    for (const signals of [PERFECT, EMPTY, ARCHIVED]) {
      const { total } = scoreAt(signals);
      expect(Number.isInteger(total)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
    }
  });
});

describe("grades", () => {
  it.each([
    [100, "A+"],
    [90, "A+"],
    [89, "A"],
    [80, "A"],
    [79, "B"],
    [70, "B"],
    [69, "C"],
    [60, "C"],
    [59, "D"],
    [50, "D"],
    [49, "F"],
    [0, "F"],
  ])("grades %i as %s", (total, expected) => {
    expect(toGrade(total)).toBe(expected);
  });
});

describe("purity", () => {
  it("returns the same result for the same inputs", () => {
    expect(scoreAt(PERFECT)).toEqual(scoreAt(PERFECT));
  });

  it("does not mutate the signals it is given", () => {
    const signals = signalsWith({});
    const snapshot = structuredClone(signals);
    scoreAt(signals);
    expect(signals).toEqual(snapshot);
  });

  it("depends on the clock only through its `now` parameter", () => {
    const signals = signalsWith({ pushedAt: daysAgo(100) });
    const later = new Date(FIXED_NOW.getTime() + 400 * 24 * 60 * 60 * 1000);

    // Same signals, different clock: 100 days stale, then 500.
    expect(checkPoints(score(signals, FIXED_NOW), "recent-push")).toBe(4);
    expect(checkPoints(score(signals, later), "recent-push")).toBe(0);
  });
});
