import { and, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";

import { SCORE_HISTORY_DAYS } from "@/lib/config";
import type { Grade, ScoreResult } from "@/lib/score/types";

import { db } from "./client";
import { repoAliases, repos, scores } from "./schema";

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

  /**
   * The slug the caller asked for, when it differs from the canonical one
   * GitHub returned — `facebook/react` for `react/react`, say. Recorded as an
   * alias so the next lookup by that name is a cache hit rather than another
   * six-call fan-out.
   */
  requestedSlug?: { owner: string; name: string };
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
    // A left join, so an alias is optional: most repos have none, and an inner
    // join would hide every repo that has never been renamed.
    .leftJoin(repoAliases, eq(repoAliases.repoId, repos.id))
    .where(matchesSlugOrAlias(slug))
    // scores_latest_idx serves exactly this ordering. The id breaks ties:
    // two rows written in the same millisecond share a timestamp, and without
    // it Postgres may return either — meaning the page could show a superseded
    // score while a newer one sits in the table.
    .orderBy(desc(scores.fetchedAt), desc(scores.id))
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

/** One point on the sparkline: a score, and the day it first read that way. */
export interface ScorePoint {
  total: number;
  grade: Grade;
  firstSeenAt: Date;
  /** When it was last confirmed. Equals `firstSeenAt` until a rescan agrees. */
  fetchedAt: Date;
}

/**
 * A repo's score over time, oldest first.
 *
 * Ordered and dated by `first_seen_at`, not `fetched_at`. The two diverge the
 * moment a rescan confirms an unchanged score: `fetched_at` jumps to today
 * while the score has in fact been unchanged for months. Plotting the former
 * would draw every stable repository as a vertical cluster at "now".
 *
 * Bounded by the same window the sweep enforces, so this can never return rows
 * the sweep has already promised to delete.
 */
export async function findScoreHistory(
  slug: { owner: string; name: string },
  options: { rubricVersion: number; now?: Date },
): Promise<ScorePoint[]> {
  const now = options.now ?? new Date();
  const since = new Date(
    now.getTime() - SCORE_HISTORY_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      total: scores.total,
      grade: scores.grade,
      firstSeenAt: scores.firstSeenAt,
      fetchedAt: scores.fetchedAt,
    })
    .from(scores)
    .innerJoin(repos, eq(scores.repoId, repos.id))
    .where(
      and(
        matchesSlug(slug),
        // Mixing rubric versions on one line would draw a cliff where the
        // weights changed, not where the repository did (SPEC §8).
        eq(scores.rubricVersion, options.rubricVersion),
        gte(scores.firstSeenAt, since),
      ),
    )
    .orderBy(scores.firstSeenAt);

  return rows;
}

/**
 * Upserts the repo, then either touches the newest score row or appends one.
 *
 * A rescan that finds nothing changed updates `fetched_at` in place instead of
 * writing a duplicate. Most rescans are exactly that: the rubric reads a dozen
 * booleans and two counts, and a repository does not usually differ six hours
 * later. Appending unconditionally meant the table measured how often people
 * looked, not how often anything changed — and the "Rescore now" button makes
 * that far worse than the 6-hour TTL ever did, since one caller can spend a
 * 30-per-hour budget on a single repo and write thirty identical rows.
 *
 * A row is still appended whenever the score actually differs, so the history
 * that survives is the history worth keeping: the points at which a repository
 * changed.
 *
 * Two requests racing on the same cold repo may still both append — the read
 * and the write are not in one transaction. That is the pre-existing tradeoff
 * (SPEC §8): locking to save one duplicate row is not worth the deadlock
 * surface, and the sweep collects it later.
 */
export async function saveScore(record: ScoreRecord): Promise<void> {
  const repoId = await upsertRepo(record);

  if (record.requestedSlug !== undefined) {
    await rememberAlias(repoId, record.requestedSlug, record);
  }

  const touched = await touchIfUnchanged(repoId, record);

  if (!touched) {
    await db.insert(scores).values({
      repoId,
      total: record.score.total,
      grade: record.score.grade,
      categories: record.score.categories,
      tips: record.score.tips,
      rubricVersion: record.rubricVersion,
    });
  }

  await maybeSweepHistory();
}

