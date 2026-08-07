# RepoGauge — Technical Spec

> Status: M1–M5 built · 2026-08-07 · Spec version 1.2
>
> Reconciled against the implementation as each milestone landed. Notes are
> tagged **[M1]**–**[M5]** with the milestone that taught us the design was
> wrong. Nothing below is aspirational unless it says so.
>
> **Verified:** the migrations and every query in `lib/db/` run against real
> Postgres in CI, via PGlite. What remains unproven is the Neon HTTP transport
> and a live deployment — not the SQL.

## 1. Problem & Users

Deciding whether an unfamiliar GitHub repo is worth adopting means opening six tabs — is there a LICENSE, is it still maintained, does CI run, is the README more than a title? Maintainers have the mirror-image problem: they don't know which of those signals they're missing until someone tells them. Both audiences currently eyeball it, inconsistently.

RepoGauge turns a repo URL into a single 0–100 score with a category breakdown and a fixed list of concrete fixes, plus a share card and README badge that make the score portable.

**Primary user:** a developer evaluating or maintaining a public repo, who wants a defensible one-number answer in under three seconds.
**Success looks like:** paste `facebook/react`, get a score and a breakdown in <3s cold / <500ms cached, and be able to copy a Markdown snippet that renders a card in your own README.

Distribution is a product requirement, not a nice-to-have: the result page URL, the OG image, and the README embed are the acquisition surfaces. They are specified in §6 and built in M3, not deferred.

---

## 2. Scope

### In scope

- Paste `owner/repo`, a full GitHub URL, or a `git@` clone URL, and get a score
- Overall 0–100 score with a letter grade, and a five-category breakdown with per-category points earned/available
- A deterministic ordered list of improvement tips derived from which rubric checks failed
- A permanent shareable result URL: `/r/{owner}/{repo}`
- A 1200×630 PNG card at `/api/og`, used both as the page's OG meta image and as a README embed
- A small SVG badge at `/api/badge` for README embedding
- "Copy Markdown" and "Download PNG" on the result page
- A `/trending` page listing recently-scored repos, ranked by score
- Public JSON API at `/api/score` returning the full result

### Explicitly out of scope

- **GitHub App install, OAuth, any authenticated user session** — the product's zero-permission posture is the point. A repo is scored using nothing but public data.
- **Private repos** — follows from the above.
- **Accounts, billing, custom themes** — v2 at the earliest.
- **Deep SAST, full dependency graphs, Dependabot/security-alert data** — all require elevated permissions or a code checkout. v2.
- **Score history charts over time** — the `scores` table records every scoring run, so the data will exist from M2 onward, but no UI reads it in v1.
- **Auto-updating badge with a stable cache** — the v1 badge reflects the last score in the DB; GitHub's Camo proxy caches it aggressively and we do not fight that.
- **Comparing two repos side by side** — the obvious v2 feature. Deliberately not in v1; it doubles the UI surface.
- **Submitting a repo for re-scoring on a schedule** — no cron, no workers. Scores refresh lazily on view (§7).

---

## 3. Architecture

### Overview

One Next.js application on Vercel. There is no separate backend, no queue, and no Redis. Postgres is the score cache, the trending data source, and the rate-limit counter — three jobs, one dependency. The scoring rubric is a pure function that takes a plain data structure and returns a plain data structure, which is what makes it testable without a network or a database.

The only component that talks to `api.github.com` is `lib/github/`. The only component that emits SQL is `lib/db/`. Everything else composes them.

```
                    ┌──────────────────────────────────────┐
  Browser ─HTTP────▶│  Next.js App (Vercel, Node runtime)  │
  GitHub Camo ─────▶│                                       │
  (README embeds)   │  app/r/[owner]/[repo]  (RSC page)    │
                    │  app/trending          (RSC page)    │
                    │  app/api/score         (JSON)        │
                    │  app/api/og            (PNG)         │
                    │  app/api/badge         (SVG)         │
                    │             │                         │
                    │             ▼ direct fn call          │
                    │  lib/services/score-repo.ts           │
                    │      │            │           │       │
                    └──────┼────────────┼───────────┼───────┘
                           │            │           │
                  SQL over │       HTTPS│      pure │ fn call
                  HTTP     │    REST/JSON│           │
                           ▼            ▼           ▼
                  ┌────────────┐  ┌──────────┐  ┌──────────────┐
                  │  Neon      │  │ GitHub   │  │ lib/score    │
                  │  Postgres  │  │ REST API │  │ (pure, no IO)│
                  └────────────┘  └──────────┘  └──────────────┘
```

### Components

| Component       | Responsibility                                                                                                                                                         | Technology                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `app/`          | Routing, rendering, HTTP request/response shaping, cache headers. Contains no scoring logic and no SQL.                                                                | Next.js 16 App Router, React 19, TypeScript 5.9 |
| `lib/github/`   | The only code that calls `api.github.com`. Fans out the six-call signal fetch, normalizes it to `RepoSignals`, maps upstream failures to typed errors. Does not score. | `fetch` + a hand-rolled client (no Octokit)     |
| `lib/score/`    | Pure rubric. `RepoSignals` → `ScoreResult`. Imports nothing from `lib/db`, `lib/github`, or React.                                                                     | Plain TypeScript                                |
| `lib/tips/`     | Turns failed rubric checks into ordered advice, behind a `TipProvider` interface so an LLM provider can be added later without touching `lib/score`.                   | Plain TypeScript                                |
| `lib/db/`       | Drizzle schema, migrations, and every query in the system.                                                                                                             | Drizzle ORM + `@neondatabase/serverless`        |
| `lib/services/` | Orchestration: cache lookup → freshness check → fetch → score → persist. Where the transaction boundary is.                                                            | Plain TypeScript                                |
| Neon Postgres   | Score cache, trending source, rate-limit counters.                                                                                                                     | Neon serverless Postgres (free tier)            |

### Decisions

**Database** — Neon serverless Postgres, accessed via `@neondatabase/serverless` over HTTP.
Because: §2 requires a trending page and a persistent cache that survives serverless cold starts and is shared across all Vercel instances. Neon's HTTP driver issues each query as a stateless HTTP request, which means no connection pool to exhaust — the failure mode that kills naive Postgres-on-serverless setups.
Instead of: Upstash Redis — a pure cache, but it cannot answer "top 20 repos scored this week" without a second data store. Instead of: node-postgres with a pool — exhausts Neon's free-tier connection cap under exactly the traffic spike we're designing for.
Revisit if: sustained write volume makes per-query HTTP round trips the bottleneck, at which point switch to Neon's pooled WebSocket driver.

**ORM** — Drizzle ORM with `drizzle-kit` migrations.
Because: it compiles to plain SQL strings with no query engine binary, so cold start stays in the tens of milliseconds.
Instead of: Prisma — ships a native engine that inflates the serverless bundle and cold start. Instead of: raw SQL — loses type inference across the `categories`/`tips` JSONB columns.
Revisit if: never, for this scale.

**No Redis, no queue, no worker** — Postgres is the only stateful dependency.
Because: every derivation rule says don't add a cache or a broker without a measured problem. The score cache is a table with a timestamp; the rate limiter is an upsert.
Revisit if: rate-limit upserts become a measurable share of DB time — the fix is a Redis counter, not a redesign.

**Scoring is a pure function, isolated from IO** — **[M1]** `score(signals: RepoSignals, now?: Date): RubricResult`.
Because: the rubric is the product, it will be tuned constantly, and every tuning change needs a fast unit test rather than a live GitHub call. Also lets the OG route and the JSON route share one implementation with zero risk of divergence.
Instead of: scoring inline in the route handler — guarantees the rubric drifts between the API and the card.
**[M1] Two corrections the implementation forced.** The clock is a parameter, not a `new Date()` inside: three activity tiers are defined in days-since-push, and without an injectable clock they are untestable and the JSON route and the card could disagree by a second. And the return type stops at `RubricResult` (`ScoreResult` minus `tips`) — tips come from a provider that is async by interface, so `lib/services/` assembles the two halves. Nothing about the purity claim changes.

