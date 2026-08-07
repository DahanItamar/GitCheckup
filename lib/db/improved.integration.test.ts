import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * `/improved` against real Postgres.
 *
 * The ranking rule is the product decision this page exists for — by gain, not
 * by height — and it lives entirely in one query's `order by` and `having`.
 * A unit test could not reach either.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { findMostImproved } = await import("./scores");

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const V = 2;

let postgres: TestPostgres;
let db: TestDb;

let nextGithubId = 1;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

/** Seeds a repo and its score sequence, oldest first. */
async function seed(
  name: string,
  stars: number,
  runs: { total: number; daysAgo: number; rubricVersion?: number }[],
) {
  const rows = await db
    .insert(repos)
    .values({ githubId: nextGithubId++, owner: "owner", name, stars })
    .returning({ id: repos.id });
  const repoId = rows[0]!.id;

  for (const run of runs) {
    await db.insert(scores).values({
      repoId,
      total: run.total,
      grade: "C",
      categories: [],
      tips: [],
      rubricVersion: run.rubricVersion ?? V,
      firstSeenAt: daysAgo(run.daysAgo),
      fetchedAt: daysAgo(run.daysAgo),
    });
  }
}

function board(
  overrides: Partial<Parameters<typeof findMostImproved>[0]> = {},
) {
  return findMostImproved({
    limit: 20,
    windowDays: 30,
    minStars: 10,
    rubricVersion: V,
    now: NOW,
    ...overrides,
  });
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
  nextGithubId = 1;
});

describe("what ranks", () => {
  it("orders by gain, not by score", async () => {
    // The whole point. The 95 has nowhere to climb; the 54 did the work.
    await seed("giant", 90_000, [
      { total: 93, daysAgo: 20 },
      { total: 95, daysAgo: 2 },
    ]);
    await seed("climber", 40, [
      { total: 54, daysAgo: 20 },
      { total: 71, daysAgo: 2 },
    ]);

    const rows = await board();

    expect(rows.map((r) => r.name)).toEqual(["climber", "giant"]);
    expect(rows[0]).toMatchObject({ from: 54, total: 71, delta: 17 });
  });

  it("reports the gain across the whole window, not the last step", async () => {
    await seed("steady", 50, [
      { total: 40, daysAgo: 25 },
      { total: 55, daysAgo: 15 },
      { total: 62, daysAgo: 3 },
    ]);

    expect((await board())[0]).toMatchObject({
      from: 40,
      total: 62,
      delta: 22,
    });
  });

  it("breaks a tie on the higher current score", async () => {
    await seed("lower", 50, [
      { total: 30, daysAgo: 10 },
      { total: 40, daysAgo: 1 },
    ]);
    await seed("higher", 50, [
      { total: 60, daysAgo: 10 },
      { total: 70, daysAgo: 1 },
    ]);

    expect((await board()).map((r) => r.name)).toEqual(["higher", "lower"]);
  });
});

describe("what does not rank", () => {
  it("excludes a repo scored only once", async () => {
    // No "from" to subtract. Treating the first score as a gain from zero
    // would put every newly-scored repo straight to the top.
    await seed("fresh", 500, [{ total: 88, daysAgo: 1 }]);

    expect(await board()).toEqual([]);
  });

  it("excludes a repo that got worse", async () => {
    await seed("slipping", 500, [
      { total: 70, daysAgo: 20 },
      { total: 61, daysAgo: 1 },
    ]);

    expect(await board()).toEqual([]);
  });

  it("excludes a repo that stood still", async () => {
    await seed("flat", 500, [
      { total: 70, daysAgo: 20 },
      { total: 70, daysAgo: 1 },
    ]);

    expect(await board()).toEqual([]);
  });

  it("excludes gains that happened before the window", async () => {
    await seed("ancient", 500, [
      { total: 30, daysAgo: 200 },
      { total: 80, daysAgo: 150 },
    ]);

    expect(await board()).toEqual([]);
  });

  it("enforces the star floor that keeps throwaway repos off the homepage", async () => {
    // SPEC §9: this page is a public surface anyone can push a repo onto.
    await seed("tiny", 9, [
      { total: 20, daysAgo: 10 },
      { total: 90, daysAgo: 1 },
    ]);

    expect(await board()).toEqual([]);
    expect(await board({ minStars: 9 })).toHaveLength(1);
  });

  it("never mixes rubric versions into one gain", async () => {
    // A weight change moves every score at once. Counting it as improvement
    // would put the entire index on the board the day the rubric ships.
    await seed("reweighted", 500, [
      { total: 40, daysAgo: 20, rubricVersion: 1 },
      { total: 75, daysAgo: 1, rubricVersion: V },
    ]);

    expect(await board()).toEqual([]);
  });
});

describe("shape and limits", () => {
  it("honours the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await seed(`repo-${i}`, 100, [
        { total: 30, daysAgo: 10 },
        { total: 40 + i, daysAgo: 1 },
      ]);
    }

    expect(await board({ limit: 3 })).toHaveLength(3);
  });

  it("returns the shape the UI renders", async () => {
    await seed("shaped", 1234, [
      { total: 51, daysAgo: 10 },
      { total: 77, daysAgo: 1 },
    ]);

    expect((await board())[0]).toEqual({
      owner: "owner",
      name: "shaped",
      stars: 1234,
      total: 77,
      grade: "C",
      from: 51,
      delta: 26,
      repoId: expect.any(Number),
    });
  });

  it("is empty rather than throwing on a quiet database", async () => {
    expect(await board()).toEqual([]);
  });
});
