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

import { repoAliases, repos, scores } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * When a slug moves from one repository to another.
 *
 * `repos` is unique on `github_id` *and* on the slug, but `ON CONFLICT` takes
 * one target. Insert a new `github_id` carrying a slug another row already
 * holds and the conflict lands on the index that is not the target, so the
 * whole statement throws. `computeAndPersist` catches it, the caller still
 * gets a score, and nothing appears wrong — while that repository is never
 * cached again and every request re-runs the six-call fan-out.
 *
 * Two ways it happens in the wild, and the first one happened to this project:
 * a repository deleted and recreated keeps its name and gets a fresh id, and a
 * repository renamed away from a slug leaves it for someone else to take.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { saveScore, findLatestScore } = await import("./scores");

const RUBRIC = score(PERFECT, new Date("2026-08-07T00:00:00Z"));
const SLUG = { owner: "acme", name: "widget" };

let postgres: TestPostgres;
let db: TestDb;

function save(
  githubId: number,
  total: number,
  slug: { owner: string; name: string } = SLUG,
) {
  return saveScore({
    githubId,
    owner: slug.owner,
    name: slug.name,
    stars: 1,
    isArchived: false,
    score: { ...RUBRIC, total, tips: [] },
    rubricVersion: 2,
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
  await db.delete(repoAliases);
  await db.delete(repos);
});

describe("a repository recreated under the same slug", () => {
  it("saves without throwing", async () => {
    await save(111, 70);

    // The bug: this threw a unique violation on repos_slug_idx.
    await expect(save(222, 88)).resolves.toBeUndefined();
  });

  it("caches the new repository, so later requests are hits", async () => {
    await save(111, 70);
    await save(222, 88);

    // Not caching it was the real cost — a permanent six-call fan-out per
    // request, with nothing in the logs a user would ever see.
    expect((await findLatestScore(SLUG))?.score.total).toBe(88);
  });

  it("leaves exactly one row holding the slug", async () => {
    await save(111, 70);
    await save(222, 88);

    const rows = await db.select().from(repos);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.githubId).toBe(222);
  });

  it("does not keep the old repository's scores under the new one", async () => {
    await save(111, 70);
    await save(222, 88);

    // They describe a different project. Attributing them to the newcomer
    // would be worse than losing them.
    const totals = (await db.select().from(scores)).map((s) => s.total);

    expect(totals).toEqual([88]);
  });
});

describe("what it must not disturb", () => {
  it("leaves a repository keeping its own slug untouched", async () => {
    await save(111, 70);
    await save(111, 75);

    const rows = await db.select().from(repos);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.githubId).toBe(111);
    expect((await findLatestScore(SLUG))?.score.total).toBe(75);
  });

  it("keeps history across an ordinary rescore", async () => {
    await save(111, 70);
    await save(111, 75);

    expect(await db.select().from(scores)).toHaveLength(2);
  });

  it("leaves a different repository's slug alone", async () => {
    await save(111, 70);
    await save(222, 88, { owner: "other", name: "project" });

    expect(await db.select().from(repos)).toHaveLength(2);
    expect((await findLatestScore(SLUG))?.score.total).toBe(70);
  });
});
