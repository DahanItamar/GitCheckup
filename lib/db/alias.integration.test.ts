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
 * Slug aliases, against real Postgres.
 *
 * GitHub keeps every old `owner/name` working forever — `facebook/react`
 * answers a 301 to `react/react`. The API reports the canonical identity, so
 * that is what gets stored, and a lookup by the requested slug found nothing:
 * every request for a renamed repo was a cold six-call fan-out, permanently.
 * Found on the first run against a real database, not by reading the code.
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

/** Scores the canonical repo, as if `requested` had been asked for. */
function save(
  canonical: { owner: string; name: string },
  requested?: { owner: string; name: string },
) {
  return saveScore({
    githubId: 10270250,
    owner: canonical.owner,
    name: canonical.name,
    stars: 247_102,
    isArchived: false,
    score: { ...RUBRIC, tips: [] },
    rubricVersion: 2,
    requestedSlug: requested,
  });
}

const CANONICAL = { owner: "react", name: "react" };
const OLD = { owner: "facebook", name: "react" };

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

describe("looking up a renamed repo", () => {
  it("finds it by the slug that was asked for", async () => {
    await save(CANONICAL, OLD);

    // The bug: this returned null, so every request re-fetched from GitHub.
    const found = await findLatestScore(OLD);

    expect(found).not.toBeNull();
    expect(found!.repo).toMatchObject(CANONICAL);
  });

  it("still finds it by its canonical slug", async () => {
    await save(CANONICAL, OLD);

    expect((await findLatestScore(CANONICAL))!.repo).toMatchObject(CANONICAL);
  });

  it("reports the canonical name, never the alias", async () => {
    await save(CANONICAL, OLD);

    // Otherwise the page would render a slug GitHub no longer uses.
    expect((await findLatestScore(OLD))!.repo.owner).toBe("react");
  });

  it("matches an alias case-insensitively, like GitHub", async () => {
    await save(CANONICAL, OLD);

    expect(
      await findLatestScore({ owner: "FaceBook", name: "REACT" }),
    ).not.toBeNull();
  });
});

describe("when to write an alias at all", () => {
  it("writes none when the requested slug is already canonical", async () => {
    await save(CANONICAL, CANONICAL);

    expect(await db.select().from(repoAliases)).toHaveLength(0);
  });

  it("writes none when no requested slug is supplied", async () => {
    await save(CANONICAL);

    expect(await db.select().from(repoAliases)).toHaveLength(0);
  });

  it("writes none for a case-only difference", async () => {
    // `Facebook/React` and `facebook/react` are one slug to GitHub, and
    // `repos_slug_idx` already matches case-insensitively.
    await save(CANONICAL, { owner: "React", name: "React" });

    expect(await db.select().from(repoAliases)).toHaveLength(0);
  });

  it("does not duplicate an alias across repeated scores", async () => {
    await save(CANONICAL, OLD);
    await save(CANONICAL, OLD);
    await save(CANONICAL, OLD);

    expect(await db.select().from(repoAliases)).toHaveLength(1);
  });
});

describe("what it must not break", () => {
  it("leaves an unrelated repo unfound", async () => {
    await save(CANONICAL, OLD);

    expect(
      await findLatestScore({ owner: "vercel", name: "next.js" }),
    ).toBeNull();
  });

  it("finds a repo that has no alias at all", async () => {
    // The left join must not hide the common case.
    await saveScore({
      githubId: 70107786,
      owner: "vercel",
      name: "next.js",
      stars: 100,
      isArchived: false,
      score: { ...RUBRIC, tips: [] },
      rubricVersion: 2,
    });

    expect(
      await findLatestScore({ owner: "vercel", name: "next.js" }),
    ).not.toBeNull();
  });
});