**Tips are deterministic rules in v1, behind a `TipProvider` interface** — `RuleTipProvider` is the only implementation that ships.
Because: tips render inside the OG image, which must be fast, free, and identical on every render. An LLM in that path adds latency, cost, and non-determinism to the hot path.
Instead of: Claude-generated tips — better prose, but they become a new upstream failure mode in the render path. The interface exists so a `ClaudeTipProvider` can be added post-MVP, selected by the `TIPS_PROVIDER` env var (v1 accepts only `"rules"`).
Revisit if: user feedback says the fixed tip strings read as generic.

**The OG route re-derives the score server-side; it never trusts query parameters** — `/api/og?repo=owner/name` accepts only the repo slug.
Because: an endpoint that renders `?score=100` into an image is a forgery generator, and the card's whole value is that it's credible. Cost: the OG route needs a DB read, which is why it shares the same cache path as everything else.

**Pages call `lib/services/` directly, never their own API routes** — no server-side `fetch('/api/score')`.
Because: a Server Component calling its own HTTP endpoint pays a full network round trip, loses the type, and creates a self-DoS path during a traffic spike.

**Node.js runtime for all routes, including `/api/og`** — no Edge runtime anywhere.
Because: one runtime means one set of capabilities to reason about. `ImageResponse` from `next/og` is supported on the Node runtime, and the Neon HTTP driver works identically on both.

---

## 4. Project Layout & Conventions

### Directory layout

```
RepoGauge/
├── app/
│   ├── layout.tsx                   # Root shell, fonts, theme. No data fetching.
│   ├── page.tsx                     # Landing: URL input, example repos, recent scores strip.
│   ├── trending/page.tsx            # Leaderboard.
│   ├── r/[owner]/[repo]/
│   │   ├── page.tsx                 # Result page (RSC). Calls lib/services. Exports generateMetadata.
│   │   ├── loading.tsx              # Skeleton shown while a cold score computes.
│   │   └── error.tsx                # Typed-error → user-facing copy.
│   └── api/
│       ├── score/route.ts           # GET, JSON.
│       ├── og/route.tsx             # GET, image/png. .tsx because ImageResponse takes JSX.
│       ├── badge/route.ts           # GET, image/svg+xml.
│       └── plan/route.ts            # [M5] GET, text/markdown. The downloadable fix plan.
│
├── components/                      # Presentational only. No fetching, no lib/db import.
│   ├── ScoreDial.tsx
│   ├── CategoryBreakdown.tsx
│   ├── TipList.tsx
│   ├── TrendingList.tsx
│   ├── ShareCard.tsx                # Satori, not a browser: literal hex, flexbox only.
│   ├── RepoInput.tsx                # 'use client' — the only client component with state.
│   ├── RepoError.tsx                # [M1] Typed error code → heading + copy.
│   ├── grade-color.ts               # [M1] Grade → CSS custom property. [M5] + tint helpers.
│   ├── icons.tsx                    # [M5] Hand-written SVG. Same reasoning as the badge.
│   └── EmbedSnippets.tsx            # 'use client' — clipboard access.
│
├── lib/
│   ├── config.ts                    # Zod-parsed env. Throws at import time if invalid.
│   ├── errors.ts                    # [M1] RepoGaugeError + code→status/copy. Imports nothing.
│   ├── github/
│   │   ├── client.ts                # The ONLY fetch() to api.github.com in the repo.
│   │   ├── signals.ts               # The 6-call fan-out → RepoSignals.
│   │   ├── types.ts                 # RepoSignals and friends. No GitHub SDK types leak past here.
│   │   └── errors.ts                # GitHubError with a typed code.
│   ├── score/
│   │   ├── rubric.ts                # The five category scorers. Pure.
│   │   ├── grade.ts                 # number → letter.
│   │   ├── types.ts                 # ScoreResult, RubricResult, CategoryScore, Check.
│   │   ├── fixtures.ts              # [M1] PERFECT / EMPTY / ARCHIVED signal fixtures.
│   │   └── rubric.test.ts           # Colocated. The most important test file in the repo.
│   ├── tips/
│   │   ├── index.ts                 # Provider selection by env.
│   │   ├── rules.ts                 # RuleTipProvider — the v1 implementation.
│   │   └── types.ts                 # TipProvider interface, Tip.
│   ├── db/
│   │   ├── schema.ts                # Drizzle table definitions. The source of truth for §5.
│   │   ├── client.ts                # Neon connection.
│   │   ├── scores.ts                # Score read/write queries.
│   │   └── rate-limit.ts            # Rate-limit counter queries.
│   ├── services/
│   │   ├── score-repo.ts            # getOrComputeScore(). The one orchestration seam.
│   │   ├── freshness.ts             # Pure fresh/stale/cold decision.
│   │   ├── rate-limit.ts            # Per-IP cold-score budget.
│   │   └── trending.ts              # Flow D, plus the demo-mode leaderboard.
│   ├── demo/
│   │   └── repos.ts                 # [M5] Fixtures for DEMO_MODE. See §11 assumption 12.
│   ├── badge.ts                     # Score → SVG. Pure.
│   ├── fix-plan.ts                  # [M5] Score → Markdown brief. Pure, same reason as badge.
│   ├── repo-slug.ts                 # Parse + validate owner/repo from any input form. Pure.
│   └── repo-slug.test.ts            # [M1] Colocated.
│
├── drizzle/                         # Generated migration SQL. Committed. Never hand-edited.
├── docs/SPEC.md                     # This file.
├── .env.example                     # Every var, empty values. Committed.
├── vitest.config.mts                # [M1] .mts so Vite loads it as ESM.
├── CLAUDE.md                        # Points at this spec.
└── README.md                        # Demo GIF, one-liner, badge embed examples.
```

**[M1] Two files this layout didn't anticipate.**

`lib/errors.ts` exists because `RepoGaugeError`'s codes and copy are needed by
client components (`error.tsx` is `'use client'`), and importing them from
`lib/services/` would pull the database client into the browser bundle. It
imports nothing, which is what makes it safe to import from anywhere.

`components/RepoError.tsx` exists because §7's failure copy has to render from
the **page**, not only from `error.tsx` — see the note in §7.

**[M5] Pure renderers are a category, not a coincidence.** `lib/badge.ts` and
`lib/fix-plan.ts` both take a finished score and return bytes — SVG and
Markdown. Neither does IO, both are fully tested without a network, and both
keep their route to a dozen lines of parse-call-respond. Anything that turns a
`ScoreResult` into another representation belongs here rather than inside a
route handler. `components/ShareCard.tsx` is the same idea one level up: it is
a renderer, but its output is JSX for Satori, so it lives with the components.

**[M5] One tint strength, and it is not a parameter.** `gradeChip()` in
`components/grade-color.ts` returns the strongest grade-coloured background
that still clears WCAG AA (4.5:1) for grade-coloured text on it, in **both**
schemes. Two cases bind it from opposite directions: in light mode amber falls
below 4.5 past 8%, and in dark mode red falls below it past 6%, because mixing
a bright colour into a near-black canvas lifts the background fast. 6% clears
both. The number is baked into the function rather than passed in, because a
caller choosing its own would silently fail one scheme. `gradeTint(grade, n)`
remains available for washes that carry no text.

### Dependency direction

```
app/ ─▶ lib/services ─▶ lib/github ─┐
  │          │                       ├─▶ lib/score  (imports nothing)
  │          └────────▶ lib/db ──────┘         ▲
  │                                            │
  └──▶ components/ ────────────────────────────┘ (types only)
```

- **`lib/score/` imports nothing** — not React, not Drizzle, not `lib/github`. It receives `RepoSignals` and returns `ScoreResult`. If it ever needs to fetch something, the fetch belongs in `lib/github/` and the result belongs in `RepoSignals`.
- **`lib/github/` never imports `lib/db/`**, and vice versa. `lib/services/` is the only place they meet.
- **`components/` never imports `lib/db` or `lib/github`.** It takes props.
- **No route handler contains business logic.** A route parses input, calls a service, and shapes a response. If a route handler exceeds 60 lines, logic leaked into it.
- Enforce with `madge --circular` in CI plus an ESLint `no-restricted-imports` rule pinning the above.

### Naming