/**
 * Bumps the newest row's timestamp when the score it holds is identical.
 *
 * The comparison happens in Postgres, not in JavaScript, and that is the whole
 * design. `categories` and `tips` are `jsonb`, and **jsonb does not preserve
 * key order** — it normalises on write — so a `JSON.stringify` comparison
 * against the object that was inserted fails even when the two are the same
 * data. `jsonb =` is defined semantically and gets it right. This was found by
 * a test asserting thirty identical rescans produce one row; they produced
 * thirty.
 *
 * The `order by fetched_at desc, id desc` tie-break matters as much. Two saves
 * inside the same millisecond share a timestamp, and without the serial id to
 * break the tie Postgres may return either — so a rescan could compare itself
 * against a superseded row and append a duplicate of the current one.
 *
 * A row from an older rubric never matches, because `rubric_version` is in the
 * predicate: that is a different question, not a stale answer (SPEC §8), and
 * must be superseded rather than overwritten.
 *
 * @returns true when a row was updated and no insert is needed.
 */
async function touchIfUnchanged(
  repoId: number,
  record: ScoreRecord,
): Promise<boolean> {
  const updated = await db.execute<{ id: number }>(sql`
    update ${scores}
       -- Unqualified on purpose: Postgres rejects "scores"."fetched_at" as a
       -- SET target, and drizzle qualifies every column reference it expands.
       set fetched_at = now()
     where ${scores.id} = (
             select ${scores.id} from ${scores}
              where ${scores.repoId} = ${repoId}
              order by ${scores.fetchedAt} desc, ${scores.id} desc
              limit 1
           )
       and ${scores.total} = ${record.score.total}
       and ${scores.grade} = ${record.score.grade}
       and ${scores.rubricVersion} = ${record.rubricVersion}
       and ${scores.categories} = ${JSON.stringify(record.score.categories)}::jsonb
       and ${scores.tips} = ${JSON.stringify(record.score.tips)}::jsonb
    returning ${scores.id}
  `);

  return rowsOf(updated).length > 0;
}

/** The neon-http and PGlite drivers disagree on the shape they return. */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows : [];
}

/** Superseded rows are swept on roughly this share of writes — no cron. */
const SWEEP_PROBABILITY = 0.01;

/**
 * Deletes score rows that are both old and superseded.
 *
 * This table is insert-only by design — the latest row wins and the older
 * ones were simply never removed, so a continuously-viewed repo grew by four
 * rows a day indefinitely. Storage was tracking score *events* rather than
 * repositories, which is the shape that eventually fills any tier.
 *
 * Two conditions, and the second is the one that matters: a row must be past
 * the retention window **and** not be the newest for its repository. Age alone
 * would eventually delete the only score a rarely-visited repo has, turning
 * every subsequent visit into a cold six-call fan-out — a cache that empties
 * itself, which is worse than one that grows.
 *
 * Swept on a fraction of writes rather than on a schedule, like the rate-limit
 * counter above it: SPEC §3 says not to add a cron without a measured problem.
 */
async function maybeSweepHistory(): Promise<void> {
  if (Math.random() >= SWEEP_PROBABILITY) return;
  await sweepScoreHistory();
}

/** Exported for the integration test, which cannot wait on a 1% coin flip. */
export async function sweepScoreHistory(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(
    now.getTime() - SCORE_HISTORY_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    await db.execute(sql`
      delete from ${scores}
      where ${scores.fetchedAt} < ${cutoff}
        and ${scores.id} not in (
          select distinct on (${scores.repoId}) ${scores.id}
          from ${scores}
          order by ${scores.repoId}, ${scores.fetchedAt} desc
        )
    `);
  } catch (cause) {
    // Housekeeping must never fail the request that triggered it.
    console.error("[scores] history sweep failed", cause);
  }
}

/**
 * Matches on `github_id`, which survives renames and transfers, and
 * overwrites owner/name with the canonical values the API just returned
 * (SPEC §8).
 */
/**
 * Frees this slug if a *different* repository currently holds it.
 *
 * Deletes at most one row, and only when `github_id` differs — a repository
 * keeping its own slug is the overwhelmingly common case and touches nothing.
 * Any alias rows cascade with it, which is correct: they pointed at a
 * repository that no longer answers to this name.
 */
async function releaseSlugHeldByAnotherRepo(
  record: ScoreRecord,
): Promise<void> {
  await db
    .delete(repos)
    .where(
      and(
        eq(sql`lower(${repos.owner})`, record.owner.toLowerCase()),
        eq(sql`lower(${repos.name})`, record.name.toLowerCase()),
        ne(repos.githubId, record.githubId),
      ),
    );
}

