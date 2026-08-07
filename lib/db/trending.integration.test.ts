import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { RUBRIC_VERSION } from "@/lib/config";
import type { Grade } from "@/lib/score/types";

import { repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * Flow D against real Postgres. `DISTINCT ON` inside a subquery is the one
 * piece of SQL here that no type checker can vouch for.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { findTrending } = await import("./scores");

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let postgres: TestPostgres;
let db: TestDb;
let nextId = 1;

beforeAll(async () => {
  postgres = await createTestPostgres();
  db = postgres.db;
  mocked.db = db;
});

afterAll(async () => {
  await postgres.close();
});

beforeEach(async () => {
  await db.delete(repos);
  nextId = 1;
});

async function seed(options: {
  name: string;
  stars: number;
  /** One entry per scoring run, oldest first. */
  runs: Array<{ total: number; daysAgo: number; rubricVersion?: number }>;
}): Promise<void> {
  const githubId = nextId++;
  const inserted = await db
    .insert(repos)
    .values({
      githubId,
      owner: "owner",
      name: options.name,
      stars: options.stars,
    })
    .returning({ id: repos.id });

  const repoId = inserted[0]!.id;

  for (const run of options.runs) {
    await db.insert(scores).values({
      repoId,
      total: run.total,
      grade: "A" as Grade,
      categories: [],
      tips: [],
      rubricVersion: run.rubricVersion ?? RUBRIC_VERSION,
      fetchedAt: new Date(NOW.getTime() - run.daysAgo * DAY),
    });
  }
}

const trending = (over: Partial<Parameters<typeof findTrending>[0]> = {}) =>
  findTrending({
    limit: 20,
    windowDays: 7,
    minStars: 50,
    rubricVersion: RUBRIC_VERSION,
    now: NOW,
    ...over,
  });

describe("findTrending", () => {
  it("returns nothing when nothing has been scored", async () => {
    expect(await trending()).toEqual([]);
  });

  it("collapses a repo's history to its newest score", async () => {
    // Scored three times; only the most recent should appear, once.
    await seed({
      name: "busy",
      stars: 100,
      runs: [
        { total: 40, daysAgo: 5 },
        { total: 60, daysAgo: 3 },
        { total: 95, daysAgo: 1 },
      ],
    });

    const rows = await trending();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(95);
  });

  it("ranks by score descending", async () => {
    await seed({ name: "low", stars: 100, runs: [{ total: 51, daysAgo: 1 }] });
    await seed({ name: "high", stars: 100, runs: [{ total: 97, daysAgo: 1 }] });
    await seed({ name: "mid", stars: 100, runs: [{ total: 74, daysAgo: 1 }] });

    expect((await trending()).map((r) => r.name)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  it("breaks a tie on stars, so the board is deterministic", async () => {
    await seed({ name: "fewer", stars: 60, runs: [{ total: 80, daysAgo: 1 }] });
    await seed({
      name: "more",
      stars: 9000,
      runs: [{ total: 80, daysAgo: 1 }],
    });

    expect((await trending()).map((r) => r.name)).toEqual(["more", "fewer"]);
  });

  it("enforces the 50-star floor", async () => {
    await seed({
      name: "famous",
      stars: 50,
      runs: [{ total: 60, daysAgo: 1 }],
    });
    await seed({
      name: "obscure",
      stars: 49,
      runs: [{ total: 99, daysAgo: 1 }],
    });

    // The obscure repo scores higher and is still excluded — that is the point
    // of the floor (SPEC §9).
    expect((await trending()).map((r) => r.name)).toEqual(["famous"]);
  });

  it("only counts scores inside the window", async () => {
    await seed({
      name: "recent",
      stars: 100,
      runs: [{ total: 60, daysAgo: 6 }],
    });
    await seed({
      name: "ancient",
      stars: 100,
      runs: [{ total: 99, daysAgo: 8 }],
    });

    expect((await trending()).map((r) => r.name)).toEqual(["recent"]);
  });

  it("ignores scores written by a different rubric version", async () => {
    await seed({
      name: "current",
      stars: 100,
      runs: [{ total: 60, daysAgo: 1 }],
    });
    await seed({
      name: "stale-rubric",
      stars: 100,
      runs: [{ total: 99, daysAgo: 1, rubricVersion: RUBRIC_VERSION - 1 }],
    });

    expect((await trending()).map((r) => r.name)).toEqual(["current"]);
  });

  it("falls back to an older in-window run when the newest is out of window", async () => {
    // DISTINCT ON runs after the WHERE clause, so the out-of-window row is
    // filtered before the collapse and must not hide the eligible one.
    await seed({
      name: "mixed",
      stars: 100,
      runs: [
        { total: 55, daysAgo: 3 },
        { total: 88, daysAgo: 30 },
      ],
    });

    const rows = await trending();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(55);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 8; i++) {
      await seed({
        name: `repo-${i}`,
        stars: 100,
        runs: [{ total: 60 + i, daysAgo: 1 }],
      });
    }

    expect(await trending({ limit: 3 })).toHaveLength(3);
    expect(await trending({ limit: 20 })).toHaveLength(8);
  });

  it("returns the shape the UI renders", async () => {
    await seed({
      name: "shaped",
      stars: 1234,
      runs: [{ total: 77, daysAgo: 1 }],
    });

    expect(await trending()).toEqual([
      { owner: "owner", name: "shaped", stars: 1234, total: 77, grade: "A" },
    ]);
  });
});