| Kind             | Convention                          | Example                                 |
| ---------------- | ----------------------------------- | --------------------------------------- |
| Type / interface | PascalCase noun, no `I` prefix      | `RepoSignals`, `CategoryScore`          |
| Function         | camelCase verb phrase               | `getOrComputeScore`, `scoreDocs`        |
| Boolean          | `is`/`has`/`can` prefix             | `isArchived`, `hasCiWorkflows`          |
| Constant         | SCREAMING_SNAKE, module scope       | `SCORE_TTL_HOURS`, `GITHUB_CALL_BUDGET` |
| File — module    | kebab-case matching its main export | `score-repo.ts`, `rate-limit.ts`        |
| File — component | PascalCase matching the component   | `ScoreDial.tsx`                         |
| Test             | beside the source                   | `rubric.test.ts`                        |
| DB table         | snake_case, plural                  | `repos`, `scores`                       |
| DB column        | snake_case, singular                | `repo_id`, `fetched_at`                 |
| Timestamp column | `*_at`, always `timestamptz` UTC    | `fetched_at`, `first_seen_at`           |
| Env var          | SCREAMING_SNAKE                     | `GITHUB_TOKEN`, `DATABASE_URL`          |

Banned suffixes: `Manager`, `Helper`, `Utils`, `Data`, `Info`. `lib/github/signals.ts` states a job; `lib/github/utils.ts` would not.

### Size limits

Enforced by ESLint so they are never a review opinion:

| Unit                | Soft      | Hard | Rule                     |
| ------------------- | --------- | ---- | ------------------------ |
| File                | 300 lines | 500  | `max-lines`              |
| Function            | 40 lines  | 80   | `max-lines-per-function` |
| Nesting depth       | 3         | 4    | `max-depth`              |
| Parameters          | 3         | 4    | `max-params`             |
| React component JSX | 150 lines | 250  | reviewed, not linted     |

`lib/score/rubric.ts` will push the file limit as the rubric grows. When it does, split by category (`rubric/docs.ts`, `rubric/activity.ts`) — not into a `helpers.ts`.

### Tooling

| Concern         | Tool                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Formatter       | Prettier, default config, no discussion                                                                        |
| Linter          | ESLint with `next/core-web-vitals` + `@typescript-eslint` strict, `no-floating-promises` on                    |
| Types           | TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. `any` is a lint error.                            |
| Validation      | Zod — one schema per boundary, shared between route parsing and env parsing                                    |
| Testing         | Vitest. `lib/score/` and `lib/repo-slug.ts` require tests; route handlers do not.                              |
| Migrations      | `drizzle-kit generate` → committed SQL in `drizzle/`, applied via `drizzle-kit migrate` in a Vercel build step |
| CI              | GitHub Actions: `prettier --check`, `eslint`, `tsc --noEmit`, `vitest run`, `madge --circular` — all blocking  |
| Package manager | pnpm, lockfile committed                                                                                       |

---

## 5. Data Models

### Domain types (`lib/github/types.ts`, `lib/score/types.ts`)

```ts
/** Everything the rubric is allowed to see. Produced only by lib/github/signals.ts. */
export interface RepoSignals {
  owner: string; // canonical casing from the GitHub API, not user input
  name: string;
  githubId: number;
  description: string | null; // null = repo has no description set; a scored condition
  homepage: string | null; // null = unset; GitHub also returns "" which we normalize to null
  topics: string[]; // [] when none set
  stars: number;
  forks: number;
  openIssues: number; // includes open PRs — GitHub's own quirk, accepted (§8)
  pushedAt: string | null; // [M5] ISO 8601 UTC; null = never pushed (no commits)
  isArchived: boolean;
  isFork: boolean;
  hasIssuesEnabled: boolean;
  primaryLanguage: string | null; // null = GitHub detected no language (docs-only repos)
  defaultBranch: string;

  readmeBytes: number | null; // null = no README found anywhere GitHub looks
  hasLicense: boolean;
  hasContributing: boolean;
  hasCodeOfConduct: boolean;
  hasSecurityPolicy: boolean;
  hasIssueOrPrTemplate: boolean;
  hasCiWorkflows: boolean; // [M1] .github/workflows appears in the .github listing.
  // Git cannot store an empty directory, so its presence
  // implies at least one file — no 7th call needed.

  commitsLast90Days: number; // capped at 100 — we request one page (§8)
}

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";
export type CategoryKey =
  "docs" | "community" | "activity" | "popularity" | "hygiene";

/** One rubric line item. Drives both the breakdown UI and tip generation. */
export interface Check {
  id: string; // stable slug, e.g. "has-license" — referenced by tip rules
  label: string; // "LICENSE file present"
  earned: number;
  available: number;
}

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  earned: number; // sum of checks
  available: number; // fixed per category: 25/20/20/15/20
  checks: Check[];
}

export interface Tip {
  checkId: string; // the Check.id that produced it
  text: string; // "Add a LICENSE file — without one, others legally can't reuse your code."
  points: number; // points recoverable; the sort key, descending
}

export interface ScoreResult {
  total: number; // 0-100, integer
  grade: Grade;
  categories: CategoryScore[]; // always all five, in fixed order
  tips: Tip[]; // only checks that lost points; sorted by points desc
}
```

### The rubric (`lib/score/rubric.ts`)

Fixed weights, 100 points total. Every check is deterministic given `RepoSignals`.

**Docs — 25 pts**

| Check id          | Condition                                    | Points |
| ----------------- | -------------------------------------------- | ------ |
| `has-readme`      | `readmeBytes !== null`                       | 6      |
| `readme-depth`    | bytes ≥4000 → 8, ≥1500 → 6, ≥300 → 3, else 0 | 8      |
| `has-description` | `description` non-empty                      | 5      |
| `has-topics`      | ≥3 topics → 4, ≥1 → 2, else 0                | 4      |
| `has-homepage`    | `homepage` non-empty                         | 2      |

**Community — 20 pts**

| Check id              | Condition              | Points |
| --------------------- | ---------------------- | ------ |
| `has-license`         | `hasLicense`           | 8      |
| `has-contributing`    | `hasContributing`      | 4      |
| `has-code-of-conduct` | `hasCodeOfConduct`     | 3      |
| `has-security-policy` | `hasSecurityPolicy`    | 3      |
| `has-templates`       | `hasIssueOrPrTemplate` | 2      |

**Activity — 20 pts**

| Check id         | Condition                                                                                                              | Points |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| `recent-push`    | days since `pushedAt`: ≤30 → 10, ≤90 → 7, ≤180 → 4, ≤365 → 2, else 0                                                   | 10     |
| `commit-cadence` | `commitsLast90Days`: ≥20 → 6, ≥5 → 4, ≥1 → 2, else 0                                                                   | 6      |
| `issue-backlog`  | `stars < 50` → 4 (ratio is noise at low star counts). Else `openIssues/stars`: ≤0.05 → 4, ≤0.15 → 3, ≤0.30 → 2, else 1 | 4      |