async function upsertRepo(record: ScoreRecord): Promise<number> {
  // `repos` is unique on two things: `github_id`, the real identity, and the
  // slug. `ON CONFLICT` takes one target, so the other can still collide —
  // and it does, whenever a slug moves between repositories:
  //
  //   - a repository is deleted and recreated, keeping its name but getting a
  //     fresh `github_id` (observed on this very project);
  //   - one is renamed away from a slug and another takes it.
  //
  // The insert then finds no conflict on `github_id`, proceeds, and violates
  // the slug index instead. `saveScore` throws, `computeAndPersist` logs
  // "failed to persist score", and the caller still gets their number — so
  // nothing looks wrong while that repository is never cached again. Every
  // later request is a fresh six-call fan-out, permanently.
  //
  // The stale row is released first. Its scores cascade, which is the right
  // loss: they describe a *different* repository, and leaving them under a
  // slug that has moved would attribute one project's history to another.
  await releaseSlugHeldByAnotherRepo(record);

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

export interface TrendingRepo {
  owner: string;
  name: string;
  stars: number;
  total: number;
  grade: Grade;
  /** Exposed so the caller can fetch every row's trend in one query. */
  repoId: number;
}

/**
 * The score sequence for several repos at once, keyed by repo id.
 *
 * One query for the whole leaderboard. Asking per row would be twenty round
 * trips to draw twenty decorations, on a page whose entire job is a list.
 *
 * Returns totals only — the row sparkline plots shape, not dates, and sending
 * timestamps to render a 56-pixel line would be payload nobody reads.
 */
export async function findScoreTrends(
  repoIds: number[],
  options: { rubricVersion: number; now?: Date },
): Promise<Map<number, number[]>> {
  const trends = new Map<number, number[]>();
  if (repoIds.length === 0) return trends;

  const now = options.now ?? new Date();
  const since = new Date(
    now.getTime() - SCORE_HISTORY_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      repoId: scores.repoId,
      total: scores.total,
      firstSeenAt: scores.firstSeenAt,
    })
    .from(scores)
    .where(
      and(
        inArray(scores.repoId, repoIds),
        eq(scores.rubricVersion, options.rubricVersion),
        gte(scores.firstSeenAt, since),
      ),
    )
    .orderBy(scores.repoId, scores.firstSeenAt);

  for (const row of rows) {
    const existing = trends.get(row.repoId);
    if (existing) existing.push(row.total);
    else trends.set(row.repoId, [row.total]);
  }

  return trends;
}

/** A repo that gained points inside the window, and by how many. */
export interface ImprovedRepo {
  owner: string;
  name: string;
  stars: number;
  /** Where it stands now. */
  total: number;
  grade: Grade;
  /** Where it stood when the window opened. */
  from: number;
  /** `total - from`, always positive — a decline is not an improvement. */
  delta: number;
  repoId: number;
}

/**
 * Flow D′: the biggest score gains inside a window, ranked by gain.
 *
 * The leaderboard ranked by absolute score could only ever show the same
 * handful of enormous repositories, because nothing about a 95 changes. This
 * ranks by movement, which is the one thing GitCheckup knows and GitHub does
 * not — and a repo going 54 → 71 has done more work than one sitting at 95.
 *
 * Requires two scores in the window, so a repo scored once cannot appear: with
 * a single observation there is no "from" to subtract, and treating its first
 * score as a gain from zero would put every newly-scored repo at the top.
 *
 * `first_seen_at` is what bounds and orders the window — see the note on that
 * column. Using `fetched_at` would let a repo that merely got *looked at*
 * today claim its months-old improvement was recent.
 */
export async function findMostImproved(options: {
  limit: number;
  windowDays: number;
  minStars: number;
  rubricVersion: number;
  now?: Date;
}): Promise<ImprovedRepo[]> {
  const now = options.now ?? new Date();
  const since = new Date(
    now.getTime() - options.windowDays * 24 * 60 * 60 * 1000,
  );

  const result = await db.execute(sql`
    select r.owner, r.name, r.stars, w.repo_id,
           w.latest_total, w.latest_grade, w.earliest_total,
           (w.latest_total - w.earliest_total) as delta
      from (
        select repo_id,
               (array_agg(total order by first_seen_at desc, id desc))[1] as latest_total,
               (array_agg(grade order by first_seen_at desc, id desc))[1] as latest_grade,
               (array_agg(total order by first_seen_at asc,  id asc))[1]  as earliest_total
          from ${scores}
         where ${scores.rubricVersion} = ${options.rubricVersion}
           and ${scores.firstSeenAt} >= ${since}
         group by repo_id
        having count(*) >= 2
      ) w
      join ${repos} r on r.id = w.repo_id
     where r.stars >= ${options.minStars}
       and w.latest_total > w.earliest_total
     order by delta desc, w.latest_total desc, r.stars desc
     limit ${options.limit}
  `);

  return rowsOf(result).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      owner: String(r.owner),
      name: String(r.name),
      stars: Number(r.stars),
      total: Number(r.latest_total),
      grade: String(r.latest_grade) as Grade,
      from: Number(r.earliest_total),
      delta: Number(r.delta),
      repoId: Number(r.repo_id),
    };
  });
}

