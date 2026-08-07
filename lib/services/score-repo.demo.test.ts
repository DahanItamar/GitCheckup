import { describe, expect, it, vi } from "vitest";

import { isRepoGaugeError } from "@/lib/errors";
import { assertRepoSlug } from "@/lib/repo-slug";

/**
 * Flow A under `DEMO_MODE=1` (SPEC §11 assumption 12).
 *
 * The claim being pinned is the one the banner makes: the real rubric on
 * canned input, and not a single outbound call. Every collaborator that could
 * make one is replaced with a throw, so "unused" fails as loudly as "wrong".
 */

vi.stubEnv("DEMO_MODE", "1");

const forbidden = vi.hoisted(() => {
  const refuse = (what: string) =>
    vi.fn(() => {
      throw new Error(`demo mode must not reach ${what}`);
    });

  return {
    fetchRepoSignals: refuse("GitHub"),
    findLatestScore: refuse("Postgres"),
    saveScore: refuse("Postgres"),
    chargeColdScore: refuse("the rate limiter"),
    after: refuse("next/server after()"),
  };
});

vi.mock("next/server", () => ({ after: forbidden.after }));
vi.mock("@/lib/github/signals", () => ({
  fetchRepoSignals: forbidden.fetchRepoSignals,
}));
vi.mock("@/lib/db/scores", () => ({
  findLatestScore: forbidden.findLatestScore,
  saveScore: forbidden.saveScore,
}));
vi.mock("./rate-limit", () => ({ chargeColdScore: forbidden.chargeColdScore }));

const { getOrComputeScore } = await import("./score-repo");

describe("getOrComputeScore in demo mode", () => {
  it("scores a bundled repo without any IO", async () => {
    const result = await getOrComputeScore(assertRepoSlug("facebook/react"));

    expect(result.repo).toMatchObject({ owner: "facebook", name: "react" });
    expect(result.score.total).toBeGreaterThan(0);
    expect(result.score.categories).toHaveLength(5);

    for (const call of Object.values(forbidden)) {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("is honest that nothing was cached", async () => {
    const result = await getOrComputeScore(assertRepoSlug("vercel/next.js"));

    expect(result.cached).toBe(false);
    expect(result.stale).toBe(false);
  });

  it("still produces tips, which is half the point of the demo", async () => {
    const result = await getOrComputeScore(assertRepoSlug("acme/starter-kit"));

    expect(result.score.tips.length).toBeGreaterThan(0);
  });

  it("says a repo it does not carry is not found", async () => {
    // Not an invented score for whatever was typed, and not a 500 either.
    const failure = await getOrComputeScore(
      assertRepoSlug("torvalds/linux"),
    ).catch((error: unknown) => error);

    expect(isRepoGaugeError(failure)).toBe(true);
    expect(isRepoGaugeError(failure) && failure.code).toBe("REPO_NOT_FOUND");
  });

  it("ignores neverRefresh, having nothing to refresh from", async () => {
    // The image routes pass it on every Camo hit; it must not change the path.
    const direct = await getOrComputeScore(assertRepoSlug("facebook/react"));
    const embed = await getOrComputeScore(assertRepoSlug("facebook/react"), {
      neverRefresh: true,
    });

    expect(embed.score.total).toBe(direct.score.total);
  });
});