**Popularity — 15 pts** (log-scaled, so a 40-star repo isn't crushed)

| Check id     | Formula                                  | Points |
| ------------ | ---------------------------------------- | ------ |
| `star-count` | `min(11, round(log10(stars + 1) * 2.2))` | 11     |
| `fork-count` | `min(4, round(log10(forks + 1) * 1.6))`  | 4      |

Reference points: 10★ → 2, 100★ → 4, 1k★ → 7, 10k★ → 9, 100k★ → 11.

**Hygiene — 20 pts**

| Check id            | Condition                  | Points |
| ------------------- | -------------------------- | ------ |
| `has-ci`            | `hasCiWorkflows`           | 8      |
| `not-archived`      | `!isArchived`              | 4      |
| `is-original`       | `!isFork`                  | 3      |
| `issues-enabled`    | `hasIssuesEnabled`         | 3      |
| `language-detected` | `primaryLanguage !== null` | 2      |

**Grades:** A+ ≥90 · A 80–89 · B 70–79 · C 60–69 · D 50–59 · F <50.

### Database schema (`lib/db/schema.ts` → `drizzle/`)

**[M5] `scores` carries two timestamps, and they are not interchangeable.** `fetched_at` is when a score was last _confirmed_; `first_seen_at` is when it was first _reached_, and never moves. An unchanged rescan drags the former forward and leaves the latter alone. The sparkline plots `first_seen_at`, because plotting `fetched_at` would draw every stable repository as a vertical cluster at "now" — a score reached in March would claim to have been reached today. `drizzle/0002` adds the column with `default now()`; there was no production data to backfill, since the app had never run against a real database when it landed.

```sql
CREATE TABLE repos (
  id             BIGSERIAL PRIMARY KEY,
  github_id      BIGINT      NOT NULL UNIQUE,   -- survives renames; the real identity
  owner          TEXT        NOT NULL,          -- canonical casing from the API
  name           TEXT        NOT NULL,
  stars          INTEGER     NOT NULL,          -- denormalized for the trending star floor (§9)
  is_archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repos_slug_idx ON repos (lower(owner), lower(name));

CREATE TABLE scores (
  id          BIGSERIAL   PRIMARY KEY,
  repo_id     BIGINT      NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  total       SMALLINT    NOT NULL CHECK (total BETWEEN 0 AND 100),
  grade       TEXT        NOT NULL CHECK (grade IN ('A+','A','B','C','D','F')),
  categories  JSONB       NOT NULL,   -- CategoryScore[] — denormalized; never queried by field
  tips        JSONB       NOT NULL,   -- Tip[]
  rubric_version SMALLINT NOT NULL,   -- bumped whenever rubric.ts changes weights (§8)
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scores_latest_idx   ON scores (repo_id, fetched_at DESC);
CREATE INDEX scores_trending_idx ON scores (fetched_at DESC, total DESC);

CREATE TABLE rate_limit_hits (
  bucket_key  TEXT        PRIMARY KEY,   -- '<hmac(ip)>:<epoch_hour>'
  hits        INTEGER     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX rate_limit_expiry_idx ON rate_limit_hits (expires_at);
```

**Relationships**

- `repos` 1:N `scores` — every scoring run appends a row; nothing is updated in place. Deleting a repo cascades its scores. Score history is therefore free, even though no v1 UI reads it.

**Constraints & indexes**

- unique `repos.github_id` — prevents a renamed repo becoming two rows.
- unique `(lower(owner), lower(name))` — GitHub slugs are case-insensitive; `Facebook/React` and `facebook/react` must be one row.
- `scores_latest_idx` serves the cache lookup: latest score for one repo.
- `scores_trending_idx` serves `/trending`: recent window, ordered by score.
- `rate_limit_hits` rows are swept opportunistically (`DELETE WHERE expires_at < now()` on ~1% of writes), not by a cron job.

**Retention:** `rate_limit_hits` holds only an HMAC of an IP and is deleted within two hours. No raw IPs, no user identifiers, nothing else personal is stored anywhere.

---

## 6. Interfaces

### GitHub REST — outbound (`lib/github/signals.ts`)

Six calls, issued in parallel via `Promise.allSettled`, 5-second timeout each via `AbortSignal.timeout(5000)`. `GITHUB_CALL_BUDGET = 6` is asserted in a test so the budget can't silently grow.

| #   | Endpoint                                                  | Supplies                                                                                                                        | 404 handling                     |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | `GET /repos/{o}/{r}`                                      | identity, stars, forks, openIssues, pushedAt, topics, description, homepage, archived, fork, hasIssues, language, defaultBranch | **fatal** → `REPO_NOT_FOUND`     |
| 2   | `GET /repos/{o}/{r}/community/profile`                    | license, contributing, code of conduct, README presence, issue/PR templates                                                     | tolerated → all false            |
| 3   | `GET /repos/{o}/{r}/readme`                               | `readmeBytes` (from the `size` field; content is never fetched or decoded)                                                      | tolerated → `readmeBytes = null` |
| 4   | `GET /repos/{o}/{r}/contents/`                            | root `SECURITY.md`                                                                                                              | tolerated → false                |
| 5   | `GET /repos/{o}/{r}/contents/.github`                     | `.github/SECURITY.md`, `workflows` directory entry                                                                              | tolerated → false                |
| 6   | `GET /repos/{o}/{r}/commits?per_page=100&since={90d ago}` | `commitsLast90Days` (array length, capped at 100)                                                                               | tolerated → 0                    |

**[M1] Call #2 under-reports templates.** `/community/profile` returns `issue_template: null` when a repo uses the directory form (`.github/ISSUE_TEMPLATE/`) rather than a single file — `vercel/next.js` is one such repo. `hasIssueOrPrTemplate` therefore also checks the call #5 listing for an `issue_template`/`pull_request_template` entry. Verified against the live API; costs no extra call.

**[M5] A rejected token is not an outage.** `401` maps to its own `UNAUTHORIZED` code rather than to `UNAVAILABLE`, and `lib/github/client.ts` logs it by name at the point of detection. The visitor still sees the `UPSTREAM_UNAVAILABLE` copy — they cannot act on an expired PAT — but the operator gets a line that says which of the two it is. It is logged in the client rather than where it is finally handled because with a warm cache the service degrades to stale scores and never reaches the error mapping: the site keeps answering, looks healthy, and serves frozen data indefinitely. This is the failure mode a token expiry produces, and it is the one worth being loud about.

Only call #1 is fatal. Any other rejection degrades that signal to its "absent" value and the score still returns — a partial score beats an error page. Every request sends `Authorization: Bearer ${GITHUB_TOKEN}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and a `User-Agent` identifying RepoGauge.

### HTTP API — inbound

| Signature                            | Purpose                                         | Request → Response                                                                                              | Errors                                                                                                                             |
| ------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/score?repo={owner}/{name}` | Full score as JSON                              | `?repo=facebook/react` → `{ repo: {owner,name,stars}, score: ScoreResult, fetchedAt: string, cached: boolean }` | `400 INVALID_SLUG` · `404 REPO_NOT_FOUND` · `429 RATE_LIMITED` (+`Retry-After`) · `502 UPSTREAM_UNAVAILABLE`                       |
| `GET /api/og?repo={owner}/{name}`    | 1200×630 PNG share card                         | → `image/png`                                                                                                   | On any error, returns a **200 with a fallback card** reading "Couldn't score this repo" — never a broken image in someone's README |
| `GET /api/badge?repo={owner}/{name}` | Shields-style SVG badge                         | `&style=flat\|flat-square` → `image/svg+xml`                                                                    | Same fallback rule: renders `RepoGauge \| unknown` at 200                                                                          |
| `GET /api/plan?repo={owner}/{name}`  | **[M5]** The fix list as a Markdown download    | → `text/markdown` + `Content-Disposition: attachment; filename="repogauge-{owner}-{name}.md"`                   | Markdown on failure too, at the same statuses as `/api/score` — a browser following a download link must not save a JSON blob      |
| `GET /`                              | Landing: input, examples, recent-scores strip   | HTML                                                                                                            | —                                                                                                                                  |
| `GET /r/{owner}/{repo}`              | Result page, server-rendered with OG meta       | HTML                                                                                                            | Typed error → `error.tsx` copy                                                                                                     |
| `GET /trending`                      | Leaderboard, top 20 by score in the last 7 days | HTML                                                                                                            | —                                                                                                                                  |

Response headers on `/api/score` and `/api/plan`: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`.
Response headers on `/api/og` and `/api/badge`: `Cache-Control: public, s-maxage=21600, stale-while-revalidate=604800` — long, because GitHub's Camo proxy is the primary caller and re-rendering per README view is the one thing that could exhaust the token budget.

Error body shape is uniform: `{ error: { code: string, message: string } }`. `message` is safe to display; no upstream detail, no stack.

### Service seam (`lib/services/score-repo.ts`)

```ts
export interface ScoreRepoOptions {
  /** Skip the freshness check and force a GitHub fetch. Rate-limited callers only. */
  forceRefresh?: boolean;
}

export interface ScoredRepo {
  repo: { owner: string; name: string; stars: number };
  score: ScoreResult;
  fetchedAt: string; // ISO 8601 UTC
  cached: boolean; // true when served without touching GitHub
  stale: boolean; // true when served past TTL with a background refresh queued
}

export async function getOrComputeScore(
  slug: { owner: string; name: string },
  options?: ScoreRepoOptions,
): Promise<ScoredRepo>;
```

Throws `RepoGaugeError` with `code: 'INVALID_SLUG' | 'REPO_NOT_FOUND' | 'RATE_LIMITED' | 'UPSTREAM_UNAVAILABLE'`. Route handlers map codes to status codes in one place; nothing else catches.

### Tip provider seam (`lib/tips/types.ts`)

```ts
export interface TipProvider {
  generate(signals: RepoSignals, categories: CategoryScore[]): Promise<Tip[]>;
}
```

`lib/tips/index.ts` selects by `TIPS_PROVIDER`, which in v1 validates to the literal `"rules"`. `RuleTipProvider` maps each `Check` with `earned < available` to a fixed string, sorted by recoverable points descending, capped at 6 tips (3 render in the OG card).

**[M1] Two exclusions the ranking needs to be useful.**

- **`star-count` and `fork-count` never produce tips.** "Get more stars" is not an action anyone can take, and because those checks lose the most points on exactly the small repos that need advice most, ranking by recoverable points would put them at the top and push every fixable item off the list.
- **`readme-depth` is suppressed when `readmeBytes === null`.** "Expand the README" is noise directly underneath "add one".

Both are properties of the tip provider, not the rubric — the points are still scored and still shown in the breakdown.

### Environment (`lib/config.ts`, Zod-validated, throws at import)

| Variable               | Required | Purpose                                                                                                                  |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`         | yes      | Neon connection string                                                                                                   |
| `GITHUB_TOKEN`         | yes      | Fine-grained PAT, **public-repo read only, zero write scopes**. Raises the rate ceiling from 60/hr to 5000/hr.           |
| `RATE_LIMIT_SECRET`    | yes      | HMAC key for hashing IPs                                                                                                 |
| `TIPS_PROVIDER`        | no       | `"rules"` (default and only accepted value in v1)                                                                        |
| `NEXT_PUBLIC_SITE_URL` | no       | Absolute base for OG/embed URLs. Falls back to `https://${VERCEL_PROJECT_PRODUCTION_URL}`, then `http://localhost:3000`. |

---

## 7. Core Flows

### Flow A — Score a repo (the product)

1. User pastes input into `RepoInput` on `/` and submits.
2. `lib/repo-slug.ts` parses it client-side for immediate feedback. It accepts `owner/repo`, `https://github.com/owner/repo(/anything)`, and `git@github.com:owner/repo.git`. On failure the user sees an inline message and no navigation happens.
3. Client navigates to `/r/{owner}/{repo}`. **This is the shareable URL** — there is no intermediate state to lose.
4. The Server Component re-parses and re-validates the slug (client validation is UX, never a control) and calls `getOrComputeScore`.
5. `getOrComputeScore` reads the latest `scores` row for that repo.
   - **Fresh** (`fetched_at` within 6h **and** `rubric_version` current) → return it. `cached: true`. Typical response <300ms.
   - **Stale** (older than 6h, newer than 7d, current rubric version) → return it immediately with `stale: true`, and schedule a refresh with Next's `after()` so the user waits on nothing.
   - **Missing, expired past 7d, or written by an older `rubric_version`** → check the rate limit, then fetch and score synchronously.
6. On a cold path: `lib/github/signals.ts` issues the six parallel calls, `lib/score/rubric.ts` scores the result, `lib/tips/` generates tips, and `lib/db/scores.ts` upserts `repos` and inserts a `scores` row.
7. The page renders the dial, the sparkline beneath it, the five-category breakdown, the tips, and the embed snippets. `generateMetadata` sets `og:image` to `{SITE_URL}/api/og?repo={owner}/{name}`.

**Failure branches:** repo doesn't exist or is private → `error.tsx` shows "We couldn't find that repo. RepoGauge only reads public repositories." · rate limited → "Too many new repos scored from your network. Try again in a few minutes." with the `Retry-After` value · GitHub down → if any score exists in the DB regardless of age, serve it with a "scored {n} days ago" notice rather than failing.

**[M1] Expected failures render from `page.tsx`, not from `error.tsx`.** Next replaces a server-thrown error's `message` with a generic string plus a digest in production, so copy that reaches the user through a thrown error would be lost exactly where it matters. The page catches `RepoGaugeError`, maps the `code` to copy via `components/RepoError.tsx`, and returns it as normal output. `error.tsx` stays mounted as the boundary for genuinely unexpected throws, and renders the same component with a reset button.

### Flow B — Share card renders on social or in a README

1. Twitter/Slack/GitHub Camo requests `/api/og?repo=owner/name`.
2. Vercel's CDN serves a cached PNG if one exists (`s-maxage=21600`). Most requests stop here and never reach our code.
3. On a miss, the route calls `getOrComputeScore` — **with `forceRefresh` unavailable**. If a score exists at any age, it is used as-is; the OG route never triggers a GitHub fetch for a stale score, only for a completely unknown repo.
4. `ImageResponse` renders the card at 1200×630: repo name, big score, grade, five category bars, wordmark and site host.
5. On any failure, a fallback card is returned at status 200.

**[M5] The card states the result and carries no tips.** It originally rendered the top three. The card's job is to be embedded in the scored repository's own README, and a list of that repository's shortcomings is the last thing its author wants published — the tips were driving people away from the one surface that recruits new users. The fix list moved to `/api/plan`, which is downloaded rather than embedded, and the space it freed went to the category bars. See Flow C.

**[M5] Each category bar is coloured by its own ratio**, on the same five bands as the grades, rather than all five taking the repo's overall grade colour. Painting them uniformly made 0/25 and 25/25 identical at a glance, which is the whole of what a reader takes from a card seen in passing. `components/ShareCard.tsx` mirrors `components/grade-color.ts` in literal hex, because Satori resolves no custom properties.

**Why step 3 is written that way:** this endpoint is called by GitHub's proxy on every README view of every repo that embeds the badge. If it could trigger GitHub fetches, long-tail README traffic would drain the 5000/hr token budget with no user waiting on the result. Freshness is a UI concern; the card trades it for a hard ceiling on outbound calls.

### Flow C — Take the result away (embed, or fix plan)

1. On `/r/{owner}/{repo}`, `EmbedSnippets` shows two prefilled snippets built from `NEXT_PUBLIC_SITE_URL`:
   - Card: `[![RepoGauge](https://site/api/og?repo=owner/name)](https://site/r/owner/name)`
   - Badge: `[![RepoGauge](https://site/api/badge?repo=owner/name)](https://site/r/owner/name)`
2. "Copy Markdown" writes to the clipboard; "Download PNG" fetches `/api/og` and triggers a download with filename `RepoGauge-{owner}-{name}.png`.

Both snippets wrap the image in a link back to the result page — that link is the acquisition loop and it is not optional.

**[M5] The fix plan — `/api/plan`.** The tip list under "What to fix" carries a `Download the full plan as Markdown` link. The file is a brief addressed to a coding agent: the score, the five categories as a table, every unearned check as a checkbox with the points it recovers and the rubric's advice, the checks that cannot be acted on, and the checks that already pass. Three properties define it:

- **Uncapped.** The page shows `MAX_TIPS` (6) so the list stays readable; the file lists every check that lost a point. Truncating it would silently redefine "everything that needs fixing" as "the first six things".
- **It names what cannot be fixed.** Stars and forks are scored but never advised on (§8). Omitting them from a file whose header promises a reachable total would leave an agent to conclude the arithmetic is wrong, or to try to manufacture them. The header states the reachable score — `total + actionable`, which for a young repo lands near 85 and makes §12's open question concrete.
- **It carries no repository description.** Descriptions are attacker-controlled by anyone who can create a repository (§9). This file is written to disk and pasted into an agent's context, so it is built from the slug and the rubric's own strings and nothing else. A test pins the input shape so a later edit cannot quietly add one.

Like `/api/og`, the route accepts only a slug and re-derives the score server-side; a route that rendered numbers handed to it in a query string would turn a file designed to be pasted into an agent into an injection vector. Unlike `/api/og` it does **not** set `neverRefresh` — nothing embeds it, so there is no Camo traffic to defend against, and it is charged against the caller's cold-score budget exactly like the result page.

`lib/fix-plan.ts` renders it and is pure, for the same reason `lib/badge.ts` is: it is a rendering of a score, not a computation of one.

### Flow D — Trending

1. `/trending` queries the latest score per repo where `fetched_at` is within 7 days and `repos.stars >= 50`, ordered by `total` desc, limit 20.
2. The landing page runs the same query with `limit 6` for its "recently scored" strip.

The 50-star floor is deliberate: without it, the leaderboard is whatever anyone last pasted, including repos named to be seen on our homepage (§9).

---

## 8. Edge Cases & Failure Modes

| Case                                                   | Consequence if unhandled                                                    | Handling                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub token exhausts its 5000/hr ceiling              | Every cold score fails during exactly the traffic spike we want             | Detect `403` + `x-ratelimit-remaining: 0`. Serve any cached score at any age with a staleness notice; if none exists, return `502 UPSTREAM_UNAVAILABLE` with a "we're being rate-limited by GitHub, try in an hour" message. Never surface a raw GitHub error. |
| `GITHUB_TOKEN` missing in an environment               | Silently drops to 60 req/hr and the app dies mysteriously under any load    | `lib/config.ts` requires it. The app refuses to boot without it. No unauthenticated fallback path exists.                                                                                                                                                      |
| One README embedded across thousands of repos          | Camo traffic drains the token budget                                        | Flow B step 3: the OG route never triggers a GitHub fetch for an already-known repo. Combined with `s-maxage=21600`, outbound calls are bounded by _distinct new repos_, not by views.                                                                         |
| Someone scripts `/api/score` across thousands of repos | Token budget gone in minutes                                                | Per-IP rate limit: **30 cold scores per hour** (cached reads are unlimited and don't count). Key is `hmac(ip, RATE_LIMIT_SECRET) + epoch hour`, one upsert per cold score.                                                                                     |
| Repo renamed or transferred on GitHub                  | Two rows for one repo, split history                                        | `repos.github_id` is the unique identity. The upsert matches on `github_id` and overwrites `owner`/`name` with the canonical values the API returned.                                                                                                          |
| User pastes `Facebook/React`                           | Duplicate row, duplicate cache miss                                         | Unique index on `(lower(owner), lower(name))`; lookups lowercase before querying. The page renders GitHub's canonical casing.                                                                                                                                  |
| Repo has zero commits / is empty                       | Endpoints 3–6 all 404, division or log of zero                              | Only endpoint #1 is fatal. Every other signal degrades to its absent value; `log10(0 + 1) = 0` is well-defined. **[M5]** An empty repo scores **14** — the low teens this row predicted. It briefly scored 24; see the scale-floor note below.                 |
| Repo has >100 commits in 90 days                       | Undercounts cadence                                                         | Accepted and documented: one page of 100 is requested and the cadence check saturates at 20. A second page would buy nothing.                                                                                                                                  |
| `openIssues` includes open pull requests               | A busy repo looks like it has a backlog                                     | Accepted, documented in the check's tooltip. Separating them costs a search API call, which is rate-limited at 30/min — a worse trade.                                                                                                                         |
| A GitHub call hangs                                    | The request hangs, then the Vercel function times out at 10s with no output | Every outbound call has `AbortSignal.timeout(5000)`. `Promise.allSettled` means one slow call can't block the other five. Worst case is 5s + scoring, inside the function limit.                                                                               |
| Rubric weights are changed after launch                | Old cached scores mix with new ones; the same repo shows two numbers        | `scores.rubric_version` is bumped in the same commit as any weight change. A row with an older version is treated as a cache miss. No backfill, no migration.                                                                                                  |
| Neon free tier auto-suspends after idle                | First request after a quiet period pays a cold-start penalty                | Accepted: the HTTP driver's wake is a few hundred ms and it's amortized across the request. Documented in the README so it isn't diagnosed as a bug.                                                                                                           |
| `/trending` before any repos are scored                | An empty page as the second impression                                      | Landing and trending both seed with a hardcoded example set (`facebook/react`, `vercel/next.js`, `rust-lang/rust`, `sveltejs/svelte`) rendered as suggestions when the query returns fewer than 6 rows.                                                        |
| Two requests score the same cold repo simultaneously   | Two GitHub fan-outs, two `scores` rows                                      | Accepted. `scores` is append-only, so a duplicate row is harmless and the latest wins. Locking to save one duplicate fetch isn't worth the deadlock surface.                                                                                                   |
| Unicode / very long owner or repo names                | Layout break in the OG card                                                 | `lib/repo-slug.ts` enforces GitHub's own rules: owner ≤39 chars matching `^[A-Za-z0-9](?:[A-Za-z0-9]\|-(?=[A-Za-z0-9])){0,38}$`, repo ≤100 chars matching `^[A-Za-z0-9._-]+$`. Anything else is `400` before a query runs. The card also truncates at render.  |

### [M5] The scale's floor is 14 — and 10 of the original 24 were a bug

Measured, not predicted. This was originally recorded as an open calibration
question with three options. It turned out to be mostly a defect, so it was
fixed rather than decided.

**The defect.** `lib/github/signals.ts` substituted `created_at` when GitHub
returned `pushed_at: null`, which it does for a repository with no commits.
That handed every empty repo **10 of 10** for "pushed recently" — a repo that
has never been pushed reading as pushed today. Passing the null through and
scoring it zero is not a weight change; it is the check finally measuring what
it claims to. `RUBRIC_VERSION` is 2 as a result.

**What remains, and why it stays.** A repository that merely exists still
collects 14:

- **4 pts** for `issue-backlog`, which returns full marks below 50 stars
  because the ratio is genuinely noise there — one filed issue on a 3-star repo
  is not a backlog.
- **10 pts** of hygiene for not being archived, not being a fork, and having
  issues enabled. These are true by default, but they are also real signals:
  an archived repo, a fork, and a repo with issues switched off each deserve to
  lose those points.

So the usable range is 14–100 rather than 0–100. That is a deliberate property
of an additive rubric, documented in the README, and not worth rescaling —
rescaling would stop the category points summing to the headline number, which
is the one thing that makes the breakdown checkable by eye.

### [M5] The dogfooding target in M5 is unreachable for a new repository

Scoring itself with every M5 file in place, RepoGauge reaches **83 (A)**, not
the ≥90 the milestone asks for. The gap is entirely `popularity`: 15 points of
stars and forks that no amount of work on the repository can produce on day
one. Reaching 90 needs roughly a thousand stars.

That is worth knowing about the rubric itself, not just about this repo: **a
flawless brand-new project cannot score above 85.** Whether that is correct
depends on what the number is for. It is honest if the question is "should I
adopt this?", and unfair if the question is "is this well built?". Left as
designed for v1, recorded here so the trade-off is a choice rather than a
surprise.

---

## 9. Security & Permissions

**Authentication:** none. There are no accounts and no sessions. Every route is public and every response is the same for every caller. This is a product decision (§2), not a gap.

**Authorization:** not applicable — there is no user-owned data. The only thing worth protecting is the GitHub token budget, which is handled by rate limiting rather than identity.

**The token.** `GITHUB_TOKEN` is a fine-grained PAT with **public repository read access and zero write scopes**. It is server-only, never referenced in a `NEXT_PUBLIC_*` variable, and never appears in a response body or a log line. If it leaks, the blast radius is public data reads at a rate someone could achieve anonymously anyway — but rotate it regardless.

**SSRF.** The app fetches URLs on a user's behalf, which is the classic SSRF shape. It is closed by construction: the base URL is the hardcoded constant `https://api.github.com`, and the only user-controlled input is the owner and repo path segments, each validated against GitHub's own character rules before interpolation. `homepage` from the API is rendered as a link with `rel="noopener noreferrer nofollow"` and is **never fetched server-side**.

**Rate limiting.** 30 cold scores per IP per hour. IPs are HMAC-SHA256'd with `RATE_LIMIT_SECRET` before storage — the raw IP never reaches Postgres. Buckets expire within two hours and are swept opportunistically. Cached reads are not limited; the resource being protected is the GitHub budget, not our own bandwidth.

**Untrusted content in our own UI.** Repo names, descriptions, topics, and homepage URLs come from GitHub and are attacker-controlled by anyone who can create a repo. React escapes them on render; the rules that matter are: never `dangerouslySetInnerHTML`, and validate `homepage` parses as `http:`/`https:` before rendering it as an anchor (a `javascript:` homepage is a stored XSS otherwise).

**`/trending` is a public surface someone can push content onto.** Anyone can score any repo, and a repo name is arbitrary text. Mitigations: the 50-star floor in Flow D means a repo created to appear there would first need 50 real stars; only `owner/name` and a number are rendered, never the description; and the query window is 7 days so anything unwanted ages off without intervention.

**Errors and logs.** Client-facing errors carry a code and a generic message. Upstream status codes, response bodies, and stack traces go to Vercel logs only. No request bodies are logged.

**Secrets.** `.env` is gitignored; `.env.example` lists every variable with empty values and is committed. Production values live in Vercel's environment settings. The pnpm lockfile is committed.

**Data handling.** The only stored data is public GitHub metadata plus salted IP hashes with a two-hour lifetime. There is no PII, no deletion request to honor, and no backup story beyond Neon's own — the entire database is a cache that could be dropped and rebuilt by re-scoring.

---

## 10. Build Order

**M1 — A real score, live on the internet**
End state: you paste `facebook/react` at a public URL and see a scored breakdown. No database yet.

- [x] `create-next-app` (TypeScript, App Router, Tailwind v4), pnpm, Prettier/ESLint/Vitest, `tsconfig` strict
- [x] `lib/repo-slug.ts` with tests covering all three input forms and the rejection cases
- [x] `lib/config.ts` — Zod env parsing that throws at import
- [x] `lib/github/` — the six-call fan-out, timeouts, `Promise.allSettled`, typed errors, `RepoSignals`
- [x] `lib/score/rubric.ts` + `grade.ts` with a test per category, plus fixture-based tests for a strong repo, an empty repo, and an archived repo
- [x] `lib/tips/rules.ts` behind `TipProvider`
- [x] `app/page.tsx` (input + examples) and `app/r/[owner]/[repo]/page.tsx` (dial, breakdown, tips)
- [ ] Deploy to Vercel with `GITHUB_TOKEN` set — a live URL exists at the end of day one

**M1 verification, 2026-08-07.** 130 tests, plus `eslint`, `tsc --noEmit`,
`madge --circular` and a production build, all clean. Scored live against the
real API: `vercel/next.js` → 95 (A+), `rust-lang/rust` → 94 (A+). Invalid slugs
and upstream failures render their own copy. **Not yet deployed** — the Vercel
project and production domain are still open (§12).

Also added beyond the checklist, because the cold path takes real seconds
without a cache: `loading.tsx` and `error.tsx`, which §10 assigns to M2.

**M2 — Cache and persistence**
End state: the second view of a repo is instant, and the same score survives a redeploy.

- [~] Neon project, `DATABASE_URL`, Drizzle schema for `repos` and `scores`, first migration committed — **schema and migrations written, committed, and applied against real Postgres in CI; no Neon project exists yet, so they have never run against Neon itself**
- [x] `lib/services/score-repo.ts` — the fresh / stale / cold branches from Flow A, including `rubric_version`
- [x] Stale-while-revalidate via `after()`
- [x] `GET /api/score` returning the JSON contract from §6
- [x] `loading.tsx` and `error.tsx` with the copy from Flow A's failure branches _(landed early, in M1)_

**[M2] What is and is not verified.** The freshness decision — the branch that
determines whether a user waits on GitHub — is a pure function in
`lib/services/freshness.ts` with 20 tests covering both sides of the 6-hour TTL
and the 7-day ceiling, rubric-version mismatch in both directions, and clock
skew.

**The SQL is verified too, without a Neon account.** `lib/db/test-postgres.ts`
starts [PGlite](https://pglite.dev) — Postgres compiled to WebAssembly, not a
mock and not SQLite — applies the committed migrations verbatim, and the
integration tests exercise the production query functions unchanged by
swapping `lib/db/client.ts` for the test database. That covers what a type
checker cannot: `DISTINCT ON` inside a subquery, `ON CONFLICT` incrementing
rather than resetting, `jsonb` round-tripping as structures, the
case-insensitive slug index, and both CHECK constraints rejecting bad rows.

It runs in CI with no secrets, so the persistence layer stays verified on every
commit rather than only on the day someone happens to have a database to hand.

**Still unproven:** the `@neondatabase/serverless` HTTP transport specifically.
PGlite proves the SQL is correct; it does not prove Neon's driver speaks it
identically. That gap closes on the first real deployment, not before.

**[M2] Two failure paths the spec implied but did not spell out.**

- **A cache read that throws is a miss, not an outage.** If Neon is unreachable, `getOrComputeScore` logs and falls through to the cold path, degrading to M1 behaviour rather than failing the page.
- **A cache write that throws does not cost the user their score.** The score is already computed; the next request simply misses again.

Both are logged to Vercel and invisible to the caller, which is the same
posture §8 takes toward a degraded GitHub.

**M3 — The share card**
End state: pasting a result URL into Slack shows a card, and the README snippet works.

- [x] `app/api/og/route.tsx` with `ImageResponse`, 1200×630, re-deriving the score server-side
- [x] Fallback card on error at status 200
- [x] `generateMetadata` on the result page wiring `og:image` and `twitter:card`
- [~] `EmbedSnippets` — copy Markdown, download PNG — **card snippet only; see below**
- [~] Long cache headers on `/api/og`; verify a real embed renders through GitHub's Camo proxy — **headers set and confirmed; the Camo check needs a public deployment**

**[M3] The badge snippet is withheld until M4.** Flow C specifies two
snippets, but `/api/badge` does not exist until M4, and a copy-paste that 404s
inside someone else's README is worse than one fewer option. `EmbedSnippets`
ships the card snippet alone and regains the badge when the route lands.

**[M3] `neverRefresh` was added to `ScoreRepoOptions`.** Flow B step 3 requires
that the image routes never trigger a GitHub fetch for an already-known repo,
but the M2 service scheduled a background refresh on every stale hit — which
would have let long-tail Camo traffic drain the token budget through the back
door, exactly the failure §8 designs against. The option makes any cached
score, at any age, serve as-is with no outbound call. The rubric version is
still honoured: a card contradicting the page it links to would be worse than
a slow card.

**[M3] What was verified.** Cards were rendered against live GitHub data and
inspected as images, not just as byte counts: `rust-lang/rust` (94, A+, three
tips), `jaywcjlove/awesome-mac` (97, A+, one tip — the sparse case), an invalid
slug, and an unknown repo. Both failure paths return `image/png` at status
200 with `s-maxage=21600`. Three layout bugs were found and fixed this way that
compilation could not surface: the grade collided with the first category bar,
the footer collided with the last tip, and tip text truncated mid-word with
240px of unused width.

**M4 — Survive the spike**
End state: someone can point a script at it and the token budget holds.

- [x] `rate_limit_hits` table and migration; HMAC-of-IP keying
- [x] 30-cold-scores-per-hour enforcement in `getOrComputeScore`, with `429` + `Retry-After`
- [x] GitHub 403/rate-limit detection and the degraded-serve path from §8 — **verified against live GitHub, see below**
- [x] `/trending` and the landing "recently scored" strip, with the 50-star floor and the seeded fallback
- [x] `/api/badge` SVG

**[M4] The §8 degraded path was verified for real, by accident.** Repeated
unauthenticated verification traffic exhausted GitHub's 60/hr anonymous quota
mid-session, which exercised the whole chain against the real API rather than
a mock: a `403` carrying `x-ratelimit-remaining: 0` was detected as
`RATE_LIMITED`, translated to `UPSTREAM_UNAVAILABLE` rather than blamed on the
caller, and rendered as `repogauge | unknown` at **status 200** — not a broken
image. Confirmed in the logs, end to end.

**[M4] Two things the spec did not anticipate.**

- **`/trending` and `/` are `revalidate = 300`, not static.** Both read the
  database, and Next prerendered them at build time by default — which would
  have frozen the leaderboard at whatever the database held during the build.
  Five minutes keeps a newly scored repo appearing quickly while the CDN, not
  Neon, absorbs the traffic.
- **`lib/client-ip.ts` is new.** The limit is per-IP, but nothing below `app/`
  may touch headers, so routes read the address and pass it into
  `ScoreRepoOptions.clientIp`. Its contract depends on the host: on Vercel the
  platform overwrites `x-forwarded-for` with the real connecting address, but
  on a host that does not, callers can choose their own bucket. That
  assumption is documented in the file.

**[M4] Where the limiter fails open, deliberately.** An unknown IP is allowed
through, because local development and server-side calls have no forwarded
address and refusing them would break the app precisely where no budget is at
risk. A counter that cannot reach Postgres also allows the request: a limiter
protecting a budget should not take down the product it is protecting. Both are
logged.

**M5 — The README is the product page**
End state: the repo alone sells it.

- [~] `README.md`: one-liner, demo GIF of the paste→score flow, both embed snippets, self-scored RepoGauge badge — **written; the GIF and the self-scored badge need a deployment and a public repo**
- [x] `CLAUDE.md` pointing at this spec
- [x] GitHub Actions CI: format, lint, typecheck, test, `madge --circular`
- [x] LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue and PR templates, `.github/workflows`
- [ ] Dogfood: RepoGauge should score itself ≥90 — **blocked, and unreachable as specified; see §8**

**[M5] The repository is private, so RepoGauge cannot score itself at all.**
The product reads public repositories only — that is the whole zero-permission
posture from §2 — so dogfooding requires making this repo public first. That is
a deliberate decision, not a formality, and it also gates the Camo verification
M3 left open.

**[M5] CI needs no secrets.** `format:check`, `lint`, `typecheck`, `test` and
`deps:check` all run without touching GitHub or Postgres, because the rubric is
a pure function and the tests never leave the process. `build` is deliberately
not in CI: it imports `lib/config.ts`, which throws without a full environment,
so putting it there would mean handing CI a token and a database URL to prove
something the type checker already proved.

---

## 11. Assumptions

Numbered so any one can be rejected without reopening the rest.

1. **[M1] The GitHub name is `DahanItamar/RepoGauge`; the package name is `RepoGauge`. One working copy still sits at the lowercase `C:\Users\USER\Documents\repogauge`.** Revised from the original all-lowercase assumption: the product is called RepoGauge, and the identifiers now match it rather than splitting brand from slug. Three notes, each of which has bitten once:

   - **npm.** `package.json` carries `"name": "RepoGauge"`, which is legal _only_ because the package is `private: true`. **If this is ever published, that field must go back to lowercase** — npm rejects capitals outright. Verified, not assumed.
   - **The local directory is deliberately not renamed.** A case-only rename on Windows needs every handle on the folder released, and an open editor or shell holds one. It buys nothing: NTFS is case-insensitive, so both spellings resolve to the same directory and no reference breaks. A fresh `git clone` produces `RepoGauge/`, which is what the §4 tree shows.
   - **The old GitHub slug still resolves.** GitHub permanently redirects `repogauge` → `RepoGauge`, so anything already linking to the old URL keeps working.

2. **A single server-side PAT serves all users; there is no per-user token entry.** Rejecting this adds an optional "paste your own token" field and a whole trust conversation about handling someone else's credential — a meaningfully different product.
3. **6-hour score TTL, 7-day stale ceiling, 6-hour CDN cache on images, 180-day score history.** Pure tuning constants in `lib/config.ts`; change freely.

   **[M5] Two changes bound the database, and the order matters.** `scores` is insert-only, and nothing removed superseded rows — so storage tracked score _events_ rather than repositories: a continuously-viewed repo added four rows a day, forever.

   _First_, **identical rescans stopped writing rows.** `saveScore` moves the newest row's `fetched_at` forward when the recomputed score matches it exactly, and appends only when something differs. The comparison happens in Postgres because `jsonb` does not preserve key order — a `JSON.stringify` comparison against the inserted object never matches, which a test asserting "thirty identical rescans produce one row" caught producing thirty. It matters more since the rescore control lets one caller spend a 30-per-hour budget on a single repository.

   _Second_, **`sweepScoreHistory` deletes rows that are both past `SCORE_HISTORY_DAYS` and not the newest for their repository.** The second condition is load-bearing: age alone would eventually delete the only score a long-tail repo has, turning every later visit into a cold six-call fan-out — a cache that empties itself is worse than one that grows. Swept on ~1% of writes like the rate-limit counter, because §3 says not to add a cron without a measured problem.

   Measured on PGlite over a simulated year (200 repos, 20 refreshed four times a day): **29,380 rows / 59.3 MB → 2,600 rows / 5.3 MB**, all 200 repos still holding a current score. That second figure is a steady state, not a slower slope, so growth is bounded by traffic shape rather than uptime. With duplicates gone the window became cheap enough to widen from 30 days to 180 — at ~2.2 KB per row, six months of a weekly-changing repo costs ~55 KB — and 180 is the shortest window where the sparkline says anything: a repo that improves once a quarter draws a flat line over 30 days.

4. **30 cold scores per IP per hour.** A guess calibrated to "one enthusiastic human, not a script." Adjust after seeing real traffic.
5. **The 50-star floor on `/trending`.** Lower it and the leaderboard becomes whatever was last pasted; raise it and the page stays empty longer.
6. **The rubric weights in §5 are the launch values and will be wrong.** `rubric_version` exists specifically so tuning them is a one-line change plus a cache invalidation, not a migration.
7. **Tailwind CSS v4 for styling, no component library.** Six components is below the threshold where shadcn/ui earns its setup cost.
8. **The SVG badge is hand-written, not proxied through shields.io.** ~40 lines of SVG, no third-party availability dependency in a README-embedded path.
9. **No analytics beyond Vercel's built-in.** Adding PostHog or similar means a cookie banner conversation this product currently doesn't need.
10. **English only, LTR only.** No i18n layer; strings live in components. Retrofitting is real work — reject this now if a second language is ever likely.
11. **`readmeBytes` uses the `size` field from the readme endpoint; content is never fetched or decoded.** Cheaper and sufficient for a length heuristic, but it means a README that is 8KB of badges scores the same as 8KB of prose. Rejecting this adds a base64 decode and a heuristic for "real" content.

12. **[M5] `DEMO_MODE=1` runs the whole interface against bundled fixtures, with no GitHub token and no database.** Added because the app is otherwise unreachable without three credentials, and the one thing it most needs — someone looking at it — is the one thing that gated on all three. Four properties keep it from becoming the "quietly degrade to anonymous GitHub" fallback §8 forbids:

    - **It must be asked for by name.** There is no inference, no fallback, and no way to arrive in it by accident: the flag is either `1` or the app demands its credentials exactly as before.
    - **It makes no outbound call at all.** Not a degraded fetch — zero. `getOrComputeScore` and `getTrending` short-circuit before any IO, so GitHub, Postgres, and the rate limiter are all unreachable rather than merely unused. Nothing is left to abuse, which is why dropping the rate limiter with it is safe.
    - **Every page says so.** A persistent banner in `app/layout.tsx`, on every route, so no screenshot of a demo score can be mistaken for a real one.
    - **Only the input is canned.** The rubric, the tips, the card, the badge, and the star floor on `/trending` are the production implementations running on fixtures captured from the live six-call fan-out. A demo that scored differently from production would be worse than no demo.

    Recency is stored as `pushedDaysAgo` and materialised against the clock at read time, so the fixtures do not rot toward "abandoned" as they age. Rejecting this assumption costs nothing in the live path — delete `lib/demo/`, the flag, and four short branches.

---

## 12. Open Questions

- ~~**[M1] Does the ~24-point floor get fixed, and how?**~~ **Resolved in M5.** It was mostly a defect rather than a calibration choice — see §8. The floor is now 14 and `RUBRIC_VERSION` is 2.
- **[M5] Is 15 points of popularity right, when a flawless new repo cannot exceed 85?** Raised by dogfooding (§8). Blocks: nothing — but it decides whether the number answers "should I adopt this?" or "is this well built?", and those want different weights. Needed by: whenever real users disagree with a score.
- **[M5] Does this repository become public?** Blocks: dogfooding, the self-scored badge, the demo GIF, and the Camo verification from M3. Nothing in the code depends on it.
- **Production domain.** Blocks: the absolute URLs baked into README embed snippets, which are painful to change after people copy them. Needed by: M3. Until then `NEXT_PUBLIC_SITE_URL` falls back to the Vercel preview URL, so M1 and M2 are unblocked.
- **Does `/trending` need a manual removal path?** The star floor plus the 7-day window is the v1 answer. If something objectionable clears 50 stars, the only recourse is a SQL delete. Blocks: nothing before launch. Revisit if it happens once.
- **Should a repo's score be re-checked when someone views its badge weeks later?** Flow B deliberately says no, trading freshness for a bounded token budget. If badge staleness becomes the top complaint, the fix is a low-frequency refresh job for repos with embedded badges — which is the first thing in this design that would need a cron. Blocks: nothing in v1.
