import { and, desc, eq, sql } from "drizzle-orm";

import type { ScoreResult } from "@/lib/score/types";

import { db } from "./client";
import { repos, scores } from "./schema";

/**
 * Every score read and write in the system (SPEC §3). Nothing above this
 * layer emits SQL, and nothing in it knows what a GitHub API response is.
 */

export interface CachedScore {
  repo: { owner: string; name: string; stars: number };
  score: ScoreResult;
  fetchedAt: Date;
  rubricVersion: number;
}

/** What a scoring run produces and this module persists. */
export interface ScoreRecord {
  githubId: number;
  owner: string;
  name: string;
  stars: number;
  isArchived: boolean;
  score: ScoreResult;
  rubricVersion: number;
}

/**
 * The latest score for a repo, at any age. Freshness is decided by
 * `lib/services/freshness.ts`, not here — this returns the row and lets the
 * caller judge it, so the "GitHub is down, serve whatever we have" path in
 * SPEC §8 can reach an expired row.
 */
export async function findLatestScore(slug: {
  owner: string;
  name: string;
}): Promise<CachedScore | null> {
  const rows = await db
    .select({
      owner: repos.owner,
      name: repos.name,
      stars: repos.stars,
      total: scores.total,
      grade: scores.grade,
      categories: scores.categories,
      tips: scores.tips,
      rubricVersion: scores.rubricVersion,
      fetchedAt: scores.fetchedAt,
    })
    .from(scores)
    .innerJoin(repos, eq(scores.repoId, repos.id))
    .where(matchesSlug(slug))
    // scores_latest_idx serves exactly this ordering.
    .orderBy(desc(scores.fetchedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    repo: { owner: row.owner, name: row.name, stars: row.stars },
    score: {
      total: row.total,
      grade: row.grade,
      categories: row.categories,
      tips: row.tips,
    },
    fetchedAt: row.fetchedAt,
    rubricVersion: row.rubricVersion,
  };
}

/**
 * Upserts the repo and appends a score row.
 *
 * `scores` is append-only, so two requests racing on the same cold repo
 * simply write two rows and the latest wins — locking to save one duplicate
 * fetch isn't worth the deadlock surface (SPEC §8).
 */
export async function saveScore(record: ScoreRecord): Promise<void> {
  const repoId = await upsertRepo(record);

  await db.insert(scores).values({
    repoId,
    total: record.score.total,
    grade: record.score.grade,
    categories: record.score.categories,
    tips: record.score.tips,
    rubricVersion: record.rubricVersion,
  });
}

/**
 * Matches on `github_id`, which survives renames and transfers, and
 * overwrites owner/name with the canonical values the API just returned
 * (SPEC §8).
 */
async function upsertRepo(record: ScoreRecord): Promise<number> {
  const rows = await db
    .insert(repos)
    .values({
      githubId: record.githubId,
      owner: record.owner,
      name: record.name,
      stars: record.stars,
      isArchived: record.isArchived,
    })
    .onConflictDoUpdate({
      target: repos.githubId,
      set: {
        owner: record.owner,
        name: record.name,
        stars: record.stars,
        isArchived: record.isArchived,
        updatedAt: new Date(),
      },
    })
    .returning({ id: repos.id });

  const row = rows[0];
  if (!row) {
    throw new Error(`Upsert returned no row for github_id ${record.githubId}`);
  }
  return row.id;
}

/** GitHub slugs are case-insensitive; repos_slug_idx indexes the same pair. */
function matchesSlug(slug: { owner: string; name: string }) {
  return and(
    eq(sql`lower(${repos.owner})`, slug.owner.toLowerCase()),
    eq(sql`lower(${repos.name})`, slug.name.toLowerCase()),
  );
}
