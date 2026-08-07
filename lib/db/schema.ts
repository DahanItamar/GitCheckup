import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { CategoryScore, Grade, Tip } from "@/lib/score/types";

/**
 * The source of truth for SPEC §5's schema. Migrations are generated from
 * this file by `drizzle-kit generate` and committed; the SQL under drizzle/
 * is never hand-edited.
 */

export const repos = pgTable(
  "repos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    /** Survives renames and transfers — the real identity (SPEC §8). */
    githubId: bigint("github_id", { mode: "number" }).notNull().unique(),

    /** Canonical casing from the API, not from user input. */
    owner: text("owner").notNull(),
    name: text("name").notNull(),

    /** Denormalized for the trending star floor (SPEC §9). */
    stars: integer("stars").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // GitHub slugs are case-insensitive: Facebook/React and facebook/react
    // must be one row, not two (SPEC §8).
    uniqueIndex("repos_slug_idx").on(
      sql`lower(${table.owner})`,
      sql`lower(${table.name})`,
    ),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),

    total: smallint("total").notNull(),
    grade: text("grade").$type<Grade>().notNull(),

    /** Denormalized. Never queried by field — read whole, written whole. */
    categories: jsonb("categories").$type<CategoryScore[]>().notNull(),
    tips: jsonb("tips").$type<Tip[]>().notNull(),

    /** Bumped whenever rubric weights change; older rows are cache misses. */
    rubricVersion: smallint("rubric_version").notNull(),

    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("scores_total_range", sql`${table.total} between 0 and 100`),
    check(
      "scores_grade_valid",
      sql`${table.grade} in ('A+','A','B','C','D','F')`,
    ),

    /** Serves the cache lookup: latest score for one repo. */
    index("scores_latest_idx").on(table.repoId, table.fetchedAt.desc()),

    /** Serves /trending: recent window, ordered by score. */
    index("scores_trending_idx").on(table.fetchedAt.desc(), table.total.desc()),
  ],
);

/**
 * The rate-limit counter (SPEC §5).
 *
 * Holds an HMAC of an IP and nothing else, for at most two hours. No raw IPs,
 * no user identifiers — there is no PII in this database at all.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    /** `<hmac(ip)>:<epoch_hour>`. */
    bucketKey: text("bucket_key").primaryKey(),
    hits: integer("hits").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limit_expiry_idx").on(table.expiresAt)],
);

export type RepoRow = typeof repos.$inferSelect;
export type ScoreRow = typeof scores.$inferSelect;
