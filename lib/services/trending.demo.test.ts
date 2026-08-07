import { describe, expect, it, vi } from "vitest";

import { allDemoSignals, findDemoSignals } from "@/lib/demo/repos";

/**
 * `/trending` under `DEMO_MODE=1` (SPEC §11 assumption 12).
 *
 * `DEMO_MODE` is read once when `lib/config.ts` is imported, so the flag has
 * to be set before the module graph is pulled in — hence the dynamic import.
 * Vitest isolates module registries per file, so this does not leak into the
 * suites that exercise the live path.
 */

vi.stubEnv("DEMO_MODE", "1");

/** The database must not be reachable at all, not merely unused. */
const findTrending = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("demo mode must not query Postgres");
  }),
);

vi.mock("@/lib/db/scores", () => ({ findTrending }));

const { SEED_REPOS, getTrending } = await import("./trending");

const MIN_STARS = 50;

describe("getTrending in demo mode", () => {
  it("never touches the database", async () => {
    await getTrending(20);

    expect(findTrending).not.toHaveBeenCalled();
  });

  it("applies the same star floor as the real query", async () => {
    const { repos } = await getTrending(20);

    expect(repos.length).toBeGreaterThan(0);
    for (const repo of repos) {
      expect(repo.stars).toBeGreaterThanOrEqual(MIN_STARS);
    }
  });

  it("leaves the small fixtures off the board", async () => {
    const { repos } = await getTrending(20);
    const listed = new Set(repos.map((repo) => `${repo.owner}/${repo.name}`));
    const small = allDemoSignals().filter(
      (signals) => signals.stars < MIN_STARS,
    );

    expect(small.length).toBeGreaterThan(0);
    for (const signals of small) {
      expect(listed.has(`${signals.owner}/${signals.name}`)).toBe(false);
    }
  });

  it("ranks by score, then by stars", async () => {
    const { repos } = await getTrending(20);

    for (let i = 1; i < repos.length; i++) {
      const previous = repos[i - 1]!;
      const current = repos[i]!;

      expect(previous.total).toBeGreaterThanOrEqual(current.total);
      if (previous.total === current.total) {
        expect(previous.stars).toBeGreaterThanOrEqual(current.stars);
      }
    }
  });

  it("honours the limit", async () => {
    const { repos } = await getTrending(3);

    expect(repos).toHaveLength(3);
  });

  it("offers the suggestions the board cannot show", async () => {
    const { seeded } = await getTrending(20);

    // The board is full in demo mode, so the live row-count rule would never
    // fire — and the repos worth demonstrating are the ones it excludes.
    expect(seeded).toBe(true);
    expect(SEED_REPOS.length).toBeGreaterThan(0);

    for (const slug of SEED_REPOS) {
      expect(findDemoSignals(slug)).not.toBeNull();
      expect(findDemoSignals(slug)!.stars).toBeLessThan(MIN_STARS);
    }
  });
});