/**
 * Flow D: the latest score per repo inside a recent window, ranked.
 *
 * The star floor is deliberate. Without it the leaderboard is whatever anyone
 * last pasted, including repos named to be seen on our homepage — a repo
 * created to appear here would first need real stars (SPEC §9).
 */
export async function findTrending(options: {
  limit: number;
  windowDays: number;
  minStars: number;
  rubricVersion: number;
  now?: Date;
}): Promise<TrendingRepo[]> {
  const now = options.now ?? new Date();
  const since = new Date(
    now.getTime() - options.windowDays * 24 * 60 * 60 * 1000,
  );

  // DISTINCT ON collapses each repo's history to its newest row before
  // ranking, so a repo scored ten times does not appear ten times.
  const latest = db
    .selectDistinctOn([scores.repoId], {
      owner: repos.owner,
      name: repos.name,
      stars: repos.stars,
      total: scores.total,
      grade: scores.grade,
      repoId: scores.repoId,
    })
    .from(scores)
    .innerJoin(repos, eq(scores.repoId, repos.id))
    .where(
      and(
        gte(scores.fetchedAt, since),
        gte(repos.stars, options.minStars),
        eq(scores.rubricVersion, options.rubricVersion),
      ),
    )
    .orderBy(scores.repoId, desc(scores.fetchedAt))
    .as("latest");

  const rows = await db
    .select({
      owner: latest.owner,
      name: latest.name,
      stars: latest.stars,
      total: latest.total,
      grade: latest.grade,
      // Carried out so the caller can fetch every row's trend in one query
      // rather than one per row.
      repoId: latest.repoId,
    })
    .from(latest)
    .orderBy(desc(latest.total), desc(latest.stars))
    .limit(options.limit);

  return rows;
}

/** GitHub slugs are case-insensitive; repos_slug_idx indexes the same pair. */
function matchesSlug(slug: { owner: string; name: string }) {
  return and(
    eq(sql`lower(${repos.owner})`, slug.owner.toLowerCase()),
    eq(sql`lower(${repos.name})`, slug.name.toLowerCase()),
  );
}

/**
 * The repo's current slug, or any slug it used to answer to.
 *
 * Both halves in one predicate rather than two queries: on the Neon HTTP
 * driver every statement is its own request, so "look it up, then look up the
 * alias" would double the latency of the commonest read in the app to serve
 * the rarest case.
 */
function matchesSlugOrAlias(slug: { owner: string; name: string }) {
  return or(
    matchesSlug(slug),
    and(
      eq(sql`lower(${repoAliases.owner})`, slug.owner.toLowerCase()),
      eq(sql`lower(${repoAliases.name})`, slug.name.toLowerCase()),
    ),
  );
}

/**
 * Records that `requested` is another name for this repo.
 *
 * Only called when the two actually differ, so an unrenamed repo never writes
 * here. Conflicts are ignored rather than updated: the pair is the identity,
 * and a second request for the same old slug has nothing new to say.
 *
 * Failure is swallowed. This is an optimisation for later requests, and losing
 * it costs a cache miss — never the score the caller is waiting on.
 */
async function rememberAlias(
  repoId: number,
  requested: { owner: string; name: string },
  canonical: { owner: string; name: string },
): Promise<void> {
  const same =
    requested.owner.toLowerCase() === canonical.owner.toLowerCase() &&
    requested.name.toLowerCase() === canonical.name.toLowerCase();
  if (same) return;

  try {
    await db
      .insert(repoAliases)
      .values({ repoId, owner: requested.owner, name: requested.name })
      .onConflictDoNothing();
  } catch (cause) {
    console.error("[scores] could not record slug alias", cause);
  }
}
