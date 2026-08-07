import { describe, expect, it } from "vitest";

import { score } from "@/lib/score/rubric";

import { allDemoSignals, demoSlugsBelow, findDemoSignals } from "./repos";

/**
 * The fixtures behind demo mode (SPEC §11 assumption 12).
 *
 * Two classes of bug live here and neither is visible to the type checker: a
 * slug that names a repository which does not exist, and a fixture set that
 * only demonstrates half the product.
 */

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Matches the star floor `lib/services/trending.ts` applies to the board. */
const MIN_STARS = 50;

describe("findDemoSignals", () => {
  it("finds a bundled repo", () => {
    const signals = findDemoSignals({ owner: "facebook", name: "react" }, NOW);

    expect(signals?.owner).toBe("facebook");
    expect(signals?.name).toBe("react");
  });

  it("matches case-insensitively, like GitHub's own slugs", () => {
    expect(
      findDemoSignals({ owner: "FaceBook", name: "React" }, NOW),
    ).not.toBeNull();
  });

  it("returns null for a repo the demo does not carry", () => {
    expect(findDemoSignals({ owner: "torvalds", name: "linux" }, NOW)).toBeNull(
      // Not "score it anyway" — the caller turns this into REPO_NOT_FOUND.
    );
  });

  it("resolves every slug it advertises", () => {
    // A typo in an owner field — `react/react` for `facebook/react` — passes
    // the type checker, renders a dead GitHub link, and turns the repo people
    // are most likely to type into a not-found page.
    for (const signals of allDemoSignals(NOW)) {
      expect(
        findDemoSignals({ owner: signals.owner, name: signals.name }, NOW),
      ).not.toBeNull();
    }
  });

  it("carries no duplicate slugs", () => {
    const slugs = allDemoSignals(NOW).map((signals) =>
      `${signals.owner}/${signals.name}`.toLowerCase(),
    );

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("materialising against the clock", () => {
  it("ages a fixture from the clock, not from a stored date", () => {
    const later = new Date(NOW.getTime() + 400 * DAY_MS);

    const then = findDemoSignals({ owner: "sveltejs", name: "svelte" }, NOW);
    const now = findDemoSignals({ owner: "sveltejs", name: "svelte" }, later);

    // Same freshness a year on. A stored `pushedAt` would have drifted 400
    // days toward "abandoned" and quietly changed every score in the demo.
    expect(Date.parse(now!.pushedAt!) - Date.parse(then!.pushedAt!)).toBe(
      400 * DAY_MS,
    );
    expect(score(then!, NOW).total).toBe(score(now!, later).total);
  });

  it("keeps a never-pushed repo null rather than dating it", () => {
    const signals = findDemoSignals(
      { owner: "acme", name: "starter-kit" },
      NOW,
    );

    expect(signals?.pushedAt).toBeNull();
  });
});

describe("what the fixture set demonstrates", () => {
  const totals = allDemoSignals(NOW).map(
    (signals) => score(signals, NOW).total,
  );

  it("reaches the top of the scale", () => {
    expect(Math.max(...totals)).toBeGreaterThanOrEqual(90);
  });

  it("also carries repos that score badly", () => {
    // The tip list is half of what the product is for. A demo of nothing but
    // famous repositories in the nineties never shows it.
    expect(Math.min(...totals)).toBeLessThan(50);
  });
});

describe("demoSlugsBelow", () => {
  it("returns exactly the fixtures under the floor", () => {
    const below = demoSlugsBelow(MIN_STARS);
    const expected = allDemoSignals(NOW).filter(
      (signals) => signals.stars < MIN_STARS,
    );

    expect(below.length).toBe(expected.length);
    expect(below.length).toBeGreaterThan(0);
  });

  it("returns slugs the demo can actually score", () => {
    for (const slug of demoSlugsBelow(MIN_STARS)) {
      expect(findDemoSignals(slug, NOW)).not.toBeNull();
    }
  });

  it("excludes everything at or above the floor", () => {
    const below = new Set(
      demoSlugsBelow(MIN_STARS).map((slug) => `${slug.owner}/${slug.name}`),
    );

    for (const signals of allDemoSignals(NOW)) {
      if (signals.stars >= MIN_STARS) {
        expect(below.has(`${signals.owner}/${signals.name}`)).toBe(false);
      }
    }
  });
});
