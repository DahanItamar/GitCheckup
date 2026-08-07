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

import { score } from "@/lib/score/rubric";
import { PERFECT } from "@/lib/score/fixtures";

import { repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * Rescanning must not grow the table when nothing changed.
 *
 * `scores` used to append on every save, so the row count measured how often
 * people looked rather than how often anything changed. With "Rescore now"
 * wired to a 30-per-hour budget, one caller could spend all of it on a single
 * repository and write thirty identical rows.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { saveScore, findLatestScore } = await import("./scores");

let postgres: TestPostgres;
let db: TestDb;

const RUBRIC = score(PERFECT, new Date("2026-08-07T00:00:00Z"));
const SLUG = { owner: "acme", name: "widget" };

function record(overrides: { total?: number; rubricVersion?: number } = {}) {
  return {
    githubId: 42,
    owner: SLUG.owner,
    name: SLUG.name,
    stars: 5,
    isArchived: false,
    score: { ...RUBRIC, total: overrides.total ?? RUBRIC.total, tips: [] },
    rubricVersion: overrides.rubricVersion ?? 2,
  };
}

async function rowCount(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(scores);
  return rows[0]!.n;
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

describe("saveScore", () => {
  it("writes one row for the first scan", async () => {
    await saveScore(record());

    expect(await rowCount()).toBe(1);
  });

  it("keeps one row across repeated identical rescans", async () => {
    for (let i = 0; i < 30; i++) await saveScore(record());

    // Thirty rescans — a full hour of one caller's budget spent on one repo.
    expect(await rowCount()).toBe(1);
  });

  it("moves the timestamp forward on an unchanged rescan", async () => {
    await saveScore(record());
    const first = (await findLatestScore(SLUG))!.fetchedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveScore(record());
    const second = (await findLatestScore(SLUG))!.fetchedAt;

    // The row is the same one, but it is genuinely fresh — otherwise the TTL
    // would treat a just-refreshed score as stale and refetch it forever.
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    expect(await rowCount()).toBe(1);
  });

  it("appends when the score actually changes", async () => {
    await saveScore(record({ total: 70 }));
    await saveScore(record({ total: 85 }));

    // The history that survives is the history worth keeping: the points at
    // which the repository changed.
    expect(await rowCount()).toBe(2);
    expect((await findLatestScore(SLUG))!.score.total).toBe(85);
  });

  it("appends rather than overwriting a row from an older rubric", async () => {
    await saveScore(record({ total: 70, rubricVersion: 1 }));
    await saveScore(record({ total: 70, rubricVersion: 2 }));

    // Same number, different question (SPEC §8). Overwriting would lose the
    // fact that v1 ever produced it.
    expect(await rowCount()).toBe(2);
    expect((await findLatestScore(SLUG))!.rubricVersion).toBe(2);
  });

  it("still serves the newest score after a touch", async () => {
    await saveScore(record({ total: 70 }));
    await saveScore(record({ total: 85 }));
    await saveScore(record({ total: 85 }));

    const latest = await findLatestScore(SLUG);

    expect(latest?.score.total).toBe(85);
    expect(await rowCount()).toBe(2);
  });
});
