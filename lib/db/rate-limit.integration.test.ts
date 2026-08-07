import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { rateLimitHits } from "./schema";
import {
  createTestPostgres,
  type TestDb,
  type TestPostgres,
} from "./test-postgres";

/**
 * The rate-limit counter against real Postgres. The upsert-and-increment is
 * one `ON CONFLICT` away from silently resetting every caller's budget on
 * every request, which no unit test would catch.
 */

const mocked = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./client", () => ({
  get db() {
    return mocked.db;
  },
}));

const { recordHit } = await import("./rate-limit");

const NOW = new Date("2026-08-07T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const expiry = new Date(NOW.getTime() + 2 * HOUR);

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
  await db.delete(rateLimitHits);
  // The sweep fires on ~1% of writes; keep it out of the way unless asked for.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordHit", () => {
  it("starts a new bucket at one", async () => {
    expect(await recordHit("caller-a:490000", expiry)).toBe(1);
  });

  it("increments rather than resetting — the whole point of the counter", async () => {
    const key = "caller-a:490000";
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) counts.push(await recordHit(key, expiry));

    expect(counts).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps callers independent", async () => {
    await recordHit("caller-a:490000", expiry);
    await recordHit("caller-a:490000", expiry);

    expect(await recordHit("caller-b:490000", expiry)).toBe(1);
    expect(await recordHit("caller-a:490000", expiry)).toBe(3);
  });

  it("keeps the same caller's hours independent", async () => {
    await recordHit("caller-a:490000", expiry);
    await recordHit("caller-a:490000", expiry);

    // Next epoch hour is a different bucket, so the budget resets.
    expect(await recordHit("caller-a:490001", expiry)).toBe(1);
  });

  it("stores exactly one row per bucket", async () => {
    for (let i = 0; i < 4; i++) await recordHit("caller-a:490000", expiry);

    const rows = await db.select().from(rateLimitHits);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hits).toBe(4);
    expect(rows[0]?.expiresAt).toBeInstanceOf(Date);
  });

  it("crosses the 30-per-hour threshold exactly once", async () => {
    const key = "heavy:490000";
    let firstOver = 0;
    for (let i = 1; i <= 35; i++) {
      const hits = await recordHit(key, expiry);
      if (hits > 30 && firstOver === 0) firstOver = i;
    }
    // The 31st request is the first one refused.
    expect(firstOver).toBe(31);
  });
});

describe("the opportunistic sweep", () => {
  it("deletes buckets whose expiry has passed, and spares live ones", async () => {
    await db.insert(rateLimitHits).values([
      {
        bucketKey: "expired-1",
        hits: 5,
        expiresAt: new Date(Date.now() - HOUR),
      },
      {
        bucketKey: "expired-2",
        hits: 9,
        expiresAt: new Date(Date.now() - 10 * HOUR),
      },
      { bucketKey: "live", hits: 2, expiresAt: new Date(Date.now() + HOUR) },
    ]);

    // Force the 1% branch.
    vi.spyOn(Math, "random").mockReturnValue(0);
    await recordHit("fresh", new Date(Date.now() + 2 * HOUR));

    const remaining = (await db.select().from(rateLimitHits))
      .map((r) => r.bucketKey)
      .sort();
    expect(remaining).toEqual(["fresh", "live"]);
  });

  it("leaves expired rows alone when the branch does not fire", async () => {
    await db.insert(rateLimitHits).values({
      bucketKey: "expired",
      hits: 1,
      expiresAt: new Date(Date.now() - HOUR),
    });

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    await recordHit("fresh", expiry);

    expect(await db.select().from(rateLimitHits)).toHaveLength(2);
  });
});
