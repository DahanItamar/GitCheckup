import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { score } from "@/lib/score/rubric";
import { PERFECT } from "@/lib/score/fixtures";

import { repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * `first_seen_at` and the history it feeds.
 *
 * The column exists because `fetched_at` alone could not tell "reached this
 * score in March" from "confirmed it today" — confirming an unchanged score
 * drags `fetched_at` forward, which would draw every stable repository as a
 * vertical cluster at "now". The property under test is that a touch moves one
 * timestamp and not the other.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { saveScore, findScoreHistory } = await import("./scores");

let postgres: TestPostgres;
let db: TestDb;

const RUBRIC = score(PERFECT, new Date("2026-08-07T00:00:00Z"));
const SLUG = { owner: "acme", name: "widget" };
const V = 2;

function record(total: number) {
  return {
    githubId: 42,
    owner: SLUG.owner,
    name: SLUG.name,
    stars: 5,
    isArchived: false,
    score: { ...RUBRIC, total, tips: [] },
    rubricVersion: V,
  };
}

beforeAll(async () => {
  postgres = await createTestPostgres();
  db = postgres.db;
  mocked.db = db;
});

afterAll(async () => {
  await postgres.close();
});

beforeEach(async () => {
  await db.delete(scores);
  await db.delete(repos);
});

describe("first_seen_at", () => {
  it("stays put while fetched_at moves on an unchanged rescan", async () => {
    await saveScore(record(70));
    const [before] = await findScoreHistory(SLUG, { rubricVersion: V });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveScore(record(70));
    const [after] = await findScoreHistory(SLUG, { rubricVersion: V });

    // The whole reason the column exists.
    expect(after!.firstSeenAt.getTime()).toBe(before!.firstSeenAt.getTime());
    expect(after!.fetchedAt.getTime()).toBeGreaterThan(
      before!.fetchedAt.getTime(),
    );
  });

  it("starts a new point when the score changes", async () => {
    await saveScore(record(70));
    await saveScore(record(85));

    const history = await findScoreHistory(SLUG, { rubricVersion: V });

    expect(history.map((p) => p.total)).toEqual([70, 85]);
  });

  it("returns points oldest first, whatever order they were written", async () => {
    await saveScore(record(70));
    await saveScore(record(85));
    await saveScore(record(60));

    const history = await findScoreHistory(SLUG, { rubricVersion: V });

    expect(history.map((p) => p.total)).toEqual([70, 85, 60]);
  });

  it("never mixes rubric versions on one line", async () => {
    // A weight change moves every score at once. Plotting both versions would
    // draw a cliff where the rubric changed, not where the repo did.
    await saveScore({ ...record(70), rubricVersion: 1 });
    await saveScore(record(85));

    const history = await findScoreHistory(SLUG, { rubricVersion: V });

    expect(history.map((p) => p.total)).toEqual([85]);
  });

  it("excludes points older than the retention window", async () => {
    await saveScore(record(70));

    const future = new Date(Date.now() + 10_000 * 24 * 60 * 60 * 1000);
    const history = await findScoreHistory(SLUG, {
      rubricVersion: V,
      now: future,
    });

    // Never returns rows the sweep has already promised to delete.
    expect(history).toEqual([]);
  });

  it("returns nothing for a repo with no scores", async () => {
    expect(
      await findScoreHistory(
        { owner: "nobody", name: "nothing" },
        {
          rubricVersion: V,
        },
      ),
    ).toEqual([]);
  });
});
