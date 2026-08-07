@AGENTS.md

# RepoGauge

**Read [docs/SPEC.md](docs/SPEC.md) before changing anything.** It is the source
of truth for the architecture, the rubric weights, the dependency direction
between modules, and the build order. Notes tagged **[M1]**–**[M5]** mark places
where the implementation taught us the design was wrong; they are corrections,
not history.

For where the project stands right now and what to do next, see
[docs/HANDOFF.md](docs/HANDOFF.md).

## Where things live

| I want to change…                     | Go to                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------ |
| What a repo scores                    | `lib/score/rubric.ts` — and bump `RUBRIC_VERSION` in `lib/config.ts`     |
| What advice a failed check produces   | `lib/tips/rules.ts`                                                      |
| What GitHub data we read              | `lib/github/signals.ts` — the call budget is 6 and a test enforces it    |
| How a failure reaches the user        | `lib/errors.ts` → `components/RepoError.tsx`                             |
| Whether a user waits on GitHub        | `lib/services/freshness.ts` — pure, fully tested                         |
| Orchestration (cache → fetch → score) | `lib/services/score-repo.ts`                                             |
| Any SQL                               | `lib/db/scores.ts`, `lib/db/rate-limit.ts` — nothing else emits SQL      |
| The schema                            | `lib/db/schema.ts`, then `pnpm db:generate` — never hand-edit `drizzle/` |
| The share card / badge                | `components/ShareCard.tsx`, `lib/badge.ts`                               |

## Rules the linter already enforces

`lib/score/` imports nothing. `lib/github/` and `lib/db/` never import each
other. `components/` never fetch. Files ≤500 lines, functions ≤80. If a rule
fights you, the spec explains why it exists before you change it.

## Two rules that are not the linter's job

- **Change a rubric weight → bump `RUBRIC_VERSION` in the same commit.** Cached
  rows at an older version are treated as a miss. Skipping this makes one repo
  show two different numbers.
- **The image routes must never trigger a GitHub fetch for a known repo.**
  `/api/og` and `/api/badge` pass `neverRefresh: true`. GitHub's Camo proxy
  calls them on every README view; without that flag, long-tail embed traffic
  drains the 5000/hr token budget with nobody waiting on the result.

## Before you say it works

```
pnpm test && pnpm lint && pnpm typecheck && pnpm deps:check && pnpm build
```

`pnpm test` includes real-Postgres integration tests via PGlite — no database
or credentials required. CI runs everything except `build`, which needs a full
environment.

## Status

All five milestones are built. 209 tests, CI green.

**Not yet proven:** anything that needs a deployment — the Neon HTTP driver
(PGlite verified the SQL, not that driver), and a README embed through Camo.
The app has never run against a real `DATABASE_URL` or a real `GITHUB_TOKEN`.
