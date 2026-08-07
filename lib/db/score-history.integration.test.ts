import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { SCORE_HISTORY_DAYS } from "@/lib/config";

import { repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * The score-history sweep, against real Postgres.
 *
 * The delete has one safety property and it is not "removes old rows": it must
 * never remove a repository's newest score, however old that score is. Get
 * that wrong and the cache empties itself — every subsequent visit to a
 * long-tail repo becomes a cold six-call fan-out, which is worse than the
 * unbounded growth this replaces. A unit test cannot check it; the correctness
 * lives entirely in `distinct on` and how Postgres orders it.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { sweepScoreHistory } = await import("./scores");

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let postgres: TestPostgres;
let db: TestDb;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

async function seedRepo(id: number, name: string): Promise<number> {
  const rows = await db
    .insert(repos)
    .values({ githubId: id, owner: "owner", name, stars: 100 })
    .returning({ id: repos.id });

  return rows[0]!.id;
}

async function seedScore(repoId: number, fetchedAt: Date, total: number) {
  await db.insert(scores).values({
    repoId,
    total,
    grade: "B",
    categories: [],
    tips: [],
    rubricVersion: 2,
    fetchedAt,
  });
}

async function remaining(repoId: number): Promise<number[]> {
  const rows = await db
    .select({ total: scores.total })
    .from(scores)
    .where(sql`${scores.repoId} = ${repoId}`)
    .orderBy(scores.total);

  return rows.map((row) => row.total);
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

describe("sweepScoreHistory", () => {
  it("keeps the newest score even when it is far older than the window", async () => {
    // The case that matters. A repo scored once, two years ago, and never
    // revisited: age alone would delete the only row it has.
    const repoId = await seedRepo(1, "abandoned");
    await seedScore(repoId, daysAgo(SCORE_HISTORY_DAYS * 20), 61);

    await sweepScoreHistory(NOW);

    expect(await remaining(repoId)).toEqual([61]);
  });

  it("drops superseded rows past the window", async () => {
    const repoId = await seedRepo(2, "busy");
    await seedScore(repoId, daysAgo(400), 40);
    await seedScore(repoId, daysAgo(200), 50);
    await seedScore(repoId, daysAgo(100), 60);
    await seedScore(repoId, daysAgo(1), 70);

    await sweepScoreHistory(NOW);

    expect(await remaining(repoId)).toEqual([70]);
  });

  it("keeps superseded rows inside the window, for a future trend view", async () => {
    const repoId = await seedRepo(3, "recent");
    await seedScore(repoId, daysAgo(SCORE_HISTORY_DAYS - 1), 55);
    await seedScore(repoId, daysAgo(2), 65);

    await sweepScoreHistory(NOW);

    expect(await remaining(repoId)).toEqual([55, 65]);
  });

  it("keeps a row exactly on the boundary", async () => {
    const repoId = await seedRepo(4, "boundary");
    await seedScore(repoId, daysAgo(SCORE_HISTORY_DAYS), 45);
    await seedScore(repoId, daysAgo(0), 75);

    await sweepScoreHistory(NOW);

    // `<` not `<=`: a row written the instant the window opened is inside it.
    expect(await remaining(repoId)).toEqual([45, 75]);
  });

  it("treats each repository separately", async () => {
    // The `distinct on` groups by repo_id. A sweep that computed one global
    // "newest" would keep a single row for the whole table and delete every
    // other repository's current score.
    const a = await seedRepo(5, "alpha");
    const b = await seedRepo(6, "beta");
    await seedScore(a, daysAgo(500), 31);
    await seedScore(b, daysAgo(900), 32);

    await sweepScoreHistory(NOW);

    expect(await remaining(a)).toEqual([31]);
    expect(await remaining(b)).toEqual([32]);
  });

  it("is a no-op on an empty table", async () => {
    await expect(sweepScoreHistory(NOW)).resolves.toBeUndefined();
  });

  it("is idempotent", async () => {
    const repoId = await seedRepo(7, "twice");
    await seedScore(repoId, daysAgo(300), 20);
    await seedScore(repoId, daysAgo(1), 80);

    await sweepScoreHistory(NOW);
    const first = await remaining(repoId);
    await sweepScoreHistory(NOW);

    expect(await remaining(repoId)).toEqual(first);
  });
});
