import { describe, expect, it } from "vitest";

import { GITHUB_CALL_BUDGET, buildSignalPaths } from "./signals";

const SLUG = { owner: "facebook", name: "react" };
const NOW = new Date("2026-08-07T00:00:00.000Z");

describe("the GitHub call budget", () => {
  it("is six", () => {
    expect(GITHUB_CALL_BUDGET).toBe(6);
  });

  it("matches the number of paths the fan-out actually requests", () => {
    const paths = Object.values(buildSignalPaths(SLUG, NOW));
    expect(paths).toHaveLength(GITHUB_CALL_BUDGET);
    expect(new Set(paths).size).toBe(GITHUB_CALL_BUDGET);
  });
});

describe("buildSignalPaths", () => {
  it("targets only api.github.com paths under the repo", () => {
    for (const path of Object.values(buildSignalPaths(SLUG, NOW))) {
      expect(path.startsWith("/repos/facebook/react")).toBe(true);
    }
  });

  it("asks for one page of commits in a 90-day window", () => {
    const { commits } = buildSignalPaths(SLUG, NOW);
    expect(commits).toContain("per_page=100");
    expect(commits).toContain(encodeURIComponent("2026-05-09T00:00:00.000Z"));
  });

  it("reads README size from the readme endpoint, never the content", () => {
    const { readme } = buildSignalPaths(SLUG, NOW);
    expect(readme).toBe("/repos/facebook/react/readme");
  });
});
