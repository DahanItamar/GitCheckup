import { describe, expect, it } from "vitest";

import { RUBRIC_VERSION } from "@/lib/config";

import { daysSince, decideCacheAction } from "./freshness";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const agedBy = (ms: number, rubricVersion = RUBRIC_VERSION) => ({
  fetchedAt: new Date(NOW.getTime() - ms),
  rubricVersion,
});

const decide = (candidate: Parameters<typeof decideCacheAction>[0]) =>
  decideCacheAction(candidate, RUBRIC_VERSION, NOW);

describe("decideCacheAction", () => {
  it("treats a repo we have never scored as cold", () => {
    expect(decide(null)).toBe("cold");
  });

  it("serves a just-written score as fresh", () => {
    expect(decide(agedBy(0))).toBe("fresh");
  });

  it.each([
    [1 * HOUR, "fresh"],
    [5 * HOUR, "fresh"],
    [6 * HOUR, "fresh"],
  ])("is fresh at %ims old", (age, expected) => {
    expect(decide(agedBy(age))).toBe(expected);
  });

  it("goes stale the moment it passes the 6-hour TTL", () => {
    expect(decide(agedBy(6 * HOUR))).toBe("fresh");
    expect(decide(agedBy(6 * HOUR + 1))).toBe("stale");
  });

  it.each([
    [7 * HOUR, "stale"],
    [2 * DAY, "stale"],
    [7 * DAY, "stale"],
  ])("is stale at %ims old", (age, expected) => {
    expect(decide(agedBy(age))).toBe(expected);
  });

  it("goes cold the moment it passes the 7-day ceiling", () => {
    expect(decide(agedBy(7 * DAY))).toBe("stale");
    expect(decide(agedBy(7 * DAY + 1))).toBe("cold");
  });

  it("treats a row from an older rubric as a miss, however recent", () => {
    expect(decide(agedBy(0, RUBRIC_VERSION - 1))).toBe("cold");
    expect(decide(agedBy(1 * HOUR, RUBRIC_VERSION - 1))).toBe("cold");
  });

  it("also rejects a row from a newer rubric — a rollback must not serve it", () => {
    expect(decide(agedBy(0, RUBRIC_VERSION + 1))).toBe("cold");
  });

  it("does not treat clock skew into the future as expiry", () => {
    expect(decide(agedBy(-1 * HOUR))).toBe("fresh");
  });

  it("never returns anything outside the three actions", () => {
    const ages = [-DAY, 0, HOUR, 6 * HOUR, 7 * DAY, 400 * DAY];
    for (const age of ages) {
      expect(["fresh", "stale", "cold"]).toContain(decide(agedBy(age)));
    }
  });
});

describe("daysSince", () => {
  it.each([
    [0, 0],
    [HOUR, 0],
    [DAY, 1],
    [DAY + 23 * HOUR, 1],
    [9 * DAY, 9],
  ])("reports %ims as %i whole days", (age, expected) => {
    expect(daysSince(new Date(NOW.getTime() - age), NOW)).toBe(expected);
  });

  it("floors at zero rather than reporting negative days", () => {
    expect(daysSince(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
  });
});
