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
import type { ScoreResult } from "@/lib/score/types";

import { repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * The persistence layer against real Postgres (PGlite), running the committed
 * migrations and the production query functions unchanged.
 *
 * `./client` is swapped for the test database rather than parameterising every
 * query — the code under test is exactly what ships.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { findLatestScore, saveScore } = await import("./scores");

let postgres: TestPostgres;
let db: TestDb;

beforeAll(async () => {
  postgres = await createTestPostgres();
  db = postgres.db;
  mocked.db = db;
});

afterAll(async () => {
  await postgres.close();
});

beforeEach(async () => {
  // Cascades to scores.
  await db.delete(repos);
});

const score = (
  total: number,
  overrides: Partial<ScoreResult> = {},
): ScoreResult => ({
  total,
  grade: "A",
  categories: [
    {
      key: "docs",
      label: "Docs",
      earned: 23,
      available: 25,
      checks: [
        { id: "has-readme", label: "README present", earned: 6, available: 6 },
      ],
    },
  ],
  tips: [{ checkId: "has-license", text: "Add a LICENSE file.", points: 8 }],
  ...overrides,
});

const record = (over: Partial<Parameters<typeof saveScore>[0]> = {}) => ({
  githubId: 1,
  owner: "facebook",
  name: "react",
  stars: 100,
  isArchived: false,
  score: score(83),
  rubricVersion: RUBRIC_VERSION,
  ...over,
});

describe("the migrations", () => {
  it("apply cleanly and create all three tables", async () => {
    const rows = await db.execute<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = rows.rows.map((r) => r.table_name);

    expect(names).toContain("repos");
    expect(names).toContain("scores");
    expect(names).toContain("rate_limit_hits");
  });

  it("creates the indexes the queries depend on", async () => {
    const rows = await db.execute<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const names = rows.rows.map((r) => r.indexname);

    expect(names).toContain("repos_slug_idx");
    expect(names).toContain("scores_latest_idx");
    expect(names).toContain("scores_trending_idx");
    expect(names).toContain("rate_limit_expiry_idx");
  });
});

describe("saveScore → findLatestScore", () => {
  it("round-trips a score, jsonb and all", async () => {
    await saveScore(record());
    const cached = await findLatestScore({ owner: "facebook", name: "react" });

    expect(cached).not.toBeNull();
    expect(cached?.repo).toEqual({
      owner: "facebook",
      name: "react",
      stars: 100,
    });
    expect(cached?.score.total).toBe(83);
    expect(cached?.score.grade).toBe("A");
    expect(cached?.rubricVersion).toBe(RUBRIC_VERSION);
    // The jsonb columns must survive as structures, not strings.
    expect(cached?.score.categories[0]?.checks[0]?.id).toBe("has-readme");
    expect(cached?.score.tips[0]?.points).toBe(8);
    expect(cached?.fetchedAt).toBeInstanceOf(Date);
  });

  it("returns null for a repo it has never seen", async () => {
    expect(
      await findLatestScore({ owner: "nobody", name: "nothing" }),
    ).toBeNull();
  });

  it("finds a repo whatever case the caller used", async () => {
    await saveScore(record());

    for (const slug of [
      { owner: "Facebook", name: "React" },
      { owner: "FACEBOOK", name: "REACT" },
      { owner: "facebook", name: "react" },
    ]) {
      expect((await findLatestScore(slug))?.repo.name).toBe("react");
    }
  });

  it("appends rather than overwrites, and returns the newest", async () => {
    await saveScore(record({ score: score(70) }));
    await saveScore(record({ score: score(90) }));

    const all = await db.select().from(scores);
    expect(all).toHaveLength(2);
    expect(
      (await findLatestScore({ owner: "facebook", name: "react" }))?.score
        .total,
    ).toBe(90);
  });
});

describe("the repo upsert", () => {
  it("keeps one row per github_id and overwrites the slug on rename", async () => {
    await saveScore(
      record({ githubId: 42, owner: "old-owner", name: "old-name" }),
    );
    await saveScore(
      record({
        githubId: 42,
        owner: "new-owner",
        name: "new-name",
        stars: 500,
      }),
    );

    const all = await db.select().from(repos);
    expect(all).toHaveLength(1);
    expect(all[0]?.owner).toBe("new-owner");
    expect(all[0]?.stars).toBe(500);

    // History survives the rename and is reachable at the new slug.
    expect(
      await findLatestScore({ owner: "new-owner", name: "new-name" }),
    ).not.toBeNull();
    expect(
      await findLatestScore({ owner: "old-owner", name: "old-name" }),
    ).toBeNull();
  });

  it("keeps distinct repos apart", async () => {
    await saveScore(record({ githubId: 1, owner: "a", name: "one" }));
    await saveScore(record({ githubId: 2, owner: "b", name: "two" }));

    expect(await db.select().from(repos)).toHaveLength(2);
  });
});

describe("the CHECK constraints", () => {
  it("refuses a total outside 0–100", async () => {
    await expect(saveScore(record({ score: score(101) }))).rejects.toThrow();
    await expect(saveScore(record({ score: score(-1) }))).rejects.toThrow();
  });

  it("refuses a grade outside the six", async () => {
    const bogus = score(50, { grade: "E" as never });
    await expect(saveScore(record({ score: bogus }))).rejects.toThrow();
  });

  it("accepts every legitimate grade", async () => {
    const grades = ["A+", "A", "B", "C", "D", "F"] as const;
    for (const [index, grade] of grades.entries()) {
      await saveScore(
        record({
          githubId: 100 + index,
          name: `repo-${index}`,
          score: score(75, { grade }),
        }),
      );
    }
    expect(await db.select().from(scores)).toHaveLength(grades.length);
  });
});
